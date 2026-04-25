"""Admin login / logout / verify and lockout behaviour."""
from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_TEST_PASSWORD


def test_login_rejects_empty_password(client: TestClient) -> None:
    response = client.post("/api/admin/login", json={"password": ""})
    assert response.status_code == 400


def test_login_rejects_wrong_password(client: TestClient) -> None:
    response = client.post("/api/admin/login", json={"password": "wrong"})
    assert response.status_code == 403


def test_login_accepts_correct_password(client: TestClient) -> None:
    response = client.post("/api/admin/login", json={"password": ADMIN_TEST_PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["token"], str)
    assert len(body["token"]) >= 32


def test_login_locks_after_five_failures(client: TestClient) -> None:
    # Five wrong attempts: each returns 403, but the rate-limiter ticks up.
    for _ in range(5):
        bad = client.post("/api/admin/login", json={"password": "wrong"})
        assert bad.status_code == 403, bad.text
    # The sixth attempt is now blocked — even with the right password.
    blocked = client.post("/api/admin/login", json={"password": ADMIN_TEST_PASSWORD})
    assert blocked.status_code == 429


def test_verify_rejects_anonymous(client: TestClient) -> None:
    response = client.get("/api/admin/verify")
    assert response.status_code == 401


def test_verify_accepts_valid_token(client: TestClient) -> None:
    login = client.post("/api/admin/login", json={"password": ADMIN_TEST_PASSWORD})
    token = login.json()["token"]
    response = client.get("/api/admin/verify", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


def test_logout_always_returns_ok(client: TestClient) -> None:
    response = client.post("/api/admin/logout")
    assert response.status_code == 200
