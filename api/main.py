"""
Academic Salon — FastAPI Backend
Replaces the monolithic stats_api.py with a structured, professional API.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import stats, admin, orders, contribute


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
