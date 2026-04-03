"""Database module for the Academic Salon FastAPI backend.

Provides SQLite connection management, schema initialisation, catalog I/O,
and all low-level data-access helpers extracted from the original monolithic
stats_api.py.
"""

from __future__ import annotations

import json
import os
import random
import sqlite3
import threading
import time
from typing import Any

# ---------------------------------------------------------------------------
# Configuration (environment variables with sensible defaults)
# ---------------------------------------------------------------------------

BASE_DIR: str = os.environ.get("SALON_FILES_DIR", "/var/www/salon")
DB_PATH: str = os.environ.get("SALON_STATS_DB", "/var/lib/bibliosaloon/doc_stats.sqlite3")
CATALOG_PATH: str = os.environ.get("SALON_CATALOG", os.path.join(BASE_DIR, "catalog.json"))
UPLOAD_DIR: str = os.path.join(BASE_DIR, "files")
MAX_BATCH: int = 400
MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50 MB
EVENT_WINDOWS: dict[str, int] = {
    "view": 6 * 60 * 60,
    "download": 30,
}

# ---------------------------------------------------------------------------
# Catalog management (thread-safe JSON read/write)
# ---------------------------------------------------------------------------

_catalog_lock: threading.Lock = threading.Lock()


def load_catalog() -> list[dict[str, Any]]:
    """Load the document catalog from *CATALOG_PATH*."""
    if not os.path.exists(CATALOG_PATH):
        return []
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_catalog(catalog: list[dict[str, Any]]) -> None:
    """Atomically save *catalog* to *CATALOG_PATH* (write-then-rename)."""
    tmp_path: str = CATALOG_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=None, separators=(",", ":"))
    os.replace(tmp_path, CATALOG_PATH)


def find_doc_index(catalog: list[dict[str, Any]], file_path: str) -> int:
    """Return the index of the document whose ``file`` field equals *file_path*, or ``-1``."""
    for i, doc in enumerate(catalog):
        if doc.get("file") == file_path:
            return i
    return -1


# ---------------------------------------------------------------------------
# SQLite connection & schema
# ---------------------------------------------------------------------------

def _ensure_parent_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)


def get_db() -> sqlite3.Connection:
    """Return a new :class:`sqlite3.Connection` configured for WAL mode."""
    conn: sqlite3.Connection = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    """Create all required tables and indexes if they do not already exist."""
    _ensure_parent_dir(DB_PATH)
    with get_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS doc_counters (
                file TEXT PRIMARY KEY,
                views INTEGER NOT NULL DEFAULT 0,
                downloads INTEGER NOT NULL DEFAULT 0,
                likes INTEGER NOT NULL DEFAULT 0,
                dislikes INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );

            CREATE TABLE IF NOT EXISTS event_buckets (
                file TEXT NOT NULL,
                client_id TEXT NOT NULL,
                action TEXT NOT NULL,
                bucket INTEGER NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                PRIMARY KEY (file, client_id, action, bucket)
            );

            CREATE TABLE IF NOT EXISTS reactions (
                file TEXT NOT NULL,
                client_id TEXT NOT NULL,
                reaction INTEGER NOT NULL CHECK (reaction IN (-1, 1)),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                PRIMARY KEY (file, client_id)
            );

            CREATE INDEX IF NOT EXISTS idx_event_buckets_created_at
                ON event_buckets(created_at);

            CREATE INDEX IF NOT EXISTS idx_reactions_file
                ON reactions(file);

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                work_type TEXT,
                topic TEXT,
                subject TEXT,
                deadline TEXT,
                contact TEXT,
                comment TEXT,
                ip TEXT,
                created_at INTEGER DEFAULT (strftime('%s','now')),
                status TEXT DEFAULT 'new'
            );
            """
        )


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

def cleanup_old_rows(db: sqlite3.Connection) -> None:
    """With ~4 % probability, delete event_buckets rows older than 14 days."""
    if random.random() > 0.04:
        return
    cutoff: int = int(time.time()) - (14 * 24 * 60 * 60)
    db.execute("DELETE FROM event_buckets WHERE created_at < ?", (cutoff,))


# ---------------------------------------------------------------------------
# Input validation helpers
# ---------------------------------------------------------------------------

def sanitize_file(file_value: str | None) -> str | None:
    """Validate and normalise a file path.

    Returns the cleaned relative path (e.g. ``files/foo.pdf``) when all checks
    pass, or ``None`` otherwise.  The file must start with ``files/``, must not
    contain ``..`` path components, must resolve inside *BASE_DIR/files*, and
    must exist on disk.
    """
    if not isinstance(file_value, str):
        return None
    candidate: str = file_value.strip().replace("\\", "/")
    if not candidate.startswith("files/"):
        return None
    if ".." in candidate.split("/"):
        return None
    full_path: str = os.path.normpath(os.path.join(BASE_DIR, candidate))
    files_root: str = os.path.normpath(os.path.join(BASE_DIR, "files"))
    if not full_path.startswith(files_root + os.sep):
        return None
    if not os.path.exists(full_path):
        return None
    return candidate


def normalize_client_id(value: str | None) -> str | None:
    """Validate a client-supplied identifier.

    Returns ``cid:<cleaned>`` when valid (12-120 alphanumeric/``-_. `` chars),
    or ``None``.
    """
    if not isinstance(value, str):
        return None
    cleaned: str = value.strip()
    if 12 <= len(cleaned) <= 120 and all(ch.isalnum() or ch in "-_." for ch in cleaned):
        return f"cid:{cleaned}"
    return None


# ---------------------------------------------------------------------------
# Counter / stats helpers
# ---------------------------------------------------------------------------

def ensure_counter_row(db: sqlite3.Connection, file_value: str) -> None:
    """Ensure a row exists in ``doc_counters`` for *file_value*."""
    db.execute(
        """
        INSERT INTO doc_counters (file, views, downloads, likes, dislikes, updated_at)
        VALUES (?, 0, 0, 0, 0, strftime('%s','now'))
        ON CONFLICT(file) DO NOTHING
        """,
        (file_value,),
    )


def fetch_stats_map(
    db: sqlite3.Connection,
    files: list[str],
    client_id: str,
) -> dict[str, dict[str, int]]:
    """Batch-fetch view/download/reaction stats for *files*.

    Returns a mapping from each file path to a dict with keys ``views``,
    ``downloads``, ``likes``, ``dislikes``, and ``reaction`` (the current
    user's reaction: -1, 0, or 1).
    """
    stats: dict[str, dict[str, int]] = {
        file_value: {
            "views": 0,
            "downloads": 0,
            "likes": 0,
            "dislikes": 0,
            "reaction": 0,
        }
        for file_value in files
    }
    if not files:
        return stats

    placeholders: str = ",".join("?" for _ in files)

    counter_rows = db.execute(
        f"""
        SELECT file, views, downloads, likes, dislikes
        FROM doc_counters
        WHERE file IN ({placeholders})
        """,
        files,
    ).fetchall()
    for row in counter_rows:
        stats[row["file"]].update(
            {
                "views": int(row["views"] or 0),
                "downloads": int(row["downloads"] or 0),
                "likes": int(row["likes"] or 0),
                "dislikes": int(row["dislikes"] or 0),
            }
        )

    reaction_rows = db.execute(
        f"""
        SELECT file, reaction
        FROM reactions
        WHERE client_id = ? AND file IN ({placeholders})
        """,
        [client_id, *files],
    ).fetchall()
    for row in reaction_rows:
        stats[row["file"]]["reaction"] = int(row["reaction"] or 0)

    return stats


def fetch_single_stat(
    db: sqlite3.Connection,
    file_value: str,
    client_id: str,
) -> dict[str, int]:
    """Fetch stats for a single file (convenience wrapper around :func:`fetch_stats_map`)."""
    return fetch_stats_map(db, [file_value], client_id)[file_value]


# ---------------------------------------------------------------------------
# Event recording (view / download with time-bucket deduplication)
# ---------------------------------------------------------------------------

def record_event(
    db: sqlite3.Connection,
    file_value: str,
    action: str,
    client_id: str,
) -> tuple[dict[str, int], bool]:
    """Record a *view* or *download* event.

    Uses a time-bucket deduplication strategy so the same client does not
    inflate counters within the window defined in :data:`EVENT_WINDOWS`.

    Returns ``(stat_dict, was_new_event)``.
    """
    if action not in EVENT_WINDOWS:
        raise ValueError("Unsupported action")

    ensure_counter_row(db, file_value)
    bucket: int = int(time.time() // EVENT_WINDOWS[action])
    column: str = "views" if action == "view" else "downloads"

    db.execute("BEGIN IMMEDIATE")

    inserted: bool = db.execute(
        """
        INSERT OR IGNORE INTO event_buckets (file, client_id, action, bucket, created_at)
        VALUES (?, ?, ?, ?, strftime('%s','now'))
        """,
        (file_value, client_id, action, bucket),
    ).rowcount > 0

    if inserted:
        db.execute(
            f"""
            UPDATE doc_counters
            SET {column} = {column} + 1,
                updated_at = strftime('%s','now')
            WHERE file = ?
            """,
            (file_value,),
        )

    cleanup_old_rows(db)
    stat: dict[str, int] = fetch_single_stat(db, file_value, client_id)
    db.commit()
    return stat, inserted


# ---------------------------------------------------------------------------
# Reactions (like / dislike toggle)
# ---------------------------------------------------------------------------

def set_reaction(
    db: sqlite3.Connection,
    file_value: str,
    reaction: int,
    client_id: str,
) -> dict[str, int]:
    """Toggle a like/dislike reaction for *file_value*.

    If *reaction* equals the user's current reaction, the reaction is removed
    (toggled off).  Counter columns in ``doc_counters`` are updated
    accordingly.
    """
    if reaction not in (-1, 0, 1):
        raise ValueError("Reaction must be -1, 0 or 1")

    ensure_counter_row(db, file_value)
    db.execute("BEGIN IMMEDIATE")

    current_row = db.execute(
        "SELECT reaction FROM reactions WHERE file = ? AND client_id = ?",
        (file_value, client_id),
    ).fetchone()
    current: int = int(current_row["reaction"]) if current_row else 0
    next_reaction: int = 0 if reaction == current else reaction

    if current == next_reaction:
        stat: dict[str, int] = fetch_single_stat(db, file_value, client_id)
        db.commit()
        return stat

    # Remove weight of previous reaction
    if current_row and current:
        prev_column: str = "likes" if current == 1 else "dislikes"
        db.execute(
            f"""
            UPDATE doc_counters
            SET {prev_column} = CASE WHEN {prev_column} > 0 THEN {prev_column} - 1 ELSE 0 END,
                updated_at = strftime('%s','now')
            WHERE file = ?
            """,
            (file_value,),
        )

    # Apply new reaction (or delete if toggled off)
    if next_reaction:
        next_column: str = "likes" if next_reaction == 1 else "dislikes"
        db.execute(
            """
            INSERT INTO reactions (file, client_id, reaction, updated_at)
            VALUES (?, ?, ?, strftime('%s','now'))
            ON CONFLICT(file, client_id) DO UPDATE
                SET reaction = excluded.reaction,
                    updated_at = excluded.updated_at
            """,
            (file_value, client_id, next_reaction),
        )
        db.execute(
            f"""
            UPDATE doc_counters
            SET {next_column} = {next_column} + 1,
                updated_at = strftime('%s','now')
            WHERE file = ?
            """,
            (file_value,),
        )
    else:
        db.execute(
            "DELETE FROM reactions WHERE file = ? AND client_id = ?",
            (file_value, client_id),
        )

    stat = fetch_single_stat(db, file_value, client_id)
    db.commit()
    return stat
