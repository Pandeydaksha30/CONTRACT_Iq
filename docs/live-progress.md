# Live case progress (Convex)

Optional. Hearings and agent analyses run in the background on the API. Without this feature the
website polls the API every few seconds and shows only "in progress". With it, the page shows each
stage the moment it starts ("The buyer's advocate is preparing arguments", "The bench is deciding",
"case agent · search case") and reads the result as soon as the run ends.

## How it works

```text
FastAPI job (Render) ──POST /progress + shared secret──► Convex HTTP action ──► progress table
                                                                                     │ subscription
Browser (Vercel) ◄── stages, status ──────────────────────── progress.byToken ◄──────┘
Browser ──► FastAPI: results, steps, arguments (as before, from PostgreSQL)
```

| Part | File |
|---|---|
| Publisher (background thread, 3 s timeout, failures only logged) | `backend/app/live.py` |
| Hearing stages / agent steps sent from | `backend/app/hearing/jobs.py`, `backend/app/agent/jobs.py` |
| Token returned to the owner while a run is running | `live_token` in `backend/app/api/hearing.py`, `backend/app/api/agent.py` |
| Convex table, HTTP action, query, hourly cleanup | `frontend/convex/schema.ts`, `http.ts`, `progress.ts`, `crons.ts` |
| Browser subscription | `frontend/lib/live.ts`, `frontend/components/live-stages.tsx` |

**What Convex holds:** run kind, status, stage names and fixed labels, time. No document text,
facts, arguments, tool arguments or results, and no user, case or run ids. Rows are deleted a day
after their last update.

**Who can read it:** each run is stored under `live_token`, an HMAC-SHA256 of the run id under the
shared secret. The API gives it only to the case's owner (the same check as the run itself), and
the query returns nothing for an unknown token. **Who can write:** only callers with the shared
secret; the write function is internal, so browsers cannot call it.

**If Convex is down or not configured:** nothing breaks. Runs finish as before, and the page falls
back to polling (every 15 s while following live, every 2.5–3 s without it).

## Set up

You need a Convex account (dashboard.convex.dev) and a long random secret, for example:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

1. **Create the Convex project** (once), from `frontend/`:

   ```powershell
   npm install
   npx convex dev
   ```

   Sign in, choose your team, create a project (e.g. `contractiq`). This writes
   `frontend/.env.local` (not committed) with the dev deployment and `NEXT_PUBLIC_CONVEX_URL`,
   generates `convex/_generated/`, and pushes the functions. If it complains that esbuild is
   missing, run `npm install-scripts approve esbuild` and `npm rebuild esbuild` first.
2. **Set the secret in Convex**: dashboard > your project > Settings > Environment Variables:
   `CONTRACTIQ_PROGRESS_SECRET` = the secret. (Or `npx convex env set CONTRACTIQ_PROGRESS_SECRET <secret>`.)
3. **Point the API at Convex** (`backend/.env` locally, Render environment in production):

   | Variable | Value |
   |---|---|
   | `CONTRACTIQ_CONVEX_SITE_URL` | `https://<deployment>.convex.site` (HTTP actions; note **.site**) |
   | `CONTRACTIQ_CONVEX_SECRET` | the same secret |

4. **Point the website at Convex**: `NEXT_PUBLIC_CONVEX_URL` = `https://<deployment>.convex.cloud`
   (note **.cloud**). It is read at build time: it is also added to the Content Security Policy.
5. Run a hearing on a demo case: the stages appear under the button as they start.

## Production (Vercel + Render)

- **Convex:** in the dashboard, use the project's *Production* deployment. Set
  `CONTRACTIQ_PROGRESS_SECRET` there too (production and dev have separate variables). Create a
  deploy key: Settings > Deploy Keys > Generate Production Deploy Key.
- **Vercel** (Root Directory `frontend`): add `CONVEX_DEPLOY_KEY` (the deploy key) and set the
  Build Command to `npx convex deploy --cmd 'npm run build'`. That pushes the Convex functions and
  sets `NEXT_PUBLIC_CONVEX_URL` for the build automatically.
- **Render:** set `CONTRACTIQ_CONVEX_SITE_URL` (production `.convex.site` address) and
  `CONTRACTIQ_CONVEX_SECRET` on `contractiq-api`.

Check: start a hearing; in the Convex dashboard > Data > `progress`, a row appears and gains stages.

## Not verified yet

Built and type-checked, and the publisher is unit-tested with the network stubbed. Not yet run
against a real Convex deployment, and the database tests for it need the local PostgreSQL.
