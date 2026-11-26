/**
 * POST /progress: the FastAPI backend (backend/app/live.py) reports a stage of a run.
 * Address: https://<deployment>.convex.site/progress. Only callers that send the shared secret
 * (Convex environment variable CONTRACTIQ_PROGRESS_SECRET, the same value as the backend's
 * CONTRACTIQ_CONVEX_SECRET) are accepted.
 */
import { anyApi, httpActionGeneric as httpAction, httpRouter } from "convex/server";

/** Comparison that takes the same time wherever the strings differ. */
function sameSecret(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

const progress = httpAction(async (ctx, req) => {
  const secret = process.env.CONTRACTIQ_PROGRESS_SECRET;
  if (!secret || secret.length < 20) return new Response("Not configured", { status: 503 });
  const auth = req.headers.get("Authorization") ?? "";
  if (!sameSecret(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const { token, kind, status, seq, ok, stage, label } = body;
  try {
    await ctx.runMutation(anyApi.progress.record, { token, kind, status, seq, ok, stage, label });
  } catch {
    return new Response("Rejected", { status: 400 });
  }
  return new Response(null, { status: 204 });
});

const http = httpRouter();
http.route({ path: "/progress", method: "POST", handler: progress });
export default http;
