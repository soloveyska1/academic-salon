from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_client_ip, _login_attempts
from ..services.notifications import vk_notify
import time

router = APIRouter()


class OrderRequest(BaseModel):
    workType: str = ""
    topic: str = ""
    subject: str = ""
    deadline: str = ""
    contact: str = ""
    comment: str = ""


@router.post("/")
async def create_order(order: OrderRequest, request: Request):
    ip = get_client_ip(request)

    # Rate limit: 3 orders per hour per IP
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

    # Validate and truncate
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

    # Save order to SQLite
    with get_db() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                work_type TEXT, topic TEXT, subject TEXT,
                deadline TEXT, contact TEXT, comment TEXT,
                ip TEXT, created_at INTEGER DEFAULT (strftime('%s','now')),
                status TEXT DEFAULT 'new'
            )
            """
        )
        db.execute(
            "INSERT INTO orders (work_type, topic, subject, deadline, contact, comment, ip) VALUES (?,?,?,?,?,?,?)",
            (work_type, topic, subject, deadline, contact, comment, ip),
        )

    # Send VK notification to admin
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
    vk_notify("\n".join(parts))

    return {"ok": True, "message": "Заявка отправлена!"}
