"""Smoke tests for the FastAPI health endpoints."""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_live_returns_200(client: TestClient) -> None:
    response = client.get("/api/health/live")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["service"] == "academic-salon-api"


def test_health_root_returns_200(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200


def test_calendar_endpoint_returns_list(client: TestClient) -> None:
    response = client.get("/api/calendar")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["items"], list)
