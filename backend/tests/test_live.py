"""Live progress to Convex (app/live.py): off by default, only labels leave the server, never fatal."""

from __future__ import annotations

import hashlib
import hmac

import httpx
import pytest
from pydantic import SecretStr

from app import live
from app.config import settings

SECRET = "s" * 40


class Inline:
    """Runs submitted work at once, so tests see the posts in order."""

    def submit(self, fn, *args):
        fn(*args)


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(settings, "convex_site_url", "https://example-123.convex.site/")
    monkeypatch.setattr(settings, "convex_secret", SecretStr(SECRET))
    monkeypatch.setattr(live, "_pool", Inline())
    sent: list[dict] = []

    def fake_post(url, json, headers, timeout):
        sent.append({"url": url, "json": json, "auth": headers["Authorization"]})
        return httpx.Response(204)

    monkeypatch.setattr(live.httpx, "post", fake_post)
    return sent


def test_off_by_default_sends_nothing(monkeypatch):
    monkeypatch.setattr(settings, "convex_site_url", "")
    monkeypatch.setattr(settings, "convex_secret", None)
    called = []
    monkeypatch.setattr(live.httpx, "post", lambda *a, **k: called.append(a))
    monkeypatch.setattr(live, "_pool", Inline())
    assert live.live_token("hearing", 1) is None
    live.publish("hearing", 1, "running", stage="buyer", label="x")
    assert called == []


def test_token_is_an_hmac_of_kind_and_run(enabled):
    expected = hmac.new(SECRET.encode(), b"agent:7", hashlib.sha256).hexdigest()
    assert live.live_token("agent", 7) == expected
    assert live.live_token("hearing", 7) != expected


def test_payload_holds_only_labels_and_is_ordered(enabled):
    live.publish("hearing", 3, "running", stage="buyer", label=live.HEARING_STAGES["buyer"])
    live.publish("hearing", 3, "completed")
    first, second = enabled
    assert first["url"] == "https://example-123.convex.site/progress"
    assert first["auth"] == f"Bearer {SECRET}"
    assert set(first["json"]) == {"token", "kind", "status", "seq", "ok", "stage", "label"}
    assert set(second["json"]) == {"token", "kind", "status", "seq", "ok"}
    assert second["json"]["seq"] > first["json"]["seq"]


def test_agent_label_has_names_only():
    entry = {"agent": "case", "action": "search_case", "args": {"q": "PRIVATE"}, "observation": "PRIVATE"}
    assert live.agent_step_label(entry) == "case agent · search case"


def test_network_failure_is_swallowed(enabled, monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectTimeout("down")

    monkeypatch.setattr(live.httpx, "post", boom)
    live.publish("agent", 1, "running", stage="step-1", label="x")  # no exception
