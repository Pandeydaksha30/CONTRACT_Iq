"use client";

/**
 * Live progress of background runs from Convex (frontend/convex/progress.ts), fed by the backend
 * (backend/app/live.py). Optional: without NEXT_PUBLIC_CONVEX_URL, or when the API gives no
 * live_token, the hook returns undefined and the pages keep polling the API as before.
 * Convex never holds results: when it reports a run finished, the page reloads the run from the API.
 */
import { ConvexReactClient } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";

export const LIVE_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

export interface LiveStage {
  stage: string;
  label: string;
  ok: boolean;
  at: number;
}

export interface LiveProgress {
  kind: "hearing" | "agent";
  status: "running" | "completed" | "incomplete" | "failed";
  stages: LiveStage[];
  updatedAt: number;
}

let client: ConvexReactClient | null = null;
function liveClient(): ConvexReactClient | null {
  if (!LIVE_URL) return null;
  client ??= new ConvexReactClient(LIVE_URL);
  return client;
}

/** True when this run can be followed live (Convex configured and the API gave a token). */
export const canFollowLive = (token: string | null | undefined): token is string => Boolean(LIVE_URL && token);

/**
 * Subscribes to one run's progress. undefined: not live (or not loaded yet); null: no event has
 * arrived yet for this run; otherwise the latest progress, updated as each stage starts.
 */
export function useLiveProgress(token: string | null | undefined): LiveProgress | null | undefined {
  const [value, setValue] = useState<LiveProgress | null | undefined>(undefined);
  useEffect(() => {
    setValue(undefined);
    const c = liveClient();
    if (!c || !token) return;
    const watch = c.watchQuery(anyApi.progress.byToken, { token });
    const read = () => {
      try {
        const v = watch.localQueryResult() as LiveProgress | null | undefined;
        if (v !== undefined) setValue(v);
      } catch {
        // A failed query leaves the page on polling.
      }
    };
    read();
    return watch.onUpdate(read);
  }, [token]);
  return value;
}
