"""Authentication module for the Academic Salon FastAPI backend.

Handles admin login, session management, rate limiting, and client identification.
Extracted from stats_api.py (lines 83-166 + resolve_client_key helpers).
"""

import bcrypt
import hashlib
import os
import secrets
import threading
import time

from fastapi import Header, HTTPException, Request

# ===== CONFIG (from environment) =====

ADMIN_HASH: str = os.environ.get("SALON_ADMIN_HASH", "").strip()
SESSION_TTL: int = 24 * 60 * 60          # 24 hours
LOGIN_RATE_WINDOW: int = 60              # 1 minute
LOGIN_RATE_MAX: int = 5
LOGIN_BLOCK_TIME: int = 15 * 60          # 15 min block after too many attempts

# ===== IN-MEMORY SESSION STORE =====

_sessions: dict[str, float] = {}          # token -> expiry timestamp
_sessions_lock = threading.Lock()

# ===== RATE LIMITING =====

_login_attempts: dict[str, list[float]] = {}  # ip -> [timestamps]
_login_blocks: dict[str, float] = {}          # ip -> block_until


# ===== AUTH FUNCTIONS =====


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
    """Record a login attempt timestamp for the given IP."""
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
    """Remove the given session token."""
    with _sessions_lock:
        _sessions.pop(token, None)


def admin_cleanup_sessions() -> None:
    """Remove expired sessions (called occasionally)."""
    now = time.time()
    with _sessions_lock:
        expired = [t for t, exp in _sessions.items() if exp <= now]
        for t in expired:
            del _sessions[t]


# ===== FASTAPI DEPENDENCY =====


def require_admin(authorization: str = Header(None)) -> str:
    """FastAPI dependency that enforces admin authentication.

    Extracts Bearer token from the Authorization header, verifies it,
    and raises HTTPException(401) if invalid. Returns the valid token.
    """
    token: str | None = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not admin_verify(token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token  # type: ignore[return-value]


# ===== HELPERS =====


def get_client_ip(request: Request) -> str:
    """Extract client IP from X-Forwarded-For header or direct connection."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "") or ""


def _normalize_client_id(value: str | None) -> str | None:
    """Validate and normalize a client ID string."""
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if 12 <= len(cleaned) <= 120 and all(ch.isalnum() or ch in "-_." for ch in cleaned):
        return f"cid:{cleaned}"
    return None


def _fallback_client_key(request: Request) -> str:
    """Generate an anonymous client key from IP + User-Agent hash."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "") or ""
    ua = (request.headers.get("User-Agent") or "")[:200]
    digest = hashlib.sha256(f"{ip}|{ua}".encode("utf-8")).hexdigest()
    return f"anon:{digest[:40]}"


def resolve_client_key(
    request: Request,
    payload: dict | None = None,
    query_cid: str | None = None,
) -> str:
    """Resolve a stable client identifier through a chain of lookups.

    Priority:
      1. ``clientId`` field in the JSON payload
      2. ``query_cid`` query parameter
      3. Anonymous fingerprint derived from IP + User-Agent
    """
    payload = payload or {}

    client_id = _normalize_client_id(payload.get("clientId"))
    if client_id:
        return client_id

    client_id = _normalize_client_id(query_cid)
    if client_id:
        return client_id

    return _fallback_client_key(request)
