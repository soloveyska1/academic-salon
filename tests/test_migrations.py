"""Migrations runner: discovery, idempotency, ordering, partial failures."""
from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

from api.migrations import apply_migrations


def _write(dir_: Path, name: str, sql: str) -> None:
    (dir_ / name).write_text(sql, encoding="utf-8")


def test_first_run_applies_all_migrations(tmp_path: Path) -> None:
    db = tmp_path / "test.sqlite3"
    mig = tmp_path / "migrations"
    mig.mkdir()
    _write(mig, "001_init.sql", "CREATE TABLE foo (id INTEGER PRIMARY KEY);")
    _write(mig, "002_add.sql", "CREATE TABLE bar (id INTEGER PRIMARY KEY);")

    applied = apply_migrations(str(db), migrations_dir=str(mig))
    assert applied == [1, 2]

    # Tables really exist.
    conn = sqlite3.connect(db)
    names = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    assert {"foo", "bar"}.issubset(names)


def test_second_run_is_a_noop(tmp_path: Path) -> None:
    db = tmp_path / "test.sqlite3"
    mig = tmp_path / "migrations"
    mig.mkdir()
    _write(mig, "001_init.sql", "CREATE TABLE foo (id INTEGER PRIMARY KEY);")

    apply_migrations(str(db), migrations_dir=str(mig))
    second = apply_migrations(str(db), migrations_dir=str(mig))
    assert second == []


def test_new_migration_added_after_initial_run(tmp_path: Path) -> None:
    db = tmp_path / "test.sqlite3"
    mig = tmp_path / "migrations"
    mig.mkdir()
    _write(mig, "001_init.sql", "CREATE TABLE foo (id INTEGER PRIMARY KEY);")

    apply_migrations(str(db), migrations_dir=str(mig))
    _write(mig, "002_add_baz.sql", "CREATE TABLE baz (id INTEGER PRIMARY KEY);")
    applied = apply_migrations(str(db), migrations_dir=str(mig))
    assert applied == [2]


def test_duplicate_column_is_treated_as_already_applied(tmp_path: Path) -> None:
    """If a legacy DB grew a column via the inline ALTER hack, replaying
    the migration that adds the same column must NOT abort."""
    db = tmp_path / "test.sqlite3"
    mig = tmp_path / "migrations"
    mig.mkdir()
    _write(mig, "001_init.sql", "CREATE TABLE foo (id INTEGER PRIMARY KEY);")
    _write(mig, "002_add_col.sql", "ALTER TABLE foo ADD COLUMN extra TEXT;")

    # Pretend the column already exists (legacy state).
    sqlite3.connect(db).execute("CREATE TABLE foo (id INTEGER PRIMARY KEY, extra TEXT)").connection.commit()

    applied = apply_migrations(str(db), migrations_dir=str(mig))
    # Both migrations are recorded — 001 is idempotent IF NOT EXISTS,
    # 002 is gracefully treated as already-applied.
    assert applied == [1, 2]


def test_files_with_unrecognised_names_are_ignored(tmp_path: Path) -> None:
    db = tmp_path / "test.sqlite3"
    mig = tmp_path / "migrations"
    mig.mkdir()
    _write(mig, "001_init.sql", "CREATE TABLE foo (id INTEGER PRIMARY KEY);")
    _write(mig, "README.md", "# notes")
    _write(mig, "draft.sql", "SELECT 1;")  # no NNN_ prefix → ignored.

    applied = apply_migrations(str(db), migrations_dir=str(mig))
    assert applied == [1]


def test_real_baseline_migrations_apply_cleanly(tmp_path: Path) -> None:
    """Sanity: the actual migrations/ shipped with the project apply to
    a fresh DB without errors."""
    db = tmp_path / "real.sqlite3"
    repo_root = Path(__file__).resolve().parents[1]
    real_migrations = repo_root / "migrations"
    assert real_migrations.is_dir(), "migrations/ folder is missing"

    applied = apply_migrations(str(db), migrations_dir=str(real_migrations))
    assert len(applied) >= 2  # at least 001_baseline + 002_orders_extra_columns

    conn = sqlite3.connect(db)
    names = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    for required in (
        "doc_counters", "event_buckets", "reactions",
        "orders", "contributions", "calendar_overrides",
        "schema_migrations",
    ):
        assert required in names, f"missing table {required}"

    # 002 must have grown the orders extras.
    cols = {r[1] for r in conn.execute("PRAGMA table_info(orders)")}
    for required in ("attachments", "manager_note", "response_to_client",
                     "response_channel", "response_at"):
        assert required in cols, f"orders missing {required}"
