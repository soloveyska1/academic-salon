"""Order endpoint: validation + per-IP rate limit (3 / hour)."""
from __future__ import annotations

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
