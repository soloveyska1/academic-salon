"""Smoke checks for the monolithic stats_api.py runtime health payload."""
from __future__ import annotations

import stats_api


def test_stats_api_live_health_payload() -> None:
    payload = stats_api.build_live_health()

    assert payload["ok"] is True
    assert payload["service"] == "bibliosaloon-stats"
    assert payload["version"]
    assert isinstance(payload["time"], int)
