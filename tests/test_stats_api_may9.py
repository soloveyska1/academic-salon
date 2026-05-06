"""Smoke checks for the monolithic May 9 «По рассказам» helpers."""
from __future__ import annotations

import json
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


def test_may9_admin_email_keeps_full_answers() -> None:
    long_answer = "А" * 420 + " полный хвост ответа"
    row = {
        "id": 9,
        "created_at": 1_800_000_000,
        "hero_name": "Анна",
        "years": "1918–1996",
        "relation": "прабабушка",
        "place": "Курск",
        "name": "Маша",
        "email": "masha@example.com",
        "telegram": "@masha",
        "publish_consent": 1,
        "status": "queued_manual",
        "reward_code": "MAY9_2026",
        "answers_json": json.dumps({"q4": long_answer}, ensure_ascii=False),
    }

    summary = stats_api.build_may9_voice_admin_notification(row)
    email = stats_api.build_may9_voice_admin_email(row)

    assert "полный хвост ответа" not in summary
    assert "полный хвост ответа" in email
    assert "Email: masha@example.com" in email
    assert "Telegram: @masha" in email


def test_may9_request_attachment_contains_full_admin_brief(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(stats_api, "MAY9_VOICE_DIR", str(tmp_path))
    monkeypatch.setitem(stats_api.ATTACHMENT_STORAGE_ROOTS, "may9_voices", str(tmp_path))
    row = {
        "id": 12,
        "created_at": 1_800_000_000,
        "hero_name": "Дед Коля",
        "email": "anton@example.com",
        "answers_json": json.dumps({"q1": "Полный ответ"}, ensure_ascii=False),
    }

    attachment = stats_api._may9_request_attachment_for_admin(row)

    assert attachment is not None
    assert attachment["storage"] == "may9_voices"
    assert attachment["name"] == "may9-request-12.txt"
    file_path = stats_api.resolve_order_attachment_path(attachment)
    assert file_path is not None
    assert "Полный ответ" in open(file_path, encoding="utf-8").read()
