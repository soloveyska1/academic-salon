"""Progressive-account authentication router.

Implements Stage 1 of the progressive-account flow:

* POST /api/auth/tg       — verify Telegram Login Widget HMAC payload,
                             upsert user, bind to device_id, issue session.
* POST /api/auth/vk       — exchange VK ID silent_token via the VK API,
                             upsert user, bind to device_id, issue session.
* GET  /api/auth/me       — return current session state (vk/tg handles).
* POST /api/auth/logout   — invalidate session cookie.
* GET  /api/auth/config   — non-secret public config for the frontend
                             widgets (VK app id, TG bot name, enabled flags).

All endpoints are CORS-safe and use the same `academicSalonSession` cookie.
Session TTL is 90 days; device_id is stored as a row in `users` so the
invisible-cabinet localStorage state can be merged on first login.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
import urllib.parse
import urllib.request
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..database import get_db

router = APIRouter()
logger = logging.getLogger("academic-salon.accounts")

# ---------------------------------------------------------------------------
# Configuration (environment)
# ---------------------------------------------------------------------------

TG_BOT_TOKEN: str = os.environ.get("SALON_TELEGRAM_BOT_TOKEN", "").strip()
TG_BOT_NAME: str = os.environ.get("SALON_TELEGRAM_BOT_NAME", "").strip().lstrip("@")
VK_APP_ID: str = os.environ.get("SALON_VK_APP_ID", "").strip()
VK_APP_SECRET: str = os.environ.get("SALON_VK_APP_SECRET", "").strip()

COOKIE_NAME: str = "academicSalonSession"
SESSION_TTL: int = 90 * 24 * 60 * 60   # 90 days
TG_AUTH_MAX_AGE: int = 24 * 60 * 60    # 24h freshness window for TG payload


# ---------------------------------------------------------------------------
# Schema bootstrap — idempotent, called lazily at first request
# ---------------------------------------------------------------------------

_SCHEMA_READY = False


def _ensure_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with get_db() as db:
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
    _SCHEMA_READY = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize_device_id(raw: Optional[str]) -> Optional[str]:
    """Device IDs are client-generated UUIDs — accept 8-64 safe chars."""
    if not raw:
        return None
    cleaned = raw.strip()
    if 8 <= len(cleaned) <= 64 and all(ch.isalnum() or ch in "-_." for ch in cleaned):
        return cleaned
    return None


def _issue_session(user_id: int) -> tuple[str, int]:
    """Create and persist a session token for *user_id*. Returns (token, expires_at)."""
    token = secrets.token_urlsafe(40)
    expires_at = int(time.time()) + SESSION_TTL
    with get_db() as db:
        db.execute(
            "INSERT INTO account_sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires_at),
        )
    return token, expires_at


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def _find_user_by_session(token: Optional[str]) -> Optional[dict[str, Any]]:
    if not token:
        return None
    _ensure_schema()
    now = int(time.time())
    with get_db() as db:
        row = db.execute(
            """
            SELECT u.* FROM users u
            JOIN account_sessions s ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > ?
            """,
            (token, now),
        ).fetchone()
    return dict(row) if row else None


def _upsert_by_channel(
    channel: str,
    channel_id: str,
    device_id: Optional[str],
    fields: dict[str, Any],
) -> int:
    """Find or create a user by (vk|tg) id. Merge device_id when present.

    Returns the resolved user_id. If both a device_id row and a channel_id row
    exist and are different, we prefer the channel row and detach device_id
    (keeping per-channel identity stable).
    """
    _ensure_schema()
    channel_col = "vk_id" if channel == "vk" else "tg_id"
    now = int(time.time())

    with get_db() as db:
        db.execute("BEGIN IMMEDIATE")

        existing_by_channel = db.execute(
            f"SELECT id, device_id FROM users WHERE {channel_col} = ? LIMIT 1",
            (channel_id,),
        ).fetchone()

        existing_by_device = None
        if device_id:
            existing_by_device = db.execute(
                "SELECT id FROM users WHERE device_id = ? LIMIT 1",
                (device_id,),
            ).fetchone()

        if existing_by_channel:
            user_id = int(existing_by_channel["id"])
            # Adopt the device_id if missing (first-time bind from this browser)
            if device_id and not existing_by_channel["device_id"]:
                # But release it from any other user that had it
                if existing_by_device and int(existing_by_device["id"]) != user_id:
                    db.execute(
                        "UPDATE users SET device_id = NULL WHERE id = ?",
                        (int(existing_by_device["id"]),),
                    )
                db.execute(
                    "UPDATE users SET device_id = ? WHERE id = ?",
                    (device_id, user_id),
                )
        elif existing_by_device:
            user_id = int(existing_by_device["id"])
        else:
            cur = db.execute(
                "INSERT INTO users (device_id, created_at, last_seen_at) VALUES (?, ?, ?)",
                (device_id, now, now),
            )
            user_id = int(cur.lastrowid or 0)

        # Update channel fields + last_seen
        set_parts: list[str] = [f"{channel_col} = ?"]
        params: list[Any] = [channel_id]
        for key in ("handle", "name", "avatar"):
            value = fields.get(key)
            if value is not None:
                set_parts.append(f"{channel}_{key} = ?")
                params.append(str(value)[:255])
        set_parts.append("last_seen_at = ?")
        params.append(now)
        params.append(user_id)

        db.execute(
            f"UPDATE users SET {', '.join(set_parts)} WHERE id = ?",
            params,
        )
        db.commit()

    return user_id


# ---------------------------------------------------------------------------
# Telegram Login Widget — HMAC verification
# https://core.telegram.org/widgets/login#checking-authorization
# ---------------------------------------------------------------------------

class TgAuthPayload(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str = Field(..., min_length=10)
    device_id: Optional[str] = None


def _verify_telegram_hash(payload: dict[str, Any], provided_hash: str) -> bool:
    if not TG_BOT_TOKEN:
        return False
    data = {k: v for k, v in payload.items() if k != "hash" and v is not None}
    data_check_string = "\n".join(
        f"{k}={data[k]}" for k in sorted(data.keys())
    )
    secret_key = hashlib.sha256(TG_BOT_TOKEN.encode()).digest()
    computed = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, provided_hash)


@router.post("/tg")
async def auth_telegram(payload: TgAuthPayload, response: Response) -> dict[str, Any]:
    if not TG_BOT_TOKEN or not TG_BOT_NAME:
        raise HTTPException(status_code=503, detail="Telegram login is not configured on this server")

    if int(time.time()) - payload.auth_date > TG_AUTH_MAX_AGE:
        raise HTTPException(status_code=400, detail="Telegram auth payload expired")

    raw = payload.model_dump()
    provided_hash = raw.pop("hash")
    device_id = _sanitize_device_id(raw.pop("device_id", None))

    # Payload for HMAC must NOT include our synthetic `device_id` field
    if not _verify_telegram_hash(raw, provided_hash):
        raise HTTPException(status_code=401, detail="Invalid Telegram signature")

    full_name = " ".join(filter(None, [payload.first_name, payload.last_name])) or None
    user_id = _upsert_by_channel(
        "tg",
        str(payload.id),
        device_id,
        {
            "handle": payload.username,
            "name": full_name,
            "avatar": payload.photo_url,
        },
    )
    token, _ = _issue_session(user_id)
    _set_session_cookie(response, token)
    return {"ok": True, "user": _public_user(user_id)}


# ---------------------------------------------------------------------------
# VK ID — silent_token exchange
# https://id.vk.com/about/business/go/docs/vkid/exchange-silent-token
# ---------------------------------------------------------------------------

class VkAuthPayload(BaseModel):
    code: str = Field(..., min_length=8)
    redirect_uri: str = Field(..., min_length=8)
    device_id: Optional[str] = None


def _vk_exchange_code(code: str, redirect_uri: str) -> dict[str, Any]:
    """Classic VK OAuth code → access_token exchange (server-side)."""
    if not VK_APP_ID or not VK_APP_SECRET:
        raise HTTPException(status_code=503, detail="VK login is not configured on this server")

    params = {
        "client_id": VK_APP_ID,
        "client_secret": VK_APP_SECRET,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    url = "https://oauth.vk.com/access_token?" + urllib.parse.urlencode(params)

    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("VK code exchange failed: %s", exc)
        raise HTTPException(status_code=502, detail="VK service unavailable") from exc

    if "error" in data or not data.get("user_id"):
        logger.warning("VK code exchange rejected: %s", data.get("error_description") or data.get("error"))
        raise HTTPException(status_code=401, detail="VK rejected the authorization code")

    return data


def _vk_fetch_profile(access_token: str) -> dict[str, Any]:
    try:
        url = "https://api.vk.com/method/users.get?" + urllib.parse.urlencode({
            "v": "5.131",
            "access_token": access_token,
            "fields": "screen_name,photo_100",
        })
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        items = (data.get("response") or [])
        return items[0] if items else {}
    except Exception:
        return {}


@router.post("/vk")
async def auth_vk(payload: VkAuthPayload, response: Response) -> dict[str, Any]:
    exchanged = _vk_exchange_code(payload.code, payload.redirect_uri)
    vk_id = str(exchanged["user_id"])
    device_id = _sanitize_device_id(payload.device_id)
    access_token = exchanged.get("access_token")

    profile = _vk_fetch_profile(access_token) if access_token else {}
    handle = profile.get("screen_name")
    name = " ".join(filter(None, [profile.get("first_name"), profile.get("last_name")])) or None
    avatar = profile.get("photo_100")

    user_id = _upsert_by_channel(
        "vk",
        vk_id,
        device_id,
        {"handle": handle, "name": name, "avatar": avatar},
    )
    token, _ = _issue_session(user_id)
    _set_session_cookie(response, token)
    return {"ok": True, "user": _public_user(user_id)}


# ---------------------------------------------------------------------------
# Session endpoints
# ---------------------------------------------------------------------------

def _public_user(user_id: int) -> dict[str, Any]:
    with get_db() as db:
        row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return {}
    d = dict(row)
    return {
        "id": d["id"],
        "deviceId": d.get("device_id"),
        "vk": {
            "id": d.get("vk_id"),
            "handle": d.get("vk_handle"),
            "name": d.get("vk_name"),
            "avatar": d.get("vk_avatar"),
        } if d.get("vk_id") else None,
        "tg": {
            "id": d.get("tg_id"),
            "handle": d.get("tg_handle"),
            "name": d.get("tg_name"),
            "avatar": d.get("tg_avatar"),
        } if d.get("tg_id") else None,
    }


@router.get("/me")
async def auth_me(
    academicSalonSession: Optional[str] = Cookie(default=None),
) -> dict[str, Any]:
    _ensure_schema()
    user = _find_user_by_session(academicSalonSession)
    if not user:
        return {"ok": True, "authenticated": False}
    return {"ok": True, "authenticated": True, "user": _public_user(int(user["id"]))}


@router.post("/logout")
async def auth_logout(
    response: Response,
    academicSalonSession: Optional[str] = Cookie(default=None),
) -> dict[str, Any]:
    if academicSalonSession:
        _ensure_schema()
        with get_db() as db:
            db.execute("DELETE FROM account_sessions WHERE token = ?", (academicSalonSession,))
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/config")
async def auth_config() -> dict[str, Any]:
    """Public (non-secret) config for frontend login widgets."""
    return {
        "ok": True,
        "tg": {
            "enabled": bool(TG_BOT_TOKEN and TG_BOT_NAME),
            "botName": TG_BOT_NAME or None,
        },
        "vk": {
            "enabled": bool(VK_APP_ID and VK_APP_SECRET),
            "appId": VK_APP_ID or None,
        },
    }
