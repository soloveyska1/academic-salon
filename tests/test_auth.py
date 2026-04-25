"""Auth: rate-limit helper + admin login lockout."""
from __future__ import annotations

import pytest
from fastapi import HTTPException, Request

from api.auth import (
    enforce_rate_limit,
    admin_check_rate_limit,
    admin_record_attempt,
)


class _StubRequest:
    """Minimal Request stand-in carrying just enough headers for get_client_ip."""

    def __init__(self, ip: str = "203.0.113.42") -> None:
        self.headers = {"X-Forwarded-For": ip}

        class _Client:
            host = ip

        self.client = _Client()


def test_enforce_rate_limit_blocks_after_max_calls() -> None:
    req = _StubRequest()
    for _ in range(3):
        enforce_rate_limit(req, "test-bucket", max_calls=3, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit(req, "test-bucket", max_calls=3, window_seconds=60)
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers


def test_enforce_rate_limit_isolates_buckets() -> None:
    req = _StubRequest("198.51.100.1")
    for _ in range(2):
        enforce_rate_limit(req, "bucket-a", max_calls=2, window_seconds=60)
    # A different bucket must still allow this IP through.
    enforce_rate_limit(req, "bucket-b", max_calls=2, window_seconds=60)


def test_admin_login_lock_after_five_failed_attempts() -> None:
    ip = "192.0.2.99"
    for _ in range(5):
        assert admin_check_rate_limit(ip) is True
        admin_record_attempt(ip)
    # 6th check should report blocked.
    assert admin_check_rate_limit(ip) is False
