"""Test configuration: spin up the FastAPI app against a throw-away SQLite
database in /tmp and stub out the notification side-effects so a single
test run cannot hit real VK/Telegram/SMTP."""
from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator

import bcrypt
import pytest

# Configure the API to use an isolated SQLite file BEFORE any api.* import.
_TMP = tempfile.mkdtemp(prefix="salon-tests-")
os.environ.setdefault("SALON_STATS_DB", os.path.join(_TMP, "test_stats.sqlite3"))
os.environ.setdefault("SALON_FILES_DIR", _TMP)
os.environ.setdefault("SALON_CATALOG", os.path.join(_TMP, "catalog.json"))

# Test-only admin password: "test-admin-password" — its bcrypt hash sits
# in SALON_ADMIN_HASH so admin_login() can validate without reading prod.
ADMIN_TEST_PASSWORD = "test-admin-password"
os.environ.setdefault(
    "SALON_ADMIN_HASH",
    bcrypt.hashpw(ADMIN_TEST_PASSWORD.encode(), bcrypt.gensalt()).decode(),
)

from fastapi.testclient import TestClient  # noqa: E402

from api.auth import _login_attempts, _login_blocks, _public_hits  # noqa: E402
from api.main import app  # noqa: E402
from api import database  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_state(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Reset in-memory rate-limit dicts and stub side-effects before each test."""
    _login_attempts.clear()
    _login_blocks.clear()
    _public_hits.clear()

    monkeypatch.setattr(
        "api.routers.orders._notify",
        lambda *args, **kwargs: None,
    )
    yield


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A FastAPI TestClient bound to a fresh SQLite file."""
    database.init_db()
    with TestClient(app) as c:
        yield c
