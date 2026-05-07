from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any, List, Optional

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from ..database import get_db, BASE_DIR
from ..auth import get_client_ip, _login_attempts
from ..services.notifications import notify_order_channels, send_user_email

logger = logging.getLogger(__name__)
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ORDER_SOURCE_LABELS = {
    "site_package": "Сайт · пакет услуг",
    "site_calculator": "Сайт · калькулятор стоимости",
}


def _build_customer_confirmation_body(order_id: int, work_type: str, topic: str, subject: str, deadline: str) -> str:
    lines = [
        "Здравствуйте!",
        "",
        f"Мы получили вашу заявку №{order_id} — спасибо.",
        "",
    ]
    detail = []
    if topic:     detail.append(f"  Тема: {topic}")
    if work_type: detail.append(f"  Тип работы: {work_type}")
    if subject:   detail.append(f"  Предмет: {subject}")
    if deadline:  detail.append(f"  Срок: {deadline}")
    if detail:
        lines.extend(detail)
        lines.append("")
    lines.extend([
        "Ответим в течение 2 часов в рабочее время (9:00–22:00 МСК).",
        "Поздно вечером и в выходные — до утра.",
        "",
        "Статус заявки и сохранённые работы — в личном кабинете:",
        "https://bibliosaloon.ru/me",
        "",
        "Если срочно — напишите нам напрямую:",
        "  Telegram: https://t.me/academicsaloon",
        "  ВКонтакте: https://vk.com/academicsaloon",
        "",
        "—",
        "Академический Салон",
        "https://bibliosaloon.ru",
    ])
    return "\n".join(lines)


def _pick_confirmation_address(contact: str, confirm_email: str) -> str | None:
    """Prefer the explicit `confirmEmail` if given (covers users who put a
    Telegram handle / VK / phone in `contact`). Falls back to `contact`
    itself if that already looks like an email. Returns None if neither
    is a valid address — operator handles those manually."""
    explicit = (confirm_email or "").strip()
    if explicit and _EMAIL_RE.match(explicit):
        return explicit
    contact = (contact or "").strip()
    if contact and _EMAIL_RE.match(contact):
        return contact
    return None


def _maybe_send_customer_confirmation(
    order_id: int,
    contact: str,
    work_type: str,
    topic: str,
    subject: str,
    deadline: str,
    confirm_email: str = "",
) -> None:
    """Fire-and-forget customer email when we can resolve a delivery
    address. Best-effort: a failed send doesn't break the request."""
    to_addr = _pick_confirmation_address(contact, confirm_email)
    if not to_addr:
        return
    try:
        body = _build_customer_confirmation_body(order_id, work_type, topic, subject, deadline)
        send_user_email(to_addr, f"Заявка №{order_id} принята — Академический Салон", body)
    except Exception:
        logger.exception("Order #%s: customer confirmation email failed", order_id)

router = APIRouter()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ORDER_ATTACH_DIR: str = os.path.join(BASE_DIR, "order_attachments")
MAX_ORDER_FILES: int = 6
MAX_ORDER_TOTAL_SIZE: int = 45 * 1024 * 1024  # 45 MB
ALLOWED_EXTENSIONS: set[str] = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".rtf", ".odt", ".jpg", ".jpeg", ".png", ".webp",
    ".zip", ".rar",
}


# ---------------------------------------------------------------------------
# Pydantic model (kept for backward compat with JSON submissions)
# ---------------------------------------------------------------------------

class OrderRequest(BaseModel):
    workType: str = ""
    topic: str = ""
    subject: str = ""
    deadline: str = ""
    contact: str = ""
    comment: str = ""
    confirmEmail: str = ""  # optional — used to send confirmation when contact is Telegram/VK/phone
    source: str = ""
    sourceLabel: str = ""
    sourcePath: str = ""
    entryUrl: str = ""
    contactChannel: str = ""
    estimatedPrice: int | None = None
    packageCode: str = ""
    packageName: str = ""
    packageItems: Any = None
    packagePriceFrom: int | None = None
    packageTimeline: str = ""
    packageAudience: str = ""
    packageOutcome: str = ""
    packageVersion: str = ""
    packageNote: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rate_limit(ip: str) -> None:
    """Raise 429 if this IP sent >= 3 orders in the last hour."""
    now = time.time()
    order_key = f"order:{ip}"
    attempts = _login_attempts.get(order_key, [])
    attempts = [t for t in attempts if now - t < 3600]
    _login_attempts[order_key] = attempts
    if len(attempts) >= 3:
        raise HTTPException(
            status_code=429,
            detail={"ok": False, "error": "Слишком много заявок. Попробуйте позже."},
        )
    _login_attempts[order_key].append(now)


def _clean_text(value: object, limit: int) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()[:limit]


def _normalize_int(value: object, max_value: int = 500_000) -> int | None:
    try:
        number = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if number < 0:
        return None
    return min(number, max_value)


def _normalize_package_items(value: object) -> list[str]:
    if isinstance(value, list):
        raw_items = value
    elif isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
        except Exception:
            parsed = [part.strip() for part in re.split(r"[;\n]", stripped)]
        raw_items = parsed if isinstance(parsed, list) else []
    else:
        return []
    items: list[str] = []
    for item in raw_items:
        cleaned = _clean_text(item, 180)
        if cleaned and cleaned not in items:
            items.append(cleaned)
        if len(items) >= 8:
            break
    return items


def _package_meta(payload: dict[str, Any]) -> dict[str, Any]:
    meta = {
        "packageCode": _clean_text(payload.get("packageCode"), 80),
        "packageName": _clean_text(payload.get("packageName"), 160),
        "packageItems": _normalize_package_items(payload.get("packageItems")),
        "packagePriceFrom": _normalize_int(payload.get("packagePriceFrom")),
        "packageTimeline": _clean_text(payload.get("packageTimeline"), 120),
        "packageAudience": _clean_text(payload.get("packageAudience"), 240),
        "packageOutcome": _clean_text(payload.get("packageOutcome"), 240),
        "packageVersion": _clean_text(payload.get("packageVersion"), 40),
        "packageNote": _clean_text(payload.get("packageNote"), 1000),
    }
    return {k: v for k, v in meta.items() if v not in ("", None, [])}


def _source_label(source: str, explicit: str) -> str:
    return explicit or ORDER_SOURCE_LABELS.get(source, "")


def _save_order(
    work_type: str, topic: str, subject: str,
    deadline: str, contact: str, comment: str,
    ip: str, attachments: Optional[str] = None,
    confirm_email: str = "",
    source: str = "",
    source_label: str = "",
    source_path: str = "",
    entry_url: str = "",
    contact_channel: str = "",
    estimated_price: int | None = None,
    meta_json: str = "",
) -> int:
    """Insert order into SQLite, return the new order id.

    The ``orders`` table and its extra columns (attachments, manager_note,
    confirm_email, …) are owned by migrations/001_baseline.sql +
    002_orders_extra_columns.sql + 007_orders_confirm_email.sql.
    """
    with get_db() as db:
        cur = db.execute(
            """
            INSERT INTO orders (
                work_type, topic, subject, deadline, contact, comment, ip,
                attachments, confirm_email, source, source_label, source_path,
                entry_url, contact_channel, estimated_price, meta_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                work_type, topic, subject, deadline, contact, comment, ip,
                attachments, confirm_email, source, source_label, source_path,
                entry_url, contact_channel, estimated_price, meta_json,
            ),
        )
        return cur.lastrowid


def _notify(
    work_type: str, topic: str, subject: str,
    deadline: str, contact: str, comment: str,
    file_names: List[str],
    meta: dict[str, Any] | None = None,
) -> None:
    """Send notification to all configured channels (Codex multi-channel system)."""
    parts = ["\U0001f4cb Новая заявка с сайта!"]
    if topic:
        parts.append(f"Тема: {topic}")
    if work_type:
        parts.append(f"Тип: {work_type}")
    if subject:
        parts.append(f"Предмет: {subject}")
    if deadline:
        parts.append(f"Срок: {deadline}")
    parts.append(f"Контакт: {contact}")
    if comment:
        parts.append(f"Комментарий: {comment}")
    meta = meta or {}
    package_name = _clean_text(meta.get("packageName"), 160)
    if package_name:
        parts.append("")
        parts.append(f"Пакет: {package_name}")
        if meta.get("packageCode"):
            parts.append(f"Код пакета: {_clean_text(meta.get('packageCode'), 80)}")
        if meta.get("packagePriceFrom") is not None:
            parts.append(f"Ориентир пакета: {meta.get('packagePriceFrom')} ₽")
        for item in _normalize_package_items(meta.get("packageItems")):
            parts.append(f"• {item}")
    if file_names:
        parts.append(f"\U0001f4ce Файлы ({len(file_names)}): {', '.join(file_names)}")
    message = "\n".join(parts)
    subj = topic or work_type or "Новая заявка с сайта"
    notify_order_channels(
        f"Academic Salon: {subj}",
        message,
        telegram_topic_name=f"Сайт · {subj}",
    )


def _sanitize_filename(name: str) -> str:
    """Strip path components and dangerous chars."""
    name = os.path.basename(name)
    return name.replace("/", "_").replace("\\", "_").replace("..", "_").strip()


# ---------------------------------------------------------------------------
# Unified endpoint — handles both JSON and multipart/form-data
# ---------------------------------------------------------------------------

@router.post("")
@router.post("/")
async def create_order(request: Request):
    ip = get_client_ip(request)
    _rate_limit(ip)

    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        return await _handle_multipart(request, ip)
    else:
        return await _handle_json(request, ip)


async def _handle_json(request: Request, ip: str):
    """Original JSON path — no files."""
    body = await request.json()
    order = OrderRequest(**body)
    raw = order.model_dump() if hasattr(order, "model_dump") else order.dict()

    work_type = order.workType.strip()[:100]
    topic = order.topic.strip()[:500]
    subject = order.subject.strip()[:100]
    deadline = order.deadline.strip()[:100]
    contact = order.contact.strip()[:200]
    confirm_email = order.confirmEmail.strip()[:200]
    comment = order.comment.strip()[:500]
    source = _clean_text(order.source, 80)
    source_label = _source_label(source, _clean_text(order.sourceLabel, 160))
    source_path = _clean_text(order.sourcePath, 240)
    entry_url = _clean_text(order.entryUrl, 240)
    contact_channel = _clean_text(order.contactChannel, 80)
    estimated_price = _normalize_int(order.estimatedPrice)
    meta = _package_meta(raw)
    if estimated_price is None:
        estimated_price = _normalize_int(meta.get("packagePriceFrom"))
    meta_json = json.dumps(meta, ensure_ascii=False, separators=(",", ":")) if meta else ""

    if not contact:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": "Укажите контакт для связи"},
        )

    order_id = _save_order(
        work_type, topic, subject, deadline, contact, comment, ip,
        confirm_email=confirm_email, source=source, source_label=source_label,
        source_path=source_path, entry_url=entry_url, contact_channel=contact_channel,
        estimated_price=estimated_price, meta_json=meta_json,
    )
    _notify(work_type, topic, subject, deadline, contact, comment, [], meta)
    _maybe_send_customer_confirmation(order_id, contact, work_type, topic, subject, deadline, confirm_email)
    return {"ok": True, "message": "Заявка отправлена!", "orderId": order_id}


async def _handle_multipart(request: Request, ip: str):
    """Multipart path — form fields + optional file attachments."""
    form = await request.form()

    work_type = str(form.get("workType", "")).strip()[:100]
    topic = str(form.get("topic", "")).strip()[:500]
    subject = str(form.get("subject", "")).strip()[:100]
    deadline = str(form.get("deadline", "")).strip()[:100]
    contact = str(form.get("contact", "")).strip()[:200]
    confirm_email = str(form.get("confirmEmail", "")).strip()[:200]
    comment = str(form.get("comment", "")).strip()[:500]
    raw = {key: form.get(key, "") for key in (
        "packageCode", "packageName", "packageItems", "packagePriceFrom",
        "packageTimeline", "packageAudience", "packageOutcome", "packageVersion", "packageNote",
    )}
    source = _clean_text(form.get("source", ""), 80)
    source_label = _source_label(source, _clean_text(form.get("sourceLabel", ""), 160))
    source_path = _clean_text(form.get("sourcePath", ""), 240)
    entry_url = _clean_text(form.get("entryUrl", ""), 240)
    contact_channel = _clean_text(form.get("contactChannel", ""), 80)
    estimated_price = _normalize_int(form.get("estimatedPrice"))
    meta = _package_meta(raw)
    if estimated_price is None:
        estimated_price = _normalize_int(meta.get("packagePriceFrom"))
    meta_json = json.dumps(meta, ensure_ascii=False, separators=(",", ":")) if meta else ""

    if not contact:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": "Укажите контакт для связи"},
        )

    # Collect uploaded files
    files: list[UploadFile] = []
    for key in form:
        value = form.getlist(key)
        for item in value:
            if isinstance(item, UploadFile) and item.filename:
                files.append(item)

    if len(files) > MAX_ORDER_FILES:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": f"Максимум {MAX_ORDER_FILES} файлов"},
        )

    # Read and validate files
    file_data_list: list[tuple[str, bytes]] = []
    total_size = 0
    for uf in files:
        ext = os.path.splitext(uf.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail={"ok": False, "error": f"Недопустимый тип файла: {ext}"},
            )
        data = await uf.read()
        total_size += len(data)
        if total_size > MAX_ORDER_TOTAL_SIZE:
            raise HTTPException(
                status_code=400,
                detail={"ok": False, "error": "Превышен лимит 45 МБ"},
            )
        safe_name = _sanitize_filename(uf.filename or "file")
        if not safe_name:
            safe_name = "file" + ext
        file_data_list.append((safe_name, data))

    # Save order first to get the id
    attachments_json = json.dumps([n for n, _ in file_data_list]) if file_data_list else None
    order_id = _save_order(
        work_type, topic, subject, deadline, contact, comment, ip,
        attachments_json, confirm_email=confirm_email, source=source,
        source_label=source_label, source_path=source_path, entry_url=entry_url,
        contact_channel=contact_channel, estimated_price=estimated_price,
        meta_json=meta_json,
    )

    # Save files to disk
    saved_names: list[str] = []
    if file_data_list:
        order_dir = os.path.join(ORDER_ATTACH_DIR, str(order_id))
        os.makedirs(order_dir, exist_ok=True)
        for safe_name, data in file_data_list:
            dest = os.path.join(order_dir, safe_name)
            base, ext = os.path.splitext(safe_name)
            counter = 1
            while os.path.exists(dest):
                safe_name = f"{base}_{counter}{ext}"
                dest = os.path.join(order_dir, safe_name)
                counter += 1
            with open(dest, "wb") as f:
                f.write(data)
            saved_names.append(safe_name)

    _notify(work_type, topic, subject, deadline, contact, comment, saved_names, meta)
    _maybe_send_customer_confirmation(order_id, contact, work_type, topic, subject, deadline, confirm_email)
    return {"ok": True, "message": "Заявка отправлена!", "orderId": order_id}
