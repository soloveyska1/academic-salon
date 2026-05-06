"""Smoke checks for the monolithic May 9 «По рассказам» helpers."""
from __future__ import annotations

import sqlite3

import stats_api


def _db() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    stats_api.ensure_may9_voices_table(db)
    return db


def test_may9_slots_payload_counts_remaining(monkeypatch) -> None:
    monkeypatch.setattr(stats_api, "MAY9_VOICE_TOTAL", 2)
    db = _db()

    assert stats_api.may9_slots_payload(db) == {
        "ok": True,
        "taken": 0,
        "total": 2,
        "remaining": 2,
        "closed": False,
    }

    db.execute(
        "INSERT INTO may9_voices (email, email_norm, hero_name, created_at) VALUES (?, ?, ?, ?)",
        ("student@example.com", "student@example.com", "Анна", 1_800_000_000),
    )

    assert stats_api.may9_slots_payload(db)["remaining"] == 1
    db.close()


def test_may9_guard_closes_after_total_limit(monkeypatch) -> None:
    monkeypatch.setattr(stats_api, "MAY9_VOICE_TOTAL", 1)
    db = _db()
    now = 1_800_000_000

    status, error = stats_api.evaluate_may9_voice_guard(
        db,
        ip="127.0.0.1",
        email_norm="student@example.com",
        now_ts=now,
    )
    assert (status, error) == (0, "")

    db.execute(
        "INSERT INTO may9_voices (email, email_norm, hero_name, ip, created_at) VALUES (?, ?, ?, ?, ?)",
        ("student@example.com", "student@example.com", "Анна", "127.0.0.1", now),
    )

    status, error = stats_api.evaluate_may9_voice_guard(
        db,
        ip="127.0.0.1",
        email_norm="other@example.com",
        now_ts=now,
    )
    assert status == 410
    assert "места закончились" in error
    db.close()
