"""Cabinet (/me) — Phase 2.

Visitors hit POST /api/me/request-link with a contact (Telegram or
email). For email we mint a one-time token, persist it, and send the
visitor a https://bibliosaloon.ru/me?token=<token> link. The /me page
auto-calls /api/me/verify, the verify endpoint exchanges the token for
a session cookie. From that point /api/me/whoami answers the cabinet
UI.

Telegram contacts still go down the Phase-1 manual path (operator gets
a notification) — Telegram bots can't message users first without the
user starting a conversation, so a fully-automatic flow needs the
@academicsaloonbot deep-link UX which is not yet wired up.
"""
from __future__ import annotations

import logging
import re
import secrets
import time
from typing import Literal

from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel

from ..auth import enforce_rate_limit, get_client_ip
from ..database import get_db
from ..services.notifications import notify_order_channels, send_user_email


router = APIRouter()
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------- helpers

_TG_RE = re.compile(r"^@?[a-zA-Z0-9_]{4,32}$")
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

LINK_TOKEN_TTL = 30 * 60                     # 30 minutes
SESSION_TTL = 30 * 24 * 60 * 60              # 30 days
COOKIE_NAME = "salon_session"
SITE_URL = "https://bibliosaloon.ru"


def _detect_channel(contact: str) -> Literal["telegram", "email"] | None:
    cleaned = contact.strip()
    if not cleaned:
        return None
    if _EMAIL_RE.match(cleaned):
        return "email"
    if _TG_RE.match(cleaned):
        return "telegram"
    return None


def _now() -> int:
    return int(time.time())


def _new_token() -> str:
    return secrets.token_hex(32)


def _build_email_body(contact: str, link: str) -> str:
    return (
        f"Здравствуйте!\n\n"
        f"Вы запросили вход в кабинет Академического Салона по этому "
        f"e-mail ({contact}). Откройте ссылку, чтобы войти:\n\n"
        f"{link}\n\n"
        f"Ссылка действует 30 минут и сработает один раз.\n"
        f"Если это были не вы — просто проигнорируйте письмо, "
        f"ничего не произойдёт.\n\n"
        f"— Академический Салон"
    )


def _read_session(request: Request) -> dict | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    with get_db() as db:
        row = db.execute(
            "SELECT token, contact, channel, expires_at "
            "FROM me_sessions WHERE token = ? AND expires_at > ?",
            (token, _now()),
        ).fetchone()
    return dict(row) if row else None


# --------------------------------------------------------------------- schema


class LinkRequest(BaseModel):
    contact: str


# --------------------------------------------------------------------- routes


@router.post("/request-link")
async def request_link(body: LinkRequest, request: Request) -> dict:
    enforce_rate_limit(
        request, "me:request-link",
        max_calls=3, window_seconds=3600,
    )

    contact = (body.contact or "").strip()[:200]
    channel = _detect_channel(contact)
    if not channel:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": "Укажите Telegram (через @) или e-mail."},
        )

    ip = get_client_ip(request)
    user_agent = (request.headers.get("user-agent") or "")[:500]
    now = _now()

    # Audit trail (Phase 1 compatibility) — keeps the old me_link_requests
    # table populated so historical reports keep working.
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO me_link_requests (contact, channel, ip, user_agent) "
            "VALUES (?, ?, ?, ?)",
            (contact, channel, ip, user_agent),
        )
        request_id = cur.lastrowid

    if channel == "email":
        token = _new_token()
        expires_at = now + LINK_TOKEN_TTL
        with get_db() as db:
            db.execute(
                "INSERT INTO me_link_tokens (token, contact, channel, expires_at) "
                "VALUES (?, ?, ?, ?)",
                (token, contact, channel, expires_at),
            )
        link = f"{SITE_URL}/api/me/verify?token={token}"
        sent = False
        try:
            sent = send_user_email(
                to_addr=contact,
                subject="Вход в кабинет — Академический Салон",
                body=_build_email_body(contact, link),
            )
        except Exception:
            logger.exception("me: email send failed for %s", contact)

        if sent:
            return {"ok": True, "channel": "email", "auto": True}

        # SMTP off / failed → fall back to operator notify so the user
        # isn't stranded.
        notify_order_channels(
            subject=f"Кабинет (email fallback): {contact}",
            body=(
                f"⚠️ Email-доставка ссылки не сработала.\n"
                f"Контакт: {contact}\nIP: {ip}\nID: #{request_id}\n\n"
                f"Пришлите ссылку вручную: {link}"
            ),
            telegram_topic_name=f"Кабинет · {contact}",
        )
        return {"ok": True, "channel": "email", "auto": False}

    # Telegram — Phase 1 (manual). Bots can't message users first without
    # the user starting the bot, so we route this to the operator.
    notify_order_channels(
        subject=f"Кабинет (TG): {contact}",
        body=(
            f"\U0001f511 Запрос на вход в кабинет (Telegram)\n"
            f"Контакт: {contact}\nIP: {ip}\nID: #{request_id}\n\n"
            f"Пришлите ссылку вручную или попросите написать боту."
        ),
        telegram_topic_name=f"Кабинет · {contact}",
    )
    return {"ok": True, "channel": "telegram", "auto": False}


@router.get("/verify")
async def verify(token: str, request: Request) -> Response:
    """Redeem a magic-link token, mint a session cookie, redirect to /me."""
    if not token or len(token) != 64:
        return RedirectResponse(url="/me?err=token", status_code=303)

    now = _now()
    with get_db() as db:
        row = db.execute(
            "SELECT contact, channel, expires_at, used_at "
            "FROM me_link_tokens WHERE token = ?",
            (token,),
        ).fetchone()
        if not row:
            return RedirectResponse(url="/me?err=unknown", status_code=303)
        if row["used_at"] is not None:
            return RedirectResponse(url="/me?err=used", status_code=303)
        if int(row["expires_at"]) <= now:
            return RedirectResponse(url="/me?err=expired", status_code=303)

        db.execute(
            "UPDATE me_link_tokens SET used_at = ? WHERE token = ?",
            (now, token),
        )
        session_token = _new_token()
        db.execute(
            "INSERT INTO me_sessions (token, contact, channel, expires_at) "
            "VALUES (?, ?, ?, ?)",
            (session_token, row["contact"], row["channel"], now + SESSION_TTL),
        )

    response = RedirectResponse(url="/me?ok=1", status_code=303)
    # Mark the cookie Secure only when actually served over HTTPS — on
    # http://testserver (and local dev) we keep it loose so the same
    # endpoint is unit-testable.
    is_secure = request.url.scheme == "https"
    response.set_cookie(
        key=COOKIE_NAME,
        value=session_token,
        max_age=SESSION_TTL,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        path="/",
    )
    return response


@router.get("/whoami")
async def whoami(request: Request) -> dict:
    sess = _read_session(request)
    if not sess:
        return {"ok": False, "loggedIn": False}
    return {
        "ok": True,
        "loggedIn": True,
        "contact": sess["contact"],
        "channel": sess["channel"],
        "expiresAt": sess["expires_at"],
    }


@router.get("/orders")
async def orders(request: Request) -> dict:
    """Return up to 50 orders matching the session's contact (case-insensitive)."""
    sess = _read_session(request)
    if not sess:
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Not signed in"})
    contact = sess["contact"].strip().lower()
    with get_db() as db:
        rows = db.execute(
            "SELECT id, work_type, topic, subject, deadline, status, created_at "
            "FROM orders WHERE LOWER(contact) = ? ORDER BY created_at DESC LIMIT 50",
            (contact,),
        ).fetchall()
    return {"ok": True, "orders": [dict(r) for r in rows]}


@router.post("/logout")
async def logout(request: Request) -> Response:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        with get_db() as db:
            db.execute("DELETE FROM me_sessions WHERE token = ?", (token,))
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


# ────────────────────────────────────────────────────── favourites

class FavoritesPayload(BaseModel):
    """Body for POST/DELETE /api/me/favorites."""
    file: str | None = None
    files: list[str] | None = None  # used by POST for the localStorage merge


def _normalise_file(value: str) -> str | None:
    cleaned = (value or "").strip()
    if not cleaned or len(cleaned) > 500 or "\x00" in cleaned:
        return None
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        return None
    if cleaned.startswith("/") or ".." in cleaned.split("/"):
        return None
    return cleaned


@router.get("/favorites")
async def list_favorites(request: Request) -> dict:
    sess = _read_session(request)
    if not sess:
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Not signed in"})
    contact = sess["contact"]
    with get_db() as db:
        rows = db.execute(
            "SELECT file, added_at FROM me_favorites "
            "WHERE contact = ? ORDER BY added_at DESC LIMIT 500",
            (contact,),
        ).fetchall()
    return {"ok": True, "favorites": [dict(r) for r in rows]}


@router.post("/favorites")
async def add_favorites(body: FavoritesPayload, request: Request) -> dict:
    """Add one (`file`) or many (`files`, used for the localStorage merge
    on first sign-in). Idempotent — duplicate (contact, file) pairs
    silently no-op via INSERT OR IGNORE."""
    sess = _read_session(request)
    if not sess:
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Not signed in"})

    candidates: list[str] = []
    if body.file:
        candidates.append(body.file)
    if body.files:
        candidates.extend(body.files)

    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in candidates:
        norm = _normalise_file(raw)
        if norm and norm not in seen:
            cleaned.append(norm)
            seen.add(norm)

    if not cleaned:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": "Provide file or files[]."},
        )

    contact = sess["contact"]
    with get_db() as db:
        db.executemany(
            "INSERT OR IGNORE INTO me_favorites (contact, file) VALUES (?, ?)",
            [(contact, f) for f in cleaned],
        )
    return {"ok": True, "added": len(cleaned)}


@router.delete("/favorites")
async def remove_favorite(body: FavoritesPayload, request: Request) -> dict:
    sess = _read_session(request)
    if not sess:
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Not signed in"})
    file = _normalise_file(body.file or "")
    if not file:
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "error": "Provide a file path."},
        )
    contact = sess["contact"]
    with get_db() as db:
        cursor = db.execute(
            "DELETE FROM me_favorites WHERE contact = ? AND file = ?",
            (contact, file),
        )
    return {"ok": True, "removed": cursor.rowcount}
