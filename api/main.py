"""
Academic Salon — FastAPI Backend
Replaces the monolithic stats_api.py with a structured, professional API.
"""
from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import ADMIN_HASH
from .database import DB_PATH, get_db, init_db
from .routers import stats, admin, orders, contribute
from .services.notifications import (
    EMAIL_TO,
    SENDMAIL_PATH,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_USERNAME,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_FORUM_CHAT_ID,
    VK_ADMIN_ID,
    VK_TOKEN,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    init_db()
    yield


app = FastAPI(
    title="Академический Салон API",
    description="Backend API for the Academic Salon document library",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS — allow same-origin and development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://bibliosaloon.ru", "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(stats.router, prefix="/api/doc-stats", tags=["Statistics"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(orders.router, prefix="/api/order", tags=["Orders"])
app.include_router(contribute.router, prefix="/api/contribute", tags=["Contributions"])


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "academic-salon-api", "version": "2.0.0"}


@app.get("/api/health/live")
async def health_live():
    return {"ok": True, "service": "academic-salon-api", "version": "2.0.0"}


@app.get("/api/health/ready")
async def health_ready():
    checks: dict[str, dict] = {}
    warnings: list[str] = []

    try:
        with get_db() as db:
            db.execute("SELECT 1").fetchone()
        checks["db"] = {"ok": True, "path": DB_PATH}
    except Exception as exc:
        checks["db"] = {"ok": False, "path": DB_PATH, "error": str(exc)}

    smtp_ready = bool(SMTP_HOST and (not SMTP_USERNAME or SMTP_PASSWORD))
    sendmail_ready = bool(SENDMAIL_PATH and os.path.exists(SENDMAIL_PATH))
    checks["notifications"] = {
        "ok": any((
            bool(VK_TOKEN and VK_ADMIN_ID),
            bool(TELEGRAM_BOT_TOKEN and TELEGRAM_FORUM_CHAT_ID),
            bool(EMAIL_TO and (smtp_ready or sendmail_ready)),
        )),
        "vk": bool(VK_TOKEN and VK_ADMIN_ID),
        "telegramForum": bool(TELEGRAM_BOT_TOKEN and TELEGRAM_FORUM_CHAT_ID),
        "email": bool(EMAIL_TO and (smtp_ready or sendmail_ready)),
    }
    checks["adminAuth"] = {"ok": bool(ADMIN_HASH)}

    if not checks["notifications"]["email"]:
        warnings.append("Email delivery is not configured.")

    ok = all(item["ok"] for item in checks.values())
    status_code = 200 if ok else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "ok": ok,
            "service": "academic-salon-api",
            "version": "2.0.0",
            "checks": checks,
            "warnings": warnings,
        },
    )
