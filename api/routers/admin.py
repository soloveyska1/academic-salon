"""Admin router — login, logout, verify, CRUD docs, orders, analytics, upload, rebuild."""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from ..auth import (
    require_admin,
    admin_login,
    admin_logout,
    admin_check_rate_limit,
    admin_record_attempt,
    admin_cleanup_sessions,
    get_client_ip,
)
from ..database import (
    get_db,
    load_catalog,
    save_catalog,
    find_doc_index,
    UPLOAD_DIR,
    BASE_DIR,
    MAX_UPLOAD_SIZE,
)
from ..services.notifications import (
    _email_notify_sync,
    _vk_notify_sync,
    _telegram_notify_sync,
    send_user_email,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    password: str


class DocUpdateRequest(BaseModel):
    file: str
    updates: Dict[str, Any]


class DocDeleteRequest(BaseModel):
    file: str


class OrderUpdateRequest(BaseModel):
    id: int
    updates: Dict[str, Any]


class OrderResponseRequest(BaseModel):
    channel: str = "auto"   # auto | telegram | vk | email
    message: str


class CalendarSetRequest(BaseModel):
    date: str               # YYYY-MM-DD
    state: Optional[str]    # free | tight | busy | closed — or None to clear


# ---------------------------------------------------------------------------
# Public (unauthenticated) endpoints
# ---------------------------------------------------------------------------


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    ip = get_client_ip(request)
    if not admin_check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    if not body.password:
        raise HTTPException(status_code=400, detail="Password required")
    admin_record_attempt(ip)
    token = admin_login(body.password)
    if token:
        return {"ok": True, "token": token}
    raise HTTPException(status_code=403, detail="Invalid password")


@router.post("/logout")
async def logout(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else None
    if token:
        admin_logout(token)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Protected endpoints
# ---------------------------------------------------------------------------


@router.get("/verify")
async def verify(_admin: None = Depends(require_admin)):
    return {"ok": True}


@router.get("/docs")
async def get_docs(_admin: None = Depends(require_admin)):
    catalog = load_catalog()
    return {"ok": True, "docs": catalog, "total": len(catalog)}


@router.put("/docs")
async def update_doc(body: DocUpdateRequest, _admin: None = Depends(require_admin)):
    if not body.file or not body.updates:
        raise HTTPException(status_code=400, detail="file and updates required")

    allowed_fields = {
        "title", "description", "category", "subject", "course",
        "docType", "catalogTitle", "catalogDescription", "tags",
    }

    catalog = load_catalog()
    idx = find_doc_index(catalog, body.file)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Document not found")

    for key, val in body.updates.items():
        if key in allowed_fields:
            catalog[idx][key] = val

    save_catalog(catalog)
    return {"ok": True, "doc": catalog[idx]}


@router.delete("/docs")
async def delete_doc(body: DocDeleteRequest, _admin: None = Depends(require_admin)):
    if not body.file:
        raise HTTPException(status_code=400, detail="file required")

    catalog = load_catalog()
    idx = find_doc_index(catalog, body.file)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Document not found")

    removed = catalog.pop(idx)
    save_catalog(catalog)

    # Optionally remove file from disk
    disk_path = os.path.normpath(os.path.join(BASE_DIR, body.file))
    files_root = os.path.normpath(UPLOAD_DIR)
    if disk_path.startswith(files_root + os.sep) and os.path.exists(disk_path):
        try:
            os.remove(disk_path)
        except OSError:
            pass

    return {"ok": True, "removed": removed.get("title", body.file)}


@router.get("/orders")
async def get_orders(_admin: None = Depends(require_admin)):
    # ``orders`` schema lives in migrations/001_baseline.sql.
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM orders ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
    return {"ok": True, "orders": [dict(r) for r in rows]}


@router.get("/analytics")
async def get_analytics(_admin: None = Depends(require_admin)):
    with get_db() as db:
        total_views = db.execute(
            "SELECT COALESCE(SUM(views),0) as s FROM doc_counters"
        ).fetchone()["s"]
        total_downloads = db.execute(
            "SELECT COALESCE(SUM(downloads),0) as s FROM doc_counters"
        ).fetchone()["s"]
        total_likes = db.execute(
            "SELECT COALESCE(SUM(likes),0) as s FROM doc_counters"
        ).fetchone()["s"]
        total_dislikes = db.execute(
            "SELECT COALESCE(SUM(dislikes),0) as s FROM doc_counters"
        ).fetchone()["s"]
        top_viewed = db.execute(
            "SELECT file, views, downloads, likes, dislikes "
            "FROM doc_counters ORDER BY views DESC LIMIT 20"
        ).fetchall()
        top_downloaded = db.execute(
            "SELECT file, views, downloads, likes, dislikes "
            "FROM doc_counters ORDER BY downloads DESC LIMIT 20"
        ).fetchall()
        recent = db.execute(
            "SELECT file, action, created_at "
            "FROM event_buckets ORDER BY created_at DESC LIMIT 50"
        ).fetchall()

    catalog = load_catalog()

    return {
        "ok": True,
        "totalDocs": len(catalog),
        "totalViews": total_views,
        "totalDownloads": total_downloads,
        "totalLikes": total_likes,
        "totalDislikes": total_dislikes,
        "topViewed": [dict(r) for r in top_viewed],
        "topDownloaded": [dict(r) for r in top_downloaded],
        "recent": [
            {"file": r["file"], "action": r["action"], "at": r["created_at"]}
            for r in recent
        ],
    }


@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(""),
    description: str = Form(""),
    category: str = Form("Другое"),
    subject: str = Form("Общее"),
    course: str = Form(""),
    docType: str = Form(""),
    tags: str = Form(""),
    _admin: None = Depends(require_admin),
):
    # Check size via Content-Length header
    content_length = int(request.headers.get("content-length", "0"))
    if content_length > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    file_data = await file.read()
    if len(file_data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    file_name = file.filename
    if not file_name:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Sanitize filename
    safe_name = file_name.replace("/", "_").replace("\\", "_").replace("..", "_")
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    dest_path = os.path.join(UPLOAD_DIR, safe_name)

    # Avoid overwrite
    base, ext = os.path.splitext(safe_name)
    counter = 1
    while os.path.exists(dest_path):
        safe_name = f"{base}_{counter}{ext}"
        dest_path = os.path.join(UPLOAD_DIR, safe_name)
        counter += 1

    # Write file
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(file_data)

    # Build catalog entry
    file_size = len(file_data)
    if file_size < 1024:
        size_str = f"{file_size} B"
    elif file_size < 1024 * 1024:
        size_str = f"{file_size / 1024:.1f} KB"
    else:
        size_str = f"{file_size / (1024 * 1024):.1f} MB"

    resolved_title = title or os.path.splitext(safe_name)[0]
    resolved_doc_type = docType or category
    parsed_tags: List[str] = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    doc_entry = {
        "file": f"files/{safe_name}",
        "filename": safe_name,
        "size": size_str,
        "text": description,
        "tags": parsed_tags,
        "category": category,
        "subject": subject,
        "course": course,
        "exists": True,
        "title": resolved_title,
        "description": description,
        "catalogTitle": resolved_title,
        "catalogDescription": description,
        "docType": resolved_doc_type,
    }

    catalog = load_catalog()
    catalog.append(doc_entry)
    save_catalog(catalog)

    return {"ok": True, "doc": doc_entry, "totalDocs": len(catalog)}


def _ensure_order_columns() -> None:
    """No-op shim. Order extras (manager_note, response_*) are owned by
    migrations/002_orders_extra_columns.sql and applied at startup."""


_STATUS_NOTIFY = {"in_work", "done", "waiting_client"}
_EMAIL_RE_ADMIN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _build_status_email(order_id: int, new_status: str, topic: str) -> tuple[str, str]:
    """Mirror of stats_api._build_status_update_body. Same copy so the
    customer experience doesn't depend on which runtime served the
    admin save (FastAPI here is mostly used for tests + dev)."""
    topic_clause = f' «{topic}»' if topic else ""
    if new_status == "in_work":
        return (
            f"Заявка №{order_id} в работе — Академический Салон",
            f"Здравствуйте!\n\n"
            f"Хорошие новости: мы взяли вашу заявку №{order_id}{topic_clause} в работу.\n\n"
            f"Куратор свяжется с вами в ближайшее время, чтобы согласовать план "
            f"и зафиксировать срок. Пока ничего делать не нужно — ждите весточку.\n\n"
            f"Если что-то изменится с вашей стороны (тема, требования, дедлайн) — "
            f"напишите нам, чтобы мы переиграли план до того, как начнём писать:\n"
            f"  Telegram: https://t.me/academicsaloon\n"
            f"  ВКонтакте: https://vk.com/academicsaloon\n\n"
            f"Статус заявки в любой момент можно посмотреть в кабинете:\n"
            f"https://bibliosaloon.ru/me\n\n"
            f"—\nАкадемический Салон",
        )
    if new_status == "done":
        return (
            f"Заявка №{order_id} готова — Академический Салон",
            f"Здравствуйте!\n\n"
            f"Ваша заявка №{order_id}{topic_clause} готова. Куратор пришлёт файлы "
            f"и подробности в Telegram/ВКонтакте — там, где удобнее обсудить правки.\n\n"
            f"Если будут замечания — нам важно их получить как можно раньше: "
            f"бесплатные доработки в рамках ТЗ входят в стоимость.\n\n"
            f"Спасибо, что выбрали Салон. Удачной защиты!\n\n"
            f"—\nАкадемический Салон\n"
            f"https://bibliosaloon.ru",
        )
    # waiting_client
    return (
        f"Заявка №{order_id} — нужен ваш ответ",
        f"Здравствуйте!\n\n"
        f"По заявке №{order_id}{topic_clause} мы уточняем детали и не можем "
        f"двигаться дальше без вашего ответа. Куратор написал в Telegram/ВКонтакте — "
        f"проверьте, пожалуйста, и ответьте в удобной форме.\n\n"
        f"Чем раньше отзовётесь, тем меньше съест времени уточнение.\n\n"
        f"—\nАкадемический Салон\n"
        f"https://bibliosaloon.ru",
    )


def _maybe_send_status_update(
    order_id: int,
    old_status: str | None,
    new_status: str,
    contact: str,
    confirm_email: str,
    topic: str,
) -> None:
    """Best-effort: notify the customer when status moves into a
    user-visible state. Silent skip when contact resolves to no email
    address."""
    if new_status not in _STATUS_NOTIFY or new_status == old_status:
        return
    explicit = (confirm_email or "").strip()
    addr = (
        explicit if explicit and _EMAIL_RE_ADMIN.match(explicit)
        else (contact.strip() if contact and _EMAIL_RE_ADMIN.match(contact.strip()) else None)
    )
    if not addr:
        return
    try:
        subject, body = _build_status_email(order_id, new_status, topic or "")
        send_user_email(addr, subject, body)
    except Exception:
        logger.exception("Order #%s: status-update email failed", order_id)


def _ensure_order_messages(db) -> None:
    db.execute(
        "CREATE TABLE IF NOT EXISTS order_messages ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, "
        "author TEXT NOT NULL, body TEXT NOT NULL, "
        "created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), "
        "read_at INTEGER)"
    )


@router.get("/orders/{order_id}/messages")
async def admin_list_order_messages(order_id: int, _admin: None = Depends(require_admin)) -> dict:
    """Stage 60 — admin reads the chat thread for any order."""
    with get_db() as db:
        _ensure_order_messages(db)
        rows = db.execute(
            "SELECT id, author, body, created_at, read_at "
            "FROM order_messages WHERE order_id = ? "
            "ORDER BY created_at ASC LIMIT 500",
            (order_id,),
        ).fetchall()
        db.execute(
            "UPDATE order_messages SET read_at = strftime('%s','now') "
            "WHERE order_id = ? AND author = 'client' AND read_at IS NULL",
            (order_id,),
        )
    return {"ok": True, "messages": [dict(r) for r in rows]}


class AdminMessageBody(BaseModel):
    body: str = ""


@router.post("/orders/{order_id}/messages")
async def admin_post_order_message(
    order_id: int,
    body: AdminMessageBody,
    _admin: None = Depends(require_admin),
) -> dict:
    text = (body.body or "").strip()[:4000]
    if not text:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Empty body"})
    with get_db() as db:
        _ensure_order_messages(db)
        order_row = db.execute(
            "SELECT contact, confirm_email, topic FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
        if not order_row:
            raise HTTPException(status_code=404, detail={"ok": False, "error": "Order not found"})
        cur = db.execute(
            "INSERT INTO order_messages (order_id, author, body) VALUES (?, ?, ?)",
            (order_id, "manager", text),
        )
        mid = int(cur.lastrowid or 0)
        msg = db.execute(
            "SELECT id, author, body, created_at, read_at FROM order_messages WHERE id = ?",
            (mid,),
        ).fetchone()
    # Best-effort email notification (sync — same as Stage 46 admin path).
    row = dict(order_row) if order_row else {}
    contact = (row.get("contact") or "").strip()
    confirm_email = (row.get("confirm_email") or "").strip()
    addr = (
        confirm_email if confirm_email and _EMAIL_RE_ADMIN.match(confirm_email)
        else (contact if contact and _EMAIL_RE_ADMIN.match(contact) else None)
    )
    if addr:
        topic = (row.get("topic") or "").strip()
        topic_clause = f' «{topic}»' if topic else ""
        try:
            send_user_email(
                addr,
                f"Новое сообщение по заявке №{order_id} — Академический Салон",
                (
                    f"Здравствуйте!\n\n"
                    f"Куратор оставил сообщение по вашей заявке №{order_id}{topic_clause}.\n\n"
                    f"Прочитать и ответить можно в кабинете:\n"
                    f"https://bibliosaloon.ru/me\n\n"
                    f"—\nАкадемический Салон"
                ),
            )
        except Exception:
            logger.exception("Order #%s: reply email failed", order_id)
    return {"ok": True, "message": dict(msg) if msg else None}


@router.put("/orders")
async def update_order(body: OrderUpdateRequest, _admin: None = Depends(require_admin)):
    """Update order status / manager_note + maybe notify customer about
    a meaningful status change (Stage 46)."""
    if not body.id:
        raise HTTPException(status_code=400, detail="id required")

    _ensure_order_columns()
    allowed = {"status", "manager_note", "internal_note"}
    fields: Dict[str, Any] = {}
    for key, value in (body.updates or {}).items():
        if key == "internal_note":
            key = "manager_note"
        if key in allowed:
            fields[key] = value
    if not fields:
        raise HTTPException(status_code=400, detail="no allowed fields to update")

    set_clause = ", ".join(f"{k} = ?" for k in fields.keys())
    params = list(fields.values()) + [body.id]
    with get_db() as db:
        before = db.execute(
            "SELECT * FROM orders WHERE id = ?", (body.id,)
        ).fetchone()
        if before is None:
            raise HTTPException(status_code=404, detail="Order not found")
        cur = db.execute(f"UPDATE orders SET {set_clause} WHERE id = ?", params)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Order not found")
        row = db.execute("SELECT * FROM orders WHERE id = ?", (body.id,)).fetchone()

    if "status" in fields:
        before_d = dict(before) if before else {}
        row_d = dict(row) if row else {}
        _maybe_send_status_update(
            order_id=int(body.id),
            old_status=before_d.get("status"),
            new_status=fields["status"],
            contact=row_d.get("contact") or "",
            confirm_email=row_d.get("confirm_email") or "",
            topic=row_d.get("topic") or "",
        )

    return {"ok": True, "order": dict(row)}


def _detect_channel(contact: str) -> str:
    """Best-effort guess of the original contact channel from a free-text field."""
    c = (contact or "").strip()
    if not c:
        return "email"
    low = c.lower()
    if "t.me/" in low or low.startswith("@") or "telegram" in low:
        return "telegram"
    if "vk.com" in low or "vk.me" in low or low.startswith("vk:"):
        return "vk"
    if re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", c):
        return "email"
    return "telegram"  # безопасный дефолт — админу в форум-канал


@router.post("/orders/{order_id}/send-response")
async def send_order_response(
    order_id: int,
    body: OrderResponseRequest,
    _admin: None = Depends(require_admin),
):
    """Send a free-form message to the client via selected channel and log it."""
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message required")
    if len(message) > 4000:
        raise HTTPException(status_code=400, detail="message too long (max 4000 chars)")

    _ensure_order_columns()
    with get_db() as db:
        row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")

    order = dict(row)
    contact = (order.get("contact") or "").strip()
    topic = order.get("topic") or "Заявка"

    channel = (body.channel or "auto").lower()
    if channel == "auto":
        channel = _detect_channel(contact)

    full_text = f"Академический Салон. Ответ по заявке: {topic}\n\n{message}"
    ok = False
    if channel == "email":
        ok = _email_notify_sync(f"Academic Salon — ответ по заявке «{topic}»", full_text)
    elif channel == "vk":
        ok = _vk_notify_sync(full_text)
    elif channel == "telegram":
        ok = _telegram_notify_sync(full_text)
    else:
        raise HTTPException(status_code=400, detail=f"unsupported channel: {channel}")

    if not ok:
        raise HTTPException(
            status_code=502,
            detail=f"Канал '{channel}' не настроен или не принял сообщение. Скопируйте текст и отправьте вручную.",
        )

    sent_at = int(time.time())
    with get_db() as db:
        db.execute(
            "UPDATE orders SET response_to_client = ?, response_channel = ?, response_at = ?, status = COALESCE(NULLIF(status, 'new'), 'in_work') WHERE id = ?",
            (message, channel, sent_at, order_id),
        )
    logger.info("Order #%s response sent via %s", order_id, channel)
    return {"ok": True, "channel": channel, "deliveredAt": sent_at}


def _ensure_calendar_table() -> None:
    """No-op shim. ``calendar_overrides`` is owned by
    migrations/001_baseline.sql and applied at startup."""


@router.get("/calendar")
async def admin_get_calendar(_admin: None = Depends(require_admin)):
    _ensure_calendar_table()
    with get_db() as db:
        rows = db.execute(
            "SELECT date, state, updated_at FROM calendar_overrides ORDER BY date"
        ).fetchall()
    return {"ok": True, "items": [dict(r) for r in rows]}


@router.put("/calendar")
async def admin_set_calendar_day(body: CalendarSetRequest, _admin: None = Depends(require_admin)):
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", body.date or ""):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

    _ensure_calendar_table()
    with get_db() as db:
        if body.state is None:
            db.execute("DELETE FROM calendar_overrides WHERE date = ?", (body.date,))
            return {"ok": True, "cleared": body.date}
        if body.state not in {"free", "tight", "busy", "closed"}:
            raise HTTPException(status_code=400, detail="state must be one of free/tight/busy/closed")
        db.execute(
            """INSERT INTO calendar_overrides (date, state, updated_at)
               VALUES (?, ?, strftime('%s','now'))
               ON CONFLICT(date) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at""",
            (body.date, body.state),
        )
    return {"ok": True, "date": body.date, "state": body.state}


@router.post("/rebuild")
async def rebuild(_admin: None = Depends(require_admin)):
    admin_cleanup_sessions()
    return {"ok": True, "message": "Catalog is managed via catalog.json"}
