/**
 * 1. Private demo mode (lib/gate.ts): when SITE_PASSWORD is set, every page and /api call needs
 *    the gate cookie; visitors without it see the password page (/gate). The API checks the same
 *    token itself, so this is the friendly front door, and the API is the boundary.
 * 2. Sends signed-out visitors from private pages to the sign-in page (and back afterwards).
 *    This only checks that a session cookie exists; the API checks that it is valid and that the
 *    case belongs to the user on every request, so this is a convenience, not the security boundary.
 */
import { type NextRequest, NextResponse } from "next/server";
import { GATE_COOKIE, gatePassword, gateToken, sameToken } from "./lib/gate";

const PRIVATE = [/^\/dashboard(\/|$)/, /^\/search(\/|$)/, /^\/account(\/|$)/, /^\/cases\/new(\/|$)/, /^\/cases\/(?!demo(\/|$))[^/]+/];
// Reachable without the site password: the password page, the call that checks it, health, icons.
const GATE_OPEN = [/^\/gate$/, /^\/api\/v1\/gate$/, /^\/health$/, /^\/icon\.svg$/, /^\/favicon\.ico$/];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const password = gatePassword();
  if (password && !GATE_OPEN.some((r) => r.test(pathname))) {
    const given = req.cookies.get(GATE_COOKIE)?.value ?? "";
    if (!sameToken(given, await gateToken(password))) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ detail: "This site is private. Enter the site password first.", gate: true }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/gate";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  if (PRIVATE.some((r) => r.test(pathname)) && !req.cookies.has("contractiq_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Everything except Next's own build files: the gate must cover every page and /api call.
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
