"""Lightweight numbered SQL migrations runner.

Drops in next to api/database.py: instead of init_db() spraying CREATE
TABLE statements at startup, the runner discovers
``migrations/NNN_*.sql`` files, compares them against a single
``schema_migrations`` table in the same SQLite DB, and applies anything
new in a single transaction per file.

Why not Alembic?  This project is one SQLite file with ~7 tables and
no SQLAlchemy models — Alembic would have to run in standalone raw-SQL
mode, which is most of the cost and little of the benefit. Numbered
.sql files give us versioned history, replay, idempotent deploys, and
a clean upgrade story without the dependency.

Idempotency is enforced two ways:
  1. The runner skips files whose version is already in ``schema_migrations``.
  2. ``ALTER TABLE ADD COLUMN`` errors that mean "column already exists"
     are caught and treated as success — so re-applying a migration
     against a DB that grew the column via the legacy inline hack does
     not blow up.
"""
from __future__ import annotations

import logging
import os
import re
import sqlite3
from typing import Iterable

logger = logging.getLogger(__name__)

# migrations/ lives at the repo root, one level above the api/ package.
MIGRATIONS_DIR: str = os.environ.get(
    "SALON_MIGRATIONS_DIR",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "migrations")),
)

_FILE_RE = re.compile(r"^(\d+)_.+\.sql$")


def _discover(migrations_dir: str = MIGRATIONS_DIR) -> list[tuple[int, str, str]]:
    """Return [(version, filename, full_path)] sorted by version."""
    if not os.path.isdir(migrations_dir):
        return []
    found: list[tuple[int, str, str]] = []
    for name in os.listdir(migrations_dir):
        m = _FILE_RE.match(name)
        if not m:
            continue
        found.append((int(m.group(1)), name, os.path.join(migrations_dir, name)))
    found.sort(key=lambda t: t[0])
    return found


def _ensure_table(db: sqlite3.Connection) -> None:
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    INTEGER PRIMARY KEY,
            filename   TEXT    NOT NULL,
            applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )
        """
    )


def _applied_versions(db: sqlite3.Connection) -> set[int]:
    rows = db.execute("SELECT version FROM schema_migrations").fetchall()
    return {int(r[0]) for r in rows}


def _exec_statements(db: sqlite3.Connection, sql: str) -> None:
    """Execute statements one-by-one so 'duplicate column' errors on
    legacy databases (where the inline ALTER hack already ran) don't
    abort the whole migration."""
    for stmt in _split_sql(sql):
        try:
            db.execute(stmt)
        except sqlite3.OperationalError as exc:
            msg = str(exc).lower()
            if "duplicate column" in msg or "already exists" in msg:
                logger.info("migrations: skipping (already applied): %s", stmt[:80])
                continue
            raise


def _split_sql(sql: str) -> Iterable[str]:
    """Naive splitter — good enough because every migration here uses
    flat DDL with ';' terminators and no embedded semicolons."""
    for chunk in sql.split(";"):
        stripped = chunk.strip()
        if stripped:
            yield stripped


def apply_migrations(db_path: str, migrations_dir: str = MIGRATIONS_DIR) -> list[int]:
    """Apply every pending migration in ``migrations_dir`` to ``db_path``.

    Returns the list of versions actually applied this call (empty when
    the DB is already up to date)."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    applied: list[int] = []
    with sqlite3.connect(db_path, timeout=30, isolation_level=None) as db:
        db.execute("PRAGMA journal_mode=WAL")
        _ensure_table(db)
        seen = _applied_versions(db)
        for version, filename, path in _discover(migrations_dir):
            if version in seen:
                continue
            with open(path, "r", encoding="utf-8") as f:
                sql = f.read()
            db.execute("BEGIN")
            try:
                _exec_statements(db, sql)
                db.execute(
                    "INSERT INTO schema_migrations (version, filename) VALUES (?, ?)",
                    (version, filename),
                )
                db.execute("COMMIT")
            except Exception:
                db.execute("ROLLBACK")
                raise
            logger.info("migrations: applied %s", filename)
            applied.append(version)
    return applied
