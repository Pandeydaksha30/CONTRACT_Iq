/**
 * Live progress of one run. `byToken` is what the run's page subscribes to; `record` is called
 * only by the HTTP action in http.ts (internal: browsers cannot call it); `prune` is run by
 * crons.ts so nothing is kept longer than a day.
 */
import { internalMutationGeneric as internalMutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { kind, status } from "./schema";

const TOKEN = /^[0-9a-f]{64}$/;
const MAX_STAGES = 80;
const KEEP_MS = 24 * 60 * 60 * 1000;
const DONE = new Set(["completed", "incomplete", "failed"]);

export const byToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!TOKEN.test(token)) return null;
    const row = await ctx.db
      .query("progress")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!row) return null;
    return { kind: row.kind, status: row.status, stages: row.stages, updatedAt: row.updatedAt };
  },
});

export const record = internalMutation({
  args: {
    token: v.string(),
    kind,
    status,
    seq: v.number(),
    ok: v.boolean(),
    stage: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (!TOKEN.test(a.token)) throw new Error("bad token");
    const now = Date.now();
    const entry = a.stage
      ? [{ stage: a.stage.slice(0, 60), label: (a.label ?? a.stage).slice(0, 160), ok: a.ok, at: now }]
      : [];
    const row = await ctx.db
      .query("progress")
      .withIndex("by_token", (q) => q.eq("token", a.token))
      .unique();
    if (!row) {
      await ctx.db.insert("progress", {
        token: a.token,
        kind: a.kind,
        status: a.status,
        seq: a.seq,
        stages: entry,
        updatedAt: now,
      });
      return;
    }
    // Late or repeated events, and anything after the run has ended, change nothing.
    if (a.seq <= row.seq || DONE.has(row.status)) return;
    await ctx.db.patch(row._id, {
      status: a.status,
      seq: a.seq,
      stages: [...row.stages, ...entry].slice(-MAX_STAGES),
      updatedAt: now,
    });
  },
});

export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("progress")
      .withIndex("by_updated", (q) => q.lt("updatedAt", Date.now() - KEEP_MS))
      .take(500);
    for (const row of old) await ctx.db.delete(row._id);
  },
});
