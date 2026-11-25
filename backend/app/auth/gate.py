"""Private demo mode: one shared site password in front of the whole application.

Off unless CONTRACTIQ_SITE_PASSWORD is set. When set, every API request except /health and the
gate itself needs proof that the visitor entered the password:

- the browser: the HttpOnly cookie `contractiq_gate`, set by POST /api/v1/gate;
- the website's own server (pages rendered on the server): the header `x-contractiq-gate`.

Both carry the same token: HMAC-SHA256 of a fixed label, keyed with the password. The password
itself is never stored in a cookie, and changing it signs everyone out of the gate. The website
checks the same token in its middleware (frontend/middleware.ts) so visitors see the password
page first; the API check is the real boundary, so calling the API directly does not bypass it.

The gate is in addition to accounts, not instead of them: a visitor still signs in afterwards.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.auth.limits import ip_limit
from app.config import settings

GATE_COOKIE = "contractiq_gate"
GATE_HEADER = "x-contractiq-gate"
LABEL = b"contractiq-site-gate-v1"
OPEN_PATHS = ("/health", "/api/v1/gate")
MAX_AGE_S = 30 * 24 * 3600


def gate_token(password: str) -> str:
    return hmac.new(password.encode("utf-8"), LABEL, hashlib.sha256).hexdigest()


def gate_enabled() -> bool:
    return settings.site_password is not None


def has_token(request: Request) -> bool:
    """True if the gate is off or this request carries the right token (cookie or header)."""
    if settings.site_password is None:
        return True
    expected = gate_token(settings.site_password.get_secret_value())
    given = request.cookies.get(GATE_COOKIE) or request.headers.get(GATE_HEADER) or ""
    return hmac.compare_digest(given, expected)


def request_passes(request: Request) -> bool:
    """True if the path is always open (/health, the gate itself) or the request has the token."""
    return request.url.path in OPEN_PATHS or has_token(request)


router = APIRouter(prefix="/api/v1/gate", tags=["site gate"])


class GateIn(BaseModel):
    password: Annotated[str, Field(min_length=1, max_length=200)]


@router.get("")
def gate_status(request: Request) -> dict[str, bool]:
    """Whether this site is private, and whether this browser has already entered the password."""
    return {"required": gate_enabled(), "open": has_token(request)}


@router.post("", dependencies=[ip_limit("gate", 10, 600)])
def enter_gate(body: GateIn, response: Response) -> dict[str, bool]:
    if settings.site_password is None:
        return {"required": False, "open": True}
    real = settings.site_password.get_secret_value()
    if not hmac.compare_digest(body.password.encode("utf-8"), real.encode("utf-8")):
        raise HTTPException(401, "That is not the site password.")
    response.set_cookie(
        GATE_COOKIE,
        gate_token(real),
        max_age=MAX_AGE_S,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return {"required": True, "open": True}
