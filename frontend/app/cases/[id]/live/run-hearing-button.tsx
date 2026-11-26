"use client";

/**
 * Starts a simulated hearing. The server runs it in the background; this polls the run every few
 * seconds and refreshes the page when it finishes. A reload while it runs picks the run back up.
 * With live progress (lib/live.ts) each stage is shown as it starts, the run is checked the moment
 * Convex reports it finished, and polling slows to a fallback.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Banner } from "@/components/icons";
import { LiveStages } from "@/components/live-stages";
import { ApiError } from "@/lib/api";
import { getActiveRun, getRun, type HearingRun, runHearing } from "@/lib/cases-api";
import { canFollowLive, useLiveProgress } from "@/lib/live";

const POLL_MS = 3000;
const LIVE_FALLBACK_POLL_MS = 15000;

export default function RunHearingButton({ caseId, again }: { caseId: string; again?: boolean }) {
  const router = useRouter();
  const [runId, setRunId] = useState<number | null>(null);
  const [liveToken, setLiveToken] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const live = useLiveProgress(runId !== null ? liveToken : null);

  function follow(run: HearingRun, startedAtMs: number) {
    setRunId(run.id);
    setLiveToken(run.live_token ?? null);
    setStartedAt(startedAtMs);
  }

  useEffect(() => {
    alive.current = true;
    getActiveRun(caseId)
      .then((run) => {
        if (run && alive.current) follow(run, Date.parse(run.started_at));
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [caseId]);

  const poll = useCallback(async () => {
    if (runId === null) return;
    try {
      const run = await getRun(caseId, runId);
      if (!alive.current) return;
      if (run.status === "completed") {
        setRunId(null);
        router.refresh();
      } else if (run.status === "failed") {
        setRunId(null);
        setError(run.error ?? "The hearing failed.");
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Lost track of the hearing. Reload the page.");
      setRunId(null);
    }
  }, [caseId, runId, router]);

  const followingLive = runId !== null && canFollowLive(liveToken);
  useEffect(() => {
    if (runId === null) return;
    const every = followingLive ? LIVE_FALLBACK_POLL_MS : POLL_MS;
    const t = setInterval(poll, every);
    return () => clearInterval(t);
  }, [runId, followingLive, poll]);

  // Convex says the run ended: read the stored result now instead of at the next poll.
  const liveStatus = live?.status;
  useEffect(() => {
    if (liveStatus && liveStatus !== "running") poll();
  }, [liveStatus, poll]);

  useEffect(() => {
    if (runId === null || !startedAt) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [runId, startedAt]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const run = await runHearing(caseId);
      follow(run, Date.now());
      setElapsed(0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const active = await getActiveRun(caseId).catch(() => null);
        if (active) follow(active, Date.parse(active.started_at));
      } else {
        setError(e instanceof Error ? e.message : "The hearing could not be started.");
      }
    } finally {
      setStarting(false);
    }
  }

  const running = runId !== null;
  return (
    <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
      <button type="button" className={again ? "btn" : "btn btn-primary"} onClick={start} disabled={starting || running}>
        {starting ? "Starting…" : running ? "Hearing in progress…" : again ? "Run again" : "Run simulated hearing"}
      </button>
      {running && (
        <span className="small muted" role="status">
          The advocates and the bench are working through the precedents. This usually takes under a minute
          {elapsed > 0 ? ` (${elapsed} s so far)` : ""}. You can leave this page and come back.
        </span>
      )}
      {running && live && <LiveStages stages={live.stages} running={live.status === "running"} />}
      {error && <Banner tone="error"><b>Not completed.</b> {error}</Banner>}
    </div>
  );
}
