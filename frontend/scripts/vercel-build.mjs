// Vercel build (frontend/vercel.json). With CONVEX_DEPLOY_KEY set, pushes the Convex functions to
// that deployment first and builds with NEXT_PUBLIC_CONVEX_URL pointing at it
// (docs/live-progress.md). Without it, a plain build: the site polls the API as before.
import { execSync } from "node:child_process";

const cmd = process.env.CONVEX_DEPLOY_KEY ? `npx convex deploy --cmd "npm run build"` : "npm run build";
console.log(`> ${cmd}`);
execSync(cmd, { stdio: "inherit" });
