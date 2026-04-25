"""Cabinet access — Phase 1.

The /me page asks visitors for a contact (Telegram or email) so that
the salon can hand-deliver a one-time link. We don't actually mint a
token yet (Phase 2); for now we just persist the request and ping the
operator on the same channels that order notifications use, so nobody
is left staring at a "feature in development" toast.
"""
from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from ..auth import enforce_rate_limit, get_client_ip
from ..database import get_db
from ..services.notifications import notify_order_channels


router = APIRouter()


# --------------------------------------------------------------------- helpers

_TG_RE = re.compile(r"^@?[a-zA-Z0-9_]{4,32}$")
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _detect_channel(contact: str) -> Literal["telegram", "email"] | None:
    cleaned = contact.strip()
    if not cleaned:
        return None
    if _EMAIL_RE.match(cleaned):
        return "email"
    if _TG_RE.match(cleaned):
        return "telegram"
    return None


# --------------------------------------------------------------------- schema


class LinkRequest(BaseModel):
    contact: str


# --------------------------------------------------------------------- routes


@router.post("/request-link")
async def request_link(body: LinkRequest, request: Request) -> dict:
    """Accept a cabinet-access request, log it, and notify operators.

    Rate-limited: 3 requests / hour per IP. Validation happens before
    DB writes so junk traffic doesn't bloat the table.
    """
    enforce_rate_limit(
        request,
        "me:request-link",
        max_calls=3,
        window_seconds=3600,
    )

    contact = (body.contact or "").strip()[:200]
    channel = _detect_channel(contact)
    if not channel:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "error": "Укажите Telegram (через @) или e-mail.",
            },
        )

    ip = get_client_ip(request)
    user_agent = (request.headers.get("user-agent") or "")[:500]

    with get_db() as db:
        cursor = db.execute(
            """
            INSERT INTO me_link_requests (contact, channel, ip, user_agent)
            VALUES (?, ?, ?, ?)
            """,
            (contact, channel, ip, user_agent),
        )
        request_id = cursor.lastrowid

    where = "Telegram" if channel == "telegram" else "email"
    notify_order_channels(
        subject=f"Кабинет: {contact}",
        body=(
            f"\U0001f511 Запрос на вход в кабинет\n"
            f"Контакт: {contact}\n"
            f"Канал: {where}\n"
            f"IP: {ip}\n"
            f"ID: #{request_id}\n\n"
            f"Свяжитесь и пришлите ссылку вручную (Phase 2 заменит на токен)."
        ),
        telegram_topic_name=f"Кабинет · {contact}",
    )

    return {"ok": True, "channel": channel}
