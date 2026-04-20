from __future__ import annotations

import json
import os
import time
from typing import List, Optional

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from ..database import get_db, BASE_DIR
from ..auth import get_client_ip, _login_attempts
from ..services.notifications import notify_order_channels
from .accounts import COOKIE_NAME as ACCOUNT_COOKIE, resolve_order_user

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
    deviceId: str = ""


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


def _save_order(
    work_type: str, topic: str, subject: str,
    deadline: str, contact: str, comment: str,
    ip: str, attachments: Optional[str] = None,
    user_id: Optional[int] = None,
) -> int:
    """Insert order into SQLite, return the new order id."""
    with get_db() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                work_type TEXT, topic TEXT, subject TEXT,
                deadline TEXT, contact TEXT, comment TEXT,
                ip TEXT, created_at INTEGER DEFAULT (strftime('%s','now')),
                status TEXT DEFAULT 'new',
                attachments TEXT,
                user_id INTEGER
            )
            """
        )
        for col_sql in (
            "ALTER TABLE orders ADD COLUMN attachments TEXT",
            "ALTER TABLE orders ADD COLUMN user_id INTEGER",
        ):
            try:
                db.execute(col_sql)
            except Exception:
                pass
        cur = db.execute(
            "INSERT INTO orders (work_type, topic, subject, deadline, contact, comment, ip, attachments, user_id) VALUES (?,?,?,?,?,?,?,?,?)",
            (work_type, topic, subject, deadline, contact, comment, ip, attachments, user_id),
        )
        return cur.lastrowid


def _extract_device_and_session(request: Request, payload_device_id: Optional[str] = None) -> tuple[Optional[str], Optional[str]]:
    """Pull device_id from payload / header / cookie and session token from cookie."""
    device_id = (payload_device_id or request.headers.get("X-Device-Id") or request.cookies.get("academicSalonDevice") or "").strip() or None
    session_token = request.cookies.get(ACCOUNT_COOKIE)
    return device_id, session_token


def _notify(
    work_type: str, topic: str, subject: str,
    deadline: str, contact: str, comment: str,
    file_names: List[str],
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

    work_type = order.workType.strip()[:100]
    topic = order.topic.strip()[:500]
    subject = order.subject.strip()[:100]
    deadline = order.deadline.strip()[:100]
    contact = order.contact.strip()[:200]
    comment = order.comment.strip()[:500]

    if not contact:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": "Укажите контакт для связи"},
        )

    device_id, session_token = _extract_device_and_session(request, order.deviceId)
    user_id = resolve_order_user(session_token, device_id, contact)

    _save_order(work_type, topic, subject, deadline, contact, comment, ip, user_id=user_id)
    _notify(work_type, topic, subject, deadline, contact, comment, [])
    return {"ok": True, "message": "Заявка отправлена!", "bound": bool(user_id)}


async def _handle_multipart(request: Request, ip: str):
    """Multipart path — form fields + optional file attachments."""
    form = await request.form()

    work_type = str(form.get("workType", "")).strip()[:100]
    topic = str(form.get("topic", "")).strip()[:500]
    subject = str(form.get("subject", "")).strip()[:100]
    deadline = str(form.get("deadline", "")).strip()[:100]
    contact = str(form.get("contact", "")).strip()[:200]
    comment = str(form.get("comment", "")).strip()[:500]

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

    device_id, session_token = _extract_device_and_session(
        request,
        str(form.get("deviceId", "")).strip() or None,
    )
    user_id = resolve_order_user(session_token, device_id, contact)

    # Save order first to get the id
    attachments_json = json.dumps([n for n, _ in file_data_list]) if file_data_list else None
    order_id = _save_order(work_type, topic, subject, deadline, contact, comment, ip, attachments_json, user_id=user_id)

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

    _notify(work_type, topic, subject, deadline, contact, comment, saved_names)
    return {"ok": True, "message": "Заявка отправлена!", "bound": bool(user_id)}
