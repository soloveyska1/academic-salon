"""FastAPI router for document statistics endpoints.

Replaces the stats-related endpoints from the original monolithic stats_api.py.
Mounted at ``/api/doc-stats`` in the main application.
"""

from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ..database import (
    get_db,
    sanitize_file,
    fetch_stats_map,
    record_event,
    set_reaction,
    MAX_BATCH,
    EVENT_WINDOWS,
)
from ..auth import resolve_client_key

# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------


class BatchRequest(BaseModel):
    files: list[str]
    clientId: str = ""


class EventRequest(BaseModel):
    file: str
    action: str
    clientId: str = ""


class ReactionRequest(BaseModel):
    file: str
    reaction: int
    clientId: str = ""


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter()


# -- 1. Health check -------------------------------------------------------


@router.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "doc-stats"}


# -- 2. Download redirect --------------------------------------------------


@router.get("/download")
@router.head("/download")
async def download(
    request: Request,
    file: str = Query(...),
    cid: str = Query(""),
) -> RedirectResponse:
    file_value = sanitize_file(file)
    if not file_value:
        raise HTTPException(status_code=400, detail="Invalid file")

    # On HEAD requests skip recording the event
    if request.method != "HEAD":
        client_key = resolve_client_key(request, query_cid=cid)
        with get_db() as db:
            try:
                record_event(db, file_value, "download", client_key)
            except Exception as exc:
                raise HTTPException(status_code=500, detail=str(exc))

    location = "/" + quote(file_value, safe="/")
    return RedirectResponse(
        url=location,
        status_code=302,
        headers={"Cache-Control": "no-store"},
    )


# -- 3. Batch stats --------------------------------------------------------


@router.post("/batch")
async def batch(request: Request, body: BatchRequest) -> dict:
    files = body.files
    if len(files) > MAX_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files (max {MAX_BATCH})",
        )

    # Validate each file path
    validated: list[str] = []
    for f in files:
        cleaned = sanitize_file(f)
        if cleaned:
            validated.append(cleaned)

    client_key = resolve_client_key(
        request,
        payload={"clientId": body.clientId},
    )

    with get_db() as db:
        stats = fetch_stats_map(db, validated, client_key)

    return {"ok": True, "stats": stats}


# -- 4. Record event -------------------------------------------------------


@router.post("/event")
async def event(request: Request, body: EventRequest) -> dict:
    if body.action not in EVENT_WINDOWS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported action. Must be one of: {', '.join(EVENT_WINDOWS)}",
        )

    file_value = sanitize_file(body.file)
    if not file_value:
        raise HTTPException(status_code=400, detail="Invalid file")

    client_key = resolve_client_key(
        request,
        payload={"clientId": body.clientId},
    )

    with get_db() as db:
        try:
            stat, counted = record_event(db, file_value, body.action, client_key)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    return {"ok": True, "counted": counted, "stat": stat}


# -- 5. Set reaction -------------------------------------------------------


@router.post("/reaction")
async def reaction(request: Request, body: ReactionRequest) -> dict:
    if body.reaction not in (-1, 0, 1):
        raise HTTPException(
            status_code=400,
            detail="Reaction must be -1, 0, or 1",
        )

    file_value = sanitize_file(body.file)
    if not file_value:
        raise HTTPException(status_code=400, detail="Invalid file")

    client_key = resolve_client_key(
        request,
        payload={"clientId": body.clientId},
    )

    with get_db() as db:
        try:
            stat = set_reaction(db, file_value, body.reaction, client_key)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    return {"ok": True, "stat": stat}
