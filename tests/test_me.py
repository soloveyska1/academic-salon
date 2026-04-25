"""Cabinet endpoint /api/me/request-link — Phase 1 (notify-only)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _stub_me_notify(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stub the operator-notification side effect — same pattern as the
    orders test fixture."""
    monkeypatch.setattr(
        "api.routers.me.notify_order_channels",
        lambda *args, **kwargs: None,
    )


def test_request_link_accepts_email(client: TestClient) -> None:
    response = client.post(
        "/api/me/request-link",
        json={"contact": "student@example.com"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True
    assert body["channel"] == "email"


def test_request_link_accepts_telegram_with_at(client: TestClient) -> None:
    response = client.post(
        "/api/me/request-link",
        json={"contact": "@student_test"},
    )
    assert response.status_code == 200
    assert response.json()["channel"] == "telegram"


def test_request_link_accepts_telegram_without_at(client: TestClient) -> None:
    response = client.post(
        "/api/me/request-link",
        json={"contact": "student_test"},
    )
    assert response.status_code == 200
    assert response.json()["channel"] == "telegram"


def test_request_link_rejects_garbage(client: TestClient) -> None:
    response = client.post(
        "/api/me/request-link",
        json={"contact": "not a contact at all"},
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["ok"] is False


def test_request_link_rejects_empty(client: TestClient) -> None:
    response = client.post("/api/me/request-link", json={"contact": ""})
    assert response.status_code == 400


def test_request_link_rate_limit_blocks_fourth(client: TestClient) -> None:
    """Three per IP per hour are allowed; the fourth must be 429."""
    for i in range(3):
        ok = client.post(
            "/api/me/request-link",
            json={"contact": f"student{i}@example.com"},
        )
        assert ok.status_code == 200, ok.text

    blocked = client.post(
        "/api/me/request-link",
        json={"contact": "another@example.com"},
    )
    assert blocked.status_code == 429
    detail = blocked.json()["detail"]
    assert detail["ok"] is False


def test_request_link_persists_row(client: TestClient) -> None:
    """A successful request leaves an audit trail in me_link_requests."""
    from api.database import get_db

    response = client.post(
        "/api/me/request-link",
        json={"contact": "audit@example.com"},
    )
    assert response.status_code == 200

    with get_db() as db:
        row = db.execute(
            "SELECT contact, channel, status FROM me_link_requests "
            "WHERE contact = ?",
            ("audit@example.com",),
        ).fetchone()
    assert row is not None
    assert row["channel"] == "email"
    assert row["status"] == "pending"
