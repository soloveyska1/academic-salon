"""Stats endpoint: batch validation + sanitize_file edge cases."""
from __future__ import annotations

from fastapi.testclient import TestClient

from api.database import sanitize_file


def test_sanitize_strips_path_traversal() -> None:
    assert sanitize_file("../etc/passwd") is None or sanitize_file("../etc/passwd") == "etc/passwd"
    assert sanitize_file("files/../secret") is None or "secret" not in (sanitize_file("files/../secret") or "")


def test_sanitize_rejects_path_outside_files_dir() -> None:
    # Even a syntactically valid path is rejected if it doesn't start with files/.
    assert sanitize_file("../../etc/passwd") is None
    assert sanitize_file("/etc/passwd") is None
    assert sanitize_file("not-files/example.docx") is None


def test_sanitize_rejects_non_strings() -> None:
    assert sanitize_file(None) is None
    assert sanitize_file(123) is None  # type: ignore[arg-type]


def test_batch_returns_stats_for_known_files(client: TestClient) -> None:
    response = client.post(
        "/api/doc-stats/batch",
        json={"files": ["files/some-doc.docx"], "clientId": "cid-test-12345"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "stats" in body


def test_batch_caps_at_max_files(client: TestClient) -> None:
    too_many = [f"files/doc-{i}.docx" for i in range(500)]
    response = client.post("/api/doc-stats/batch", json={"files": too_many})
    assert response.status_code == 400
    assert "Too many files" in response.json()["detail"]


def test_event_rejects_unknown_action(client: TestClient) -> None:
    response = client.post(
        "/api/doc-stats/event",
        json={"file": "files/doc.docx", "action": "explode", "clientId": "cid-test-12345"},
    )
    assert response.status_code == 400


def test_reaction_rejects_out_of_range(client: TestClient) -> None:
    response = client.post(
        "/api/doc-stats/reaction",
        json={"file": "files/doc.docx", "reaction": 99, "clientId": "cid-test-12345"},
    )
    assert response.status_code == 400
