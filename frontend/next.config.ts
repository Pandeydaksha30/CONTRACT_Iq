import type { NextConfig } from "next";

// Where this server forwards /api/* (the FastAPI backend). Read at build time: on Vercel set
// API_URL to the Render service address (https://<service>.onrender.com); locally the default.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";
const dev = process.env.NODE_ENV !== "production";
// Optional live progress (lib/live.ts): the browser connects to this Convex deployment over HTTPS
// and a websocket, so the policy below allows exactly that address. Read at build time.
const CONVEX_URL = (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(/\/+$/, "");
const convexOrigins = CONVEX_URL ? ` ${CONVEX_URL} ${CONVEX_URL.replace(/^https:/, "wss:")}` : "";

// Content Security Policy: only this site's own scripts, styles, fonts and API. Next.js needs
// inline scripts for hydration; dev mode also needs eval and a websocket for hot reload.
// Google sign-in is a full-page redirect, so no Google script is ever loaded here.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${convexOrigins}${dev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `npm run build:check` builds into .next-check so it can run while `npm run dev` uses .next.
  // (Building into the dev server's folder breaks it with "Cannot find module './NNN.js'".)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Self-contained server for the optional Docker image (frontend/Dockerfile sets NEXT_OUTPUT).
  // Vercel and `next start` use the normal output.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  // No Next.js badge in the corner during local demos (it never appears in production anyway).
  devIndicators: false,
  // Model calls (fact extraction, document answers) can take minutes when Gemini is busy and the
  // backend retries. Without this the local /api forwarding gives up after 30 s with a bare HTTP 500.
  // On Vercel the platform's own proxy limit applies instead (docs/deployment.md).
  experimental: { proxyTimeout: 600_000 },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/health", destination: `${API_URL}/health` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // HTTPS only once deployed (Vercel); not in local development over http.
          ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
