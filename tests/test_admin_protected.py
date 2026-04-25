"""Protected admin endpoints: require Bearer auth, return 401 without it."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import ADMIN_TEST_PASSWORD


@pytest.fixture
def admin_token(client: TestClient) -> str:
    """Convenience fixture — log in once, hand back the Bearer token."""
    r = client.post("/api/admin/login", json={"password": ADMIN_TEST_PASSWORD})
    assert r.status_code == 200
    return r.json()["token"]


def test_docs_requires_auth(client: TestClient) -> None:
    response = client.get("/api/admin/docs")
    assert response.status_code == 401


def test_docs_with_token_returns_catalog(client: TestClient, admin_token: str) -> None:
    response = client.get(
        "/api/admin/docs",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "docs" in body
    assert "total" in body


def test_orders_requires_auth(client: TestClient) -> None:
    response = client.get("/api/admin/orders")
    assert response.status_code == 401


def test_orders_with_token_returns_list(client: TestClient, admin_token: str) -> None:
    response = client.get(
        "/api/admin/orders",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["orders"], list)


def test_analytics_requires_auth(client: TestClient) -> None:
    response = client.get("/api/admin/analytics")
    assert response.status_code == 401


def test_analytics_with_token_returns_totals(client: TestClient, admin_token: str) -> None:
    response = client.get(
        "/api/admin/analytics",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    # Totals exist even when DB is empty.
    for key in ("totalViews", "totalDownloads", "totalLikes", "totalDislikes"):
        assert key in body or key.lower().replace("total", "total_") in body or any(
            k.lower().endswith(key.lower().removeprefix("total")) for k in body
        )


def test_update_doc_rejects_anonymous(client: TestClient) -> None:
    response = client.put(
        "/api/admin/docs",
        json={"file": "files/whatever.docx", "updates": {"title": "x"}},
    )
    assert response.status_code == 401


def test_update_doc_rejects_unknown_file(client: TestClient, admin_token: str) -> None:
    response = client.put(
        "/api/admin/docs",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"file": "files/does-not-exist.docx", "updates": {"title": "x"}},
    )
    assert response.status_code == 404


def test_delete_doc_rejects_anonymous(client: TestClient) -> None:
    response = client.request(
        "DELETE",
        "/api/admin/docs",
        json={"file": "files/whatever.docx"},
    )
    assert response.status_code == 401
