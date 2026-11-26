/**
 * Convex holds only the live progress of background runs (hearings, agent analyses). Everything
 * else (cases, documents, facts, results) stays in PostgreSQL behind the FastAPI backend.
 * Written by the backend through http.ts; read by the run's page through progress.ts.
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const kind = v.union(v.literal("hearing"), v.literal("agent"));
export const status = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("incomplete"),
  v.literal("failed"),
);
export const stage = v.object({ stage: v.string(), label: v.string(), ok: v.boolean(), at: v.number() });

export default defineSchema({
  progress: defineTable({
    // HMAC of the run id under the shared secret (backend/app/live.py): the only key, unguessable.
    token: v.string(),
    kind,
    status,
    // The backend numbers its events; an older one arriving late is ignored.
    seq: v.number(),
    stages: v.array(stage),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_updated", ["updatedAt"]),
});
