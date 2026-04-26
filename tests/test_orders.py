"""Order endpoint: validation + per-IP rate limit (3 / hour)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


VALID_PAYLOAD = {
    "workType": "Курсовая",
    "topic": "Тестовая тема",
    "subject": "Психология",
    "deadline": "2 недели",
    "contact": "@test_user",
    "comment": "",
}


def test_create_order_accepts_json(client: TestClient) -> None:
    response = client.post("/api/order/", json=VALID_PAYLOAD)
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True


def test_create_order_rejects_empty_contact(client: TestClient) -> None:
    payload = {**VALID_PAYLOAD, "contact": "  "}
    response = client.post("/api/order/", json=payload)
    assert response.status_code == 400
    assert "контакт" in response.json()["detail"]["error"].lower()


def test_create_order_rate_limit_blocks_fourth_in_hour(client: TestClient) -> None:
    # The router allows three orders per IP per hour; the fourth must be 429.
    for i in range(3):
        ok = client.post("/api/order/", json={**VALID_PAYLOAD, "topic": f"Тема {i}"})
        assert ok.status_code == 200, ok.text

    blocked = client.post("/api/order/", json=VALID_PAYLOAD)
    assert blocked.status_code == 429
    detail = blocked.json()["detail"]
    assert detail["ok"] is False


# ─────────────── customer confirmation email (Stage 37) ───────────────

def test_confirmation_email_sent_when_contact_is_email(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If the customer's contact looks like an email, a confirmation
    email goes out alongside the operator notification."""
    sent: list[tuple[str, str, str]] = []
    def _capture(to_addr: str, subject: str, body: str) -> bool:
        sent.append((to_addr, subject, body))
        return True
    monkeypatch.setattr("api.routers.orders.send_user_email", _capture)

    payload = {**VALID_PAYLOAD, "contact": "student@example.com"}
    response = client.post("/api/order/", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "orderId" in body and isinstance(body["orderId"], int)

    assert len(sent) == 1
    to_addr, subject, mail_body = sent[0]
    assert to_addr == "student@example.com"
    assert "Заявка №" in subject
    assert str(body["orderId"]) in subject
    assert "Тестовая тема" in mail_body
    assert "Курсовая" in mail_body
    assert "https://bibliosaloon.ru/me" in mail_body


def test_confirmation_email_skipped_for_telegram_contact(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Telegram-shaped contacts (with no confirmEmail) are silently
    skipped — operator handles them via the existing
    notify_order_channels flow."""
    sent: list[tuple[str, str, str]] = []
    def _capture(to_addr: str, subject: str, body: str) -> bool:
        sent.append((to_addr, subject, body))
        return True
    monkeypatch.setattr("api.routers.orders.send_user_email", _capture)

    response = client.post("/api/order/", json=VALID_PAYLOAD)  # contact: @test_user
    assert response.status_code == 200
    assert sent == []  # nothing sent to a Telegram handle


def test_confirmation_email_uses_confirmEmail_for_telegram_contact(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When contact is Telegram but confirmEmail is provided (Stage 39),
    the confirmation goes to confirmEmail."""
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "api.routers.orders.send_user_email",
        lambda to, subj, body: (sent.append((to, subj, body)) or True),
    )
    payload = {**VALID_PAYLOAD, "contact": "@alice", "confirmEmail": "alice@example.com"}
    response = client.post("/api/order/", json=payload)
    assert response.status_code == 200
    assert len(sent) == 1
    assert sent[0][0] == "alice@example.com"
    assert "Заявка №" in sent[0][1]


def test_confirmation_email_prefers_confirmEmail_over_contact_email(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If the user puts an email in BOTH contact and confirmEmail, the
    explicit confirmEmail wins (more likely intentional)."""
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "api.routers.orders.send_user_email",
        lambda to, subj, body: (sent.append((to, subj, body)) or True),
    )
    payload = {**VALID_PAYLOAD,
               "contact": "old@example.com",
               "confirmEmail": "new@example.com"}
    response = client.post("/api/order/", json=payload)
    assert response.status_code == 200
    assert len(sent) == 1
    assert sent[0][0] == "new@example.com"


def test_confirmation_email_ignores_garbage_in_confirmEmail(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A non-email confirmEmail (typo, free text) shouldn't break
    anything — fall back to contact-detection or skip silently."""
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "api.routers.orders.send_user_email",
        lambda to, subj, body: (sent.append((to, subj, body)) or True),
    )
    payload = {**VALID_PAYLOAD,
               "contact": "@alice",
               "confirmEmail": "не email"}
    response = client.post("/api/order/", json=payload)
    assert response.status_code == 200
    assert sent == []


def test_confirmation_failure_does_not_break_response(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SMTP exception in the confirmation path must not cause the order
    POST to 5xx — operator notification already went through."""
    def _boom(to_addr: str, subject: str, body: str) -> bool:
        raise RuntimeError("SMTP server unreachable")
    monkeypatch.setattr("api.routers.orders.send_user_email", _boom)

    payload = {**VALID_PAYLOAD, "contact": "student@example.com"}
    response = client.post("/api/order/", json=payload)
    assert response.status_code == 200
    assert response.json()["ok"] is True
