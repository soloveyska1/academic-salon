"""Cabinet endpoints /api/me/* — Phase 2 (auto-email magic link)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _stub_me_notify(monkeypatch: pytest.MonkeyPatch) -> tuple[list, list]:
    """Stub both the operator-notification side effect and the user
    email send so test runs never touch real channels.

    Returns the two recording lists so individual tests can assert on
    the side effects when needed:
      * notifications  — list[(args, kwargs)] passed to notify_order_channels
      * emails         — list[(to_addr, subject, body)] passed to send_user_email
                         (`body` will contain the magic link)
    """
    notifications: list = []
    emails: list = []

    def fake_notify(*args, **kwargs):
        notifications.append((args, kwargs))

    def fake_send_email(to_addr, subject, body):
        emails.append((to_addr, subject, body))
        return True

    monkeypatch.setattr("api.routers.me.notify_order_channels", fake_notify)
    monkeypatch.setattr("api.routers.me.send_user_email", fake_send_email)
    return notifications, emails


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


# ────────────────────────────────────────── Phase 2 — auto-email + sessions

def _request_link_and_extract_token(client: TestClient, emails: list, contact: str) -> str:
    """Call /request-link for an email contact, then pull the token out
    of the link in the captured email body."""
    r = client.post("/api/me/request-link", json={"contact": contact})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "channel": "email", "auto": True}
    assert emails, "send_user_email was not called"
    _, _, body = emails[-1]
    # Body has the link as a bare URL: /me?token=<64 hex>
    import re
    m = re.search(r"/api/me/verify\?token=([a-f0-9]{64})", body)
    assert m, f"no /me?token=... link in email body:\n{body}"
    return m.group(1)


def test_email_request_sends_magic_link(client: TestClient, _stub_me_notify) -> None:
    notifications, emails = _stub_me_notify
    r = client.post("/api/me/request-link", json={"contact": "auto@example.com"})
    assert r.status_code == 200
    assert r.json()["auto"] is True
    assert len(emails) == 1
    to_addr, subject, body = emails[0]
    assert to_addr == "auto@example.com"
    assert "кабинет" in subject.lower()
    assert "https://bibliosaloon.ru/api/me/verify?token=" in body
    # Operator notify is NOT called for email channel.
    assert notifications == []


def test_telegram_request_still_notifies_operator(
    client: TestClient, _stub_me_notify
) -> None:
    notifications, emails = _stub_me_notify
    r = client.post("/api/me/request-link", json={"contact": "@some_user"})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "channel": "telegram", "auto": False}
    assert len(notifications) == 1
    assert emails == []


def test_verify_redeems_token_and_sets_session_cookie(
    client: TestClient, _stub_me_notify
) -> None:
    _, emails = _stub_me_notify
    token = _request_link_and_extract_token(client, emails, "user@example.com")

    r = client.get(f"/api/me/verify?token={token}", follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == "/me?ok=1"
    assert "salon_session" in r.cookies
    session = r.cookies["salon_session"]
    assert len(session) == 64

    # Replay must fail.
    again = client.get(f"/api/me/verify?token={token}", follow_redirects=False)
    assert again.status_code == 303
    assert again.headers["location"] == "/me?err=used"


def test_verify_rejects_unknown_token(client: TestClient) -> None:
    r = client.get("/api/me/verify?token=" + "0" * 64, follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == "/me?err=unknown"


def test_whoami_returns_false_when_anonymous(client: TestClient) -> None:
    r = client.get("/api/me/whoami")
    assert r.status_code == 200
    assert r.json() == {"ok": False, "loggedIn": False}


def test_whoami_returns_contact_after_verify(
    client: TestClient, _stub_me_notify
) -> None:
    _, emails = _stub_me_notify
    token = _request_link_and_extract_token(client, emails, "who@example.com")
    client.get(f"/api/me/verify?token={token}")  # cookie now in client jar

    r = client.get("/api/me/whoami")
    body = r.json()
    assert body["loggedIn"] is True
    assert body["contact"] == "who@example.com"
    assert body["channel"] == "email"


def test_logout_clears_session(client: TestClient, _stub_me_notify) -> None:
    _, emails = _stub_me_notify
    token = _request_link_and_extract_token(client, emails, "bye@example.com")
    client.get(f"/api/me/verify?token={token}")

    out = client.post("/api/me/logout")
    assert out.status_code == 200
    after = client.get("/api/me/whoami")
    assert after.json()["loggedIn"] is False


def test_orders_requires_session(client: TestClient) -> None:
    r = client.get("/api/me/orders")
    assert r.status_code == 401


def test_orders_returns_matching_orders(
    client: TestClient, _stub_me_notify
) -> None:
    """Place an order, sign in with the same contact, expect to see it."""
    contact = "shopper@example.com"
    place = client.post("/api/order/", json={
        "workType": "Реферат",
        "topic": "Тестовая тема",
        "subject": "Психология",
        "deadline": "2 недели",
        "contact": contact,
        "comment": "",
    })
    assert place.status_code == 200, place.text

    _, emails = _stub_me_notify
    token = _request_link_and_extract_token(client, emails, contact)
    client.get(f"/api/me/verify?token={token}")

    r = client.get("/api/me/orders")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert len(body["orders"]) >= 1
    assert body["orders"][0]["topic"] == "Тестовая тема"


# ────────────────────────────────────────────────────── favourites


def _sign_in(client, emails, contact):
    token = _request_link_and_extract_token(client, emails, contact)
    client.get(f"/api/me/verify?token={token}")


def test_favorites_anonymous_is_401(client) -> None:
    assert client.get("/api/me/favorites").status_code == 401
    assert client.post("/api/me/favorites", json={"file": "files/x.docx"}).status_code == 401


def test_favorites_add_and_list(client, _stub_me_notify) -> None:
    _, emails = _stub_me_notify
    _sign_in(client, emails, "fav@example.com")

    r = client.post("/api/me/favorites", json={"file": "files/работа.docx"})
    assert r.status_code == 200
    assert r.json()["added"] == 1

    listing = client.get("/api/me/favorites").json()
    assert listing["ok"] is True
    files = [item["file"] for item in listing["favorites"]]
    assert "files/работа.docx" in files


def test_favorites_bulk_merge_dedup(client, _stub_me_notify) -> None:
    """The localStorage-merge path: many files, duplicates collapse."""
    _, emails = _stub_me_notify
    _sign_in(client, emails, "merge@example.com")

    r = client.post("/api/me/favorites", json={
        "files": [
            "files/a.docx", "files/b.docx", "files/a.docx",  # dup
        ],
    })
    assert r.status_code == 200
    files = [it["file"] for it in client.get("/api/me/favorites").json()["favorites"]]
    assert sorted(files) == ["files/a.docx", "files/b.docx"]

    # Re-posting the same files is a no-op (INSERT OR IGNORE).
    again = client.post("/api/me/favorites", json={"files": ["files/a.docx"]})
    assert again.json()["added"] == 1   # candidate count, not row count
    files2 = [it["file"] for it in client.get("/api/me/favorites").json()["favorites"]]
    assert sorted(files2) == ["files/a.docx", "files/b.docx"]


def test_favorites_delete(client, _stub_me_notify) -> None:
    _, emails = _stub_me_notify
    _sign_in(client, emails, "del@example.com")

    client.post("/api/me/favorites", json={"file": "files/keep.docx"})
    client.post("/api/me/favorites", json={"file": "files/drop.docx"})

    r = client.request("DELETE", "/api/me/favorites", json={"file": "files/drop.docx"})
    assert r.status_code == 200
    assert r.json()["removed"] == 1

    files = [it["file"] for it in client.get("/api/me/favorites").json()["favorites"]]
    assert files == ["files/keep.docx"]


def test_favorites_rejects_traversal_and_urls(client, _stub_me_notify) -> None:
    _, emails = _stub_me_notify
    _sign_in(client, emails, "guard@example.com")

    bad_inputs = [
        {"file": "../etc/passwd"},
        {"file": "/etc/passwd"},
        {"file": "https://example.com/x.pdf"},
        {"file": ""},
    ]
    for payload in bad_inputs:
        assert client.post("/api/me/favorites", json=payload).status_code == 400, payload


def test_favorites_isolated_per_contact(client, _stub_me_notify) -> None:
    """Two users do not see each other's favourites."""
    _, emails = _stub_me_notify
    _sign_in(client, emails, "alice@example.com")
    client.post("/api/me/favorites", json={"file": "files/alice.docx"})
    client.post("/api/me/logout")

    _sign_in(client, emails, "bob@example.com")
    bob_files = [it["file"] for it in client.get("/api/me/favorites").json()["favorites"]]
    assert bob_files == []


# ────────────────────────────────────────────────────── telegram login


def _make_tg_payload(token: str, **fields) -> dict:
    """Build a Telegram-Login-Widget-shaped payload signed with the test
    bot token, exactly the same way the widget does."""
    import hashlib, hmac, time
    fields.setdefault("id", 12345678)
    fields.setdefault("first_name", "Alice")
    fields.setdefault("auth_date", int(time.time()))
    pairs = sorted(f"{k}={v}" for k, v in fields.items() if v is not None)
    data = "\n".join(pairs)
    secret = hashlib.sha256(token.encode()).digest()
    fields["hash"] = hmac.new(secret, data.encode(), hashlib.sha256).hexdigest()
    return fields


def test_telegram_config_exposes_username(client) -> None:
    r = client.get("/api/me/telegram-config").json()
    assert r["ok"] is True
    assert isinstance(r["botUsername"], str)
    assert r["botUsername"]


def test_telegram_login_rejects_bad_hash(client, monkeypatch) -> None:
    monkeypatch.setattr("api.routers.me.TELEGRAM_BOT_TOKEN", "test-bot-token")
    bad = {
        "id": 1, "first_name": "X", "auth_date": int(__import__("time").time()),
        "hash": "0" * 64,
    }
    r = client.post("/api/me/telegram-login", json=bad)
    assert r.status_code == 400


def test_telegram_login_rejects_stale_payload(client, monkeypatch) -> None:
    monkeypatch.setattr("api.routers.me.TELEGRAM_BOT_TOKEN", "test-bot-token")
    payload = _make_tg_payload(
        "test-bot-token",
        auth_date=int(__import__("time").time()) - 48 * 3600,
    )
    r = client.post("/api/me/telegram-login", json=payload)
    assert r.status_code == 400


def test_telegram_login_mints_session(client, monkeypatch) -> None:
    monkeypatch.setattr("api.routers.me.TELEGRAM_BOT_TOKEN", "test-bot-token")
    payload = _make_tg_payload("test-bot-token", username="alice_test", first_name="Alice")
    r = client.post("/api/me/telegram-login", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["channel"] == "telegram"
    assert body["contact"] == "@alice_test"
    assert "salon_session" in r.cookies

    me = client.get("/api/me/whoami").json()
    assert me["loggedIn"] is True
    assert me["channel"] == "telegram"
    assert me["contact"] == "@alice_test"


def test_telegram_login_falls_back_to_id_when_no_username(client, monkeypatch) -> None:
    monkeypatch.setattr("api.routers.me.TELEGRAM_BOT_TOKEN", "test-bot-token")
    payload = _make_tg_payload("test-bot-token", id=99999, first_name="NoName")
    r = client.post("/api/me/telegram-login", json=payload)
    assert r.status_code == 200
    assert r.json()["contact"] == "tg:99999"
