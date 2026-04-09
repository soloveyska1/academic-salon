import json
import logging
import mimetypes
import os
import random
import secrets
import smtplib
import subprocess
import threading
import urllib.parse
import urllib.request
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

# ===== VK NOTIFICATIONS =====
VK_TOKEN = os.environ.get("SALON_VK_TOKEN", "").strip()
VK_ADMIN_ID = os.environ.get("SALON_VK_ADMIN_ID", "76544534").strip()

# ===== EMAIL NOTIFICATIONS =====
NOTIFY_EMAIL = os.environ.get("SALON_NOTIFY_EMAIL", "academsaloon@mail.ru").strip()
NOTIFY_EMAIL_CC = os.environ.get("SALON_NOTIFY_EMAIL_CC", "").strip()
SMTP_HOST = os.environ.get("SALON_SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SALON_SMTP_PORT", "465") or "465")
SMTP_USERNAME = os.environ.get("SALON_SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SALON_SMTP_PASSWORD", "").strip()
SMTP_FROM = os.environ.get("SALON_SMTP_FROM", NOTIFY_EMAIL or SMTP_USERNAME).strip()
SENDMAIL_PATH = os.environ.get("SALON_SENDMAIL_PATH", "/usr/sbin/sendmail").strip()

# ===== TELEGRAM NOTIFICATIONS =====
TELEGRAM_BOT_TOKEN = os.environ.get("SALON_TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_FORUM_CHAT_ID = os.environ.get("SALON_TELEGRAM_FORUM_CHAT_ID", "").strip()
TELEGRAM_FORUM_TOPIC_ID = os.environ.get("SALON_TELEGRAM_FORUM_TOPIC_ID", "").strip()
TELEGRAM_SITE_TOPIC_PREFIX = os.environ.get("SALON_TELEGRAM_SITE_TOPIC_PREFIX", "Сайт").strip() or "Сайт"

# ===== MAX NOTIFICATIONS =====
MAX_BOT_TOKEN = os.environ.get("SALON_MAX_BOT_TOKEN", "").strip()
MAX_API_BASE = os.environ.get("SALON_MAX_API_BASE", "https://platform-api.max.ru").strip().rstrip("/")
ORDER_UPLOAD_DIR = os.environ.get(
    "SALON_ORDER_UPLOAD_DIR",
    os.path.join(os.path.dirname(os.environ.get("SALON_STATS_DB", "/var/lib/bibliosaloon/doc_stats.sqlite3")), "order_uploads"),
)
LIBRARY_SUBMISSION_DIR = os.environ.get(
    "SALON_LIBRARY_SUBMISSION_DIR",
    os.path.join(os.path.dirname(os.environ.get("SALON_STATS_DB", "/var/lib/bibliosaloon/doc_stats.sqlite3")), "library_submissions"),
)


def _env_flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(*names: str) -> list[str]:
    values: list[str] = []
    for name in names:
        raw = os.environ.get(name, "")
        if not raw:
            continue
        normalized = raw.replace(";", ",").replace("\n", ",")
        values.extend(part.strip() for part in normalized.split(","))
    return [value for value in values if value]


EMAIL_TO = _env_list("SALON_NOTIFY_EMAILS") or ([NOTIFY_EMAIL] if NOTIFY_EMAIL else [])
EMAIL_CC = _env_list("SALON_NOTIFY_EMAILS_CC") or ([NOTIFY_EMAIL_CC] if NOTIFY_EMAIL_CC else [])
SMTP_USE_SSL = _env_flag("SALON_SMTP_USE_SSL", SMTP_PORT == 465)
SMTP_USE_TLS = _env_flag("SALON_SMTP_USE_TLS", not SMTP_USE_SSL and SMTP_PORT in {25, 587})
TELEGRAM_CHAT_IDS = _env_list("SALON_TELEGRAM_CHAT_IDS", "SALON_TELEGRAM_CHAT_ID")
TELEGRAM_FORUM_CREATE_TOPIC_PER_ORDER = _env_flag("SALON_TELEGRAM_FORUM_CREATE_TOPIC_PER_ORDER", True)
MAX_CHAT_IDS = _env_list("SALON_MAX_CHAT_IDS", "SALON_MAX_CHAT_ID")
MAX_USER_IDS = _env_list("SALON_MAX_USER_IDS", "SALON_MAX_USER_ID")
ATTACHMENT_STORAGE_ROOTS = {
    "orders": ORDER_UPLOAD_DIR,
    "library_submissions": LIBRARY_SUBMISSION_DIR,
}


def _run_async(label: str, func, *args) -> None:
    def _wrapped():
        try:
            func(*args)
        except Exception:
            logger.exception("%s notification crashed", label)

    threading.Thread(target=_wrapped, daemon=True).start()


def _read_json_response(response) -> dict:
    body = response.read().decode("utf-8", errors="replace").strip()
    if not body:
        return {}
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return {"raw": body}


def resolve_order_attachment_path(attachment: dict) -> str | None:
    if not isinstance(attachment, dict):
        return None
    storage = str(attachment.get("storage") or "orders").strip()
    root = ATTACHMENT_STORAGE_ROOTS.get(storage)
    if not root:
        return None
    relative_path = str(attachment.get("relative_path") or "").replace("\\", "/").strip("/")
    if not relative_path or ".." in relative_path.split("/"):
        return None
    root = os.path.normpath(root)
    full_path = os.path.normpath(os.path.join(root, relative_path))
    if not full_path.startswith(root + os.sep):
        return None
    if not os.path.exists(full_path):
        return None
    return full_path


def _normalize_notification_attachments(attachments: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for attachment in attachments or []:
        if isinstance(attachment, dict) and attachment.get("relative_path"):
            normalized.append(attachment)
    return normalized


def _email_notify_sync(subject: str, body: str, attachments: list[dict] | None = None) -> bool:
    recipients = [*EMAIL_TO, *EMAIL_CC]
    if not recipients:
        logger.warning("Email notification skipped: no recipients configured")
        return False

    msg = MIMEMultipart()
    msg["From"] = SMTP_FROM or NOTIFY_EMAIL
    msg["To"] = ", ".join(EMAIL_TO)
    if EMAIL_CC:
        msg["Cc"] = ", ".join(EMAIL_CC)
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))
    attachment_count = 0
    for attachment in _normalize_notification_attachments(attachments):
        file_path = resolve_order_attachment_path(attachment)
        if not file_path:
            continue
        try:
            with open(file_path, "rb") as fh:
                part = MIMEApplication(fh.read(), Name=attachment.get("name") or os.path.basename(file_path))
        except OSError:
            logger.exception("Email attachment open failed: %s", attachment)
            continue
        filename = attachment.get("name") or os.path.basename(file_path)
        part["Content-Disposition"] = f'attachment; filename="{filename}"'
        msg.attach(part)
        attachment_count += 1

    if SMTP_HOST:
        if SMTP_USE_SSL:
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20)
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
        try:
            if SMTP_USE_TLS and not SMTP_USE_SSL:
                server.starttls()
            if SMTP_USERNAME:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg, to_addrs=recipients)
            logger.info(
                "Email notification sent to %s%s",
                ", ".join(recipients),
                f" with {attachment_count} attachment(s)" if attachment_count else "",
            )
            return True
        finally:
            try:
                server.quit()
            except Exception:
                pass

    if SENDMAIL_PATH and os.path.exists(SENDMAIL_PATH):
        subprocess.run(
            [SENDMAIL_PATH, "-t", "-oi"],
            input=msg.as_bytes(),
            check=True,
        )
        logger.info(
            "Email notification sent via sendmail to %s%s",
            ", ".join(recipients),
            f" with {attachment_count} attachment(s)" if attachment_count else "",
        )
        return True

    logger.warning("Email notification skipped: SMTP and sendmail are not configured")
    return False


def _vk_notify_sync(message: str) -> bool:
    if not VK_TOKEN or not VK_ADMIN_ID:
        logger.warning("VK notification skipped: SALON_VK_TOKEN or SALON_VK_ADMIN_ID is missing")
        return False

    params = urllib.parse.urlencode(
        {
            "user_id": VK_ADMIN_ID,
            "message": message,
            "random_id": random.randint(1, 2**31),
            "access_token": VK_TOKEN,
            "v": "5.199",
        }
    )
    url = f"https://api.vk.com/method/messages.send?{params}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = _read_json_response(response)
    if payload.get("error"):
        logger.error("VK notification failed: %s", payload["error"])
        return False
    logger.info("VK notification sent")
    return True


def _telegram_notify_sync(message: str) -> bool:
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("Telegram notification skipped: bot token is missing")
        return False

    if not TELEGRAM_CHAT_IDS:
        if TELEGRAM_FORUM_CHAT_ID:
            logger.info("Telegram direct notification skipped: no personal chat ids configured")
        else:
            logger.warning("Telegram notification skipped: chat id is missing")
        return False

    ok_any = False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    for chat_id in TELEGRAM_CHAT_IDS:
        payload = urllib.parse.urlencode(
            {
                "chat_id": chat_id,
                "text": message,
                "disable_web_page_preview": "true",
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            data = _read_json_response(response)
        if data.get("ok"):
            ok_any = True
            logger.info("Telegram notification sent to %s", chat_id)
        else:
            logger.error("Telegram notification failed for %s: %s", chat_id, data)
    return ok_any


def _telegram_api_request(method: str, payload: dict) -> dict:
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("Telegram bot token is missing")
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    encoded = urllib.parse.urlencode(
        {key: str(value) for key, value in payload.items() if value not in (None, "")}
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=encoded,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        data = _read_json_response(response)
    if not data.get("ok"):
        raise RuntimeError(f"Telegram API {method} failed: {data}")
    return data


def _telegram_api_upload(method: str, fields: dict, file_field: str, file_path: str, filename: str, content_type: str) -> dict:
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("Telegram bot token is missing")
    boundary = "----AcademicSalon" + secrets.token_hex(12)
    body = bytearray()
    for key, value in fields.items():
        if value in (None, ""):
            continue
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")
    with open(file_path, "rb") as fh:
        file_bytes = fh.read()
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode("utf-8"))
    body.extend(f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n".encode("utf-8"))
    body.extend(file_bytes)
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    req = urllib.request.Request(
        url,
        data=bytes(body),
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        data = _read_json_response(response)
    if not data.get("ok"):
        raise RuntimeError(f"Telegram API {method} upload failed: {data}")
    return data


def _build_telegram_topic_name(subject: str, body: str) -> str:
    compact_subject = " ".join(str(subject or "").split())[:80] or "Новая заявка"
    first_line = " ".join((body or "").splitlines()[0].split())[:40] if body else ""
    title = f"{TELEGRAM_SITE_TOPIC_PREFIX} · {compact_subject}"
    if first_line and first_line not in title:
        title = f"{title} · {first_line}"
    return title[:128]


def _telegram_send_documents(chat_id: str, attachments: list[dict], thread_id: str = "") -> bool:
    if not attachments:
        return True
    ok_all = True
    for index, attachment in enumerate(attachments, start=1):
        file_path = resolve_order_attachment_path(attachment)
        if not file_path:
            ok_all = False
            logger.error("Telegram attachment path is invalid: %s", attachment)
            continue
        filename = attachment.get("name") or os.path.basename(file_path)
        content_type = attachment.get("content_type") or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        caption = filename
        size_label = attachment.get("size_label") or attachment.get("size")
        if size_label:
            caption = f"{filename} ({size_label})"
        payload = {
            "chat_id": chat_id,
            "caption": caption[:1024],
            "disable_content_type_detection": "false",
        }
        if thread_id:
            payload["message_thread_id"] = thread_id
        try:
            _telegram_api_upload("sendDocument", payload, "document", file_path, filename, content_type)
            logger.info(
                "Telegram attachment %s/%s sent to %s%s",
                index,
                len(attachments),
                chat_id,
                f" thread {thread_id}" if thread_id else "",
            )
        except Exception:
            ok_all = False
            logger.exception("Telegram attachment send failed: %s", filename)
    return ok_all


def _telegram_forum_notify_sync(
    message: str,
    topic_name: str | None = None,
    attachments: list[dict] | None = None,
) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_FORUM_CHAT_ID:
        logger.warning("Telegram forum notification skipped: bot token or forum chat id is missing")
        return False

    thread_id = TELEGRAM_FORUM_TOPIC_ID or ""
    if TELEGRAM_FORUM_CREATE_TOPIC_PER_ORDER:
        try:
            created = _telegram_api_request(
                "createForumTopic",
                {
                    "chat_id": TELEGRAM_FORUM_CHAT_ID,
                    "name": (topic_name or f"{TELEGRAM_SITE_TOPIC_PREFIX} · Заявка")[:128],
                },
            )
            thread_id = str(created.get("result", {}).get("message_thread_id") or "")
            logger.info("Telegram forum topic created in %s with thread_id=%s", TELEGRAM_FORUM_CHAT_ID, thread_id)
        except Exception:
            logger.exception("Telegram forum topic creation failed")
            return False

    payload = {
        "chat_id": TELEGRAM_FORUM_CHAT_ID,
        "text": message,
        "disable_web_page_preview": "true",
    }
    if thread_id:
        payload["message_thread_id"] = thread_id

    try:
        _telegram_api_request("sendMessage", payload)
        logger.info(
            "Telegram forum notification sent to %s%s",
            TELEGRAM_FORUM_CHAT_ID,
            f' thread {thread_id}' if thread_id else "",
        )
        return _telegram_send_documents(
            TELEGRAM_FORUM_CHAT_ID,
            _normalize_notification_attachments(attachments),
            thread_id=thread_id,
        )
    except Exception:
        logger.exception("Telegram forum send failed")
        return False


def _max_notify_sync(message: str) -> bool:
    if not MAX_BOT_TOKEN:
        logger.warning("MAX notification skipped: SALON_MAX_BOT_TOKEN is missing")
        return False

    targets = [{"chat_id": chat_id} for chat_id in MAX_CHAT_IDS]
    targets.extend({"user_id": user_id} for user_id in MAX_USER_IDS)
    if not targets:
        logger.warning("MAX notification skipped: no chat or user ids configured")
        return False

    ok_any = False
    for target in targets:
        url = f"{MAX_API_BASE}/messages?{urllib.parse.urlencode(target)}"
        req = urllib.request.Request(
            url,
            data=json.dumps({"text": message, "notify": True}).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": MAX_BOT_TOKEN,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            data = _read_json_response(response)
        if data.get("message") or data.get("status"):
            ok_any = True
            logger.info("MAX notification sent to %s", target)
        else:
            logger.error("MAX notification failed for %s: %s", target, data)
    return ok_any


def email_notify(subject: str, body: str, attachments: list[dict] | None = None) -> None:
    _run_async("email", _email_notify_sync, subject, body, attachments)


def vk_notify(message: str) -> None:
    _run_async("vk", _vk_notify_sync, message)


def telegram_notify(message: str) -> None:
    _run_async("telegram", _telegram_notify_sync, message)


def max_notify(message: str) -> None:
    _run_async("max", _max_notify_sync, message)


def notify_order_channels(
    subject: str,
    body: str,
    telegram_topic_name: str | None = None,
    attachments: list[dict] | None = None,
) -> None:
    def _notify_all() -> None:
        normalized_attachments = _normalize_notification_attachments(attachments)
        results = {
            "vk": _vk_notify_sync(body),
            "telegram": _telegram_notify_sync(body),
            "telegram_forum": _telegram_forum_notify_sync(
                body,
                topic_name=telegram_topic_name or _build_telegram_topic_name(subject, body),
                attachments=normalized_attachments,
            ),
            "email": _email_notify_sync(subject, body, attachments=normalized_attachments),
            "max": _max_notify_sync(body),
        }
        delivered = [channel for channel, ok in results.items() if ok]
        if delivered:
            logger.info("Order notification delivered via %s", ", ".join(delivered))
        else:
            logger.error("Order notification was not delivered via any channel")

    _run_async("order", _notify_all)
