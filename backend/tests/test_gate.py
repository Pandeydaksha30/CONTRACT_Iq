"""Private demo mode (app/auth/gate.py): with a site password set, nothing but /health and the
gate answers until the password has been entered; with no password, nothing changes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.auth.gate import GATE_COOKIE, GATE_HEADER, gate_token
from app.config import settings
from app.main import app

PASSWORD = "viva-preview-2026"
ORIGIN = {"Origin": "http://localhost:3100"}


@pytest.fixture
def gated(monkeypatch):
    monkeypatch.setattr(settings, "site_password", SecretStr(PASSWORD))
    return TestClient(app)


def test_everything_but_health_and_gate_is_closed_until_the_password(gated):
    assert gated.get("/health").json() == {"status": "ok"}
    for path in ("/api/v1/auth/me", "/api/v1/cases", "/openapi.json"):
        r = gated.get(path)
        assert r.status_code == 401 and r.json()["gate"] is True, path
    # A state-changing call is refused at the gate too, before any route runs.
    r = gated.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "x"}, headers=ORIGIN)
    assert r.status_code == 401 and r.json()["gate"] is True
    assert gated.get("/api/v1/gate").json() == {"required": True, "open": False}


def test_wrong_password_is_refused_and_the_right_one_opens_the_site(gated):
    r = gated.post("/api/v1/gate", json={"password": "guess"}, headers=ORIGIN)
    assert r.status_code == 401 and GATE_COOKIE not in r.cookies
    r = gated.post("/api/v1/gate", json={"password": PASSWORD}, headers=ORIGIN)
    assert r.status_code == 200
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert PASSWORD not in r.headers["set-cookie"]  # the password itself is never in the cookie
    assert gated.get("/api/v1/gate").json() == {"required": True, "open": True}
    # Past the gate, the normal rules apply: not signed in yet.
    r = gated.get("/api/v1/auth/me")
    assert r.status_code == 401 and "gate" not in r.json()


def test_server_side_header_and_forged_tokens(gated):
    ok = TestClient(app, headers={GATE_HEADER: gate_token(PASSWORD)})
    assert ok.get("/api/v1/gate").json()["open"] is True
    bad = TestClient(app, headers={GATE_HEADER: gate_token("another-password")})
    assert bad.get("/api/v1/cases").json().get("gate") is True
    forged = TestClient(app, cookies={GATE_COOKIE: "0" * 64})
    assert forged.get("/api/v1/cases").json().get("gate") is True


def test_no_site_password_means_no_gate(monkeypatch):
    monkeypatch.setattr(settings, "site_password", None)
    c = TestClient(app)
    assert c.get("/api/v1/gate").json() == {"required": False, "open": True}
    r = c.get("/api/v1/auth/me")
    assert r.status_code == 401 and "gate" not in r.json()


def test_empty_site_password_setting_means_off(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("NYAYASIM_SITE_PASSWORD", "  ")
    assert Settings(_env_file=None).site_password is None
