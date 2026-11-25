/**
 * Private demo mode (backend/app/auth/gate.py): one shared site password in front of the site.
 *
 * Off unless SITE_PASSWORD is set for the website (the API needs the same value as
 * CONTRACTIQ_SITE_PASSWORD). The token is HMAC-SHA256 of a fixed label keyed with the password,
 * exactly as the API computes it. Web Crypto only, so it runs in the middleware (edge), on the
 * server and nowhere else: SITE_PASSWORD is not a NEXT_PUBLIC_ variable and never reaches the browser.
 */

export const GATE_COOKIE = "contractiq_gate";
export const GATE_HEADER = "x-contractiq-gate";
const LABEL = "contractiq-site-gate-v1";

export const gatePassword = (): string | undefined => {
  const p = typeof window === "undefined" ? process.env.SITE_PASSWORD : undefined;
  return p && p.trim() ? p : undefined;
};

export async function gateToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(LABEL)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex strings of the same length. */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Headers the website's own server adds when it calls the API (empty in the browser or when off). */
export async function serverGateHeaders(): Promise<Record<string, string>> {
  const p = gatePassword();
  return p ? { [GATE_HEADER]: await gateToken(p) } : {};
}
