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


# ─────── Stage 46 — status-update notifications ───────

def _create_order(client: TestClient, contact: str, confirmEmail: str = "") -> int:
    """Helper: submit a real /api/order/ request, return the new id."""
    payload = {
        "workType": "Курсовая",
        "topic": "Тема для статус-теста",
        "subject": "Психология",
        "deadline": "2 недели",
        "contact": contact,
        "confirmEmail": confirmEmail,
        "comment": "",
    }
    r = client.post("/api/order/", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["orderId"]


def test_status_in_work_notifies_customer(
    client: TestClient, admin_token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "api.routers.admin.send_user_email",
        lambda to, subj, body: (sent.append((to, subj, body)) or True),
    )
    # Same monkeypatch silences the initial confirmation email.
    monkeypatch.setattr(
        "api.routers.orders.send_user_email",
        lambda to, subj, body: True,
    )
    order_id = _create_order(client, contact="student@example.com")
    sent.clear()  # discard whatever first email side-effect did

    r = client.put(
        "/api/admin/orders",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"id": order_id, "updates": {"status": "in_work"}},
    )
    assert r.status_code == 200
    assert len(sent) == 1
    to_addr, subject, body = sent[0]
    assert to_addr == "student@example.com"
    assert "в работе" in subject.lower()
    assert f"№{order_id}" in body
    assert "https://bibliosaloon.ru/me" in body


def test_status_done_notifies_customer(
    client: TestClient, admin_token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "api.routers.admin.send_user_email",
        lambda to, subj, body: (sent.append((to, subj, body)) or True),
    )
    monkeypatch.setattr(
        "api.routers.orders.send_user_email",
        lambda to, subj, body: True,
    )
    order_id = _create_order(client, contact="user@example.com")
    sent.clear()

    r = client.put(
        "/api/admin/orders",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"id": order_id, "updates": {"status": "done"}},
    )
    assert r.status_code == 200
    assert len(sent) == 1
    assert "готова" in sent[0][1].lower()


def test_status_uses_confirmEmail_when_contact_is_telegram(
    client: TestClient, admin_token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A Telegram-contact order with a separate confirmEmail still
    notifies via that email when the admin moves status forward."""
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "api.routers.admin.send_user_email",
        lambda to, subj, body: (sent.append((to, subj, body)) or True),
    )
    monkeypatch.setattr(
        "api.routers.orders.send_user_email",
        lambda to, subj, body: True,
    )
    order_id = _create_order(client, contact="@alice", confirmEmail="alice@example.com")
    sent.clear()

    r = client.put(
        "/api/admin/orders",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"id": order_id, "updates": {"status": "in_work"}},
    )
    assert r.status_code == 200
    assert len(sent) == 1
    assert sent[0][0] == "alice@example.com"


def test_status_silent_for_internal_status_changes(
    client: TestClient, admin_token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Internal-only statuses (priority, archived) don't email the customer."""
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "api.routers.admin.send_user_email",
        lambda to, subj, body: (sent.append((to, subj, body)) or True),
    )
    monkeypatch.setattr(
        "api.routers.orders.send_user_email",
        lambda to, subj, body: True,
    )
    order_id = _create_order(client, contact="quiet@example.com")
    sent.clear()

    r = client.put(
        "/api/admin/orders",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"id": order_id, "updates": {"status": "priority"}},
    )
    assert r.status_code == 200
    assert sent == []


def test_status_no_email_address_skips_silently(
    client: TestClient, admin_token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Telegram-only contact + no confirmEmail → admin save still
    succeeds, but no email is attempted."""
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "api.routers.admin.send_user_email",
        lambda to, subj, body: (sent.append((to, subj, body)) or True),
    )
    order_id = _create_order(client, contact="@noemail")
    sent.clear()

    r = client.put(
        "/api/admin/orders",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"id": order_id, "updates": {"status": "done"}},
    )
    assert r.status_code == 200
    assert sent == []
