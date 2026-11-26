"use client";

import type { LiveStage } from "@/lib/live";

/** The stages of a running hearing or analysis, as they start (lib/live.ts). */
export function LiveStages({ stages, running }: { stages: LiveStage[]; running: boolean }) {
  if (stages.length === 0) return null;
  return (
    <ol className="small" aria-live="polite" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
      {stages.map((s, i) => {
        const current = running && i === stages.length - 1;
        return (
          <li key={`${s.stage}-${s.at}`} style={{ color: current ? undefined : "var(--text-2)" }}>
            {current ? <b>{s.label}…</b> : s.label}
            {!s.ok && " (did not succeed)"}
          </li>
        );
      })}
    </ol>
  );
}
