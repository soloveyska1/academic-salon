"""Contribute endpoint: validation + per-IP rate limit (5 / hour)."""
from __future__ import annotations

from fastapi.testclient import TestClient


def _form(**overrides: str) -> dict:
    base = {
        "title": "Курсовая по социологии",
        "subject": "Социология",
        "category": "Курсовые работы",
        "contact": "@student_test",
        "description": "Загрузка для архива",
    }
    base.update(overrides)
    return base


def test_contribute_rejects_empty_contact(client: TestClient) -> None:
    response = client.post("/api/contribute/", data=_form(contact=""))
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "контакт" in detail["error"].lower()


def test_contribute_rate_limit_blocks_sixth(client: TestClient) -> None:
    # Five contributions per IP per hour are allowed; the sixth must be 429.
    # Without files we expect either 400 (no file in form) or 200 — we don't
    # care here, only that the rate limiter ticks up.
    for _ in range(5):
        client.post("/api/contribute/", data=_form())
    blocked = client.post("/api/contribute/", data=_form())
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["ok"] is False
