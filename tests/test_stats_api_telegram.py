"""Smoke checks for monolithic stats_api.py Telegram Login verification."""

from __future__ import annotations

import hashlib
import hmac
import sqlite3
import time

import stats_api


def _make_payload(token: str, **fields) -> dict:
    def signed_value(value):
        if isinstance(value, bool):
            return "true" if value else "false"
        return str(value)

    fields.setdefault("id", 12345678)
    fields.setdefault("first_name", "Alice")
    fields.setdefault("auth_date", int(time.time()))
    data = "\n".join(
        sorted(f"{key}={signed_value(value)}" for key, value in fields.items())
    )
    secret = hashlib.sha256(token.encode("utf-8")).digest()
    fields["hash"] = hmac.new(secret, data.encode("utf-8"), hashlib.sha256).hexdigest()
    return fields


def test_stats_api_telegram_hash_accepts_write_access_flag(monkeypatch) -> None:
    monkeypatch.setattr(stats_api, "TELEGRAM_LOGIN_BOT_TOKEN", "test-bot-token")
    payload = _make_payload(
        "test-bot-token",
        username="alice_test",
        allows_write_to_pm=True,
    )

    assert stats_api.StatsHandler._verify_telegram_hash(object(), payload) is True


def test_stats_api_sessions_schema_adds_missing_columns(tmp_path) -> None:
    db = sqlite3.connect(tmp_path / "sessions.sqlite3")
    db.execute(
        "CREATE TABLE me_sessions (token TEXT PRIMARY KEY, contact TEXT NOT NULL)"
    )
    db.execute(
        "INSERT INTO me_sessions (token, contact) VALUES (?, ?)",
        ("old-token", "student@example.com"),
    )

    stats_api.ensure_me_sessions_table(db)

    columns = {row[1] for row in db.execute("PRAGMA table_info(me_sessions)")}
    assert {"token", "contact", "channel", "expires_at", "created_at"} <= columns
    row = db.execute(
        "SELECT channel, expires_at, created_at FROM me_sessions WHERE token = ?",
        ("old-token",),
    ).fetchone()
    assert row == ("email", 0, 0)
    db.execute(
        "INSERT INTO me_sessions (token, contact, channel, expires_at) "
        "VALUES (?, ?, ?, ?)",
        ("new-token", "@alice", "telegram", 1_800_000_000),
    )
    db.close()


def test_stats_api_sessions_schema_rebuilds_incompatible_table(tmp_path) -> None:
    db = sqlite3.connect(tmp_path / "sessions.sqlite3")
    db.execute(
        "CREATE TABLE me_sessions (session TEXT PRIMARY KEY, contact TEXT)"
    )

    stats_api.ensure_me_sessions_table(db)

    columns = {row[1] for row in db.execute("PRAGMA table_info(me_sessions)")}
    assert {"token", "contact", "channel", "expires_at", "created_at"} <= columns
    legacy_tables = [
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name LIKE 'me_sessions_legacy_%'"
        )
    ]
    assert len(legacy_tables) == 1
    db.execute(
        "INSERT INTO me_sessions (token, contact, channel, expires_at) "
        "VALUES (?, ?, ?, ?)",
        ("new-token", "tg:123", "telegram", 1_800_000_000),
    )
    db.close()
