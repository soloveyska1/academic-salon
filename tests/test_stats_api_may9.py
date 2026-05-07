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


def test_may9_portrait_saves_and_resolves(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(stats_api, "MAY9_VOICE_DIR", str(tmp_path))
    monkeypatch.setitem(stats_api.ATTACHMENT_STORAGE_ROOTS, "may9_voices", str(tmp_path))

    saved, state = stats_api.save_may9_portrait(
        7,
        [
            {
                "name": "portrait.jpg",
                "stored_name": "portrait_ab12.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 12,
                "size_label": "12 B",
                "data": b"fake-jpeg-data",
            }
        ],
    )

    assert state["status"] == "pending"
    assert saved[0]["storage"] == "may9_voices"
    assert saved[0]["relative_path"] == "voice_7/portrait_ab12.jpg"
    file_path = stats_api.resolve_order_attachment_path(saved[0])
    assert file_path is not None
    assert open(file_path, "rb").read() == b"fake-jpeg-data"


def test_may9_html_renders_portrait(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(stats_api, "MAY9_VOICE_DIR", str(tmp_path))
    monkeypatch.setitem(stats_api.ATTACHMENT_STORAGE_ROOTS, "may9_voices", str(tmp_path))
    saved, _state = stats_api.save_may9_portrait(
        8,
        [
            {
                "name": "anna.jpg",
                "stored_name": "anna_ab12.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 4,
                "size_label": "4 B",
                "data": b"jpeg",
            }
        ],
    )
    row = {
        "id": 8,
        "hero_name": "Анна",
        "years": "1918—1996",
        "relation": "Прабабушка",
        "place": "Курск",
        "name": "Маша",
        "portrait_json": json.dumps(saved, ensure_ascii=False),
    }
    html_path = tmp_path / "voice_8" / "anna.html"

    stats_api.render_may9_html(row, "Первый абзац.\n\nВторой абзац.", str(html_path))

    html = html_path.read_text(encoding="utf-8")
    assert 'class="portrait"' in html
    assert "file://" in html
    assert "портрет из семейного архива" in html


def test_may9_admin_notice_attaches_portrait(monkeypatch, tmp_path) -> None:
    sent_attachments: list[list[dict]] = []
    monkeypatch.setattr(stats_api, "MAY9_VOICE_DIR", str(tmp_path))
    monkeypatch.setitem(stats_api.ATTACHMENT_STORAGE_ROOTS, "may9_voices", str(tmp_path))
    monkeypatch.setattr(stats_api, "VK_TOKEN", "")
    monkeypatch.setattr(stats_api, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(stats_api, "TELEGRAM_CHAT_IDS", [])
    monkeypatch.setattr(stats_api, "TELEGRAM_FORUM_CHAT_ID", "")
    monkeypatch.setattr(stats_api, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(stats_api, "SENDMAIL_PATH", "")
    monkeypatch.setattr(stats_api, "MAX_BOT_TOKEN", "")
    monkeypatch.setattr(stats_api, "_email_delivery_configured", lambda **_kwargs: True)
    monkeypatch.setattr(
        stats_api,
        "_email_notify_sync",
        lambda _subject, _body, **kwargs: sent_attachments.append(kwargs.get("attachments") or []) or True,
    )
    saved, _state = stats_api.save_may9_portrait(
        15,
        [
            {
                "name": "ded-kolya.jpg",
                "stored_name": "ded_kolya_ab12.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 9,
                "size_label": "9 B",
                "data": b"fake-data",
            }
        ],
    )
    row = {
        "id": 15,
        "created_at": 1_800_000_000,
        "hero_name": "Дед Коля",
        "email": "anton@example.com",
        "answers_json": json.dumps({"q1": "Ответ"}, ensure_ascii=False),
        "portrait_json": json.dumps(saved, ensure_ascii=False),
    }

    assert stats_api._notify_may9_admin(row)

    assert sent_attachments
    names = [item["name"] for item in sent_attachments[0]]
    assert "may9-request-15.txt" in names
    assert "ded-kolya.jpg" in names
    assert "Фото: ded-kolya.jpg (9 B)" in stats_api.build_may9_voice_admin_email(row)


def test_notification_splitter_prefers_newlines() -> None:
    message = "Вступление\n" + ("А" * 80) + "\nХвост"

    chunks = stats_api._split_notification_message(message, max_chars=40)

    assert len(chunks) == 3
    assert chunks[0].startswith("1/3\nВступление")
    assert chunks[-1].endswith("Хвост")


def test_may9_vk_notice_uses_full_brief(monkeypatch, tmp_path) -> None:
    sent: list[str] = []
    long_answer = "А" * 420 + " полный хвост ответа для ВК"
    monkeypatch.setattr(stats_api, "MAY9_VOICE_DIR", str(tmp_path))
    monkeypatch.setitem(stats_api.ATTACHMENT_STORAGE_ROOTS, "may9_voices", str(tmp_path))
    monkeypatch.setattr(stats_api, "VK_TOKEN", "token")
    monkeypatch.setattr(stats_api, "VK_ADMIN_ID", "123")
    monkeypatch.setattr(stats_api, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(stats_api, "TELEGRAM_CHAT_IDS", [])
    monkeypatch.setattr(stats_api, "TELEGRAM_FORUM_CHAT_ID", "")
    monkeypatch.setattr(stats_api, "SMTP_HOST", "")
    monkeypatch.setattr(stats_api, "SENDMAIL_PATH", "")
    monkeypatch.setattr(stats_api, "MAX_BOT_TOKEN", "")
    monkeypatch.setattr(stats_api, "_vk_notify_sync", lambda message: sent.append(message) or True)
    row = {
        "id": 14,
        "created_at": 1_800_000_000,
        "hero_name": "Анна",
        "email": "masha@example.com",
        "answers_json": json.dumps({"q4": long_answer}, ensure_ascii=False),
    }

    assert stats_api._notify_may9_admin(row)

    assert sent
    assert "полный хвост ответа для ВК" in sent[0]
