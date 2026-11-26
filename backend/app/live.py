"""Live progress of background runs (hearings, agent analyses), published to Convex.

Optional. With CONTRACTIQ_CONVEX_SITE_URL and CONTRACTIQ_CONVEX_SECRET unset nothing is sent and the
website follows runs by polling the API, as before. When set, each stage of a run is posted to the
Convex HTTP action in frontend/convex/http.ts, and the run's page subscribes to it and updates the
moment a stage starts or the run ends.

What leaves this server: the run kind, a stage name, a short fixed label ("The bench is deciding",
"case agent · search case"), ok/failed and a status. Never document text, facts, arguments, tool
arguments or results, user or case ids: the final result is still read from PostgreSQL through
the API. Each run is keyed in Convex by `live_token`, an HMAC of the run id under the shared
secret; the API gives it only to the case's owner, and without it the progress cannot be found.

Publishing never slows or breaks a run: posts go through one background thread (so they arrive in
order), with a short timeout, and every failure is logged and dropped.
"""

from __future__ import annotations

import hashlib
import hmac
import itertools
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

import httpx

from app.config import settings

log = logging.getLogger("contractiq.live")

Kind = Literal["hearing", "agent"]
Status = Literal["running", "completed", "incomplete", "failed"]

TIMEOUT_S = 3.0
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="live")
_seq = itertools.count(1)

HEARING_STAGES = {
    "buyer": "The buyer's advocate is preparing arguments",
    "builder": "The builder's advocate is preparing the defence",
    "gate": "Checking every citation against the stored orders",
    "judge": "The bench is deciding",
    "report": "Writing the report",
}


def live_token(kind: Kind, run_id: int) -> str | None:
    """The key of this run's progress in Convex, or None when live progress is off."""
    if not settings.live_enabled:
        return None
    key = settings.convex_secret.get_secret_value().encode()
    return hmac.new(key, f"{kind}:{run_id}".encode(), hashlib.sha256).hexdigest()


def _post(payload: dict) -> None:
    url = settings.convex_site_url.rstrip("/") + "/progress"
    try:
        r = httpx.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {settings.convex_secret.get_secret_value()}"},
            timeout=TIMEOUT_S,
        )
        if r.status_code >= 300:
            log.warning("Live progress not accepted: HTTP %s", r.status_code)
    except httpx.HTTPError as e:
        log.warning("Live progress not sent: %s", type(e).__name__)


def publish(
    kind: Kind,
    run_id: int,
    status: Status,
    stage: str | None = None,
    label: str | None = None,
    ok: bool = True,
) -> None:
    """Queue one progress event. Returns at once; a no-op when live progress is off."""
    token = live_token(kind, run_id)
    if token is None:
        return
    payload = {"token": token, "kind": kind, "status": status, "seq": next(_seq), "ok": ok}
    if stage is not None:
        payload["stage"] = stage[:60]
    if label is not None:
        payload["label"] = label[:160]
    try:
        _pool.submit(_post, payload)
    except RuntimeError:  # pool shut down while the process stops
        pass


def agent_step_label(entry: dict) -> str:
    """'case agent · search case' from an agent step: names only, never arguments or results."""
    action = str(entry.get("action", "step")).replace("_", " ")
    return f"{entry.get('agent', 'agent')} agent · {action}"
