"""Admin router — login, logout, verify, CRUD docs, orders, analytics, upload, rebuild."""

from __future__ import annotations

import os
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
    with get_db() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                work_type TEXT, topic TEXT, subject TEXT,
                deadline TEXT, contact TEXT, comment TEXT,
                ip TEXT, created_at INTEGER DEFAULT (strftime('%s','now')),
                status TEXT DEFAULT 'new'
            )"""
        )
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


@router.post("/rebuild")
async def rebuild(_admin: None = Depends(require_admin)):
    admin_cleanup_sessions()
    return {"ok": True, "message": "Catalog is managed via catalog.json"}
