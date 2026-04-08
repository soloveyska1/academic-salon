"""Router for library contributions — users can upload their works for moderation."""

from __future__ import annotations

import json
import os
import time

from fastapi import APIRouter, Request, HTTPException, UploadFile

from ..database import get_db, BASE_DIR
from ..auth import get_client_ip, _login_attempts
from ..services.notifications import vk_notify

router = APIRouter()

CONTRIB_DIR: str = os.path.join(BASE_DIR, "contributions")
MAX_CONTRIB_SIZE: int = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTENSIONS: set[str] = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".rtf", ".odt",
}


def _sanitize_filename(name: str) -> str:
    name = os.path.basename(name)
    return name.replace("/", "_").replace("\\", "_").replace("..", "_").strip()


@router.post("/")
async def submit_contribution(request: Request):
    ip = get_client_ip(request)

    # Rate limit: 5 contributions per hour per IP
    now = time.time()
    key = f"contrib:{ip}"
    attempts = _login_attempts.get(key, [])
    attempts = [t for t in attempts if now - t < 3600]
    _login_attempts[key] = attempts
    if len(attempts) >= 5:
        raise HTTPException(
            status_code=429,
            detail={"ok": False, "error": "Слишком много загрузок. Попробуйте позже."},
        )
    _login_attempts[key].append(now)

    form = await request.form()

    title = str(form.get("title", "")).strip()[:200]
    subject = str(form.get("subject", "")).strip()[:100]
    category = str(form.get("category", "")).strip()[:100]
    contact = str(form.get("contact", "")).strip()[:200]
    description = str(form.get("description", "")).strip()[:500]

    if not contact:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": "Укажите контакт для связи"},
        )

    # Get uploaded file
    uploaded = form.get("file")
    if not isinstance(uploaded, UploadFile) or not uploaded.filename:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": "Файл не выбран"},
        )

    ext = os.path.splitext(uploaded.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": f"Недопустимый тип файла: {ext}"},
        )

    data = await uploaded.read()
    if len(data) > MAX_CONTRIB_SIZE:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": "Файл слишком большой (макс. 50 МБ)"},
        )

    safe_name = _sanitize_filename(uploaded.filename or "file" + ext)
    if not safe_name:
        safe_name = "file" + ext

    # Save to DB
    with get_db() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS contributions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT, subject TEXT, category TEXT,
                contact TEXT, description TEXT, filename TEXT,
                ip TEXT, created_at INTEGER DEFAULT (strftime('%s','now')),
                status TEXT DEFAULT 'pending'
            )
            """
        )
        cur = db.execute(
            "INSERT INTO contributions (title, subject, category, contact, description, filename, ip) VALUES (?,?,?,?,?,?,?)",
            (title, subject, category, contact, description, safe_name, ip),
        )
        contrib_id = cur.lastrowid

    # Save file to disk
    contrib_dir = os.path.join(CONTRIB_DIR, str(contrib_id))
    os.makedirs(contrib_dir, exist_ok=True)

    dest = os.path.join(contrib_dir, safe_name)
    base, fext = os.path.splitext(safe_name)
    counter = 1
    while os.path.exists(dest):
        safe_name = f"{base}_{counter}{fext}"
        dest = os.path.join(contrib_dir, safe_name)
        counter += 1

    with open(dest, "wb") as f:
        f.write(data)

    # Notify admin
    parts = ["\U0001f4da Новая работа в библиотеку!"]
    if title:
        parts.append(f"Название: {title}")
    if category:
        parts.append(f"Тип: {category}")
    if subject:
        parts.append(f"Предмет: {subject}")
    parts.append(f"Файл: {safe_name}")
    parts.append(f"Контакт: {contact}")
    if description:
        parts.append(f"Описание: {description}")
    vk_notify("\n".join(parts))

    return {"ok": True, "message": "Работа отправлена на модерацию!"}
