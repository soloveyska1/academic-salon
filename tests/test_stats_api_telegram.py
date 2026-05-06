"""Smoke checks for monolithic stats_api.py Telegram Login verification."""

from __future__ import annotations

import hashlib
import hmac
import time

import stats_api


def _make_payload(token: str, **fields) -> dict:
    def signed_value(value):
        if isinstance(value, bool):
            return "true" if value else "false"
        return str(value)

    fields.setdefault("id", 12345678)
    fields.setdefault("first_name", "Alice")
    fields.setdefault("auth_date", int(time.time()))
    data = "\n".join(
        sorted(f"{key}={signed_value(value)}" for key, value in fields.items())
    )
    secret = hashlib.sha256(token.encode("utf-8")).digest()
    fields["hash"] = hmac.new(secret, data.encode("utf-8"), hashlib.sha256).hexdigest()
    return fields


def test_stats_api_telegram_hash_accepts_write_access_flag(monkeypatch) -> None:
    monkeypatch.setattr(stats_api, "TELEGRAM_LOGIN_BOT_TOKEN", "test-bot-token")
    payload = _make_payload(
        "test-bot-token",
        username="alice_test",
        allows_write_to_pm=True,
    )

    assert stats_api.StatsHandler._verify_telegram_hash(object(), payload) is True
