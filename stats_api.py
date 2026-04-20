#!/usr/bin/env python3
import hashlib
import hmac
import json
import logging
import mimetypes
import os
import random
import re
import secrets
import shutil
import sqlite3
import subprocess
import time
import threading
from contextlib import nullcontext
from cgi import FieldStorage
from datetime import datetime
from email.mime.application import MIMEApplication
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

import bcrypt

SERVICE_NAME = "bibliosaloon-stats"
SERVICE_VERSION = "1.5.0"

LOG_LEVEL = os.environ.get("SALON_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("bibliosaloon.notifications")

# ===== VK NOTIFICATIONS =====
VK_TOKEN = os.environ.get("SALON_VK_TOKEN", "").strip()
VK_ADMIN_ID = os.environ.get("SALON_VK_ADMIN_ID", "76544534").strip()

NOTIFY_EMAIL = os.environ.get("SALON_NOTIFY_EMAIL", "academsaloon@mail.ru").strip()
NOTIFY_EMAIL_CC = os.environ.get("SALON_NOTIFY_EMAIL_CC", "saymurrr@bk.ru").strip()
SMTP_HOST = os.environ.get("SALON_SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SALON_SMTP_PORT", "465") or "465")
SMTP_USERNAME = os.environ.get("SALON_SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SALON_SMTP_PASSWORD", "").strip()
SMTP_FROM = os.environ.get("SALON_SMTP_FROM", NOTIFY_EMAIL or SMTP_USERNAME).strip()
SENDMAIL_PATH = os.environ.get("SALON_SENDMAIL_PATH", "/usr/sbin/sendmail").strip()

TELEGRAM_BOT_TOKEN = os.environ.get("SALON_TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_FORUM_CHAT_ID = os.environ.get("SALON_TELEGRAM_FORUM_CHAT_ID", "").strip()
TELEGRAM_FORUM_TOPIC_ID = os.environ.get("SALON_TELEGRAM_FORUM_TOPIC_ID", "").strip()
TELEGRAM_SITE_TOPIC_PREFIX = os.environ.get("SALON_TELEGRAM_SITE_TOPIC_PREFIX", "Сайт").strip() or "Сайт"

MAX_BOT_TOKEN = os.environ.get("SALON_MAX_BOT_TOKEN", "").strip()
MAX_API_BASE = os.environ.get("SALON_MAX_API_BASE", "https://platform-api.max.ru").strip().rstrip("/")


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
OUTBOX_DEFAULT_MAX_ATTEMPTS = int(os.environ.get("SALON_OUTBOX_MAX_ATTEMPTS", "6") or "6")
OUTBOX_RETRY_BASE_SECONDS = int(os.environ.get("SALON_OUTBOX_RETRY_BASE_SECONDS", "10") or "10")
OUTBOX_LOCK_TIMEOUT_SECONDS = int(os.environ.get("SALON_OUTBOX_LOCK_TIMEOUT_SECONDS", "180") or "180")
OUTBOX_IDLE_SLEEP_SECONDS = float(os.environ.get("SALON_OUTBOX_IDLE_SLEEP_SECONDS", "1.0") or "1.0")
HOUSEKEEPING_INTERVAL_SECONDS = int(os.environ.get("SALON_HOUSEKEEPING_INTERVAL_SECONDS", str(5 * 60)) or str(5 * 60))

_OUTBOX_WORKER_LOCK = threading.Lock()
_OUTBOX_WORKER_THREAD: threading.Thread | None = None
_HOUSEKEEPING_WORKER_LOCK = threading.Lock()
_HOUSEKEEPING_WORKER_THREAD: threading.Thread | None = None


def _vk_delivery_configured() -> bool:
    return bool(VK_TOKEN and VK_ADMIN_ID)


def _telegram_direct_delivery_configured() -> bool:
    return bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS)


def _telegram_forum_delivery_configured() -> bool:
    return bool(TELEGRAM_BOT_TOKEN and TELEGRAM_FORUM_CHAT_ID)


def _email_delivery_configured() -> bool:
    recipients = [*EMAIL_TO, *EMAIL_CC]
    has_transport = bool(SMTP_HOST or (SENDMAIL_PATH and os.path.exists(SENDMAIL_PATH)))
    return bool(recipients and has_transport)


def _max_delivery_configured() -> bool:
    return bool(MAX_BOT_TOKEN and (MAX_CHAT_IDS or MAX_USER_IDS))


def _read_json_response(response) -> dict:
    body = response.read().decode("utf-8", errors="replace").strip()
    if not body:
        return {}
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return {"raw": body}


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
    body.extend(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode("utf-8")
    )
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
    compact_subject = clean_text(subject, 80) or "Новая заявка"
    first_line = clean_text(body.splitlines()[0] if body else "", 40)
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
        caption = caption[:1024]
        payload = {
            "chat_id": chat_id,
            "caption": caption,
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


def _ensure_telegram_forum_thread(topic_name: str | None = None, existing_thread_id: str = "") -> str:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_FORUM_CHAT_ID:
        logger.warning("Telegram forum notification skipped: bot token or forum chat id is missing")
        return ""

    if existing_thread_id:
        return existing_thread_id

    thread_id = TELEGRAM_FORUM_TOPIC_ID or ""
    if thread_id or not TELEGRAM_FORUM_CREATE_TOPIC_PER_ORDER:
        return thread_id

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
        return thread_id
    except Exception:
        logger.exception("Telegram forum topic creation failed")
        return ""


def _telegram_forum_send_sync(
    message: str,
    *,
    attachments: list[dict] | None = None,
    thread_id: str = "",
) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_FORUM_CHAT_ID:
        logger.warning("Telegram forum notification skipped: bot token or forum chat id is missing")
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
        attachments_ok = _telegram_send_documents(
            TELEGRAM_FORUM_CHAT_ID,
            _normalize_notification_attachments(attachments),
            thread_id=thread_id,
        )
        return attachments_ok
    except Exception:
        logger.exception("Telegram forum send failed")
        return False


def _deliver_telegram_forum_notification_sync(
    message: str,
    topic_name: str | None = None,
    attachments: list[dict] | None = None,
    existing_thread_id: str = "",
) -> tuple[bool, str]:
    thread_id = _ensure_telegram_forum_thread(topic_name, existing_thread_id)
    if TELEGRAM_FORUM_CREATE_TOPIC_PER_ORDER and not thread_id:
        return False, ""
    return _telegram_forum_send_sync(
        message,
        attachments=attachments,
        thread_id=thread_id,
    ), thread_id


def _telegram_forum_notify_sync(
    message: str,
    topic_name: str | None = None,
    attachments: list[dict] | None = None,
) -> bool:
    ok, _thread_id = _deliver_telegram_forum_notification_sync(
        message,
        topic_name=topic_name,
        attachments=attachments,
    )
    return ok


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


def email_notify(subject: str, body: str, attachments: list[dict] | None = None) -> bool:
    return _email_notify_sync(subject, body, attachments)


def vk_notify(message: str) -> bool:
    return _vk_notify_sync(message)


def telegram_notify(message: str) -> bool:
    return _telegram_notify_sync(message)


def max_notify(message: str) -> bool:
    return _max_notify_sync(message)


def notify_order_channels(
    subject: str,
    body: str,
    telegram_topic_name: str | None = None,
    attachments: list[dict] | None = None,
) -> bool:
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
        return True
    logger.error("Order notification was not delivered via any channel")
    return False

HOST = os.environ.get("SALON_STATS_HOST", "127.0.0.1")
PORT = int(os.environ.get("SALON_STATS_PORT", "8765"))
BASE_DIR = os.environ.get("SALON_FILES_DIR", "/var/www/salon")
DB_PATH = os.environ.get("SALON_STATS_DB", "/var/lib/bibliosaloon/doc_stats.sqlite3")
CATALOG_PATH = os.environ.get("SALON_CATALOG", os.path.join(BASE_DIR, "catalog.json"))
SITE_ORIGIN = os.environ.get("SALON_SITE_ORIGIN", "https://bibliosaloon.ru")
MOSCOW_TZ = ZoneInfo("Europe/Moscow")
UPLOAD_DIR = os.path.join(BASE_DIR, "files")
ORDER_UPLOAD_DIR = os.environ.get("SALON_ORDER_UPLOAD_DIR", os.path.join(os.path.dirname(DB_PATH), "order_uploads"))
LIBRARY_SUBMISSION_DIR = os.environ.get(
    "SALON_LIBRARY_SUBMISSION_DIR",
    os.path.join(os.path.dirname(DB_PATH), "library_submissions"),
)
UPLOAD_SESSION_DIR = os.environ.get(
    "SALON_UPLOAD_SESSION_DIR",
    os.path.join(os.path.dirname(DB_PATH), "upload_sessions"),
)
MAX_BATCH = 400
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
UPLOAD_CHUNK_SIZE = int(os.environ.get("SALON_UPLOAD_CHUNK_SIZE", str(1024 * 1024)) or str(1024 * 1024))
UPLOAD_SESSION_TTL = int(os.environ.get("SALON_UPLOAD_SESSION_TTL", str(24 * 60 * 60)) or str(24 * 60 * 60))
MAX_ORDER_ATTACHMENTS = int(os.environ.get("SALON_ORDER_MAX_ATTACHMENTS", "6") or "6")
MAX_ORDER_ATTACHMENT_SIZE = int(
    os.environ.get("SALON_ORDER_MAX_ATTACHMENT_SIZE", str(25 * 1024 * 1024)) or str(25 * 1024 * 1024)
)
MAX_ORDER_TOTAL_ATTACHMENT_SIZE = int(
    os.environ.get("SALON_ORDER_MAX_TOTAL_ATTACHMENT_SIZE", str(45 * 1024 * 1024)) or str(45 * 1024 * 1024)
)
MAX_LIBRARY_ATTACHMENTS = int(os.environ.get("SALON_LIBRARY_MAX_ATTACHMENTS", "5") or "5")
MAX_LIBRARY_ATTACHMENT_SIZE = int(
    os.environ.get("SALON_LIBRARY_MAX_ATTACHMENT_SIZE", str(25 * 1024 * 1024)) or str(25 * 1024 * 1024)
)
MAX_LIBRARY_TOTAL_ATTACHMENT_SIZE = int(
    os.environ.get("SALON_LIBRARY_MAX_TOTAL_ATTACHMENT_SIZE", str(45 * 1024 * 1024)) or str(45 * 1024 * 1024)
)
ORDER_ATTACHMENT_EXTENSIONS = {
    ".7z",
    ".csv",
    ".doc",
    ".docx",
    ".heic",
    ".heif",
    ".jpeg",
    ".jpg",
    ".ods",
    ".odt",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".rar",
    ".rtf",
    ".txt",
    ".webp",
    ".xls",
    ".xlsx",
    ".zip",
}
LIBRARY_TOPIC_PREFIX = os.environ.get("SALON_TELEGRAM_LIBRARY_TOPIC_PREFIX", "Библиотека").strip() or "Библиотека"
ANTIVIRUS_REQUIRED = _env_flag("SALON_ANTIVIRUS_REQUIRED", True)
ANTIVIRUS_SCAN_TIMEOUT = int(os.environ.get("SALON_ANTIVIRUS_SCAN_TIMEOUT", "90") or "90")
ANTIVIRUS_SCAN_CONCURRENCY = max(
    1,
    int(os.environ.get("SALON_ANTIVIRUS_SCAN_CONCURRENCY", "1") or "1"),
)
CLAMDSCAN_PATH = os.environ.get("SALON_CLAMDSCAN_PATH", shutil.which("clamdscan") or "").strip()
CLAMSCAN_PATH = os.environ.get("SALON_CLAMSCAN_PATH", shutil.which("clamscan") or "").strip()
ANTIVIRUS_SCAN_SEMAPHORE = threading.Semaphore(ANTIVIRUS_SCAN_CONCURRENCY)
ATTACHMENT_STORAGE_ROOTS = {
    "orders": ORDER_UPLOAD_DIR,
    "library_submissions": LIBRARY_SUBMISSION_DIR,
}
EVENT_WINDOWS = {
    "view": 6 * 60 * 60,
    "download": 30,
}
ORDER_IDEMPOTENCY_WINDOW = int(os.environ.get("SALON_ORDER_IDEMPOTENCY_WINDOW", str(20 * 60)) or str(20 * 60))
LIBRARY_IDEMPOTENCY_WINDOW = int(
    os.environ.get("SALON_LIBRARY_IDEMPOTENCY_WINDOW", str(30 * 60)) or str(30 * 60)
)
IDEMPOTENCY_RETENTION_SECONDS = int(
    os.environ.get("SALON_IDEMPOTENCY_RETENTION_SECONDS", str(24 * 60 * 60)) or str(24 * 60 * 60)
)
ORDER_IP_HOURLY_LIMIT = int(os.environ.get("SALON_ORDER_IP_HOURLY_LIMIT", "6") or "6")
ORDER_CONTACT_HOURLY_LIMIT = int(os.environ.get("SALON_ORDER_CONTACT_HOURLY_LIMIT", "4") or "4")
ORDER_CONTACT_BURST_LIMIT = int(os.environ.get("SALON_ORDER_CONTACT_BURST_LIMIT", "2") or "2")
ORDER_CONTACT_BURST_WINDOW = int(os.environ.get("SALON_ORDER_CONTACT_BURST_WINDOW", str(10 * 60)) or str(10 * 60))
LIBRARY_IP_HOURLY_LIMIT = int(os.environ.get("SALON_LIBRARY_IP_HOURLY_LIMIT", "5") or "5")
LIBRARY_CONTACT_HOURLY_LIMIT = int(os.environ.get("SALON_LIBRARY_CONTACT_HOURLY_LIMIT", "3") or "3")
LIBRARY_CONTACT_BURST_LIMIT = int(os.environ.get("SALON_LIBRARY_CONTACT_BURST_LIMIT", "2") or "2")
LIBRARY_CONTACT_BURST_WINDOW = int(
    os.environ.get("SALON_LIBRARY_CONTACT_BURST_WINDOW", str(20 * 60)) or str(20 * 60)
)


def _bool_status(ok: bool, **details) -> dict:
    return {"ok": bool(ok), **details}


def _db_health_check() -> dict:
    try:
        with get_db() as db:
            db.execute("SELECT 1").fetchone()
        return _bool_status(True, path=DB_PATH)
    except Exception as exc:
        return _bool_status(False, path=DB_PATH, error=str(exc))


def _path_health_check(path: str) -> dict:
    normalized = os.path.normpath(path)
    parent = os.path.dirname(normalized) or "."
    exists = os.path.exists(normalized)
    writable = os.access(normalized, os.W_OK | os.X_OK) if exists else os.access(parent, os.W_OK | os.X_OK)
    return _bool_status(exists or writable, path=normalized, exists=exists, writable=writable)


def _notification_health_check() -> dict:
    sendmail_ready = bool(SENDMAIL_PATH and os.path.exists(SENDMAIL_PATH))
    smtp_ready = bool(SMTP_HOST and (not SMTP_USERNAME or SMTP_PASSWORD))
    email_ready = _email_delivery_configured()
    telegram_direct_ready = _telegram_direct_delivery_configured()
    telegram_forum_ready = _telegram_forum_delivery_configured()
    vk_ready = _vk_delivery_configured()
    max_ready = _max_delivery_configured()
    any_delivery = any((vk_ready, telegram_direct_ready, telegram_forum_ready, email_ready, max_ready))
    return {
        "ok": any_delivery,
        "vk": vk_ready,
        "telegramDirect": telegram_direct_ready,
        "telegramForum": telegram_forum_ready,
        "email": email_ready,
        "max": max_ready,
        "recipientsEmail": len(EMAIL_TO),
        "sendmail": sendmail_ready,
        "smtp": smtp_ready,
    }


def _outbox_health_check() -> dict:
    try:
        with get_db() as db:
            ensure_outbox_jobs_table(db)
            pending = int(db.execute("SELECT COUNT(*) FROM outbox_jobs WHERE status = 'pending'").fetchone()[0])
            processing = int(db.execute("SELECT COUNT(*) FROM outbox_jobs WHERE status = 'processing'").fetchone()[0])
            failed = int(db.execute("SELECT COUNT(*) FROM outbox_jobs WHERE status = 'failed'").fetchone()[0])
            oldest_pending = db.execute(
                "SELECT MIN(available_at) FROM outbox_jobs WHERE status = 'pending'"
            ).fetchone()[0]
        lag_seconds = max(0, int(time.time()) - int(oldest_pending or time.time()))
        ok = failed == 0 and processing <= 4
        return {
            "ok": ok,
            "pending": pending,
            "processing": processing,
            "failed": failed,
            "lagSeconds": lag_seconds,
        }
    except Exception as exc:
        return _bool_status(False, error=str(exc))


def _antivirus_health_check() -> dict:
    scanners = []
    if CLAMDSCAN_PATH:
        scanners.append({"engine": "clamdscan", "path": CLAMDSCAN_PATH, "exists": os.path.exists(CLAMDSCAN_PATH)})
    if CLAMSCAN_PATH:
        scanners.append({"engine": "clamscan", "path": CLAMSCAN_PATH, "exists": os.path.exists(CLAMSCAN_PATH)})
    ok = bool(scanners) if ANTIVIRUS_REQUIRED else True
    return {
        "ok": ok,
        "required": ANTIVIRUS_REQUIRED,
        "scanners": scanners,
    }


def build_live_health() -> dict:
    return {
        "ok": True,
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "time": int(time.time()),
    }


def build_ready_health() -> tuple[int, dict]:
    checks = {
        "db": _db_health_check(),
        "uploadDir": _path_health_check(UPLOAD_DIR),
        "orderUploadDir": _path_health_check(ORDER_UPLOAD_DIR),
        "librarySubmissionDir": _path_health_check(LIBRARY_SUBMISSION_DIR),
        "uploadSessionDir": _path_health_check(UPLOAD_SESSION_DIR),
        "outbox": _outbox_health_check(),
        "antivirus": _antivirus_health_check(),
        "notifications": _notification_health_check(),
        "adminAuth": _bool_status(bool(ADMIN_HASH)),
    }
    warnings: list[str] = []
    if not checks["notifications"]["email"]:
        warnings.append("Email delivery is not configured.")
    if not checks["notifications"]["max"]:
        warnings.append("MAX delivery is not configured.")
    if not checks["notifications"]["telegramDirect"]:
        warnings.append("Telegram direct delivery is not configured.")
    if checks["outbox"].get("failed"):
        warnings.append("Outbox has permanently failed jobs.")

    critical_checks = (
        "db",
        "uploadDir",
        "orderUploadDir",
        "librarySubmissionDir",
        "uploadSessionDir",
        "outbox",
        "antivirus",
        "notifications",
        "adminAuth",
    )
    ok = all(checks[name]["ok"] for name in critical_checks)
    status = 200 if ok else 503
    payload = {
        "ok": ok,
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "checks": checks,
        "warnings": warnings,
        "time": int(time.time()),
    }
    return status, payload

# ===== ADMIN AUTH =====
# Password hash is generated once: python3 -c "import bcrypt; print(bcrypt.hashpw(b'YOUR_PASSWORD', bcrypt.gensalt()).decode())"
ADMIN_HASH = os.environ.get("SALON_ADMIN_HASH", "").strip()
SESSION_TTL = 24 * 60 * 60  # 24 hours
LOGIN_RATE_WINDOW = 60  # 1 minute
LOGIN_RATE_MAX = 5
LOGIN_BLOCK_TIME = 15 * 60  # 15 min block after too many attempts

_sessions: dict[str, float] = {}  # token -> expiry timestamp
_sessions_lock = threading.Lock()
_login_attempts: dict[str, list[float]] = {}  # ip -> [timestamps]
_login_blocks: dict[str, float] = {}  # ip -> block_until


def admin_check_rate_limit(ip: str) -> bool:
    """Returns True if request is allowed, False if blocked."""
    now = time.time()
    if ip in _login_blocks and _login_blocks[ip] > now:
        return False
    attempts = _login_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < LOGIN_RATE_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= LOGIN_RATE_MAX:
        _login_blocks[ip] = now + LOGIN_BLOCK_TIME
        return False
    return True


def admin_record_attempt(ip: str) -> None:
    _login_attempts.setdefault(ip, []).append(time.time())


def admin_login(password: str) -> str | None:
    """Verify password, return session token or None."""
    try:
        if bcrypt.checkpw(password.encode("utf-8"), ADMIN_HASH.encode("utf-8")):
            token = secrets.token_hex(32)
            with _sessions_lock:
                _sessions[token] = time.time() + SESSION_TTL
            return token
    except Exception:
        pass
    return None


def admin_verify(token: str | None) -> bool:
    """Check if session token is valid."""
    if not token:
        return False
    with _sessions_lock:
        expiry = _sessions.get(token)
        if expiry and expiry > time.time():
            return True
        _sessions.pop(token, None)
    return False


def admin_logout(token: str) -> None:
    with _sessions_lock:
        _sessions.pop(token, None)


def admin_cleanup_sessions() -> None:
    """Remove expired sessions (called occasionally)."""
    now = time.time()
    with _sessions_lock:
        expired = [t for t, exp in _sessions.items() if exp <= now]
        for t in expired:
            del _sessions[t]


def log_config_warnings() -> None:
    if not VK_TOKEN:
        logger.warning("SALON_VK_TOKEN is not configured; VK delivery is disabled")
    if not ADMIN_HASH:
        logger.error("SALON_ADMIN_HASH is not configured; admin login is disabled")
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("SALON_TELEGRAM_BOT_TOKEN is not configured; Telegram delivery is limited")
    if ANTIVIRUS_REQUIRED and not (CLAMDSCAN_PATH or CLAMSCAN_PATH):
        logger.error("Antivirus is required but no scanner path is configured")


def get_bearer_token(handler: BaseHTTPRequestHandler) -> str | None:
    auth = handler.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return None


def get_client_ip(handler: BaseHTTPRequestHandler) -> str:
    forwarded = handler.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() or handler.client_address[0] or ""


# ===== CATALOG MANAGEMENT =====
_catalog_lock = threading.Lock()


def load_catalog() -> list[dict]:
    """Load catalog from JSON file."""
    if not os.path.exists(CATALOG_PATH):
        return []
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_catalog(catalog: list[dict]) -> None:
    """Save catalog to JSON file atomically."""
    tmp_path = CATALOG_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=None, separators=(",", ":"))
    os.replace(tmp_path, CATALOG_PATH)


def find_doc_index(catalog: list[dict], file_path: str) -> int:
    """Find document index by file path."""
    for i, doc in enumerate(catalog):
        if doc.get("file") == file_path:
            return i
    return -1


def build_doc_href(file_path: str) -> str:
    cleaned = str(file_path or "").strip()
    if not cleaned:
        return "/catalog"
    return "/doc?file=" + urllib.parse.quote(cleaned, safe="/")


def normalize_catalog_filename(filename: str | None) -> tuple[str, str]:
    raw_name = os.path.basename(str(filename or "").replace("\\", "/")).replace("\x00", " ").strip()
    raw_name = re.sub(r"\s+", " ", raw_name)
    if not raw_name or raw_name in {".", ".."}:
        return "", ""
    stem, ext = os.path.splitext(raw_name)
    ext = ext[:16]
    safe_stem = stem.replace("/", "_").replace("\\", "_").replace("..", "_").strip()
    safe_stem = re.sub(r"\s+", " ", safe_stem).strip(" .") or "Документ"
    return raw_name[:180], f"{safe_stem[:180]}{ext}"


def unique_catalog_filename(preferred_name: str) -> str:
    _, safe_name = normalize_catalog_filename(preferred_name)
    if not safe_name:
        safe_name = "Документ"
    stem, ext = os.path.splitext(safe_name)
    candidate = safe_name
    counter = 2
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    while os.path.exists(os.path.join(UPLOAD_DIR, candidate)):
        candidate = f"{stem} ({counter}){ext}"
        counter += 1
    return candidate


def ensure_parent_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    ensure_parent_dir(DB_PATH)
    with get_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS doc_counters (
                file TEXT PRIMARY KEY,
                views INTEGER NOT NULL DEFAULT 0,
                downloads INTEGER NOT NULL DEFAULT 0,
                likes INTEGER NOT NULL DEFAULT 0,
                dislikes INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );

            CREATE TABLE IF NOT EXISTS event_buckets (
                file TEXT NOT NULL,
                client_id TEXT NOT NULL,
                action TEXT NOT NULL,
                bucket INTEGER NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                PRIMARY KEY (file, client_id, action, bucket)
            );

            CREATE TABLE IF NOT EXISTS reactions (
                file TEXT NOT NULL,
                client_id TEXT NOT NULL,
                reaction INTEGER NOT NULL CHECK (reaction IN (-1, 1)),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                PRIMARY KEY (file, client_id)
            );

            CREATE INDEX IF NOT EXISTS idx_event_buckets_created_at
                ON event_buckets(created_at);

            CREATE INDEX IF NOT EXISTS idx_reactions_file
                ON reactions(file);
            """
        )
        ensure_orders_table(db)
        ensure_library_submissions_table(db)
        ensure_upload_sessions_table(db)
        ensure_submission_idempotency_table(db)
        ensure_outbox_jobs_table(db)


ORDER_SOURCE_LABELS = {
    "library_app": "Приложение БиблиоСалон",
    "library_app_sample": "Приложение БиблиоСалон · по примеру",
    "site_modal": "Сайт · форма заявки",
    "site_document": "Сайт · карточка документа",
    "site_quick_search": "Сайт · пустой поиск каталога",
    "site_calculator": "Сайт · калькулятор стоимости",
}

ORDER_EXTRA_COLUMNS = {
    "source": "TEXT",
    "source_label": "TEXT",
    "source_path": "TEXT",
    "entry_url": "TEXT",
    "referrer": "TEXT",
    "user_agent": "TEXT",
    "contact_channel": "TEXT",
    "estimated_price": "INTEGER",
    "pages": "INTEGER",
    "originality": "TEXT",
    "sample_title": "TEXT",
    "sample_type": "TEXT",
    "sample_subject": "TEXT",
    "sample_category": "TEXT",
    "meta_json": "TEXT",
    "attachments_json": "TEXT",
    "contact_key": "TEXT",
    "request_fingerprint": "TEXT",
    "notification_state_json": "TEXT",
    "telegram_thread_id": "TEXT",
    "manager_note": "TEXT",
    "manager_updated_at": "INTEGER",
}

LIBRARY_SUBMISSION_EXTRA_COLUMNS = {
    "contact_key": "TEXT",
    "request_fingerprint": "TEXT",
    "notification_state_json": "TEXT",
    "telegram_thread_id": "TEXT",
}

ADMIN_ORDER_ALLOWED_STATUSES = {
    "new",
    "priority",
    "in_work",
    "waiting_client",
    "done",
    "archived",
}

LIBRARY_SUBMISSION_ALLOWED_STATUSES = {
    "new",
    "priority",
    "approved",
    "rejected",
    "delivery_failed",
    "archived",
}

UPLOAD_SESSION_ALLOWED_STATUSES = {
    "created",
    "uploading",
    "uploaded",
    "consumed",
    "expired",
    "failed",
}


def ensure_orders_table(db: sqlite3.Connection) -> None:
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            work_type TEXT,
            topic TEXT,
            subject TEXT,
            deadline TEXT,
            contact TEXT,
            comment TEXT,
            ip TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            status TEXT DEFAULT 'new',
            source TEXT,
            source_label TEXT,
            source_path TEXT,
            entry_url TEXT,
            referrer TEXT,
            user_agent TEXT,
            contact_channel TEXT,
            estimated_price INTEGER,
            pages INTEGER,
            originality TEXT,
            sample_title TEXT,
            sample_type TEXT,
            sample_subject TEXT,
            sample_category TEXT,
            meta_json TEXT,
            attachments_json TEXT
        )
        """
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)")

    existing_columns = {
        row["name"]
        for row in db.execute("PRAGMA table_info(orders)").fetchall()
    }
    for column_name, column_type in ORDER_EXTRA_COLUMNS.items():
        if column_name not in existing_columns:
            db.execute(f"ALTER TABLE orders ADD COLUMN {column_name} {column_type}")
    db.execute("CREATE INDEX IF NOT EXISTS idx_orders_contact_key_created_at ON orders(contact_key, created_at)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_orders_request_fingerprint_created_at ON orders(request_fingerprint, created_at)")


def ensure_library_submissions_table(db: sqlite3.Connection) -> None:
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS library_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            subject TEXT,
            category TEXT,
            course TEXT,
            doc_type TEXT,
            tags_json TEXT,
            author_name TEXT,
            contact TEXT,
            comment TEXT,
            ip TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            status TEXT DEFAULT 'new',
            source TEXT,
            source_path TEXT,
            entry_url TEXT,
            referrer TEXT,
            user_agent TEXT,
            attachments_json TEXT,
            antivirus_json TEXT,
            manager_note TEXT,
            manager_updated_at INTEGER
        )
        """
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_submissions_created_at ON library_submissions(created_at)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_submissions_status ON library_submissions(status)"
    )
    existing_columns = {
        row["name"]
        for row in db.execute("PRAGMA table_info(library_submissions)").fetchall()
    }
    for column_name, column_type in LIBRARY_SUBMISSION_EXTRA_COLUMNS.items():
        if column_name not in existing_columns:
            db.execute(f"ALTER TABLE library_submissions ADD COLUMN {column_name} {column_type}")
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_submissions_contact_key_created_at ON library_submissions(contact_key, created_at)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_submissions_request_fingerprint_created_at ON library_submissions(request_fingerprint, created_at)"
    )


def ensure_upload_sessions_table(db: sqlite3.Connection) -> None:
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS upload_sessions (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'created',
            files_json TEXT NOT NULL,
            chunks_json TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            expires_at INTEGER NOT NULL,
            client_ip TEXT,
            user_agent TEXT,
            consumed_entity_type TEXT,
            consumed_entity_id INTEGER
        )
        """
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at ON upload_sessions(expires_at)")


def ensure_outbox_jobs_table(db: sqlite3.Connection) -> None:
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS outbox_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 6,
            available_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            locked_at INTEGER,
            last_error TEXT,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )
        """
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_outbox_jobs_status_available ON outbox_jobs(status, available_at, id)"
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_outbox_jobs_locked_at ON outbox_jobs(locked_at)")


def ensure_submission_idempotency_table(db: sqlite3.Connection) -> None:
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS submission_idempotency (
            key TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )
        """
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_submission_idempotency_kind_created_at ON submission_idempotency(kind, created_at)"
    )


def clean_text(value: object, limit: int) -> str:
    if value is None:
        return ""
    text = str(value).replace("\x00", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def clean_url(value: object, limit: int = 500) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    if text.startswith("/"):
        text = SITE_ORIGIN.rstrip("/") + text
    return text[:limit]


def normalize_int(value: object, *, min_value: int | None = None, max_value: int | None = None) -> int | None:
    if value in (None, ""):
        return None
    try:
        normalized = str(value).replace("₽", "").replace(" ", "").replace(",", ".")
        result = int(float(normalized))
    except (TypeError, ValueError):
        return None
    if min_value is not None:
        result = max(min_value, result)
    if max_value is not None:
        result = min(max_value, result)
    return result


def parse_tags_text(value: object, limit: int = 16) -> list[str]:
    if value is None:
        return []
    raw = str(value).replace(";", ",").replace("\n", ",")
    tags: list[str] = []
    for part in raw.split(","):
        tag = clean_text(part, 40)
        if tag and tag not in tags:
            tags.append(tag)
        if len(tags) >= limit:
            break
    return tags


def normalize_contact_key(value: object) -> str:
    raw = clean_text(value, 240).lower()
    if not raw:
        return ""
    if "@" in raw and "." in raw:
        return raw.replace("mailto:", "")
    if raw.startswith("@") or "t.me/" in raw or "telegram.me/" in raw or "vk.com/" in raw:
        compact = raw.replace("https://", "").replace("http://", "")
        compact = compact.replace("vk.com/", "").replace("t.me/", "").replace("telegram.me/", "")
        compact = re.sub(r"\s+", "", compact)
        compact = re.sub(r"[^a-z0-9@._-]+", "", compact)
        return f"handle:{compact[:150]}"
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) >= 10:
        if len(digits) == 11 and digits.startswith("8"):
            digits = "7" + digits[1:]
        return f"phone:{digits}"
    compact = raw.replace("https://", "").replace("http://", "").replace("vk.com/", "").replace("t.me/", "")
    compact = re.sub(r"\s+", "", compact)
    compact = re.sub(r"[^a-z0-9@._-]+", "", compact)
    return compact[:160]


def _attachment_signature_parts(attachments: list[dict]) -> list[str]:
    parts: list[str] = []
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        name = clean_text(attachment.get("name") or attachment.get("stored_name"), 180)
        size = int(attachment.get("size_bytes") or 0)
        content_type = clean_text(attachment.get("content_type"), 120)
        parts.append(f"{name}:{size}:{content_type}")
    parts.sort()
    return parts


def build_request_fingerprint(kind: str, payload: dict, attachments: list[dict], upload_session_id: str = "") -> str:
    basis = {
        "kind": clean_text(kind, 40),
        "contact": normalize_contact_key(payload.get("contact")),
        "source": clean_text(payload.get("source"), 80),
        "entryUrl": clean_url(payload.get("entryUrl"), 240),
        "uploadSessionId": clean_text(upload_session_id, 120),
        "attachments": _attachment_signature_parts(attachments),
    }
    if kind == "order":
        basis.update(
            {
                "workType": clean_text(payload.get("workType"), 100),
                "topic": clean_text(payload.get("topic"), 500),
                "subject": clean_text(payload.get("subject"), 100),
                "deadline": clean_text(payload.get("deadline"), 100),
                "comment": clean_text(payload.get("comment"), 700),
                "contactChannel": clean_text(payload.get("contactChannel"), 80),
                "estimatedPrice": normalize_int(payload.get("estimatedPrice"), min_value=0, max_value=500000),
                "pages": normalize_int(payload.get("pages"), min_value=1, max_value=300),
                "originality": clean_text(payload.get("originality"), 100),
                "sampleTitle": clean_text(payload.get("sampleTitle"), 240),
                "sampleType": clean_text(payload.get("sampleType"), 120),
                "sampleSubject": clean_text(payload.get("sampleSubject"), 120),
                "sampleCategory": clean_text(payload.get("sampleCategory"), 120),
            }
        )
    else:
        basis.update(
            {
                "title": clean_text(payload.get("title"), 240),
                "description": clean_text(payload.get("description"), 2500),
                "subject": clean_text(payload.get("subject"), 120),
                "category": clean_text(payload.get("category"), 120),
                "course": clean_text(payload.get("course"), 80),
                "docType": clean_text(payload.get("docType"), 120),
                "authorName": clean_text(payload.get("authorName"), 120),
                "comment": clean_text(payload.get("comment"), 1000),
                "tags": parse_tags_text(payload.get("tags")),
            }
        )
    canonical = json.dumps(basis, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_idempotency_key(kind: str, payload: dict, fingerprint: str) -> str:
    explicit_key = clean_text(payload.get("idempotencyKey"), 160)
    if explicit_key:
        return f"{clean_text(kind, 40)}:{explicit_key}"
    return f"{clean_text(kind, 40)}:{fingerprint}"


def _cleanup_submission_idempotency(db: sqlite3.Connection) -> None:
    if random.random() > 0.05:
        return
    cutoff = int(time.time()) - IDEMPOTENCY_RETENTION_SECONDS
    db.execute("DELETE FROM submission_idempotency WHERE created_at < ?", (cutoff,))


def _lookup_recent_idempotency_hit(
    db: sqlite3.Connection,
    *,
    key: str,
    kind: str,
    window_seconds: int,
) -> int:
    row = db.execute(
        """
        SELECT entity_id, created_at
        FROM submission_idempotency
        WHERE key = ? AND kind = ?
        """,
        (key, kind),
    ).fetchone()
    if not row:
        return 0
    created_at = int(row["created_at"] or 0)
    if created_at < int(time.time()) - max(60, window_seconds):
        db.execute("DELETE FROM submission_idempotency WHERE key = ?", (key,))
        return 0
    return int(row["entity_id"] or 0)


def _register_submission_idempotency(
    db: sqlite3.Connection,
    *,
    key: str,
    kind: str,
    entity_id: int,
) -> None:
    db.execute(
        """
        INSERT INTO submission_idempotency (key, kind, entity_id, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (key, kind, entity_id, int(time.time())),
    )


def evaluate_order_submission_guard(
    db: sqlite3.Connection,
    *,
    ip: str,
    contact_key: str,
    now_ts: int,
) -> str:
    hour_cutoff = now_ts - 3600
    ip_hour_count = int(
        db.execute(
            "SELECT COUNT(*) AS c FROM orders WHERE ip = ? AND created_at >= ?",
            (ip, hour_cutoff),
        ).fetchone()["c"] or 0
    )
    if ip_hour_count >= ORDER_IP_HOURLY_LIMIT:
        return "Слишком много заявок с этого IP. Попробуйте позже."
    if contact_key:
        contact_hour_count = int(
            db.execute(
                "SELECT COUNT(*) AS c FROM orders WHERE contact_key = ? AND created_at >= ?",
                (contact_key, hour_cutoff),
            ).fetchone()["c"] or 0
        )
        if contact_hour_count >= ORDER_CONTACT_HOURLY_LIMIT:
            return "По этому контакту уже слишком много заявок за последний час. Подождите немного."
        burst_cutoff = now_ts - ORDER_CONTACT_BURST_WINDOW
        contact_burst_count = int(
            db.execute(
                "SELECT COUNT(*) AS c FROM orders WHERE contact_key = ? AND created_at >= ?",
                (contact_key, burst_cutoff),
            ).fetchone()["c"] or 0
        )
        if contact_burst_count >= ORDER_CONTACT_BURST_LIMIT:
            return "Похоже, заявка уже отправлялась совсем недавно. Если нужна правка, напишите в ответный канал."
    return ""


def evaluate_library_submission_guard(
    db: sqlite3.Connection,
    *,
    ip: str,
    contact_key: str,
    now_ts: int,
) -> str:
    hour_cutoff = now_ts - 3600
    ip_hour_count = int(
        db.execute(
            "SELECT COUNT(*) AS c FROM library_submissions WHERE ip = ? AND created_at >= ?",
            (ip, hour_cutoff),
        ).fetchone()["c"] or 0
    )
    if ip_hour_count >= LIBRARY_IP_HOURLY_LIMIT:
        return "Слишком много отправок с этого IP. Попробуйте позже."
    if contact_key:
        contact_hour_count = int(
            db.execute(
                "SELECT COUNT(*) AS c FROM library_submissions WHERE contact_key = ? AND created_at >= ?",
                (contact_key, hour_cutoff),
            ).fetchone()["c"] or 0
        )
        if contact_hour_count >= LIBRARY_CONTACT_HOURLY_LIMIT:
            return "По этому контакту уже было слишком много отправок за последний час. Подождите немного."
        burst_cutoff = now_ts - LIBRARY_CONTACT_BURST_WINDOW
        contact_burst_count = int(
            db.execute(
                "SELECT COUNT(*) AS c FROM library_submissions WHERE contact_key = ? AND created_at >= ?",
                (contact_key, burst_cutoff),
            ).fetchone()["c"] or 0
        )
        if contact_burst_count >= LIBRARY_CONTACT_BURST_LIMIT:
            return "Похожая работа уже отправлялась совсем недавно. Подождите немного перед повторной отправкой."
    return ""


def format_file_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes / (1024 * 1024):.1f} MB"


def format_money(value: int | None) -> str:
    if value is None:
        return ""
    return f"{value:,}".replace(",", " ") + " ₽"


def format_count_ru(value: int, one: str, few: str, many: str) -> str:
    n = abs(int(value))
    mod10 = n % 10
    mod100 = n % 100
    if mod10 == 1 and mod100 != 11:
        word = one
    elif 2 <= mod10 <= 4 and not 12 <= mod100 <= 14:
        word = few
    else:
        word = many
    return f"{value} {word}"


def format_admin_timestamp(value: int | None) -> str:
    if not value:
        return ""
    return datetime.fromtimestamp(value, MOSCOW_TZ).strftime("%d.%m.%Y %H:%M")


def mask_ip(value: str) -> str:
    ip = clean_text(value, 100)
    if not ip:
        return ""
    if ":" in ip:
        parts = ip.split(":")
        if len(parts) > 2:
            return ":".join(parts[:3]) + ":*"
        return ip
    parts = ip.split(".")
    if len(parts) == 4:
        return ".".join(parts[:3] + ["*"])
    return ip


def summarize_user_agent(user_agent: str) -> str:
    ua = clean_text(user_agent, 280).lower()
    if not ua:
        return ""

    if "iphone" in ua:
        device = "iPhone"
    elif "ipad" in ua:
        device = "iPad"
    elif "android" in ua:
        device = "Android"
    elif "macintosh" in ua or "mac os" in ua:
        device = "Mac"
    elif "windows" in ua:
        device = "Windows"
    else:
        device = "Устройство"

    if "edg" in ua:
        browser = "Edge"
    elif "opr" in ua or "opera" in ua:
        browser = "Opera"
    elif "chrome" in ua and "chromium" not in ua and "edg" not in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua:
        browser = "Safari"
    else:
        browser = ""

    return f"{device} · {browser}".strip(" ·")


def detect_contact_channel(contact: str) -> str:
    normalized = clean_text(contact, 240).lower()
    if not normalized:
        return ""

    channels: list[str] = []
    digits = re.sub(r"\D", "", normalized)
    if any(marker in normalized for marker in ("vk:", "vk.com", "вк", "vkontakte")):
        channels.append("ВКонтакте")
    if any(marker in normalized for marker in ("tg:", "telegram", "t.me")) or ("@" in normalized and "email" not in normalized and "почт" not in normalized):
        channels.append("Telegram")
    if any(marker in normalized for marker in ("тел:", "телефон", "+7", "whatsapp", "wa:", "звон")) or len(digits) >= 10:
        channels.append("Телефон")
    if any(marker in normalized for marker in ("email", "почт")) or re.search(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
        channels.append("Email")

    unique_channels: list[str] = []
    for label in channels:
        if label not in unique_channels:
            unique_channels.append(label)

    if not unique_channels:
        return "Не определён"
    if len(unique_channels) == 1:
        return unique_channels[0]
    return " + ".join(unique_channels)


def build_order_source_label(source: str, source_label: str) -> str:
    if source_label:
        return source_label
    return ORDER_SOURCE_LABELS.get(source, "Сайт БиблиоСалон")


def build_source_path(source_path: str, entry_url: str) -> str:
    if source_path:
        return source_path
    if not entry_url:
        return ""
    parsed = urlparse(entry_url)
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    return path[:240]


def describe_repeat_orders(contact_repeat_count: int, ip_repeat_count: int) -> str:
    parts = []
    if contact_repeat_count > 0:
        parts.append(f"по этому контакту уже {format_count_ru(contact_repeat_count, 'заявка', 'заявки', 'заявок')}")
    if ip_repeat_count > 0:
        parts.append(f"с этого IP уже {format_count_ru(ip_repeat_count, 'заявка', 'заявки', 'заявок')}")
    if not parts:
        return "Похоже, это первая заявка."
    return "; ".join(parts) + "."


def build_order_notification(order: dict, contact_repeat_count: int, ip_repeat_count: int) -> str:
    header_parts = [f"📥 Заявка #{order['id']}"]
    if order.get("deadline"):
        deadline_lower = order["deadline"].lower()
        if any(marker in deadline_lower for marker in ("24", "сегодня", "завтра", "срочно")):
            header_parts.append("срочно")

    lines = [" · ".join(header_parts)]
    created_label = format_admin_timestamp(order.get("created_at"))
    if created_label:
        lines.append(f"Когда: {created_label} (МСК)")
    lines.append("")
    lines.append("👤 Кто")
    lines.append(f"• Контакт: {order.get('contact') or 'не указан'}")
    if order.get("contact_channel"):
        lines.append(f"• Канал: {order['contact_channel']}")
    lines.append(f"• История: {describe_repeat_orders(contact_repeat_count, ip_repeat_count)}")
    masked_ip = mask_ip(order.get("ip", ""))
    if masked_ip:
        lines.append(f"• IP: {masked_ip}")
    device_label = summarize_user_agent(order.get("user_agent", ""))
    if device_label:
        lines.append(f"• Устройство: {device_label}")

    lines.append("")
    lines.append("📝 Что нужно")
    if order.get("topic"):
        lines.append(f"• Тема: {order['topic']}")
    if order.get("work_type"):
        lines.append(f"• Тип работы: {order['work_type']}")
    if order.get("subject"):
        lines.append(f"• Предмет: {order['subject']}")
    if order.get("deadline"):
        lines.append(f"• Срок: {order['deadline']}")
    if order.get("pages"):
        lines.append(f"• Объём: {order['pages']} стр.")
    if order.get("originality"):
        lines.append(f"• Уникальность: {order['originality']}")
    if order.get("estimated_price") is not None:
        lines.append(f"• Ориентир: {format_money(order['estimated_price'])}")

    sample_bits = [
        order.get("sample_title", ""),
        order.get("sample_type", ""),
        order.get("sample_subject", ""),
        order.get("sample_category", ""),
    ]
    sample_bits = [bit for bit in sample_bits if bit]
    if sample_bits:
        lines.append(f"• Основа: {' · '.join(sample_bits)}")

    lines.append("")
    lines.append("📍 Откуда пришёл")
    lines.append(f"• Источник: {order.get('source_label') or 'Сайт БиблиоСалон'}")
    if order.get("source_path"):
        lines.append(f"• Экран: {order['source_path']}")
    if order.get("entry_url"):
        lines.append(f"• Ссылка: {order['entry_url']}")
    if order.get("referrer"):
        lines.append(f"• Переход: {order['referrer']}")

    if order.get("comment"):
        lines.append("")
        lines.append("💬 Комментарий")
        lines.append(order["comment"])

    attachments = order.get("attachments") or []
    if attachments:
        lines.append("")
        lines.append("📎 Файлы")
        for attachment in attachments:
            filename = clean_text(attachment.get("name") or attachment.get("stored_name"), 180) or "Файл"
            size_label = clean_text(attachment.get("size_label") or attachment.get("size"), 32)
            if size_label:
                lines.append(f"• {filename} ({size_label})")
            else:
                lines.append(f"• {filename}")

    return "\n".join(lines)


def build_library_submission_notification(submission: dict) -> str:
    lines = [f"📚 Работа в библиотеку #{submission['id']}"]
    created_label = format_admin_timestamp(submission.get("created_at"))
    if created_label:
        lines.append(f"Когда: {created_label} (МСК)")

    lines.append("")
    lines.append("👤 Кто прислал")
    if submission.get("author_name"):
        lines.append(f"• Имя: {submission['author_name']}")
    lines.append(f"• Контакт: {submission.get('contact') or 'не указан'}")
    masked_ip = mask_ip(submission.get("ip", ""))
    if masked_ip:
        lines.append(f"• IP: {masked_ip}")
    device_label = summarize_user_agent(submission.get("user_agent", ""))
    if device_label:
        lines.append(f"• Устройство: {device_label}")

    lines.append("")
    lines.append("📄 Что прислали")
    lines.append(f"• Название: {submission.get('title') or 'Без названия'}")
    if submission.get("doc_type"):
        lines.append(f"• Тип: {submission['doc_type']}")
    if submission.get("subject"):
        lines.append(f"• Предмет: {submission['subject']}")
    if submission.get("category"):
        lines.append(f"• Категория: {submission['category']}")
    if submission.get("course"):
        lines.append(f"• Курс: {submission['course']}")
    tags = submission.get("tags") or []
    if tags:
        lines.append(f"• Теги: {', '.join(tags)}")
    antivirus = submission.get("antivirus") or {}
    if antivirus.get("status") == "clean":
        engine = antivirus.get("engine") or "clamav"
        lines.append(f"• Антивирус: чисто ({engine})")

    lines.append("")
    lines.append("📍 Откуда пришло")
    if submission.get("source"):
        lines.append(f"• Источник: {submission['source']}")
    if submission.get("source_path"):
        lines.append(f"• Экран: {submission['source_path']}")
    if submission.get("entry_url"):
        lines.append(f"• Ссылка: {submission['entry_url']}")
    if submission.get("referrer"):
        lines.append(f"• Переход: {submission['referrer']}")

    if submission.get("description"):
        lines.append("")
        lines.append("📝 Описание")
        lines.append(submission["description"])

    if submission.get("comment"):
        lines.append("")
        lines.append("💬 Комментарий")
        lines.append(submission["comment"])

    attachments = submission.get("attachments") or []
    if attachments:
        lines.append("")
        lines.append("📎 Файлы")
        for attachment in attachments:
            filename = clean_text(attachment.get("name") or attachment.get("stored_name"), 180) or "Файл"
            size_label = clean_text(attachment.get("size_label") or attachment.get("size"), 32)
            line = f"• {filename}"
            if size_label:
                line += f" ({size_label})"
            lines.append(line)

    return "\n".join(lines)


def normalize_order_attachment_filename(filename: str | None) -> tuple[str, str, str]:
    raw_name = os.path.basename(str(filename or "").replace("\\", "/")).replace("\x00", " ").strip()
    raw_name = re.sub(r"\s+", " ", raw_name)
    if not raw_name or raw_name in {".", ".."}:
        return "", "", ""
    stem, ext = os.path.splitext(raw_name)
    ext = ext.lower()[:16]
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._") or "file"
    original_name = raw_name[:180]
    stored_name = f"{safe_stem[:80]}_{secrets.token_hex(6)}{ext}"
    return original_name, stored_name, ext


def order_attachment_type_allowed(filename: str, content_type: str) -> bool:
    _, _, ext = normalize_order_attachment_filename(filename)
    if ext in ORDER_ATTACHMENT_EXTENSIONS:
        return True
    return content_type.startswith("image/")


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


def _upload_kind_config(kind: str) -> dict:
    normalized = (kind or "").strip().lower()
    if normalized == "order":
        return {
            "kind": "order",
            "max_files": MAX_ORDER_ATTACHMENTS,
            "max_file_size": MAX_ORDER_ATTACHMENT_SIZE,
            "max_total_size": MAX_ORDER_TOTAL_ATTACHMENT_SIZE,
            "required": False,
        }
    if normalized == "library":
        return {
            "kind": "library",
            "max_files": MAX_LIBRARY_ATTACHMENTS,
            "max_file_size": MAX_LIBRARY_ATTACHMENT_SIZE,
            "max_total_size": MAX_LIBRARY_TOTAL_ATTACHMENT_SIZE,
            "required": True,
        }
    raise ValueError("Неизвестный тип загрузки.")


def _upload_session_dir(session_id: str) -> str:
    return os.path.join(UPLOAD_SESSION_DIR, session_id)


def _upload_chunk_bytes_for_index(file_size: int, chunk_index: int) -> int:
    if chunk_index < 0:
        return 0
    offset = chunk_index * UPLOAD_CHUNK_SIZE
    remaining = file_size - offset
    if remaining <= 0:
        return 0
    return min(UPLOAD_CHUNK_SIZE, remaining)


def _build_pending_antivirus_result(attachments: list[dict]) -> dict:
    return {
        "status": "pending",
        "engine": "",
        "files": [
            {
                "name": attachment["name"],
                "stored_name": attachment["stored_name"],
                "status": "pending",
                "engine": "",
                "details": "",
            }
            for attachment in attachments
        ],
    }


def _normalize_upload_session_files(kind: str, files: list[dict]) -> list[dict]:
    config = _upload_kind_config(kind)
    if not isinstance(files, list):
        raise ValueError("Некорректный список файлов для загрузки.")
    if config["required"] and not files:
        raise ValueError("Прикрепите хотя бы один файл.")
    if len(files) > config["max_files"]:
        raise ValueError(f"Можно прикрепить не больше {config['max_files']} файлов.")

    normalized: list[dict] = []
    total_size = 0
    for entry in files:
        if not isinstance(entry, dict):
            raise ValueError("Некорректные метаданные файла.")
        original_name, stored_name, _ = normalize_order_attachment_filename(entry.get("name"))
        if not original_name or not stored_name:
            raise ValueError("У файла отсутствует корректное имя.")
        content_type = clean_text(entry.get("contentType") or entry.get("content_type"), 120)
        size_bytes = normalize_int(entry.get("size"), min_value=1, max_value=config["max_file_size"])
        if size_bytes is None:
            raise ValueError(
                f"Размер файла «{original_name}» превышает {format_file_size(config['max_file_size'])}."
            )
        if not order_attachment_type_allowed(original_name, content_type):
            raise ValueError("Поддерживаем PDF, DOC, DOCX, XLS, XLSX, PPT, изображения, TXT и ZIP-архивы.")
        total_size += size_bytes
        normalized.append(
            {
                "name": original_name,
                "stored_name": stored_name,
                "content_type": content_type,
                "size_bytes": size_bytes,
                "size_label": format_file_size(size_bytes),
                "total_chunks": max(1, (size_bytes + UPLOAD_CHUNK_SIZE - 1) // UPLOAD_CHUNK_SIZE),
            }
        )

    if total_size > config["max_total_size"]:
        raise ValueError(
            f"Суммарный размер файлов не должен превышать {format_file_size(config['max_total_size'])}."
        )
    return normalized


def _parse_upload_chunks(raw_chunks: str, file_count: int) -> list[list[int]]:
    try:
        parsed = json.loads(raw_chunks) if raw_chunks else []
    except json.JSONDecodeError:
        parsed = []
    chunks: list[list[int]] = []
    if isinstance(parsed, list):
        for entry in parsed[:file_count]:
            if not isinstance(entry, list):
                chunks.append([])
                continue
            values = sorted({int(value) for value in entry if isinstance(value, int) or str(value).isdigit()})
            chunks.append([value for value in values if value >= 0])
    while len(chunks) < file_count:
        chunks.append([])
    return chunks


def _upload_session_progress(files: list[dict], chunks: list[list[int]]) -> dict:
    total_bytes = sum(int(file_info.get("size_bytes") or 0) for file_info in files)
    uploaded_bytes = 0
    for index, file_info in enumerate(files):
        file_size = int(file_info.get("size_bytes") or 0)
        for chunk_index in chunks[index] if index < len(chunks) else []:
            uploaded_bytes += _upload_chunk_bytes_for_index(file_size, int(chunk_index))
    uploaded_bytes = min(uploaded_bytes, total_bytes)
    percent = int(round((uploaded_bytes / total_bytes) * 100)) if total_bytes else 100
    return {
        "totalBytes": total_bytes,
        "uploadedBytes": uploaded_bytes,
        "percent": max(0, min(100, percent)),
    }


def _upload_session_is_complete(files: list[dict], chunks: list[list[int]]) -> bool:
    if len(files) != len(chunks):
        return False
    for index, file_info in enumerate(files):
        if len(chunks[index]) < int(file_info.get("total_chunks") or 0):
            return False
    return True


def _load_upload_session(db: sqlite3.Connection, session_id: str) -> dict | None:
    ensure_upload_sessions_table(db)
    row = db.execute("SELECT * FROM upload_sessions WHERE id = ?", (session_id,)).fetchone()
    if not row:
        return None
    files = json.loads(row["files_json"]) if row["files_json"] else []
    chunks = _parse_upload_chunks(row["chunks_json"], len(files))
    session = dict(row)
    session["files"] = files
    session["chunks"] = chunks
    return session


def cleanup_expired_upload_sessions(now: int | None = None) -> None:
    current = int(now or time.time())
    stale_consumed_before = current - max(UPLOAD_SESSION_TTL, 3600)
    with get_db() as db:
        ensure_upload_sessions_table(db)
        rows = db.execute(
            """
            SELECT id
            FROM upload_sessions
            WHERE expires_at <= ?
               OR (status IN ('consumed', 'failed', 'expired') AND updated_at <= ?)
            """,
            (current, stale_consumed_before),
        ).fetchall()
        if rows:
            db.executemany("DELETE FROM upload_sessions WHERE id = ?", [(row["id"],) for row in rows])
    for row in rows:
        try:
            shutil.rmtree(_upload_session_dir(row["id"]), ignore_errors=True)
        except Exception:
            logger.exception("Upload session cleanup failed: %s", row["id"])


def create_upload_session(kind: str, files: list[dict], client_ip: str, user_agent: str) -> dict:
    cleanup_expired_upload_sessions()
    normalized_files = _normalize_upload_session_files(kind, files)
    session_id = secrets.token_urlsafe(18)
    now = int(time.time())
    expires_at = now + UPLOAD_SESSION_TTL
    os.makedirs(_upload_session_dir(session_id), exist_ok=True)
    with get_db() as db:
        ensure_upload_sessions_table(db)
        db.execute(
            """
            INSERT INTO upload_sessions (
                id, kind, status, files_json, chunks_json, created_at, updated_at, expires_at, client_ip, user_agent
            ) VALUES (?, ?, 'created', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                kind,
                json.dumps(normalized_files, ensure_ascii=False, separators=(",", ":")),
                json.dumps([[] for _ in normalized_files], ensure_ascii=False, separators=(",", ":")),
                now,
                now,
                expires_at,
                clean_text(client_ip, 80),
                clean_text(user_agent, 280),
            ),
        )
    return {
        "id": session_id,
        "chunkSize": UPLOAD_CHUNK_SIZE,
        "expiresAt": expires_at,
        "files": normalized_files,
    }


def write_upload_chunk(session_id: str, file_index: int, chunk_index: int, body: bytes) -> dict:
    if not body:
        raise ValueError("Пустой chunk загрузки.")
    now = int(time.time())
    with get_db() as db:
        session = _load_upload_session(db, session_id)
        if not session:
            raise ValueError("Сессия загрузки не найдена.")
        if int(session.get("expires_at") or 0) <= now:
            db.execute(
                "UPDATE upload_sessions SET status = 'expired', updated_at = ? WHERE id = ?",
                (now, session_id),
            )
            raise ValueError("Сессия загрузки истекла. Начните загрузку заново.")
        if session.get("status") in {"consumed", "failed", "expired"}:
            raise ValueError("Эту сессию загрузки больше нельзя использовать.")
        files = session["files"]
        chunks = session["chunks"]
        if file_index < 0 or file_index >= len(files):
            raise ValueError("Некорректный индекс файла.")
        file_info = files[file_index]
        expected_chunk_size = _upload_chunk_bytes_for_index(int(file_info["size_bytes"]), chunk_index)
        if expected_chunk_size <= 0:
            raise ValueError("Некорректный номер чанка.")
        if len(body) != expected_chunk_size:
            raise ValueError("Некорректный размер чанка.")

        uploaded_chunks = set(chunks[file_index])
        if chunk_index not in uploaded_chunks:
            part_path = os.path.join(_upload_session_dir(session_id), file_info["stored_name"] + ".part")
            ensure_parent_dir(part_path)
            mode = "r+b" if os.path.exists(part_path) else "wb+"
            with open(part_path, mode) as fh:
                fh.seek(chunk_index * UPLOAD_CHUNK_SIZE)
                fh.write(body)
            uploaded_chunks.add(chunk_index)
            chunks[file_index] = sorted(uploaded_chunks)

        status = "uploaded" if _upload_session_is_complete(files, chunks) else "uploading"
        progress = _upload_session_progress(files, chunks)
        db.execute(
            """
            UPDATE upload_sessions
            SET status = ?, chunks_json = ?, updated_at = ?, expires_at = ?
            WHERE id = ?
            """,
            (
                status,
                json.dumps(chunks, ensure_ascii=False, separators=(",", ":")),
                now,
                now + UPLOAD_SESSION_TTL,
                session_id,
            ),
        )
    return {
        "status": status,
        "fileIndex": file_index,
        "chunkIndex": chunk_index,
        "progress": progress,
    }


def complete_upload_session(session_id: str) -> dict:
    now = int(time.time())
    with get_db() as db:
        session = _load_upload_session(db, session_id)
        if not session:
            raise ValueError("Сессия загрузки не найдена.")
        if int(session.get("expires_at") or 0) <= now:
            db.execute(
                "UPDATE upload_sessions SET status = 'expired', updated_at = ? WHERE id = ?",
                (now, session_id),
            )
            raise ValueError("Сессия загрузки истекла. Начните загрузку заново.")
        if not _upload_session_is_complete(session["files"], session["chunks"]):
            raise ValueError("Загрузка файлов ещё не завершена.")
        progress = _upload_session_progress(session["files"], session["chunks"])
        db.execute(
            "UPDATE upload_sessions SET status = 'uploaded', updated_at = ?, expires_at = ? WHERE id = ?",
            (now, now + UPLOAD_SESSION_TTL, session_id),
        )
    return {"status": "uploaded", "progress": progress}


def consume_upload_session(
    *,
    session_id: str,
    expected_kind: str,
    storage_root: str,
    storage_key: str,
    entity_dir_name: str,
    consumed_entity_id: int,
    db: sqlite3.Connection | None = None,
) -> tuple[list[dict], dict]:
    now = int(time.time())
    moved_paths: list[str] = []
    session_dir = _upload_session_dir(session_id)
    entity_dir = os.path.join(storage_root, entity_dir_name)

    db_context = nullcontext(db) if db is not None else get_db()
    with db_context as active_db:
        session = _load_upload_session(active_db, session_id)
        if not session:
            raise ValueError("Сессия загрузки не найдена.")
        if session.get("kind") != expected_kind:
            raise ValueError("Сессия загрузки принадлежит другой форме.")
        if int(session.get("expires_at") or 0) <= now:
            active_db.execute(
                "UPDATE upload_sessions SET status = 'expired', updated_at = ? WHERE id = ?",
                (now, session_id),
            )
            raise ValueError("Сессия загрузки истекла. Загрузите файлы заново.")
        if session.get("status") == "consumed":
            raise ValueError("Эта загрузка уже была использована.")
        if not _upload_session_is_complete(session["files"], session["chunks"]):
            raise ValueError("Файлы ещё не были загружены полностью.")

        os.makedirs(entity_dir, exist_ok=True)
        saved: list[dict] = []
        try:
            for file_info in session["files"]:
                part_path = os.path.join(session_dir, file_info["stored_name"] + ".part")
                if not os.path.exists(part_path):
                    raise ValueError("Не удалось найти загруженный файл в карантине.")
                dest_path = os.path.join(entity_dir, file_info["stored_name"])
                shutil.move(part_path, dest_path)
                moved_paths.append(dest_path)
                saved.append(
                    {
                        "name": file_info["name"],
                        "stored_name": file_info["stored_name"],
                        "storage": storage_key,
                        "relative_path": f"{entity_dir_name}/{file_info['stored_name']}",
                        "content_type": file_info.get("content_type", ""),
                        "size_bytes": int(file_info["size_bytes"]),
                        "size_label": file_info["size_label"],
                        "scan_status": "pending",
                        "scan_engine": "",
                    }
                )
        except Exception:
            for path in moved_paths:
                try:
                    os.remove(path)
                except OSError:
                    pass
            raise

        active_db.execute(
            """
            UPDATE upload_sessions
            SET status = 'consumed',
                updated_at = ?,
                consumed_entity_type = ?,
                consumed_entity_id = ?
            WHERE id = ?
            """,
            (now, storage_key, consumed_entity_id, session_id),
        )

    try:
        shutil.rmtree(session_dir, ignore_errors=True)
    except Exception:
        logger.exception("Upload session cleanup after consume failed: %s", session_id)

    return saved, _build_pending_antivirus_result(saved)


def _normalize_notification_attachments(attachments: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for attachment in attachments or []:
        if isinstance(attachment, dict) and attachment.get("relative_path"):
            normalized.append(attachment)
    return normalized


def run_antivirus_scan(file_path: str) -> dict:
    scanners: list[tuple[str, list[str]]] = []
    if CLAMDSCAN_PATH:
        scanners.append(("clamdscan", [CLAMDSCAN_PATH, "--fdpass", "--no-summary", file_path]))
    if CLAMSCAN_PATH:
        scanners.append(("clamscan", [CLAMSCAN_PATH, "--stdout", "--no-summary", file_path]))

    if not scanners:
        if ANTIVIRUS_REQUIRED:
            raise RuntimeError("Антивирусная проверка временно недоступна. Попробуйте позже.")
        return {"status": "skipped", "engine": "", "details": "scanner unavailable"}

    failures: list[str] = []
    for engine, command in scanners:
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=ANTIVIRUS_SCAN_TIMEOUT,
                check=False,
            )
        except subprocess.TimeoutExpired:
            logger.exception("Antivirus scan timed out for %s via %s", file_path, engine)
            failures.append(f"{engine}: timeout")
            continue
        except OSError:
            logger.exception("Antivirus scanner execution failed for %s via %s", file_path, engine)
            failures.append(f"{engine}: execution failed")
            continue

        details = "\n".join(part for part in [result.stdout.strip(), result.stderr.strip()] if part).strip()
        if result.returncode == 0:
            return {"status": "clean", "engine": engine, "details": details[:1000]}
        if result.returncode == 1:
            logger.warning("Antivirus rejected file %s via %s: %s", file_path, engine, details)
            raise ValueError("Файл отклонён антивирусной проверкой.")

        logger.warning("Antivirus scan failed for %s via %s: %s", file_path, engine, details)
        failures.append(f"{engine}: {(details or f'exit {result.returncode}')[:300]}")

    logger.error("All antivirus scanners failed for %s: %s", file_path, "; ".join(failures))
    raise RuntimeError("Антивирусная проверка временно недоступна. Попробуйте позже.")


def extract_form_attachments(
    form: FieldStorage,
    *,
    field_names: tuple[str, ...],
    max_files: int,
    max_file_size: int,
    max_total_size: int,
    required: bool = False,
) -> list[dict]:
    attachments: list[dict] = []
    total_size = 0
    for field_name in field_names:
        if field_name not in form:
            continue
        entries = form[field_name]
        if not isinstance(entries, list):
            entries = [entries]
        for entry in entries:
            if not getattr(entry, "filename", ""):
                continue
            original_name, stored_name, _ = normalize_order_attachment_filename(entry.filename)
            if not original_name:
                raise ValueError("Не удалось распознать имя прикреплённого файла.")
            content_type = clean_text(
                getattr(entry, "type", "") or mimetypes.guess_type(original_name)[0] or "application/octet-stream",
                120,
            )
            if not order_attachment_type_allowed(original_name, content_type):
                raise ValueError(
                    "Поддерживаем PDF, DOC, DOCX, XLS, XLSX, PPT, изображения, TXT и ZIP-архивы."
                )
            file_data = entry.file.read(max_file_size + 1)
            file_size = len(file_data)
            if file_size <= 0:
                continue
            if file_size > max_file_size:
                raise ValueError(
                    f"Один файл не должен превышать {format_file_size(max_file_size)}."
                )
            total_size += file_size
            if total_size > max_total_size:
                raise ValueError(
                    f"Суммарный размер файлов не должен превышать {format_file_size(max_total_size)}."
                )
            attachments.append(
                {
                    "name": original_name,
                    "stored_name": stored_name,
                    "content_type": content_type,
                    "size_bytes": file_size,
                    "size_label": format_file_size(file_size),
                    "data": file_data,
                }
            )
            if len(attachments) > max_files:
                raise ValueError(f"Можно прикрепить не больше {max_files} файлов.")
    if required and not attachments:
        raise ValueError("Прикрепите хотя бы один файл.")
    return attachments


def extract_order_attachments(form: FieldStorage) -> list[dict]:
    return extract_form_attachments(
        form,
        field_names=("attachments", "attachment", "files", "file"),
        max_files=MAX_ORDER_ATTACHMENTS,
        max_file_size=MAX_ORDER_ATTACHMENT_SIZE,
        max_total_size=MAX_ORDER_TOTAL_ATTACHMENT_SIZE,
        required=False,
    )


def extract_library_submission_attachments(form: FieldStorage) -> list[dict]:
    return extract_form_attachments(
        form,
        field_names=("files", "file", "attachments", "attachment"),
        max_files=MAX_LIBRARY_ATTACHMENTS,
        max_file_size=MAX_LIBRARY_ATTACHMENT_SIZE,
        max_total_size=MAX_LIBRARY_TOTAL_ATTACHMENT_SIZE,
        required=True,
    )


def save_private_attachments(
    *,
    storage_root: str,
    storage_key: str,
    entity_dir_name: str,
    attachments: list[dict],
) -> tuple[list[dict], dict]:
    if not attachments:
        return [], {}
    entity_dir = os.path.join(storage_root, entity_dir_name)
    os.makedirs(entity_dir, exist_ok=True)
    saved: list[dict] = []
    created_paths: list[str] = []
    try:
        for attachment in attachments:
            stored_name = attachment["stored_name"]
            dest_path = os.path.join(entity_dir, stored_name)
            with open(dest_path, "wb") as fh:
                fh.write(attachment["data"])
            created_paths.append(dest_path)
            saved.append(
                {
                    "name": attachment["name"],
                    "stored_name": stored_name,
                    "storage": storage_key,
                    "relative_path": f"{entity_dir_name}/{stored_name}",
                    "content_type": attachment["content_type"],
                    "size_bytes": attachment["size_bytes"],
                    "size_label": attachment["size_label"],
                    "scan_status": "pending",
                    "scan_engine": "",
                }
            )
        return saved, {
            "status": "pending",
            "engine": "",
            "files": [
                {
                    "name": attachment["name"],
                    "stored_name": attachment["stored_name"],
                    "status": "pending",
                    "engine": "",
                    "details": "",
                }
                for attachment in saved
            ],
        }
    except Exception:
        for path in created_paths:
            try:
                os.remove(path)
            except OSError:
                pass
        try:
            if os.path.isdir(entity_dir) and not os.listdir(entity_dir):
                os.rmdir(entity_dir)
        except OSError:
            pass
        raise


def save_order_attachments(order_id: int, attachments: list[dict]) -> tuple[list[dict], dict]:
    return save_private_attachments(
        storage_root=ORDER_UPLOAD_DIR,
        storage_key="orders",
        entity_dir_name=f"order_{order_id}",
        attachments=attachments,
    )


def save_library_submission_attachments(submission_id: int, attachments: list[dict]) -> tuple[list[dict], dict]:
    return save_private_attachments(
        storage_root=LIBRARY_SUBMISSION_DIR,
        storage_key="library_submissions",
        entity_dir_name=f"submission_{submission_id}",
        attachments=attachments,
    )


def _attachments_json(attachments: list[dict]) -> str:
    return json.dumps(attachments, ensure_ascii=False, separators=(",", ":")) if attachments else ""


def _antivirus_json(result: dict) -> str:
    return json.dumps(result, ensure_ascii=False, separators=(",", ":")) if result else ""


def _loads_json(raw: object, fallback):
    if not raw:
        return fallback
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(str(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback


def _notification_state_json(state: dict) -> str:
    return json.dumps(state, ensure_ascii=False, separators=(",", ":")) if state else ""


def _load_channel_state_map(raw: object) -> dict:
    parsed = _loads_json(raw, {})
    return parsed if isinstance(parsed, dict) else {}


def serialize_order_row(row: sqlite3.Row | dict | None) -> dict:
    data = dict(row or {})
    data["attachments"] = _loads_json(data.get("attachments_json"), [])
    data["meta"] = _loads_json(data.get("meta_json"), {})
    data["notificationState"] = _load_channel_state_map(data.get("notification_state_json"))
    data["detailHref"] = build_doc_href(str(data.get("sample_file") or ""))
    return data


def serialize_library_submission_row(row: sqlite3.Row | dict | None) -> dict:
    data = dict(row or {})
    data["tags"] = _loads_json(data.get("tags_json"), [])
    data["attachments"] = _loads_json(data.get("attachments_json"), [])
    data["antivirus"] = _loads_json(data.get("antivirus_json"), {})
    data["notificationState"] = _load_channel_state_map(data.get("notification_state_json"))
    return data


def _attachment_by_stored_name(attachments: list[dict], stored_name: str) -> dict | None:
    target = clean_text(stored_name, 255)
    if not target:
        return attachments[0] if attachments else None
    for attachment in attachments:
        if clean_text(attachment.get("stored_name"), 255) == target:
            return attachment
    return None


def resolve_admin_attachment_payload(kind: str, entity_id: int, stored_name: str) -> tuple[str, dict]:
    normalized_kind = clean_text(kind, 40).lower()
    with get_db() as db:
        if normalized_kind == "order":
            ensure_orders_table(db)
            row = db.execute("SELECT attachments_json FROM orders WHERE id = ?", (entity_id,)).fetchone()
        elif normalized_kind in {"library", "submission", "library_submission"}:
            ensure_library_submissions_table(db)
            row = db.execute(
                "SELECT attachments_json FROM library_submissions WHERE id = ?",
                (entity_id,),
            ).fetchone()
        else:
            raise ValueError("Unknown attachment kind")
    if not row:
        raise ValueError("Attachment owner was not found")
    attachments = _loads_json(row["attachments_json"], [])
    attachment = _attachment_by_stored_name(attachments, stored_name)
    if not attachment:
        raise ValueError("Attachment was not found")
    file_path = resolve_order_attachment_path(attachment)
    if not file_path:
        raise ValueError("Attachment file is unavailable")
    return file_path, attachment


def publish_library_submission_to_catalog(
    submission_id: int,
    *,
    stored_name: str = "",
    overrides: dict | None = None,
    manager_note: str = "",
) -> tuple[dict, dict]:
    overrides = overrides or {}
    with get_db() as db:
        ensure_library_submissions_table(db)
        row = db.execute("SELECT * FROM library_submissions WHERE id = ?", (submission_id,)).fetchone()
    if not row:
        raise ValueError("Submission was not found")

    submission = serialize_library_submission_row(row)
    attachments = submission.get("attachments") or []
    attachment = _attachment_by_stored_name(attachments, stored_name)
    if not attachment:
        raise ValueError("Submission does not contain a publishable file")

    source_path = resolve_order_attachment_path(attachment)
    if not source_path:
        raise ValueError("Attachment file is unavailable")

    original_name = clean_text(attachment.get("name") or attachment.get("stored_name"), 180) or "Документ"
    _, ext = os.path.splitext(original_name)
    title = clean_text(overrides.get("title") or submission.get("title"), 220) or os.path.splitext(original_name)[0]
    description = clean_text(overrides.get("description") or submission.get("description"), 4000)
    category = clean_text(overrides.get("category") or submission.get("category"), 120) or "Другое"
    subject = clean_text(overrides.get("subject") or submission.get("subject"), 120) or "Общее"
    course = clean_text(overrides.get("course") or submission.get("course"), 120)
    doc_type = clean_text(overrides.get("docType") or submission.get("doc_type") or category, 120) or category

    raw_tags = overrides.get("tags")
    if isinstance(raw_tags, str):
        tags = [part.strip() for part in raw_tags.split(",") if part.strip()]
    elif isinstance(raw_tags, list):
        tags = [clean_text(part, 60) for part in raw_tags if clean_text(part, 60)]
    else:
        tags = [clean_text(part, 60) for part in (submission.get("tags") or []) if clean_text(part, 60)]

    filename_title = title.strip() or os.path.splitext(original_name)[0]
    preferred_name = f"{doc_type} - {filename_title}{ext}" if ext else f"{doc_type} - {filename_title}"
    catalog_filename = unique_catalog_filename(preferred_name)
    target_path = os.path.join(UPLOAD_DIR, catalog_filename)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    shutil.copy2(source_path, target_path)

    size_bytes = int(attachment.get("size_bytes") or os.path.getsize(target_path) or 0)
    doc_entry = {
        "file": f"files/{catalog_filename}",
        "filename": catalog_filename,
        "size": format_file_size(size_bytes),
        "text": description,
        "tags": tags,
        "category": category,
        "subject": subject,
        "course": course,
        "exists": True,
        "title": title,
        "description": description,
        "catalogTitle": title,
        "catalogDescription": description,
        "docType": doc_type,
    }

    with _catalog_lock:
        catalog = load_catalog()
        catalog.append(doc_entry)
        save_catalog(catalog)

    state, thread_id = _load_library_delivery_meta(submission_id)
    note = clean_text(manager_note, 4000)
    if not note:
        note = clean_text(submission.get("manager_note"), 4000)
    _save_library_delivery_meta(
        submission_id,
        state,
        thread_id=thread_id,
        status="approved",
        manager_note=note,
    )

    with get_db() as db:
        updated_row = db.execute("SELECT * FROM library_submissions WHERE id = ?", (submission_id,)).fetchone()
    return doc_entry, serialize_library_submission_row(updated_row)


def _delivery_channel_completed(state: dict, channel: str) -> bool:
    status = clean_text(((state.get(channel) or {}).get("status") if isinstance(state.get(channel), dict) else ""), 40)
    return status in {"delivered", "skipped_unconfigured"}


def _set_delivery_channel_state(state: dict, channel: str, status: str, *, error: str = "") -> dict:
    state[channel] = {
        "status": status,
        "updated_at": int(time.time()),
        "last_error": clean_text(error, 500),
    }
    return state


def _load_order_delivery_meta(order_id: int) -> tuple[dict, str]:
    with get_db() as db:
        row = db.execute(
            "SELECT notification_state_json, telegram_thread_id FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
    if not row:
        raise ValueError(f"Order #{order_id} was not found for delivery")
    return _load_channel_state_map(row["notification_state_json"]), clean_text(row["telegram_thread_id"], 120)


def _save_order_delivery_meta(order_id: int, state: dict, thread_id: str = "") -> None:
    with get_db() as db:
        db.execute(
            """
            UPDATE orders
            SET notification_state_json = ?, telegram_thread_id = ?
            WHERE id = ?
            """,
            (_notification_state_json(state), clean_text(thread_id, 120), order_id),
        )


def _load_library_delivery_meta(submission_id: int) -> tuple[dict, str]:
    with get_db() as db:
        row = db.execute(
            "SELECT notification_state_json, telegram_thread_id FROM library_submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    if not row:
        raise ValueError(f"Library submission #{submission_id} was not found for delivery")
    return _load_channel_state_map(row["notification_state_json"]), clean_text(row["telegram_thread_id"], 120)


def _save_library_delivery_meta(
    submission_id: int,
    state: dict,
    *,
    thread_id: str = "",
    status: str | None = None,
    manager_note: str | None = None,
) -> None:
    set_parts = ["notification_state_json = ?", "telegram_thread_id = ?"]
    params: list[object] = [_notification_state_json(state), clean_text(thread_id, 120)]
    if status is not None:
        set_parts.append("status = ?")
        params.append(status)
    if manager_note is not None:
        set_parts.append("manager_note = ?")
        params.append(clean_text(manager_note, 4000))
        set_parts.append("manager_updated_at = ?")
        params.append(int(time.time()))
    params.append(submission_id)
    with get_db() as db:
        db.execute(
            f"UPDATE library_submissions SET {', '.join(set_parts)} WHERE id = ?",
            params,
        )


def enqueue_outbox_job(
    task_type: str,
    payload: dict,
    *,
    max_attempts: int = OUTBOX_DEFAULT_MAX_ATTEMPTS,
    available_at: int | None = None,
) -> int:
    now = int(time.time())
    with get_db() as db:
        ensure_outbox_jobs_table(db)
        cursor = db.execute(
            """
            INSERT INTO outbox_jobs (task_type, payload_json, status, attempts, max_attempts, available_at, updated_at)
            VALUES (?, ?, 'pending', 0, ?, ?, ?)
            """,
            (
                clean_text(task_type, 80),
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                max(1, int(max_attempts or OUTBOX_DEFAULT_MAX_ATTEMPTS)),
                int(available_at or now),
                now,
            ),
        )
        return int(cursor.lastrowid or 0)


def _claim_outbox_job() -> dict | None:
    now = int(time.time())
    stale_before = now - OUTBOX_LOCK_TIMEOUT_SECONDS
    with get_db() as db:
        ensure_outbox_jobs_table(db)
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            """
            SELECT id, task_type, payload_json, status, attempts, max_attempts, available_at, locked_at
            FROM outbox_jobs
            WHERE (
                status = 'pending' AND available_at <= ?
            ) OR (
                status = 'processing' AND COALESCE(locked_at, 0) <= ?
            )
            ORDER BY id ASC
            LIMIT 1
            """,
            (now, stale_before),
        ).fetchone()
        if not row:
            db.execute("COMMIT")
            return None
        db.execute(
            """
            UPDATE outbox_jobs
            SET status = 'processing', locked_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (now, now, row["id"]),
        )
        db.execute("COMMIT")
    return {
        "id": int(row["id"]),
        "task_type": row["task_type"],
        "payload": _loads_json(row["payload_json"], {}),
        "attempts": int(row["attempts"] or 0),
        "max_attempts": int(row["max_attempts"] or OUTBOX_DEFAULT_MAX_ATTEMPTS),
    }


def _mark_outbox_job_done(job_id: int) -> None:
    now = int(time.time())
    with get_db() as db:
        db.execute(
            """
            UPDATE outbox_jobs
            SET status = 'done', locked_at = NULL, last_error = '', updated_at = ?
            WHERE id = ?
            """,
            (now, job_id),
        )


def _reschedule_outbox_job(job: dict, exc: Exception) -> None:
    now = int(time.time())
    attempts = int(job.get("attempts") or 0) + 1
    max_attempts = max(1, int(job.get("max_attempts") or OUTBOX_DEFAULT_MAX_ATTEMPTS))
    failed = attempts >= max_attempts
    backoff = min(15 * 60, OUTBOX_RETRY_BASE_SECONDS * (2 ** min(attempts - 1, 6)))
    with get_db() as db:
        db.execute(
            """
            UPDATE outbox_jobs
            SET status = ?, attempts = ?, available_at = ?, locked_at = NULL, last_error = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                "failed" if failed else "pending",
                attempts,
                now + backoff,
                clean_text(str(exc), 1000),
                now,
                int(job["id"]),
            ),
        )
    if failed:
        logger.error(
            "Outbox job %s (%s) permanently failed after %s attempt(s): %s",
            job["id"],
            job.get("task_type"),
            attempts,
            exc,
        )
    else:
        logger.warning(
            "Outbox job %s (%s) failed on attempt %s/%s, retry in %ss: %s",
            job["id"],
            job.get("task_type"),
            attempts,
            max_attempts,
            backoff,
            exc,
        )


def _cleanup_outbox_jobs() -> None:
    if random.random() > 0.03:
        return
    now = int(time.time())
    done_cutoff = now - (7 * 24 * 60 * 60)
    failed_cutoff = now - (30 * 24 * 60 * 60)
    with get_db() as db:
        db.execute("DELETE FROM outbox_jobs WHERE status = 'done' AND updated_at < ?", (done_cutoff,))
        db.execute("DELETE FROM outbox_jobs WHERE status = 'failed' AND updated_at < ?", (failed_cutoff,))


def cleanup_outbox_jobs(force: bool = False) -> None:
    if not force:
        _cleanup_outbox_jobs()
        return
    now = int(time.time())
    done_cutoff = now - (7 * 24 * 60 * 60)
    failed_cutoff = now - (30 * 24 * 60 * 60)
    with get_db() as db:
        ensure_outbox_jobs_table(db)
        db.execute("DELETE FROM outbox_jobs WHERE status = 'done' AND updated_at < ?", (done_cutoff,))
        db.execute("DELETE FROM outbox_jobs WHERE status = 'failed' AND updated_at < ?", (failed_cutoff,))


def cleanup_submission_idempotency(force: bool = False) -> None:
    if not force and random.random() > 0.05:
        return
    cutoff = int(time.time()) - IDEMPOTENCY_RETENTION_SECONDS
    with get_db() as db:
        ensure_submission_idempotency_table(db)
        db.execute("DELETE FROM submission_idempotency WHERE created_at < ?", (cutoff,))


def run_housekeeping_pass(force: bool = False) -> None:
    cleanup_expired_upload_sessions()
    cleanup_outbox_jobs(force=force)
    cleanup_submission_idempotency(force=force)


def get_outbox_overview(limit: int = 100) -> dict:
    with get_db() as db:
        ensure_outbox_jobs_table(db)
        ensure_upload_sessions_table(db)
        ensure_submission_idempotency_table(db)
        recent_jobs = [
            dict(row)
            for row in db.execute(
                """
                SELECT id, task_type, status, attempts, max_attempts, available_at, locked_at,
                       last_error, created_at, updated_at
                FROM outbox_jobs
                ORDER BY id DESC
                LIMIT ?
                """,
                (max(1, min(int(limit or 100), 500)),),
            ).fetchall()
        ]
        counts = {
            "pending": int(db.execute("SELECT COUNT(*) FROM outbox_jobs WHERE status = 'pending'").fetchone()[0]),
            "processing": int(db.execute("SELECT COUNT(*) FROM outbox_jobs WHERE status = 'processing'").fetchone()[0]),
            "failed": int(db.execute("SELECT COUNT(*) FROM outbox_jobs WHERE status = 'failed'").fetchone()[0]),
            "done": int(db.execute("SELECT COUNT(*) FROM outbox_jobs WHERE status = 'done'").fetchone()[0]),
        }
        upload_session_counts = {
            row["status"]: int(row["count"] or 0)
            for row in db.execute(
                "SELECT status, COUNT(*) AS count FROM upload_sessions GROUP BY status"
            ).fetchall()
        }
        stale_uploads = int(
            db.execute(
                """
                SELECT COUNT(*)
                FROM upload_sessions
                WHERE expires_at <= ? OR (status IN ('consumed', 'failed', 'expired') AND updated_at <= ?)
                """,
                (int(time.time()), int(time.time()) - max(UPLOAD_SESSION_TTL, 3600)),
            ).fetchone()[0]
        )
        idempotency_count = int(db.execute("SELECT COUNT(*) FROM submission_idempotency").fetchone()[0])
    return {
        "counts": counts,
        "recentJobs": recent_jobs,
        "uploadSessions": upload_session_counts,
        "staleUploadSessions": stale_uploads,
        "idempotencyKeys": idempotency_count,
    }


def build_admin_analytics_payload() -> dict:
    with get_db() as db:
        total_views = db.execute("SELECT COALESCE(SUM(views),0) as s FROM doc_counters").fetchone()["s"]
        total_downloads = db.execute("SELECT COALESCE(SUM(downloads),0) as s FROM doc_counters").fetchone()["s"]
        total_likes = db.execute("SELECT COALESCE(SUM(likes),0) as s FROM doc_counters").fetchone()["s"]
        total_dislikes = db.execute("SELECT COALESCE(SUM(dislikes),0) as s FROM doc_counters").fetchone()["s"]
        top_viewed = db.execute(
            "SELECT file, views, downloads, likes, dislikes FROM doc_counters ORDER BY views DESC LIMIT 20"
        ).fetchall()
        top_downloaded = db.execute(
            "SELECT file, views, downloads, likes, dislikes FROM doc_counters ORDER BY downloads DESC LIMIT 20"
        ).fetchall()
        recent = db.execute(
            "SELECT file, action, created_at FROM event_buckets ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
    with _catalog_lock:
        catalog = load_catalog()
    return {
        "totalDocs": len(catalog),
        "totalViews": total_views,
        "totalDownloads": total_downloads,
        "totalLikes": total_likes,
        "totalDislikes": total_dislikes,
        "topViewed": [dict(r) for r in top_viewed],
        "topDownloaded": [dict(r) for r in top_downloaded],
        "recent": [{"file": r["file"], "action": r["action"], "at": r["created_at"]} for r in recent],
    }


def build_admin_bootstrap_payload(*, outbox_limit: int = 20) -> dict:
    with _catalog_lock:
        docs = load_catalog()
    with get_db() as db:
        ensure_orders_table(db)
        ensure_library_submissions_table(db)
        orders = db.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100").fetchall()
        submissions = db.execute(
            "SELECT * FROM library_submissions ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
    _status, health = build_ready_health()
    return {
        "ok": True,
        "docs": docs,
        "orders": [serialize_order_row(r) for r in orders],
        "submissions": [serialize_library_submission_row(r) for r in submissions],
        "analytics": build_admin_analytics_payload(),
        "outbox": get_outbox_overview(limit=outbox_limit),
        "health": health,
    }


def retry_outbox_job(job_id: int) -> dict:
    now = int(time.time())
    with get_db() as db:
        ensure_outbox_jobs_table(db)
        row = db.execute("SELECT * FROM outbox_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise ValueError("Outbox job not found")
        db.execute(
            """
            UPDATE outbox_jobs
            SET status = 'pending',
                attempts = 0,
                available_at = ?,
                locked_at = NULL,
                last_error = '',
                updated_at = ?
            WHERE id = ?
            """,
            (now, now, job_id),
        )
        updated = db.execute(
            """
            SELECT id, task_type, status, attempts, max_attempts, available_at, locked_at,
                   last_error, created_at, updated_at
            FROM outbox_jobs
            WHERE id = ?
            """,
            (job_id,),
        ).fetchone()
    return dict(updated) if updated else {}


def deliver_order_notification(
    *,
    order_id: int,
    subject: str,
    body: str,
    telegram_topic_name: str,
    attachments: list[dict] | None = None,
) -> tuple[list[str], list[str]]:
    state, thread_id = _load_order_delivery_meta(order_id)
    normalized_attachments = _normalize_notification_attachments(attachments)
    delivered: list[str] = []
    failed: list[str] = []

    def persist(channel: str, status: str, *, error: str = "") -> None:
        nonlocal state, thread_id
        _set_delivery_channel_state(state, channel, status, error=error)
        _save_order_delivery_meta(order_id, state, thread_id)

    if not _delivery_channel_completed(state, "vk"):
        if not _vk_delivery_configured():
            persist("vk", "skipped_unconfigured")
        elif _vk_notify_sync(body):
            delivered.append("vk")
            persist("vk", "delivered")
        else:
            failed.append("vk")
            persist("vk", "failed", error="VK delivery returned false")

    if not _delivery_channel_completed(state, "telegram"):
        if not _telegram_direct_delivery_configured():
            persist("telegram", "skipped_unconfigured")
        elif _telegram_notify_sync(body):
            delivered.append("telegram")
            persist("telegram", "delivered")
        else:
            failed.append("telegram")
            persist("telegram", "failed", error="Telegram direct delivery returned false")

    if not _delivery_channel_completed(state, "telegram_forum"):
        if not _telegram_forum_delivery_configured():
            persist("telegram_forum", "skipped_unconfigured")
        else:
            if not thread_id and TELEGRAM_FORUM_CREATE_TOPIC_PER_ORDER:
                thread_id = _ensure_telegram_forum_thread(telegram_topic_name)
                if thread_id:
                    _save_order_delivery_meta(order_id, state, thread_id)
            if TELEGRAM_FORUM_CREATE_TOPIC_PER_ORDER and not thread_id:
                failed.append("telegram_forum")
                persist("telegram_forum", "failed", error="Telegram forum topic was not created")
            elif _telegram_forum_send_sync(body, attachments=normalized_attachments, thread_id=thread_id):
                delivered.append("telegram_forum")
                persist("telegram_forum", "delivered")
            else:
                failed.append("telegram_forum")
                persist("telegram_forum", "failed", error="Telegram forum delivery returned false")

    if not _delivery_channel_completed(state, "email"):
        if not _email_delivery_configured():
            persist("email", "skipped_unconfigured")
        elif _email_notify_sync(subject, body, attachments=normalized_attachments):
            delivered.append("email")
            persist("email", "delivered")
        else:
            failed.append("email")
            persist("email", "failed", error="Email delivery returned false")

    if not _delivery_channel_completed(state, "max"):
        if not _max_delivery_configured():
            persist("max", "skipped_unconfigured")
        elif _max_notify_sync(body):
            delivered.append("max")
            persist("max", "delivered")
        else:
            failed.append("max")
            persist("max", "failed", error="MAX delivery returned false")

    return delivered, failed


def deliver_library_submission_notification(
    *,
    submission_id: int,
    body: str,
    topic_name: str,
    attachments: list[dict],
) -> tuple[list[str], list[str]]:
    state, thread_id = _load_library_delivery_meta(submission_id)
    delivered: list[str] = []
    failed: list[str] = []

    def persist(status: str, *, error: str = "", submission_status: str | None = None, manager_note: str | None = None) -> None:
        nonlocal state, thread_id
        _set_delivery_channel_state(state, "telegram_forum", status, error=error)
        _save_library_delivery_meta(
            submission_id,
            state,
            thread_id=thread_id,
            status=submission_status,
            manager_note=manager_note,
        )

    if _delivery_channel_completed(state, "telegram_forum"):
        return delivered, failed

    if not _telegram_forum_delivery_configured():
        persist("skipped_unconfigured", submission_status="delivery_failed", manager_note="Telegram forum не настроен.")
        return delivered, failed

    if not thread_id and TELEGRAM_FORUM_CREATE_TOPIC_PER_ORDER:
        thread_id = _ensure_telegram_forum_thread(topic_name)
        if thread_id:
            _save_library_delivery_meta(submission_id, state, thread_id=thread_id)
    if TELEGRAM_FORUM_CREATE_TOPIC_PER_ORDER and not thread_id:
        failed.append("telegram_forum")
        persist(
            "failed",
            error="Telegram forum topic was not created",
            submission_status="delivery_failed",
            manager_note="Работа сохранена, но тема в Telegram не была создана.",
        )
        return delivered, failed

    if _telegram_forum_send_sync(body, attachments=attachments, thread_id=thread_id):
        delivered.append("telegram_forum")
        persist("delivered", submission_status="new", manager_note="")
        return delivered, failed

    failed.append("telegram_forum")
    persist(
        "failed",
        error="Telegram forum delivery returned false",
        submission_status="delivery_failed",
        manager_note="Работа сохранена, но не доставлена в Telegram.",
    )
    return delivered, failed

def _update_attachment_scan_state(attachments: list[dict], *, status: str, engine: str = "") -> list[dict]:
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        attachment["scan_status"] = status
        attachment["scan_engine"] = engine
    return attachments


def _remove_saved_attachments(attachments: list[dict]) -> None:
    for attachment in attachments:
        file_path = resolve_order_attachment_path(attachment)
        if not file_path:
            continue
        try:
            os.remove(file_path)
        except OSError:
            logger.exception("Attachment cleanup failed: %s", attachment)


def scan_saved_attachments(attachments: list[dict]) -> dict:
    normalized = _normalize_notification_attachments(attachments)
    if not normalized:
        return {"status": "clean", "engine": "", "files": []}

    antivirus_details: list[dict] = []
    with ANTIVIRUS_SCAN_SEMAPHORE:
        for attachment in normalized:
            file_path = resolve_order_attachment_path(attachment)
            if not file_path:
                raise RuntimeError("Не удалось прочитать сохранённый файл для антивирусной проверки.")
            scan_result = run_antivirus_scan(file_path)
            attachment["scan_status"] = scan_result.get("status") or "clean"
            attachment["scan_engine"] = scan_result.get("engine") or ""
            antivirus_details.append(
                {
                    "name": attachment.get("name", ""),
                    "stored_name": attachment.get("stored_name", ""),
                    "status": attachment["scan_status"],
                    "engine": attachment["scan_engine"],
                    "details": scan_result.get("details", ""),
                }
            )

    summary_engine = antivirus_details[0].get("engine") if antivirus_details else ""
    return {
        "status": "clean",
        "engine": summary_engine,
        "files": antivirus_details,
    }


def update_order_processing_note(order_id: int, attachments: list[dict], manager_note: str) -> None:
    with get_db() as db:
        ensure_orders_table(db)
        db.execute(
            """
            UPDATE orders
            SET attachments_json = ?, manager_note = ?, manager_updated_at = ?
            WHERE id = ?
            """,
            (_attachments_json(attachments), clean_text(manager_note, 4000), int(time.time()), order_id),
        )


def update_library_submission_processing(
    submission_id: int,
    *,
    attachments: list[dict],
    antivirus_result: dict,
    status: str,
    manager_note: str = "",
) -> None:
    with get_db() as db:
        ensure_library_submissions_table(db)
        db.execute(
            """
            UPDATE library_submissions
            SET attachments_json = ?, antivirus_json = ?, status = ?, manager_note = ?, manager_updated_at = ?
            WHERE id = ?
            """,
            (
                _attachments_json(attachments),
                _antivirus_json(antivirus_result),
                status,
                clean_text(manager_note, 4000),
                int(time.time()),
                submission_id,
            ),
        )


def finalize_order_processing(
    order_id: int,
    order_info: dict,
    contact_repeat_count: int,
    ip_repeat_count: int,
    saved_attachments: list[dict],
) -> None:
    notification_note = ""
    notify_attachments = saved_attachments

    try:
        scan_saved_attachments(saved_attachments)
        update_order_processing_note(order_id, saved_attachments, "")
    except ValueError as exc:
        notification_note = f"Антивирус отклонил вложения: {exc}"
        logger.warning("Order #%s attachments rejected after queue: %s", order_id, exc)
        _update_attachment_scan_state(saved_attachments, status="rejected")
        _remove_saved_attachments(saved_attachments)
        notify_attachments = []
        update_order_processing_note(order_id, saved_attachments, notification_note)
    except RuntimeError as exc:
        notification_note = f"Антивирус временно недоступен: {exc}"
        logger.error("Order #%s antivirus unavailable after queue: %s", order_id, exc)
        _update_attachment_scan_state(saved_attachments, status="scan_unavailable")
        notify_attachments = []
        update_order_processing_note(order_id, saved_attachments, notification_note)
    except Exception:
        notification_note = "Вложения не удалось обработать автоматически."
        logger.exception("Order #%s queued attachment processing failed", order_id)
        _update_attachment_scan_state(saved_attachments, status="processing_failed")
        notify_attachments = []
        update_order_processing_note(order_id, saved_attachments, notification_note)

    order_payload = dict(order_info)
    order_payload["attachments"] = notify_attachments
    notification_body = build_order_notification(order_payload, contact_repeat_count, ip_repeat_count)
    if notification_note:
        notification_body += f"\n\n[Вложения]\n{notification_note}"
    enqueue_outbox_job(
        "order_delivery",
        {
            "order_id": order_id,
            "subject": f"Academic Salon: новая заявка #{order_id}",
            "body": notification_body,
            "telegram_topic_name": f"Сайт #{order_id} · {order_info.get('work_type') or 'Заявка'}",
            "attachments": notify_attachments,
        },
    )


def finalize_library_submission_processing(
    submission_id: int,
    submission_info: dict,
    saved_attachments: list[dict],
) -> None:
    try:
        antivirus_result = scan_saved_attachments(saved_attachments)
        update_library_submission_processing(
            submission_id,
            attachments=saved_attachments,
            antivirus_result=antivirus_result,
            status="new",
            manager_note="",
        )
    except ValueError as exc:
        logger.warning("Library submission #%s rejected after queue: %s", submission_id, exc)
        _update_attachment_scan_state(saved_attachments, status="rejected")
        antivirus_result = {"status": "rejected", "engine": "", "files": []}
        _remove_saved_attachments(saved_attachments)
        update_library_submission_processing(
            submission_id,
            attachments=saved_attachments,
            antivirus_result=antivirus_result,
            status="rejected",
            manager_note=f"Антивирус отклонил файл: {exc}",
        )
        return
    except RuntimeError as exc:
        logger.error("Library submission #%s antivirus unavailable after queue: %s", submission_id, exc)
        _update_attachment_scan_state(saved_attachments, status="scan_unavailable")
        antivirus_result = {"status": "unavailable", "engine": "", "files": []}
        update_library_submission_processing(
            submission_id,
            attachments=saved_attachments,
            antivirus_result=antivirus_result,
            status="delivery_failed",
            manager_note=f"Антивирус временно недоступен: {exc}",
        )
        return
    except Exception:
        logger.exception("Library submission #%s queued processing failed", submission_id)
        _update_attachment_scan_state(saved_attachments, status="processing_failed")
        antivirus_result = {"status": "failed", "engine": "", "files": []}
        update_library_submission_processing(
            submission_id,
            attachments=saved_attachments,
            antivirus_result=antivirus_result,
            status="delivery_failed",
            manager_note="Не удалось обработать вложения автоматически.",
        )
        return

    submission_payload = dict(submission_info)
    submission_payload["attachments"] = saved_attachments
    submission_payload["antivirus"] = antivirus_result
    notification_body = build_library_submission_notification(submission_payload)
    topic_name = f"{LIBRARY_TOPIC_PREFIX} #{submission_id} · {clean_text(submission_info.get('title'), 80) or 'Новая работа'}"
    _save_library_delivery_meta(
        submission_id,
        _load_library_delivery_meta(submission_id)[0],
        status="new",
        manager_note="Файлы проверены. Доставка в Telegram в очереди.",
    )
    enqueue_outbox_job(
        "library_delivery",
        {
            "submission_id": submission_id,
            "body": notification_body,
            "topic_name": topic_name[:128],
            "attachments": saved_attachments,
        },
    )


def _handle_order_postprocess_job(payload: dict) -> None:
    finalize_order_processing(
        int(payload.get("order_id") or 0),
        payload.get("order_info") or {},
        int(payload.get("contact_repeat_count") or 0),
        int(payload.get("ip_repeat_count") or 0),
        payload.get("saved_attachments") or [],
    )


def _handle_order_delivery_job(payload: dict) -> None:
    order_id = int(payload.get("order_id") or 0)
    delivered, failed = deliver_order_notification(
        order_id=order_id,
        subject=clean_text(payload.get("subject"), 200) or f"Academic Salon: новая заявка #{order_id}",
        body=str(payload.get("body") or ""),
        telegram_topic_name=clean_text(payload.get("telegram_topic_name"), 128) or f"Сайт #{order_id} · Заявка",
        attachments=payload.get("attachments") or [],
    )
    if delivered:
        logger.info("Order #%s notification delivered via %s", order_id, ", ".join(delivered))
    if failed:
        raise RuntimeError(f"Order #{order_id} delivery failed via: {', '.join(failed)}")


def _handle_library_postprocess_job(payload: dict) -> None:
    finalize_library_submission_processing(
        int(payload.get("submission_id") or 0),
        payload.get("submission_info") or {},
        payload.get("saved_attachments") or [],
    )


def _handle_library_delivery_job(payload: dict) -> None:
    submission_id = int(payload.get("submission_id") or 0)
    delivered, failed = deliver_library_submission_notification(
        submission_id=submission_id,
        body=str(payload.get("body") or ""),
        topic_name=clean_text(payload.get("topic_name"), 128) or f"{LIBRARY_TOPIC_PREFIX} #{submission_id}",
        attachments=payload.get("attachments") or [],
    )
    if delivered:
        logger.info("Library submission #%s delivered via %s", submission_id, ", ".join(delivered))
    if failed:
        raise RuntimeError(f"Library submission #{submission_id} delivery failed via: {', '.join(failed)}")


def _execute_outbox_job(job: dict) -> None:
    task_type = clean_text(job.get("task_type"), 80)
    payload = job.get("payload") or {}
    if not isinstance(payload, dict):
        raise ValueError(f"Outbox job payload is invalid for task {task_type}")
    if task_type == "order_postprocess":
        _handle_order_postprocess_job(payload)
        return
    if task_type == "order_delivery":
        _handle_order_delivery_job(payload)
        return
    if task_type == "library_postprocess":
        _handle_library_postprocess_job(payload)
        return
    if task_type == "library_delivery":
        _handle_library_delivery_job(payload)
        return
    raise ValueError(f"Unknown outbox task type: {task_type}")


def _outbox_worker_loop() -> None:
    logger.info("Outbox worker started")
    while True:
        try:
            job = _claim_outbox_job()
            if not job:
                time.sleep(OUTBOX_IDLE_SLEEP_SECONDS)
                continue
            try:
                _execute_outbox_job(job)
            except Exception as exc:
                logger.exception("Outbox job %s (%s) crashed", job.get("id"), job.get("task_type"))
                _reschedule_outbox_job(job, exc)
            else:
                _mark_outbox_job_done(int(job["id"]))
                _cleanup_outbox_jobs()
        except Exception:
            logger.exception("Outbox worker loop failed")
            time.sleep(OUTBOX_IDLE_SLEEP_SECONDS)


def start_outbox_worker() -> None:
    global _OUTBOX_WORKER_THREAD
    with _OUTBOX_WORKER_LOCK:
        if _OUTBOX_WORKER_THREAD and _OUTBOX_WORKER_THREAD.is_alive():
            return
        _OUTBOX_WORKER_THREAD = threading.Thread(
            target=_outbox_worker_loop,
            name="bibliosaloon-outbox",
            daemon=True,
        )
        _OUTBOX_WORKER_THREAD.start()


def _housekeeping_worker_loop() -> None:
    logger.info("Housekeeping worker started")
    while True:
        try:
            run_housekeeping_pass(force=True)
        except Exception:
            logger.exception("Housekeeping worker loop failed")
        time.sleep(max(30, HOUSEKEEPING_INTERVAL_SECONDS))


def start_housekeeping_worker() -> None:
    global _HOUSEKEEPING_WORKER_THREAD
    with _HOUSEKEEPING_WORKER_LOCK:
        if _HOUSEKEEPING_WORKER_THREAD and _HOUSEKEEPING_WORKER_THREAD.is_alive():
            return
        _HOUSEKEEPING_WORKER_THREAD = threading.Thread(
            target=_housekeeping_worker_loop,
            name="bibliosaloon-housekeeping",
            daemon=True,
        )
        _HOUSEKEEPING_WORKER_THREAD.start()


def cleanup_old_rows(db: sqlite3.Connection) -> None:
    if random.random() > 0.04:
        return
    cutoff = int(time.time()) - (14 * 24 * 60 * 60)
    db.execute("DELETE FROM event_buckets WHERE created_at < ?", (cutoff,))


def sanitize_file(file_value: str | None) -> str | None:
    if not isinstance(file_value, str):
        return None
    candidate = file_value.strip().replace("\\", "/")
    if not candidate.startswith("files/"):
        return None
    if ".." in candidate.split("/"):
        return None
    full_path = os.path.normpath(os.path.join(BASE_DIR, candidate))
    files_root = os.path.normpath(os.path.join(BASE_DIR, "files"))
    if not full_path.startswith(files_root + os.sep):
        return None
    if not os.path.exists(full_path):
        return None
    return candidate


def normalize_client_id(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if 12 <= len(cleaned) <= 120 and all(ch.isalnum() or ch in "-_." for ch in cleaned):
        return f"cid:{cleaned}"
    return None


def fallback_client_key(handler: BaseHTTPRequestHandler) -> str:
    forwarded = handler.headers.get("X-Forwarded-For", "")
    ip = forwarded.split(",")[0].strip() or handler.client_address[0] or ""
    ua = handler.headers.get("User-Agent", "")[:200]
    digest = hashlib.sha256(f"{ip}|{ua}".encode("utf-8")).hexdigest()
    return f"anon:{digest[:40]}"


def resolve_client_key(handler: BaseHTTPRequestHandler, payload: dict | None = None, query: dict | None = None) -> str:
    payload = payload or {}
    query = query or {}
    client_id = normalize_client_id(payload.get("clientId"))
    if client_id:
        return client_id
    query_cid = query.get("cid", [None])[0]
    client_id = normalize_client_id(query_cid)
    if client_id:
        return client_id
    return fallback_client_key(handler)


def ensure_counter_row(db: sqlite3.Connection, file_value: str) -> None:
    db.execute(
        """
        INSERT INTO doc_counters (file, views, downloads, likes, dislikes, updated_at)
        VALUES (?, 0, 0, 0, 0, strftime('%s','now'))
        ON CONFLICT(file) DO NOTHING
        """,
        (file_value,),
    )


def fetch_stats_map(db: sqlite3.Connection, files: list[str], client_id: str) -> dict[str, dict]:
    stats = {
        file_value: {
            "views": 0,
            "downloads": 0,
            "likes": 0,
            "dislikes": 0,
            "reaction": 0,
        }
        for file_value in files
    }
    if not files:
        return stats
    placeholders = ",".join("?" for _ in files)
    counter_rows = db.execute(
        f"""
        SELECT file, views, downloads, likes, dislikes
        FROM doc_counters
        WHERE file IN ({placeholders})
        """,
        files,
    ).fetchall()
    for row in counter_rows:
        stats[row["file"]].update(
            {
                "views": int(row["views"] or 0),
                "downloads": int(row["downloads"] or 0),
                "likes": int(row["likes"] or 0),
                "dislikes": int(row["dislikes"] or 0),
            }
        )
    reaction_rows = db.execute(
        f"""
        SELECT file, reaction
        FROM reactions
        WHERE client_id = ? AND file IN ({placeholders})
        """,
        [client_id, *files],
    ).fetchall()
    for row in reaction_rows:
        stats[row["file"]]["reaction"] = int(row["reaction"] or 0)
    return stats


def fetch_single_stat(db: sqlite3.Connection, file_value: str, client_id: str) -> dict:
    return fetch_stats_map(db, [file_value], client_id)[file_value]


def record_event(db: sqlite3.Connection, file_value: str, action: str, client_id: str) -> tuple[dict, bool]:
    if action not in EVENT_WINDOWS:
        raise ValueError("Unsupported action")
    ensure_counter_row(db, file_value)
    bucket = int(time.time() // EVENT_WINDOWS[action])
    column = "views" if action == "view" else "downloads"
    db.execute("BEGIN IMMEDIATE")
    inserted = db.execute(
        """
        INSERT OR IGNORE INTO event_buckets (file, client_id, action, bucket, created_at)
        VALUES (?, ?, ?, ?, strftime('%s','now'))
        """,
        (file_value, client_id, action, bucket),
    ).rowcount > 0
    if inserted:
        db.execute(
            f"""
            UPDATE doc_counters
            SET {column} = {column} + 1,
                updated_at = strftime('%s','now')
            WHERE file = ?
            """,
            (file_value,),
        )
    cleanup_old_rows(db)
    stat = fetch_single_stat(db, file_value, client_id)
    db.commit()
    return stat, inserted


def set_reaction(db: sqlite3.Connection, file_value: str, reaction: int, client_id: str) -> dict:
    if reaction not in (-1, 0, 1):
        raise ValueError("Reaction must be -1, 0 or 1")
    ensure_counter_row(db, file_value)
    db.execute("BEGIN IMMEDIATE")
    current_row = db.execute(
        "SELECT reaction FROM reactions WHERE file = ? AND client_id = ?",
        (file_value, client_id),
    ).fetchone()
    current = int(current_row["reaction"]) if current_row else 0
    next_reaction = 0 if reaction == current else reaction
    if current == next_reaction:
        stat = fetch_single_stat(db, file_value, client_id)
        db.commit()
        return stat
    if current_row and current:
        prev_column = "likes" if current == 1 else "dislikes"
        db.execute(
            f"""
            UPDATE doc_counters
            SET {prev_column} = CASE WHEN {prev_column} > 0 THEN {prev_column} - 1 ELSE 0 END,
                updated_at = strftime('%s','now')
            WHERE file = ?
            """,
            (file_value,),
        )
    if next_reaction:
        next_column = "likes" if next_reaction == 1 else "dislikes"
        db.execute(
            """
            INSERT INTO reactions (file, client_id, reaction, updated_at)
            VALUES (?, ?, ?, strftime('%s','now'))
            ON CONFLICT(file, client_id) DO UPDATE
                SET reaction = excluded.reaction,
                    updated_at = excluded.updated_at
            """,
            (file_value, client_id, next_reaction),
        )
        db.execute(
            f"""
            UPDATE doc_counters
            SET {next_column} = {next_column} + 1,
                updated_at = strftime('%s','now')
            WHERE file = ?
            """,
            (file_value,),
        )
    else:
        db.execute(
            "DELETE FROM reactions WHERE file = ? AND client_id = ?",
            (file_value, client_id),
        )
    stat = fetch_single_stat(db, file_value, client_id)
    db.commit()
    return stat


# ════════════════════════════════════════════════════════════════
# PROGRESSIVE ACCOUNT (Stage A) — invisible cabinet + VK/TG login
# ════════════════════════════════════════════════════════════════

TG_BOT_NAME: str = os.environ.get("SALON_TELEGRAM_BOT_NAME", "").strip().lstrip("@")
VK_APP_ID: str = os.environ.get("SALON_VK_APP_ID", "").strip()
VK_APP_SECRET: str = os.environ.get("SALON_VK_APP_SECRET", "").strip()

ACCOUNT_COOKIE_NAME: str = "academicSalonSession"
ACCOUNT_SESSION_TTL: int = 90 * 24 * 60 * 60   # 90 days
ACCOUNT_TG_MAX_AGE: int = 24 * 60 * 60         # 24h freshness for TG widget


def ensure_accounts_schema(db: sqlite3.Connection) -> None:
    """Create users + account_sessions tables (idempotent).

    Also migrates the orders table with user_id + last_notified_status columns.
    """
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id     TEXT UNIQUE,
            vk_id         TEXT UNIQUE,
            vk_handle     TEXT,
            vk_name       TEXT,
            vk_avatar     TEXT,
            tg_id         TEXT UNIQUE,
            tg_handle     TEXT,
            tg_name       TEXT,
            tg_avatar     TEXT,
            contact_phone TEXT,
            contact_email TEXT,
            created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            last_seen_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS account_sessions (
            token      TEXT PRIMARY KEY,
            user_id    INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_account_sessions_expires
            ON account_sessions(expires_at);
        """
    )
    # Orders — lazy migration (safe if columns already exist)
    for col_sql in (
        "ALTER TABLE orders ADD COLUMN user_id INTEGER",
        "ALTER TABLE orders ADD COLUMN last_notified_status TEXT",
    ):
        try:
            db.execute(col_sql)
        except Exception:
            pass


# ── contact parsing ──────────────────────────────────────────────
_ACC_RE_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
_ACC_RE_TG_URL = re.compile(r"(?:https?://)?t(?:elegram)?\.me/([A-Za-z0-9_]{3,})", re.I)
_ACC_RE_VK_URL = re.compile(r"(?:https?://)?(?:m\.)?vk\.com/([A-Za-z0-9._]{3,})", re.I)
_ACC_RE_AT_HANDLE = re.compile(r"^@([A-Za-z0-9_]{3,})$")
_ACC_RE_PHONE = re.compile(r"[+\d][\d\s\-\(\)]{6,}\d")


def parse_account_contact(raw: str) -> dict[str, str]:
    """Extract tg_handle / vk_handle / phone / email from a free-form contact."""
    out: dict[str, str] = {}
    if not raw:
        return out
    s = raw.strip()

    m = _ACC_RE_TG_URL.search(s)
    if m:
        out["tg_handle"] = m.group(1)
    m = _ACC_RE_VK_URL.search(s)
    if m:
        out["vk_handle"] = m.group(1)
    if "tg_handle" not in out and "vk_handle" not in out:
        m = _ACC_RE_AT_HANDLE.match(s)
        if m:
            out["tg_handle"] = m.group(1)

    if _ACC_RE_EMAIL.match(s):
        out["email"] = s

    m = _ACC_RE_PHONE.search(s)
    if m and "email" not in out:
        phone = re.sub(r"[^\d+]", "", m.group(0))
        if 7 <= len(phone) <= 20:
            out["phone"] = phone
    return out


def _sanitize_account_device_id(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = raw.strip()
    if 8 <= len(cleaned) <= 64 and all(ch.isalnum() or ch in "-_." for ch in cleaned):
        return cleaned
    return None


def _attach_account_contact(db: sqlite3.Connection, user_id: int, parsed: dict[str, str]) -> None:
    """Save contact fragments without clobbering verified vk_id/tg_id."""
    if not parsed:
        return
    row = db.execute(
        "SELECT vk_id, vk_handle, tg_id, tg_handle, contact_phone, contact_email "
        "FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not row:
        return
    updates: list[str] = []
    params: list = []

    tg_handle = parsed.get("tg_handle")
    if tg_handle and not row["tg_id"] and not row["tg_handle"]:
        updates.append("tg_handle = ?")
        params.append(tg_handle[:64])

    vk_handle = parsed.get("vk_handle")
    if vk_handle and not row["vk_id"] and not row["vk_handle"]:
        updates.append("vk_handle = ?")
        params.append(vk_handle[:64])

    phone = parsed.get("phone")
    if phone and not row["contact_phone"]:
        updates.append("contact_phone = ?")
        params.append(phone[:32])

    email = parsed.get("email")
    if email and not row["contact_email"]:
        updates.append("contact_email = ?")
        params.append(email[:120])

    if not updates:
        return
    updates.append("last_seen_at = ?")
    params.append(int(time.time()))
    params.append(user_id)
    db.execute(
        f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
        params,
    )


# ── session cookie helpers ───────────────────────────────────────
def _issue_account_session(db: sqlite3.Connection, user_id: int) -> tuple[str, int]:
    token = secrets.token_urlsafe(40)
    expires_at = int(time.time()) + ACCOUNT_SESSION_TTL
    db.execute(
        "INSERT INTO account_sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user_id, expires_at),
    )
    return token, expires_at


def _read_account_cookies(handler: BaseHTTPRequestHandler) -> dict[str, str]:
    raw = handler.headers.get("Cookie", "")
    cookies: dict[str, str] = {}
    if not raw:
        return cookies
    for chunk in raw.split(";"):
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def _find_account_user_by_session(db: sqlite3.Connection, token: str | None) -> dict | None:
    if not token:
        return None
    row = db.execute(
        "SELECT u.* FROM users u "
        "JOIN account_sessions s ON s.user_id = u.id "
        "WHERE s.token = ? AND s.expires_at > ?",
        (token, int(time.time())),
    ).fetchone()
    return dict(row) if row else None


def _account_user_public(user_row: dict) -> dict:
    return {
        "id": user_row["id"],
        "deviceId": user_row.get("device_id"),
        "vk": {
            "id": user_row.get("vk_id"),
            "handle": user_row.get("vk_handle"),
            "name": user_row.get("vk_name"),
            "avatar": user_row.get("vk_avatar"),
        } if user_row.get("vk_id") else None,
        "tg": {
            "id": user_row.get("tg_id"),
            "handle": user_row.get("tg_handle"),
            "name": user_row.get("tg_name"),
            "avatar": user_row.get("tg_avatar"),
        } if user_row.get("tg_id") else None,
    }


def _upsert_account_by_channel(
    db: sqlite3.Connection,
    channel: str,               # 'vk' or 'tg'
    channel_id: str,
    device_id: str | None,
    handle: str | None = None,
    name: str | None = None,
    avatar: str | None = None,
) -> int:
    """Find or create user by (vk|tg) id. Adopts device_id on first bind."""
    channel_col = "vk_id" if channel == "vk" else "tg_id"
    now = int(time.time())

    existing_channel = db.execute(
        f"SELECT id, device_id FROM users WHERE {channel_col} = ? LIMIT 1",
        (channel_id,),
    ).fetchone()
    existing_device = None
    if device_id:
        existing_device = db.execute(
            "SELECT id FROM users WHERE device_id = ? LIMIT 1",
            (device_id,),
        ).fetchone()

    if existing_channel:
        user_id = int(existing_channel["id"])
        if device_id and not existing_channel["device_id"]:
            if existing_device and int(existing_device["id"]) != user_id:
                db.execute(
                    "UPDATE users SET device_id = NULL WHERE id = ?",
                    (int(existing_device["id"]),),
                )
            db.execute(
                "UPDATE users SET device_id = ? WHERE id = ?",
                (device_id, user_id),
            )
    elif existing_device:
        user_id = int(existing_device["id"])
    else:
        cur = db.execute(
            "INSERT INTO users (device_id, created_at, last_seen_at) VALUES (?, ?, ?)",
            (device_id, now, now),
        )
        user_id = int(cur.lastrowid or 0)

    set_parts = [f"{channel_col} = ?"]
    params: list = [channel_id]
    for key, val in (("handle", handle), ("name", name), ("avatar", avatar)):
        if val is not None:
            set_parts.append(f"{channel}_{key} = ?")
            params.append(str(val)[:255])
    set_parts.append("last_seen_at = ?")
    params.append(now)
    params.append(user_id)
    db.execute(
        f"UPDATE users SET {', '.join(set_parts)} WHERE id = ?",
        params,
    )
    return user_id


def resolve_order_user(
    db: sqlite3.Connection,
    session_token: str | None,
    device_id: str | None,
    contact: str | None,
) -> int | None:
    """Find or create a user for an incoming order; attach parsed contact."""
    ensure_accounts_schema(db)
    user_id: int | None = None
    user = _find_account_user_by_session(db, session_token)
    if user:
        user_id = int(user["id"])

    device_clean = _sanitize_account_device_id(device_id)
    if not user_id and device_clean:
        row = db.execute(
            "SELECT id FROM users WHERE device_id = ? LIMIT 1",
            (device_clean,),
        ).fetchone()
        if row:
            user_id = int(row["id"])
        else:
            cur = db.execute(
                "INSERT INTO users (device_id) VALUES (?)",
                (device_clean,),
            )
            user_id = int(cur.lastrowid or 0)

    if user_id and contact:
        _attach_account_contact(db, user_id, parse_account_contact(contact))
    return user_id


# ── TG Login Widget HMAC verify ──────────────────────────────────
def verify_telegram_widget_hash(payload: dict, provided_hash: str) -> bool:
    if not TELEGRAM_BOT_TOKEN:
        return False
    data = {k: v for k, v in payload.items() if k != "hash" and v not in (None, "")}
    data_check_string = "\n".join(f"{k}={data[k]}" for k in sorted(data.keys()))
    secret_key = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode()).digest()
    computed = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, provided_hash)


# ── VK OAuth exchange ────────────────────────────────────────────
def vk_exchange_code(code: str, redirect_uri: str) -> dict:
    if not VK_APP_ID or not VK_APP_SECRET:
        raise RuntimeError("VK login is not configured on this server")
    params = urllib.parse.urlencode({
        "client_id": VK_APP_ID,
        "client_secret": VK_APP_SECRET,
        "redirect_uri": redirect_uri,
        "code": code,
    })
    url = f"https://oauth.vk.com/access_token?{params}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        data = _read_json_response(resp)
    if "error" in data or not data.get("user_id"):
        raise RuntimeError(data.get("error_description") or data.get("error") or "VK rejected the code")
    return data


def vk_fetch_profile(access_token: str) -> dict:
    try:
        url = "https://api.vk.com/method/users.get?" + urllib.parse.urlencode({
            "v": "5.131",
            "access_token": access_token,
            "fields": "screen_name,photo_100",
        })
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = _read_json_response(resp)
        items = data.get("response") or []
        return items[0] if items else {}
    except Exception:
        return {}


# ── direct-to-user DM (Stage 3) ──────────────────────────────────
def _tg_dm_sync(tg_id: str, message: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not tg_id:
        return False
    try:
        _telegram_api_request("sendMessage", {
            "chat_id": tg_id,
            "text": message,
            "disable_web_page_preview": "true",
        })
        return True
    except Exception as exc:
        logger.warning("TG DM to %s failed: %s", tg_id, exc)
        return False


def _vk_dm_sync(vk_id: str, message: str) -> bool:
    if not VK_TOKEN or not vk_id:
        return False
    try:
        params = urllib.parse.urlencode({
            "user_id": vk_id,
            "message": message,
            "random_id": random.randint(1, 2**31),
            "access_token": VK_TOKEN,
            "v": "5.199",
        })
        url = f"https://api.vk.com/method/messages.send?{params}"
        with urllib.request.urlopen(url, timeout=15) as response:
            payload = _read_json_response(response)
    except Exception as exc:
        logger.warning("VK DM to %s failed: %s", vk_id, exc)
        return False
    if payload.get("error"):
        logger.warning("VK DM to %s rejected: %s", vk_id, payload["error"])
        return False
    return True


def send_user_dm(
    *,
    tg_id: str | None = None,
    vk_id: str | None = None,
    email: str | None = None,
    message: str,
    subject: str = "Академический Салон",
) -> str | None:
    """Fan-out DM: TG → VK → email. Returns the delivered channel."""
    if tg_id and _tg_dm_sync(str(tg_id), message):
        return "tg"
    if vk_id and _vk_dm_sync(str(vk_id), message):
        return "vk"
    if email and _email_notify_sync(subject, message):
        return "email"
    return None


def send_user_dm_async(**kwargs) -> None:
    def _go():
        try:
            send_user_dm(**kwargs)
        except Exception:
            logger.exception("user DM failed")
    threading.Thread(target=_go, daemon=True).start()


# Status → user-facing DM template
ORDER_STATUS_DM_TEMPLATES: dict[str, str] = {
    "in_work": (
        "Академический Салон · заявка №{id} «{topic}» взята в работу.\n"
        "Вернёмся с черновиком — ориентировочно к {deadline}."
    ),
    "waiting_client": (
        "Академический Салон · по заявке №{id} «{topic}» нужна ваша правка.\n"
        "Напишите сюда, как будет удобно."
    ),
    "done": (
        "Академический Салон · заявка №{id} «{topic}» готова и закрыта.\n"
        "Спасибо, что выбрали салон."
    ),
    "archived": (
        "Академический Салон · заявка №{id} «{topic}» отправлена в архив.\n"
        "Если это ошибка — напишите, восстановим."
    ),
}


def maybe_notify_order_status_change(
    db: sqlite3.Connection,
    order_id: int,
    new_status: str,
) -> bool:
    """After an admin status update, fire a DM to the bound user."""
    if new_status not in ORDER_STATUS_DM_TEMPLATES:
        return False
    ensure_accounts_schema(db)
    row = db.execute(
        "SELECT id, topic, work_type, deadline, user_id, last_notified_status "
        "FROM orders WHERE id = ?",
        (order_id,),
    ).fetchone()
    if not row or not row["user_id"]:
        return False
    if (row["last_notified_status"] or "") == new_status:
        return False

    user_row = db.execute(
        "SELECT tg_id, vk_id, contact_email FROM users WHERE id = ?",
        (row["user_id"],),
    ).fetchone()
    if not user_row:
        return False

    topic = (row["topic"] or row["work_type"] or "без темы").strip()[:120]
    message = ORDER_STATUS_DM_TEMPLATES[new_status].format(
        id=row["id"],
        topic=topic,
        deadline=row["deadline"] or "оговорённому сроку",
    )
    send_user_dm_async(
        tg_id=user_row["tg_id"],
        vk_id=user_row["vk_id"],
        email=user_row["contact_email"],
        message=message,
        subject=f"Академический Салон · заявка №{row['id']}",
    )
    db.execute(
        "UPDATE orders SET last_notified_status = ? WHERE id = ?",
        (new_status, order_id),
    )
    return True


class StatsHandler(BaseHTTPRequestHandler):
    server_version = f"BibliosaloonStats/{SERVICE_VERSION}"

    def log_message(self, fmt: str, *args) -> None:
        logger.info("%s - - [%s] %s", self.address_string(), self.log_date_time_string(), fmt % args)

    def send_response(self, code: int, message: str | None = None) -> None:
        self._response_status = code
        super().send_response(code, message)

    def end_headers(self) -> None:
        request_id = getattr(self, "_request_id", "")
        if request_id:
            self.send_header("X-Request-Id", request_id)
        super().end_headers()

    def _begin_request(self) -> None:
        self._request_started_at = time.perf_counter()
        self._request_id = secrets.token_hex(8)
        self._response_status = None
        self._response_size = 0

    def _finish_request(self, error: Exception | None = None) -> None:
        started_at = getattr(self, "_request_started_at", None)
        duration_ms = (time.perf_counter() - started_at) * 1000 if started_at else 0.0
        logger_method = logger.error if error or (self._response_status or 500) >= 500 else logger.info
        logger_method(
            "request id=%s method=%s path=%s status=%s duration_ms=%.2f size=%s ip=%s ua=%s",
            getattr(self, "_request_id", "-"),
            self.command,
            self.path,
            self._response_status or "-",
            duration_ms,
            getattr(self, "_response_size", 0),
            get_client_ip(self),
            clean_text(self.headers.get("User-Agent"), 160),
        )

    def _run_instrumented(self, func) -> None:
        self._begin_request()
        error: Exception | None = None
        try:
            func()
        except BrokenPipeError as exc:
            error = exc
            logger.warning(
                "client disconnected id=%s method=%s path=%s",
                getattr(self, "_request_id", "-"),
                self.command,
                self.path,
            )
        except Exception as exc:
            error = exc
            logger.exception(
                "unhandled request failure id=%s method=%s path=%s",
                getattr(self, "_request_id", "-"),
                self.command,
                self.path,
            )
            if not getattr(self, "_response_status", None):
                try:
                    self._send_json(500, {"ok": False, "error": "Internal server error"})
                except Exception:
                    pass
        finally:
            self._finish_request(error)

    def _send_json(self, status: int, payload: dict) -> None:
        response_payload = dict(payload)
        if getattr(self, "_request_id", "") and "requestId" not in response_payload:
            response_payload["requestId"] = self._request_id
        body = json.dumps(response_payload, ensure_ascii=False).encode("utf-8")
        self._response_size = len(body)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _read_body(self, *, max_bytes: int | None = None) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return b""
        if max_bytes is not None and length > max_bytes:
            raise ValueError("Слишком большой объём данных.")
        raw = self.rfile.read(length)
        if max_bytes is not None and len(raw) > max_bytes:
            raise ValueError("Слишком большой объём данных.")
        return raw

    def _require_admin(self) -> bool:
        """Check admin auth. Returns True if authorized, sends 401 and returns False otherwise."""
        token = get_bearer_token(self)
        if admin_verify(token):
            return True
        self._send_json(401, {"ok": False, "error": "Unauthorized"})
        return False

    def _handle_get(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health/live":
            self._send_json(200, build_live_health())
            return
        if parsed.path == "/api/health/ready":
            status, payload = build_ready_health()
            self._send_json(status, payload)
            return
        if parsed.path == "/api/doc-stats/health":
            self._send_json(200, build_live_health() | {"legacy": "doc-stats"})
            return
        if parsed.path == "/api/doc-stats/download":
            query = parse_qs(parsed.query, keep_blank_values=False)
            file_value = sanitize_file(query.get("file", [None])[0])
            if not file_value:
                self._send_json(400, {"ok": False, "error": "Invalid file"})
                return
            if self.command != "HEAD":
                client_id = resolve_client_key(self, query=query)
                with get_db() as db:
                    try:
                        record_event(db, file_value, "download", client_id)
                    except Exception as exc:
                        self._send_json(500, {"ok": False, "error": str(exc)})
                        return
            self.send_response(302)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Location", "/" + quote(file_value, safe="/"))
            self.end_headers()
            return

        # ===== ADMIN GET ENDPOINTS =====
        if parsed.path == "/api/admin/verify":
            if self._require_admin():
                self._send_json(200, {"ok": True})
            return

        if parsed.path == "/api/admin/bootstrap":
            if not self._require_admin():
                return
            query = parse_qs(parsed.query, keep_blank_values=False)
            limit = normalize_int(query.get("outboxLimit", [20])[0], min_value=1, max_value=100) or 20
            self._send_json(200, build_admin_bootstrap_payload(outbox_limit=limit))
            return

        if parsed.path == "/api/admin/attachment":
            if not self._require_admin():
                return
            query = parse_qs(parsed.query, keep_blank_values=False)
            kind = query.get("kind", [""])[0]
            entity_id = normalize_int(query.get("id", [""])[0], min_value=1)
            stored_name = query.get("stored", [""])[0]
            if not entity_id or not stored_name:
                self._send_json(400, {"ok": False, "error": "kind, id and stored are required"})
                return
            try:
                file_path, attachment = resolve_admin_attachment_payload(kind, entity_id, stored_name)
            except ValueError as exc:
                self._send_json(404, {"ok": False, "error": str(exc)})
                return

            file_name = clean_text(attachment.get("name") or attachment.get("stored_name"), 180) or "attachment"
            content_type = clean_text(attachment.get("content_type"), 120) or mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            file_size = os.path.getsize(file_path)

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + quote(file_name))
            self.end_headers()
            if self.command != "HEAD":
                with open(file_path, "rb") as fh:
                    shutil.copyfileobj(fh, self.wfile)
            return

        if parsed.path == "/api/admin/docs":
            if not self._require_admin():
                return
            with _catalog_lock:
                catalog = load_catalog()
            self._send_json(200, {"ok": True, "docs": catalog, "total": len(catalog)})
            return

        if parsed.path == "/api/admin/orders":
            if not self._require_admin():
                return
            with get_db() as db:
                ensure_orders_table(db)
                rows = db.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100").fetchall()
            self._send_json(200, {"ok": True, "orders": [serialize_order_row(r) for r in rows]})
            return

        if parsed.path == "/api/admin/library-submissions":
            if not self._require_admin():
                return
            with get_db() as db:
                ensure_library_submissions_table(db)
                rows = db.execute(
                    "SELECT * FROM library_submissions ORDER BY created_at DESC LIMIT 100"
                ).fetchall()
            self._send_json(200, {"ok": True, "submissions": [serialize_library_submission_row(r) for r in rows]})
            return

        if parsed.path == "/api/admin/analytics":
            if not self._require_admin():
                return
            self._send_json(200, {"ok": True, **build_admin_analytics_payload()})
            return

        if parsed.path == "/api/admin/outbox":
            if not self._require_admin():
                return
            query = parse_qs(parsed.query, keep_blank_values=False)
            limit = normalize_int(query.get("limit", [100])[0], min_value=1, max_value=500) or 100
            self._send_json(200, {"ok": True, **get_outbox_overview(limit=limit)})
            return

        # ===== PROGRESSIVE ACCOUNT — read endpoints =====
        if parsed.path == "/api/auth/config":
            self._send_json(200, {
                "ok": True,
                "tg": {"enabled": bool(TELEGRAM_BOT_TOKEN and TG_BOT_NAME), "botName": TG_BOT_NAME or None},
                "vk": {"enabled": bool(VK_APP_ID and VK_APP_SECRET), "appId": VK_APP_ID or None},
            })
            return

        if parsed.path == "/api/auth/me":
            cookies = _read_account_cookies(self)
            token = cookies.get(ACCOUNT_COOKIE_NAME)
            with get_db() as db:
                ensure_accounts_schema(db)
                user = _find_account_user_by_session(db, token)
            if not user:
                self._send_json(200, {"ok": True, "authenticated": False})
                return
            self._send_json(200, {"ok": True, "authenticated": True, "user": _account_user_public(user)})
            return

        if parsed.path == "/api/auth/me/orders":
            cookies = _read_account_cookies(self)
            token = cookies.get(ACCOUNT_COOKIE_NAME)
            with get_db() as db:
                ensure_accounts_schema(db)
                user = _find_account_user_by_session(db, token)
                if not user:
                    self._send_json(200, {"ok": True, "authenticated": False, "orders": []})
                    return
                rows = db.execute(
                    "SELECT id, topic, work_type, deadline, status, created_at "
                    "FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
                    (int(user["id"]),),
                ).fetchall()
            self._send_json(200, {
                "ok": True,
                "authenticated": True,
                "orders": [dict(r) for r in rows],
            })
            return

        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_GET(self) -> None:
        self._run_instrumented(self._handle_get)

    def do_HEAD(self) -> None:
        self._run_instrumented(self._handle_get)

    def do_POST(self) -> None:
        self._begin_request()
        error: Exception | None = None
        parsed = urlparse(self.path)
        content_type = self.headers.get("Content-Type", "")
        order_paths = {"/api/order", "/api/order/"}
        library_submission_paths = {
            "/api/library-submit",
            "/api/library-submit/",
            "/api/contribute",
            "/api/contribute/",
        }
        try:
            # Upload must be handled BEFORE _read_json() since it's multipart
            if parsed.path == "/api/admin/upload":
                if not self._require_admin():
                    return
                self._handle_upload()
                return
            if parsed.path == "/api/uploads/chunk":
                self._handle_upload_chunk(parsed)
                return
            if parsed.path in order_paths and "multipart/form-data" in content_type:
                self._handle_public_order_multipart()
                return
            if parsed.path in library_submission_paths and "multipart/form-data" in content_type:
                self._handle_library_submission_multipart()
                return
            try:
                payload = self._read_json()
            except (json.JSONDecodeError, UnicodeDecodeError):
                self._send_json(400, {"ok": False, "error": "Invalid JSON"})
                return
            if parsed.path == "/api/uploads/init":
                self._handle_upload_session_init(payload)
                return
            if parsed.path == "/api/uploads/complete":
                self._handle_upload_session_complete(payload)
                return
            query = parse_qs(parsed.query, keep_blank_values=False)
            if parsed.path == "/api/doc-stats/batch":
                raw_files = payload.get("files")
                if not isinstance(raw_files, list):
                    self._send_json(400, {"ok": False, "error": "files must be an array"})
                    return
                files = []
                seen = set()
                for raw_file in raw_files[:MAX_BATCH]:
                    file_value = sanitize_file(raw_file)
                    if file_value and file_value not in seen:
                        files.append(file_value)
                        seen.add(file_value)
                client_id = resolve_client_key(self, payload=payload, query=query)
                with get_db() as db:
                    stats = fetch_stats_map(db, files, client_id)
                self._send_json(200, {"ok": True, "stats": stats})
                return
            if parsed.path == "/api/doc-stats/event":
                file_value = sanitize_file(payload.get("file"))
                action = payload.get("action")
                if not file_value or action not in EVENT_WINDOWS:
                    self._send_json(400, {"ok": False, "error": "Invalid file or action"})
                    return
                client_id = resolve_client_key(self, payload=payload, query=query)
                with get_db() as db:
                    try:
                        stat, counted = record_event(db, file_value, action, client_id)
                    except Exception as exc:
                        self._send_json(500, {"ok": False, "error": str(exc)})
                        return
                self._send_json(200, {"ok": True, "counted": counted, "stat": stat})
                return
            if parsed.path == "/api/doc-stats/reaction":
                file_value = sanitize_file(payload.get("file"))
                try:
                    reaction = int(payload.get("reaction", 0))
                except (TypeError, ValueError):
                    reaction = 9
                if not file_value or reaction not in (-1, 0, 1):
                    self._send_json(400, {"ok": False, "error": "Invalid file or reaction"})
                    return
                client_id = resolve_client_key(self, payload=payload, query=query)
                with get_db() as db:
                    try:
                        stat = set_reaction(db, file_value, reaction, client_id)
                    except Exception as exc:
                        self._send_json(500, {"ok": False, "error": str(exc)})
                        return
                self._send_json(200, {"ok": True, "stat": stat})
                return
            # ===== ADMIN POST ENDPOINTS =====
            if parsed.path == "/api/admin/login":
                ip = get_client_ip(self)
                if not admin_check_rate_limit(ip):
                    self._send_json(429, {"ok": False, "error": "Too many attempts. Try again later."})
                    return
                password = payload.get("password", "")
                if not password:
                    self._send_json(400, {"ok": False, "error": "Password required"})
                    return
                admin_record_attempt(ip)
                token = admin_login(password)
                if token:
                    self._send_json(200, {"ok": True, "token": token})
                else:
                    self._send_json(403, {"ok": False, "error": "Invalid password"})
                return

            if parsed.path == "/api/admin/logout":
                token = get_bearer_token(self)
                if token:
                    admin_logout(token)
                self._send_json(200, {"ok": True})
                return

            if parsed.path == "/api/admin/rebuild":
                if not self._require_admin():
                    return
                admin_cleanup_sessions()
                self._send_json(200, {"ok": True, "message": "Catalog is managed via catalog.json"})
                return

            if parsed.path == "/api/admin/outbox/retry":
                if not self._require_admin():
                    return
                job_id = normalize_int(payload.get("jobId"), min_value=1)
                if not job_id:
                    self._send_json(400, {"ok": False, "error": "jobId required"})
                    return
                try:
                    job = retry_outbox_job(job_id)
                except ValueError as exc:
                    self._send_json(404, {"ok": False, "error": str(exc)})
                    return
                self._send_json(200, {"ok": True, "job": job})
                return

            if parsed.path == "/api/admin/cleanup":
                if not self._require_admin():
                    return
                run_housekeeping_pass(force=True)
                self._send_json(200, {"ok": True, **get_outbox_overview(limit=50)})
                return

            if parsed.path == "/api/admin/library-submissions/publish":
                if not self._require_admin():
                    return
                submission_id = normalize_int(payload.get("id"), min_value=1)
                if not submission_id:
                    self._send_json(400, {"ok": False, "error": "id required"})
                    return
                doc_overrides = payload.get("doc")
                if doc_overrides is not None and not isinstance(doc_overrides, dict):
                    self._send_json(400, {"ok": False, "error": "doc must be an object"})
                    return
                try:
                    doc_entry, submission = publish_library_submission_to_catalog(
                        submission_id,
                        stored_name=clean_text(payload.get("stored"), 255),
                        overrides=doc_overrides or {},
                        manager_note=clean_text(payload.get("manager_note"), 4000),
                    )
                except ValueError as exc:
                    self._send_json(400, {"ok": False, "error": str(exc)})
                    return
                self._send_json(200, {"ok": True, "doc": doc_entry, "submission": submission})
                return

            # ===== PUBLIC ORDER FORM =====
            if parsed.path in order_paths:
                self._process_public_order(payload, attachments=[])
                return

            if parsed.path in library_submission_paths:
                self._process_library_submission(payload, attachments=[])
                return

            # ===== PROGRESSIVE ACCOUNT — auth endpoints =====
            if parsed.path == "/api/auth/tg":
                self._handle_auth_tg(payload)
                return

            if parsed.path == "/api/auth/vk":
                self._handle_auth_vk(payload)
                return

            if parsed.path == "/api/auth/logout":
                self._handle_auth_logout()
                return

            self._send_json(404, {"ok": False, "error": "Not found"})
        except BrokenPipeError as exc:
            error = exc
            logger.warning(
                "client disconnected id=%s method=%s path=%s",
                getattr(self, "_request_id", "-"),
                self.command,
                self.path,
            )
        except Exception as exc:
            error = exc
            logger.exception(
                "unhandled request failure id=%s method=%s path=%s",
                getattr(self, "_request_id", "-"),
                self.command,
                self.path,
            )
            if not getattr(self, "_response_status", None):
                try:
                    self._send_json(500, {"ok": False, "error": "Internal server error"})
                except Exception:
                    pass
        finally:
            self._finish_request(error)

    def do_PUT(self) -> None:
        def _handler() -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/api/admin/docs":
                if not self._require_admin():
                    return
                try:
                    payload = self._read_json()
                except json.JSONDecodeError:
                    self._send_json(400, {"ok": False, "error": "Invalid JSON"})
                    return
                file_path = payload.get("file")
                updates = payload.get("updates", {})
                if not file_path or not updates:
                    self._send_json(400, {"ok": False, "error": "file and updates required"})
                    return
                allowed_fields = {"title", "description", "category", "subject", "course", "docType",
                                  "catalogTitle", "catalogDescription", "tags"}
                with _catalog_lock:
                    catalog = load_catalog()
                    idx = find_doc_index(catalog, file_path)
                    if idx < 0:
                        self._send_json(404, {"ok": False, "error": "Document not found"})
                        return
                    for key, val in updates.items():
                        if key in allowed_fields:
                            catalog[idx][key] = val
                    save_catalog(catalog)
                self._send_json(200, {"ok": True, "doc": catalog[idx]})
                return
            if parsed.path == "/api/admin/orders":
                if not self._require_admin():
                    return
                try:
                    payload = self._read_json()
                except json.JSONDecodeError:
                    self._send_json(400, {"ok": False, "error": "Invalid JSON"})
                    return
                order_id = normalize_int(payload.get("id"), min_value=1)
                updates = payload.get("updates", {})
                if not order_id or not isinstance(updates, dict) or not updates:
                    self._send_json(400, {"ok": False, "error": "id and updates required"})
                    return

                fields = []
                values: list[object] = []

                if "status" in updates:
                    status = clean_text(updates.get("status"), 40)
                    if status not in ADMIN_ORDER_ALLOWED_STATUSES:
                        self._send_json(400, {"ok": False, "error": "Invalid status"})
                        return
                    fields.append("status = ?")
                    values.append(status)

                if "manager_note" in updates:
                    fields.append("manager_note = ?")
                    values.append(clean_text(updates.get("manager_note"), 4000))

                if not fields:
                    self._send_json(400, {"ok": False, "error": "No supported updates"})
                    return

                fields.append("manager_updated_at = ?")
                values.append(int(time.time()))
                values.append(order_id)

                notified = False
                with get_db() as db:
                    ensure_orders_table(db)
                    ensure_accounts_schema(db)
                    row = db.execute("SELECT id FROM orders WHERE id = ?", (order_id,)).fetchone()
                    if not row:
                        self._send_json(404, {"ok": False, "error": "Order not found"})
                        return
                    db.execute(
                        f"UPDATE orders SET {', '.join(fields)} WHERE id = ?",
                        values,
                    )
                    if "status" in updates:
                        try:
                            notified = maybe_notify_order_status_change(db, order_id, status)
                        except Exception:
                            logger.exception("status DM notify failed")
                    updated = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
                self._send_json(200, {
                    "ok": True,
                    "order": serialize_order_row(updated) if updated else None,
                    "notified": notified,
                })
                return
            if parsed.path == "/api/admin/library-submissions":
                if not self._require_admin():
                    return
                try:
                    payload = self._read_json()
                except json.JSONDecodeError:
                    self._send_json(400, {"ok": False, "error": "Invalid JSON"})
                    return
                submission_id = normalize_int(payload.get("id"), min_value=1)
                updates = payload.get("updates", {})
                if not submission_id or not isinstance(updates, dict) or not updates:
                    self._send_json(400, {"ok": False, "error": "id and updates required"})
                    return

                status = None
                manager_note = None
                if "status" in updates:
                    status = clean_text(updates.get("status"), 40)
                    if status not in LIBRARY_SUBMISSION_ALLOWED_STATUSES:
                        self._send_json(400, {"ok": False, "error": "Invalid status"})
                        return
                if "manager_note" in updates:
                    manager_note = clean_text(updates.get("manager_note"), 4000)
                if status is None and manager_note is None:
                    self._send_json(400, {"ok": False, "error": "No supported updates"})
                    return

                with get_db() as db:
                    ensure_library_submissions_table(db)
                    row = db.execute(
                        "SELECT id FROM library_submissions WHERE id = ?",
                        (submission_id,),
                    ).fetchone()
                    if not row:
                        self._send_json(404, {"ok": False, "error": "Submission not found"})
                        return
                state, thread_id = _load_library_delivery_meta(submission_id)
                _save_library_delivery_meta(
                    submission_id,
                    state,
                    thread_id=thread_id,
                    status=status,
                    manager_note=manager_note,
                )
                with get_db() as db:
                    updated = db.execute(
                        "SELECT * FROM library_submissions WHERE id = ?",
                        (submission_id,),
                    ).fetchone()
                self._send_json(
                    200,
                    {"ok": True, "submission": serialize_library_submission_row(updated) if updated else None},
                )
                return
            self._send_json(404, {"ok": False, "error": "Not found"})

        self._run_instrumented(_handler)

    def do_DELETE(self) -> None:
        def _handler() -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/api/admin/docs":
                if not self._require_admin():
                    return
                try:
                    payload = self._read_json()
                except json.JSONDecodeError:
                    self._send_json(400, {"ok": False, "error": "Invalid JSON"})
                    return
                file_path = payload.get("file")
                if not file_path:
                    self._send_json(400, {"ok": False, "error": "file required"})
                    return
                with _catalog_lock:
                    catalog = load_catalog()
                    idx = find_doc_index(catalog, file_path)
                    if idx < 0:
                        self._send_json(404, {"ok": False, "error": "Document not found"})
                        return
                    removed = catalog.pop(idx)
                    save_catalog(catalog)
                # Optionally remove file from disk
                disk_path = os.path.normpath(os.path.join(BASE_DIR, file_path))
                files_root = os.path.normpath(UPLOAD_DIR)
                if disk_path.startswith(files_root + os.sep) and os.path.exists(disk_path):
                    try:
                        os.remove(disk_path)
                    except OSError:
                        pass
                self._send_json(200, {"ok": True, "removed": removed.get("title", file_path)})
                return
            self._send_json(404, {"ok": False, "error": "Not found"})

        self._run_instrumented(_handler)

    def _handle_upload(self) -> None:
        """Handle multipart file upload."""
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._send_json(400, {"ok": False, "error": "Multipart form data required"})
            return
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length > MAX_UPLOAD_SIZE:
            self._send_json(413, {"ok": False, "error": "File too large (max 50MB)"})
            return
        # Simple multipart parser for single file
        boundary = content_type.split("boundary=")[1].strip() if "boundary=" in content_type else None
        if not boundary:
            self._send_json(400, {"ok": False, "error": "No boundary in multipart"})
            return
        body = self.rfile.read(content_length)
        parts = body.split(f"--{boundary}".encode())
        file_data = None
        file_name = None
        metadata = {}
        for part in parts:
            if b"Content-Disposition" not in part:
                continue
            header_end = part.find(b"\r\n\r\n")
            if header_end < 0:
                continue
            header = part[:header_end].decode("utf-8", errors="replace")
            data = part[header_end + 4:]
            if data.endswith(b"\r\n"):
                data = data[:-2]
            if 'name="file"' in header or 'name="document"' in header:
                # Extract filename
                if 'filename="' in header:
                    fn_start = header.index('filename="') + 10
                    fn_end = header.index('"', fn_start)
                    file_name = header[fn_start:fn_end]
                file_data = data
            elif 'name="metadata"' in header:
                try:
                    metadata = json.loads(data.decode("utf-8"))
                except json.JSONDecodeError:
                    pass
            elif 'name="' in header:
                # Simple text field
                field_start = header.index('name="') + 6
                field_end = header.index('"', field_start)
                field_name = header[field_start:field_end]
                metadata[field_name] = data.decode("utf-8", errors="replace")
        if not file_data or not file_name:
            self._send_json(400, {"ok": False, "error": "No file uploaded"})
            return
        # Sanitize filename
        safe_name = file_name.replace("/", "_").replace("\\", "_").replace("..", "_")
        if not safe_name:
            self._send_json(400, {"ok": False, "error": "Invalid filename"})
            return
        dest_path = os.path.join(UPLOAD_DIR, safe_name)
        # Avoid overwrite
        base, ext = os.path.splitext(safe_name)
        counter = 1
        while os.path.exists(dest_path):
            dest_path = os.path.join(UPLOAD_DIR, f"{base}_{counter}{ext}")
            safe_name = f"{base}_{counter}{ext}"
            counter += 1
        # Write file
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(file_data)
        # Build catalog entry
        file_size = len(file_data)
        size_str = format_file_size(file_size)
        doc_entry = {
            "file": f"files/{safe_name}",
            "filename": safe_name,
            "size": size_str,
            "text": metadata.get("description", ""),
            "tags": [t.strip() for t in metadata.get("tags", "").split(",") if t.strip()] if isinstance(metadata.get("tags"), str) else metadata.get("tags", []),
            "category": metadata.get("category", "Другое"),
            "subject": metadata.get("subject", "Общее"),
            "course": metadata.get("course", ""),
            "exists": True,
            "title": metadata.get("title", os.path.splitext(safe_name)[0]),
            "description": metadata.get("description", ""),
            "catalogTitle": metadata.get("title", os.path.splitext(safe_name)[0]),
            "catalogDescription": metadata.get("description", ""),
            "docType": metadata.get("docType", metadata.get("category", "Другое")),
        }
        with _catalog_lock:
            catalog = load_catalog()
            catalog.append(doc_entry)
            save_catalog(catalog)
        self._send_json(200, {"ok": True, "doc": doc_entry, "totalDocs": len(catalog)})

    def _public_form_rate_limited(
        self,
        key: str,
        ip: str,
        now: float,
        *,
        max_attempts: int,
        error_text: str,
    ) -> bool:
        bucket_key = f"{key}:{ip}"
        attempts = _login_attempts.get(bucket_key, [])
        attempts = [stamp for stamp in attempts if now - stamp < 3600]
        _login_attempts[bucket_key] = attempts
        if len(attempts) >= max_attempts:
            self._send_json(429, {"ok": False, "error": error_text})
            return True
        _login_attempts[bucket_key].append(now)
        return False

    def _order_rate_limited(self, ip: str, now: float) -> bool:
        return self._public_form_rate_limited(
            "order",
            ip,
            now,
            max_attempts=3,
            error_text="Слишком много заявок. Попробуйте позже.",
        )

    def _library_submission_rate_limited(self, ip: str, now: float) -> bool:
        return self._public_form_rate_limited(
            "library-submit",
            ip,
            now,
            max_attempts=4,
            error_text="Слишком много отправок. Попробуйте позже.",
        )

    def _form_value(self, form: FieldStorage, name: str) -> str:
        if name not in form:
            return ""
        item = form[name]
        if isinstance(item, list):
            item = item[-1]
        if getattr(item, "filename", ""):
            return ""
        value = item.value
        return value if isinstance(value, str) else ""

    def _handle_public_order_multipart(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._send_json(400, {"ok": False, "error": "Multipart form data required"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            content_length = 0
        if content_length > MAX_UPLOAD_SIZE:
            self._send_json(413, {"ok": False, "error": "Файлы слишком большие. Максимум 45 МБ на заявку."})
            return
        try:
            form = FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": content_type,
                    "CONTENT_LENGTH": str(content_length),
                },
                keep_blank_values=True,
            )
            attachments = extract_order_attachments(form)
            payload = {
                key: self._form_value(form, key)
                for key in (
                    "workType",
                    "topic",
                    "subject",
                    "deadline",
                    "contact",
                    "comment",
                    "source",
                    "sourceLabel",
                    "sourcePath",
                    "entryUrl",
                    "referrer",
                    "contactChannel",
                    "estimatedPrice",
                    "pages",
                    "originality",
                    "sampleTitle",
                    "sampleType",
                    "sampleSubject",
                    "sampleCategory",
                    "pageTitle",
                    "searchQuery",
                    "deviceId",
                )
            }
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        except Exception:
            logger.exception("Public order multipart parse failed")
            self._send_json(400, {"ok": False, "error": "Не удалось обработать форму. Попробуйте ещё раз."})
            return
        self._process_public_order(payload, attachments=attachments)

    def _handle_library_submission_multipart(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._send_json(400, {"ok": False, "error": "Multipart form data required"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            content_length = 0
        if content_length > MAX_UPLOAD_SIZE:
            self._send_json(413, {"ok": False, "error": "Файлы слишком большие. Максимум 45 МБ на отправку."})
            return
        try:
            form = FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": content_type,
                    "CONTENT_LENGTH": str(content_length),
                },
                keep_blank_values=True,
            )
            attachments = extract_library_submission_attachments(form)
            payload = {
                key: self._form_value(form, key)
                for key in (
                    "title",
                    "description",
                    "subject",
                    "category",
                    "course",
                    "docType",
                    "tags",
                    "authorName",
                    "contact",
                    "comment",
                    "source",
                    "sourcePath",
                    "entryUrl",
                    "referrer",
                )
            }
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        except Exception:
            logger.exception("Library submission multipart parse failed")
            self._send_json(400, {"ok": False, "error": "Не удалось обработать форму. Попробуйте ещё раз."})
            return
        self._process_library_submission(payload, attachments=attachments)

    def _handle_upload_session_init(self, payload: dict) -> None:
        kind = clean_text(payload.get("kind"), 40).lower()
        files = payload.get("files")
        try:
            session = create_upload_session(
                kind,
                files,
                get_client_ip(self),
                clean_text(self.headers.get("User-Agent"), 280),
            )
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        except Exception:
            logger.exception("Upload session init failed")
            self._send_json(500, {"ok": False, "error": "Не удалось подготовить загрузку. Попробуйте ещё раз."})
            return
        self._send_json(200, {"ok": True, "upload": session})

    def _handle_upload_chunk(self, parsed) -> None:
        query = parse_qs(parsed.query, keep_blank_values=False)
        upload_id = clean_text(query.get("uploadId", [""])[0], 120)
        file_index = normalize_int(query.get("fileIndex", [None])[0], min_value=0)
        chunk_index = normalize_int(query.get("chunkIndex", [None])[0], min_value=0)
        if not upload_id or file_index is None or chunk_index is None:
            self._send_json(400, {"ok": False, "error": "Недостаточно параметров chunk-загрузки."})
            return
        try:
            body = self._read_body(max_bytes=UPLOAD_CHUNK_SIZE)
            result = write_upload_chunk(upload_id, file_index, chunk_index, body)
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        except Exception:
            logger.exception("Upload chunk write failed: %s", upload_id)
            self._send_json(500, {"ok": False, "error": "Не удалось записать часть файла. Попробуйте ещё раз."})
            return
        self._send_json(200, {"ok": True, **result})

    def _handle_upload_session_complete(self, payload: dict) -> None:
        upload_id = clean_text(payload.get("uploadId"), 120)
        if not upload_id:
            self._send_json(400, {"ok": False, "error": "Не указан uploadId."})
            return
        try:
            result = complete_upload_session(upload_id)
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        except Exception:
            logger.exception("Upload session complete failed: %s", upload_id)
            self._send_json(500, {"ok": False, "error": "Не удалось завершить загрузку. Попробуйте ещё раз."})
            return
        self._send_json(200, {"ok": True, **result})

    def _process_public_order(self, payload: dict, attachments: list[dict] | None = None) -> None:
        ip = get_client_ip(self)
        now = time.time()

        attachments = attachments or []
        upload_session_id = clean_text(payload.get("uploadSessionId"), 120)
        work_type = clean_text(payload.get("workType"), 100)
        topic = clean_text(payload.get("topic"), 500)
        subject = clean_text(payload.get("subject"), 100)
        deadline = clean_text(payload.get("deadline"), 100)
        contact = clean_text(payload.get("contact"), 200)
        comment = clean_text(payload.get("comment"), 700)
        source = clean_text(payload.get("source"), 80)
        source_label = clean_text(payload.get("sourceLabel"), 160)
        source_path = clean_text(payload.get("sourcePath"), 240)
        entry_url = clean_url(payload.get("entryUrl"))
        referrer = clean_url(payload.get("referrer") or self.headers.get("Referer"))
        user_agent = clean_text(self.headers.get("User-Agent"), 280)
        contact_channel = clean_text(payload.get("contactChannel"), 80) or detect_contact_channel(contact)
        estimated_price = normalize_int(payload.get("estimatedPrice"), min_value=0, max_value=500000)
        pages = normalize_int(payload.get("pages"), min_value=1, max_value=300)
        originality = clean_text(payload.get("originality"), 100)
        sample_title = clean_text(payload.get("sampleTitle"), 240)
        sample_type = clean_text(payload.get("sampleType"), 120)
        sample_subject = clean_text(payload.get("sampleSubject"), 120)
        sample_category = clean_text(payload.get("sampleCategory"), 120)
        page_title = clean_text(payload.get("pageTitle"), 160)
        search_query = clean_text(payload.get("searchQuery"), 160)
        source_label = build_order_source_label(source, source_label)
        source_path = build_source_path(source_path, entry_url)

        if not contact:
            self._send_json(400, {"ok": False, "error": "Укажите контакт для связи"})
            return
        contact_key = normalize_contact_key(contact)
        request_fingerprint = build_request_fingerprint("order", payload, attachments, upload_session_id)
        idempotency_key = build_idempotency_key("order", payload, request_fingerprint)
        created_at = int(now)

        meta_payload = {
            key: value
            for key, value in {
                "pageTitle": page_title,
                "searchQuery": search_query,
            }.items()
            if value
        }
        meta_json = json.dumps(meta_payload, ensure_ascii=False, separators=(",", ":")) if meta_payload else ""

        # Progressive account: attach the order to a device/session user
        device_id_raw = clean_text(payload.get("deviceId"), 64)
        account_cookies = _read_account_cookies(self)
        account_session_token = account_cookies.get(ACCOUNT_COOKIE_NAME)

        try:
            with get_db() as db:
                ensure_orders_table(db)
                ensure_submission_idempotency_table(db)
                ensure_accounts_schema(db)
                db.execute("BEGIN IMMEDIATE")
                _cleanup_submission_idempotency(db)
                account_user_id = resolve_order_user(
                    db, account_session_token, device_id_raw, contact,
                )
                duplicate_order_id = _lookup_recent_idempotency_hit(
                    db,
                    key=idempotency_key,
                    kind="order",
                    window_seconds=ORDER_IDEMPOTENCY_WINDOW,
                )
                if duplicate_order_id:
                    db.execute("COMMIT")
                    self._send_json(
                        200,
                        {
                            "ok": True,
                            "message": "Эта заявка уже принята. Дубликат не создан.",
                            "orderId": duplicate_order_id,
                            "duplicate": True,
                            "bound": bool(account_user_id),
                        },
                    )
                    return
                spam_error = evaluate_order_submission_guard(
                    db,
                    ip=ip,
                    contact_key=contact_key,
                    now_ts=created_at,
                )
                if spam_error:
                    db.execute("ROLLBACK")
                    self._send_json(429, {"ok": False, "error": spam_error})
                    return
                cursor = db.execute(
                    """
                    INSERT INTO orders (
                        work_type, topic, subject, deadline, contact, comment, ip, created_at,
                        source, source_label, source_path, entry_url, referrer, user_agent,
                        contact_channel, estimated_price, pages, originality,
                        sample_title, sample_type, sample_subject, sample_category, meta_json, attachments_json,
                        contact_key, request_fingerprint
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        work_type,
                        topic,
                        subject,
                        deadline,
                        contact,
                        comment,
                        ip,
                        created_at,
                        source,
                        source_label,
                        source_path,
                        entry_url,
                        referrer,
                        user_agent,
                        contact_channel,
                        estimated_price,
                        pages,
                        originality,
                        sample_title,
                        sample_type,
                        sample_subject,
                        sample_category,
                        meta_json,
                        "",
                        contact_key,
                        request_fingerprint,
                    ),
                )
                order_id = int(cursor.lastrowid or 0)
                if account_user_id:
                    db.execute(
                        "UPDATE orders SET user_id = ? WHERE id = ?",
                        (account_user_id, order_id),
                    )
                saved_attachments: list[dict] = []
                if upload_session_id:
                    try:
                        saved_attachments, _ = consume_upload_session(
                            session_id=upload_session_id,
                            expected_kind="order",
                            storage_root=ORDER_UPLOAD_DIR,
                            storage_key="orders",
                            entity_dir_name=f"order_{order_id}",
                            consumed_entity_id=order_id,
                            db=db,
                        )
                    except Exception:
                        db.execute("DELETE FROM orders WHERE id = ?", (order_id,))
                        raise
                elif attachments:
                    try:
                        saved_attachments, _ = save_order_attachments(order_id, attachments)
                    except Exception:
                        db.execute("DELETE FROM orders WHERE id = ?", (order_id,))
                        raise
                    db.execute(
                        """
                        UPDATE orders
                        SET attachments_json = ?, manager_note = ?, manager_updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            _attachments_json(saved_attachments),
                            "Вложения сохранены. Идёт антивирусная проверка.",
                            int(time.time()),
                            order_id,
                        ),
                    )
                _register_submission_idempotency(
                    db,
                    key=idempotency_key,
                    kind="order",
                    entity_id=order_id,
                )
                contact_repeat_count = 0
                if contact:
                    contact_repeat_count = int(
                        db.execute(
                            "SELECT COUNT(*) AS c FROM orders WHERE contact = ? AND id <> ?",
                            (contact, order_id),
                        ).fetchone()["c"] or 0
                    )
                ip_repeat_count = int(
                    db.execute(
                        "SELECT COUNT(*) AS c FROM orders WHERE ip = ? AND id <> ?",
                        (ip, order_id),
                        ).fetchone()["c"] or 0
                    )
                db.execute("COMMIT")
        except ValueError as exc:
            logger.warning("Order attachment rejected: %s", exc)
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        except RuntimeError as exc:
            logger.error("Order attachment scan unavailable: %s", exc)
            self._send_json(503, {"ok": False, "error": str(exc)})
            return
        except Exception:
            logger.exception("Order save failed")
            self._send_json(500, {"ok": False, "error": "Не удалось сохранить заявку. Попробуйте ещё раз."})
            return

        order_info = {
            "id": order_id,
            "created_at": created_at,
            "work_type": work_type,
            "topic": topic,
            "subject": subject,
            "deadline": deadline,
            "contact": contact,
            "comment": comment,
            "ip": ip,
            "source_label": source_label,
            "source_path": source_path,
            "entry_url": entry_url,
            "referrer": referrer,
            "user_agent": user_agent,
            "contact_channel": contact_channel,
            "estimated_price": estimated_price,
            "pages": pages,
            "originality": originality,
            "sample_title": sample_title,
            "sample_type": sample_type,
            "sample_subject": sample_subject,
            "sample_category": sample_category,
            "attachments": saved_attachments,
        }
        if saved_attachments:
            enqueue_outbox_job(
                "order_postprocess",
                {
                    "order_id": order_id,
                    "order_info": order_info,
                    "contact_repeat_count": contact_repeat_count,
                    "ip_repeat_count": ip_repeat_count,
                    "saved_attachments": saved_attachments,
                },
            )
        else:
            notification_body = build_order_notification(order_info, contact_repeat_count, ip_repeat_count)
            enqueue_outbox_job(
                "order_delivery",
                {
                    "order_id": order_id,
                    "subject": f"Academic Salon: новая заявка #{order_id}",
                    "body": notification_body,
                    "telegram_topic_name": f"Сайт #{order_id} · {work_type or 'Заявка'}",
                    "attachments": saved_attachments,
                },
            )
        self._send_json(
            200,
            {
                "ok": True,
                "message": "Заявка отправлена!",
                "orderId": order_id,
                "attachmentCount": len(saved_attachments),
                "bound": bool(account_user_id),
            },
        )

    def _process_library_submission(self, payload: dict, attachments: list[dict] | None = None) -> None:
        ip = get_client_ip(self)
        now = time.time()
        attachments = attachments or []
        upload_session_id = clean_text(payload.get("uploadSessionId"), 120)

        title = clean_text(payload.get("title"), 240)
        description = clean_text(payload.get("description"), 2500)
        subject = clean_text(payload.get("subject"), 120)
        category = clean_text(payload.get("category"), 120) or "Другое"
        course = clean_text(payload.get("course"), 80)
        doc_type = clean_text(payload.get("docType"), 120) or category
        author_name = clean_text(payload.get("authorName"), 120)
        contact = clean_text(payload.get("contact"), 200)
        comment = clean_text(payload.get("comment"), 1000)
        source = clean_text(payload.get("source"), 80) or "site_catalog_submission"
        source_path = build_source_path(clean_text(payload.get("sourcePath"), 240), clean_url(payload.get("entryUrl")))
        entry_url = clean_url(payload.get("entryUrl"))
        referrer = clean_url(payload.get("referrer") or self.headers.get("Referer"))
        user_agent = clean_text(self.headers.get("User-Agent"), 280)
        tags = parse_tags_text(payload.get("tags"))

        if not title:
            self._send_json(400, {"ok": False, "error": "Укажите название работы."})
            return
        if not contact:
            self._send_json(400, {"ok": False, "error": "Укажите контакт для обратной связи."})
            return
        if not attachments and not upload_session_id:
            self._send_json(400, {"ok": False, "error": "Прикрепите хотя бы один файл."})
            return
        contact_key = normalize_contact_key(contact)
        request_fingerprint = build_request_fingerprint("library", payload, attachments, upload_session_id)
        idempotency_key = build_idempotency_key("library", payload, request_fingerprint)
        created_at = int(now)

        try:
            with get_db() as db:
                ensure_library_submissions_table(db)
                ensure_submission_idempotency_table(db)
                db.execute("BEGIN IMMEDIATE")
                _cleanup_submission_idempotency(db)
                duplicate_submission_id = _lookup_recent_idempotency_hit(
                    db,
                    key=idempotency_key,
                    kind="library",
                    window_seconds=LIBRARY_IDEMPOTENCY_WINDOW,
                )
                if duplicate_submission_id:
                    db.execute("COMMIT")
                    self._send_json(
                        200,
                        {
                            "ok": True,
                            "message": "Эта работа уже была принята. Дубликат не создан.",
                            "submissionId": duplicate_submission_id,
                            "duplicate": True,
                        },
                    )
                    return
                spam_error = evaluate_library_submission_guard(
                    db,
                    ip=ip,
                    contact_key=contact_key,
                    now_ts=created_at,
                )
                if spam_error:
                    db.execute("ROLLBACK")
                    self._send_json(429, {"ok": False, "error": spam_error})
                    return
                cursor = db.execute(
                    """
                    INSERT INTO library_submissions (
                        title, description, subject, category, course, doc_type, tags_json,
                        author_name, contact, comment, ip, created_at, status,
                        source, source_path, entry_url, referrer, user_agent,
                        attachments_json, antivirus_json, contact_key, request_fingerprint
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        title,
                        description,
                        subject,
                        category,
                        course,
                        doc_type,
                        json.dumps(tags, ensure_ascii=False, separators=(",", ":")) if tags else "",
                        author_name,
                        contact,
                        comment,
                        ip,
                        created_at,
                        "new",
                        source,
                        source_path,
                        entry_url,
                        referrer,
                        user_agent,
                        "",
                        "",
                        contact_key,
                        request_fingerprint,
                    ),
                )
                submission_id = int(cursor.lastrowid or 0)
                try:
                    if upload_session_id:
                        saved_attachments, antivirus_result = consume_upload_session(
                            session_id=upload_session_id,
                            expected_kind="library",
                            storage_root=LIBRARY_SUBMISSION_DIR,
                            storage_key="library_submissions",
                            entity_dir_name=f"submission_{submission_id}",
                            consumed_entity_id=submission_id,
                            db=db,
                        )
                    else:
                        saved_attachments, antivirus_result = save_library_submission_attachments(submission_id, attachments)
                except Exception:
                    db.execute("DELETE FROM library_submissions WHERE id = ?", (submission_id,))
                    raise
                db.execute(
                    """
                    UPDATE library_submissions
                    SET attachments_json = ?, antivirus_json = ?, manager_note = ?, manager_updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        _attachments_json(saved_attachments),
                        _antivirus_json(antivirus_result),
                        "Файлы сохранены. Идёт антивирусная проверка.",
                        int(time.time()),
                        submission_id,
                    ),
                )
                _register_submission_idempotency(
                    db,
                    key=idempotency_key,
                    kind="library",
                    entity_id=submission_id,
                )
                db.execute("COMMIT")
        except ValueError as exc:
            logger.warning("Library submission rejected: %s", exc)
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        except RuntimeError as exc:
            logger.error("Library submission antivirus unavailable: %s", exc)
            self._send_json(503, {"ok": False, "error": str(exc)})
            return
        except Exception:
            logger.exception("Library submission save failed")
            self._send_json(500, {"ok": False, "error": "Не удалось отправить работу. Попробуйте ещё раз."})
            return

        submission_info = {
            "id": submission_id,
            "created_at": created_at,
            "title": title,
            "description": description,
            "subject": subject,
            "category": category,
            "course": course,
            "doc_type": doc_type,
            "tags": tags,
            "author_name": author_name,
            "contact": contact,
            "comment": comment,
            "ip": ip,
            "source": source,
            "source_path": source_path,
            "entry_url": entry_url,
            "referrer": referrer,
            "user_agent": user_agent,
            "attachments": saved_attachments,
            "antivirus": antivirus_result,
        }
        enqueue_outbox_job(
            "library_postprocess",
            {
                "submission_id": submission_id,
                "submission_info": submission_info,
                "saved_attachments": saved_attachments,
            },
        )

        self._send_json(
            200,
            {
                "ok": True,
                "message": "Работа отправлена на модерацию. Спасибо!",
                "submissionId": submission_id,
                "attachmentCount": len(saved_attachments),
            },
        )

    # ════════════════════════════════════════════════════════════
    # PROGRESSIVE ACCOUNT — auth handlers (Stage 1)
    # ════════════════════════════════════════════════════════════

    def _send_account_cookie(self, status: int, payload: dict, token: str) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._response_size = len(body)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        cookie_parts = [
            f"{ACCOUNT_COOKIE_NAME}={token}",
            f"Max-Age={ACCOUNT_SESSION_TTL}",
            "Path=/",
            "HttpOnly",
            "Secure",
            "SameSite=Lax",
        ]
        self.send_header("Set-Cookie", "; ".join(cookie_parts))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _clear_account_cookie(self, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._response_size = len(body)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Set-Cookie",
            f"{ACCOUNT_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
        )
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _handle_auth_tg(self, payload: dict) -> None:
        if not TELEGRAM_BOT_TOKEN or not TG_BOT_NAME:
            self._send_json(503, {"ok": False, "error": "Telegram login is not configured on this server"})
            return

        provided_hash = str(payload.get("hash") or "")
        try:
            auth_date = int(payload.get("auth_date") or 0)
            user_id_tg = int(payload.get("id") or 0)
        except (TypeError, ValueError):
            self._send_json(400, {"ok": False, "error": "Invalid Telegram payload"})
            return

        if not provided_hash or not user_id_tg or not auth_date:
            self._send_json(400, {"ok": False, "error": "Invalid Telegram payload"})
            return
        if int(time.time()) - auth_date > ACCOUNT_TG_MAX_AGE:
            self._send_json(400, {"ok": False, "error": "Telegram auth payload expired"})
            return

        device_id = _sanitize_account_device_id(str(payload.get("device_id") or ""))
        # Build the HMAC check dict — same shape as widget payload, without 'hash' and our 'device_id'
        check_fields = {
            k: v for k, v in payload.items()
            if k not in {"hash", "device_id"} and v not in (None, "")
        }
        if not verify_telegram_widget_hash(check_fields, provided_hash):
            self._send_json(401, {"ok": False, "error": "Invalid Telegram signature"})
            return

        first_name = str(payload.get("first_name") or "").strip()
        last_name = str(payload.get("last_name") or "").strip()
        full_name = (first_name + " " + last_name).strip() or None

        with get_db() as db:
            ensure_accounts_schema(db)
            db.execute("BEGIN IMMEDIATE")
            user_id = _upsert_account_by_channel(
                db, "tg", str(user_id_tg), device_id,
                handle=str(payload.get("username") or "") or None,
                name=full_name,
                avatar=str(payload.get("photo_url") or "") or None,
            )
            token, _ = _issue_account_session(db, user_id)
            row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            db.execute("COMMIT")

        self._send_account_cookie(200, {"ok": True, "user": _account_user_public(dict(row))}, token)

    def _handle_auth_vk(self, payload: dict) -> None:
        if not VK_APP_ID or not VK_APP_SECRET:
            self._send_json(503, {"ok": False, "error": "VK login is not configured on this server"})
            return

        code = str(payload.get("code") or "").strip()
        redirect_uri = str(payload.get("redirect_uri") or "").strip()
        device_id = _sanitize_account_device_id(str(payload.get("device_id") or ""))

        if len(code) < 8 or len(redirect_uri) < 8:
            self._send_json(400, {"ok": False, "error": "Invalid VK payload"})
            return

        try:
            exchanged = vk_exchange_code(code, redirect_uri)
        except RuntimeError as exc:
            logger.warning("VK exchange rejected: %s", exc)
            self._send_json(401, {"ok": False, "error": "VK rejected the authorization code"})
            return
        except Exception:
            logger.exception("VK exchange failed")
            self._send_json(502, {"ok": False, "error": "VK service unavailable"})
            return

        vk_id = str(exchanged.get("user_id"))
        profile = vk_fetch_profile(exchanged.get("access_token") or "")
        handle = profile.get("screen_name") or None
        first_name = profile.get("first_name") or ""
        last_name = profile.get("last_name") or ""
        full_name = (first_name + " " + last_name).strip() or None
        avatar = profile.get("photo_100") or None

        with get_db() as db:
            ensure_accounts_schema(db)
            db.execute("BEGIN IMMEDIATE")
            user_id = _upsert_account_by_channel(
                db, "vk", vk_id, device_id,
                handle=handle, name=full_name, avatar=avatar,
            )
            token, _ = _issue_account_session(db, user_id)
            row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            db.execute("COMMIT")

        self._send_account_cookie(200, {"ok": True, "user": _account_user_public(dict(row))}, token)

    def _handle_auth_logout(self) -> None:
        cookies = _read_account_cookies(self)
        token = cookies.get(ACCOUNT_COOKIE_NAME)
        if token:
            try:
                with get_db() as db:
                    ensure_accounts_schema(db)
                    db.execute("DELETE FROM account_sessions WHERE token = ?", (token,))
            except Exception:
                logger.exception("account session delete failed")
        self._clear_account_cookie({"ok": True})


def main() -> None:
    init_db()
    log_config_warnings()
    start_outbox_worker()
    start_housekeeping_worker()
    server = ThreadingHTTPServer((HOST, PORT), StatsHandler)
    logger.info("%s %s listening on http://%s:%s", SERVICE_NAME, SERVICE_VERSION, HOST, PORT)
    server.serve_forever()


if __name__ == "__main__":
    main()
