# ContractIQ deployment guide

**Status (17 Nov 2026):** the all-in-one Docker stack was built and run on this machine with private
demo mode (docs/test-report.md). Vercel, Render and the other hosts below have **not** been tried: no
account was used, and nothing is publicly deployed.

## Choose a deployment

| Option | Website | API | Database | Scanned pages (OCR) | Effort |
|---|---|---|---|---|---|
| **A. Vercel + Render (native)** | Vercel | Render, native Python | Render PostgreSQL | No | Low; two dashboards |
| **B. Vercel + Render (Docker)** | Vercel | Render, Docker runtime (`backend/Dockerfile`) | Render PostgreSQL | Yes | Low; same as A, one setting different |
| **C. Vercel + any container host** | Vercel | Railway, Fly.io, Google Cloud Run, Azure Container Apps, AWS App Runner, Koyeb, … (`backend/Dockerfile`) | any PostgreSQL 17 with pgvector (Neon, Supabase, the host's own) | Yes | Medium |
| **D. One server, everything** | Docker stack | Docker stack | Docker stack | Yes | One command on any Linux server or VM (`infra/deploy.sh`) |

All options run the same code. For an evaluation, any option with **private demo mode** (below)
gives a site where the AI features work on fictional documents and only invited people can enter.

## Private demo mode and accounts (all options)

| Setting | Where | Effect |
|---|---|---|
| `CONTRACTIQ_SITE_PASSWORD` (API) and `SITE_PASSWORD` (website) | the **same** value, at least 10 characters | One shared password in front of the whole site. Visitors see a password page first; the API refuses everything except `/health` until it is entered, so calling the API directly does not bypass it |
| `CONTRACTIQ_ALLOW_DEMO_CASES=true` (API) | only with the site password | Users can mark a case as a fictional demo; the AI steps (answers, clause analysis, facts, agents, hearing) then run for it |
| `CONTRACTIQ_PRIVATE_LLM_OK` | keep `false` | Real (non-demo) documents are never sent to the model |

Without an email provider nobody receives the confirmation email. Confirm or create accounts with
the admin command, run where the API runs (Render shell, `docker compose exec api`, or locally
with `CONTRACTIQ_DATABASE_URL` set to the database):

```bash
python -m scripts.admin_users list
python -m scripts.admin_users verify reviewer@example.com
python -m scripts.admin_users create reviewer@example.com "Reviewer name"
python -m scripts.admin_users reset-password reviewer@example.com
```

`create` and `reset-password` print a generated password once; give it privately and ask the
person to change it on the Account page. For a site open to the public, set up SMTP instead
(`CONTRACTIQ_SMTP_*`: Brevo, Amazon SES, Gmail with an app password, …).

## A. Vercel + Render, native Python

1. Push the repository to GitHub.
2. **Render:** New > Blueprint, choose the repository. It creates `contractiq-db` (PostgreSQL 17)
   and `contractiq-api` (native Python, 2 GB plan, a 5 GB disk at `/var/data`) from `render.yaml`.
   Fill in when asked: `CONTRACTIQ_PUBLIC_URL` and `CONTRACTIQ_CORS_ORIGINS` (the Vercel address, can
   be set after step 3), `GEMINI_API_KEY`, `CONTRACTIQ_SITE_PASSWORD`, and for demo mode set
   `CONTRACTIQ_ALLOW_DEMO_CASES=true`.
3. **Vercel:** Add New > Project, Root Directory `frontend`. Environment variables: `API_URL` =
   `https://<service>.onrender.com`, and `SITE_PASSWORD` = the same site password. Deploy.
4. Load the public orders (step "Public order data" below). Check `/health` on both addresses.

Render builds with `uv sync --frozen` (exact locked packages) and runs `alembic upgrade head`
before every start. If `CREATE EXTENSION vector` fails, enable pgvector for the database in the
Render dashboard and redeploy.

## B. Vercel + Render, Docker runtime (with OCR)

As A, but in `render.yaml` replace `runtime` .. `startCommand` with the three lines shown in the
comment there (`runtime: docker`, `dockerfilePath: ./backend/Dockerfile`, `dockerContext: .`).
The image contains Tesseract, runs the migrations itself and listens on `$PORT`.

## C. Vercel + any container host

Build and run the API image (build from the repository root):

```bash
docker build -f backend/Dockerfile -t contractiq-api .
```

Give the container these environment variables: `CONTRACTIQ_DATABASE_URL` (any PostgreSQL 17 with
pgvector; `postgres://` URLs are accepted), `CONTRACTIQ_PUBLIC_URL` and `CONTRACTIQ_CORS_ORIGINS` (the
website address), `CONTRACTIQ_COOKIE_SECURE=true`, and the optional ones above. Mount persistent
storage at `/srv/data` (uploads, email outbox, model cache). The host sets `$PORT`; health check
path `/health`. Then deploy the website on Vercel as in A, with `API_URL` set to the container's
address. The website can also run as a container: `docker build --build-arg API_URL=... -t contractiq-web frontend`.

## D. One server, everything (Docker stack)

On any Linux server or VM with 4 GB memory (Ubuntu or Debian; Docker is installed if missing),
with a domain pointing at it and ports 80/443 open:

```bash
DOMAIN=contractiq.example.org SITE_PASSWORD='a-long-shared-password' ALLOW_DEMO_CASES=true DATA=release/nyayasim-public-orders.dump bash infra/deploy.sh
```

This writes `infra/.env.prod` (random database password; readable by you only), builds the
images, starts PostgreSQL, the API, the website and Caddy (automatic HTTPS certificates), loads
the order data and checks `https://DOMAIN/health`. Leave out `SITE_PASSWORD` and
`ALLOW_DEMO_CASES` for an open site. `DOMAIN=none` starts without HTTPS on port 3000, only behind
a firewall. Backups: `bash infra/backup.sh backups`; restore: `CONFIRM=yes bash infra/restore.sh
<db.dump> <files.tar.gz>`. Both files contain private data: keep them encrypted.

## Public order data (all options)

Precedent search, the hearing and the outcome estimate need the public HRERA orders
(`release/nyayasim-public-orders.dump`, 186 MB, public orders only, no user data):

| Target | Command |
|---|---|
| Render or any hosted PostgreSQL (external URL) | `TARGET_URL='postgresql://...' bash infra/import-data.sh release/nyayasim-public-orders.dump` |
| Docker stack on the server | `PROD=1 bash infra/import-data.sh release/nyayasim-public-orders.dump` |
| Local development database | `bash infra/import-data.sh release/nyayasim-public-orders.dump` |

It refuses to load into a database that already has orders (`FORCE=1` replaces them). The
classifier files are in the repository and in the API image; nothing to copy.

## Checks after deploying

| Check | Expected |
|---|---|
| `/health` on the website address | `{"status":"ok"}` (open even in private mode) |
| Open the website (private mode) | the "Private preview" password page; after the password, the landing page |
| `/api/v1/cases` without the password | HTTP 401 with `"gate": true` |
| Sign up, confirm with `admin_users verify`, sign in | dashboard opens |
| New case, tick the fictional demo option, upload `demo/sample-documents/agreement.pdf` | facts, Ask, contract analysis work |
| `/api/v1/stats` (after entering the password) | `orders_read` above 0 after the data import |

## Settings reference (API)

| Variable | Meaning | Default |
|---|---|---|
| `CONTRACTIQ_DATABASE_URL` | PostgreSQL 17 with pgvector | local dev database |
| `CONTRACTIQ_PUBLIC_URL`, `CONTRACTIQ_CORS_ORIGINS` | the website address (the only origin allowed to change data) | localhost:3100 |
| `CONTRACTIQ_COOKIE_SECURE` | `true` on HTTPS; also hides `/docs` | `false` |
| `CONTRACTIQ_DATA_DIR` | uploads, outbox, model cache; persistent storage | `data/` (`/srv/data` in the image) |
| `CONTRACTIQ_SITE_PASSWORD` | private demo mode | empty (open site) |
| `CONTRACTIQ_ALLOW_DEMO_CASES` | AI on fictional demo cases | `false` |
| `CONTRACTIQ_PRIVATE_LLM_OK` | send real documents to the model | `false`, keep it |
| `GEMINI_API_KEY`, `CONTRACTIQ_FALLBACK_MODELS`, `CONTRACTIQ_MODEL_RETRIES` | model and fallback | empty / `gemini-3.6-flash` / 2 |
| `CONTRACTIQ_SMTP_*`, `CONTRACTIQ_GOOGLE_CLIENT_*` | email, Google sign-in | empty |
| `PORT`, `FORWARDED_ALLOW_IPS` | container only: listening port, trusted proxies | 8000, `*` |

Website: `API_URL` (build time) and `SITE_PASSWORD` (run time).

## Limits that remain

- One API instance: rate limits and running jobs live in memory.
- Vercel's proxy to an external API has its own time limit; a very slow model call can end with an
  error in the browser although the API finishes. Hearings and agent runs are background jobs.
- Uploaded files are not encrypted at rest; use an encrypted disk or the host's encrypted storage.
- No external security review yet; terms and privacy pages are drafts.
- Not verified on the platforms: plan names in `render.yaml`, pgvector on the chosen database plan,
  memory use, Vercel's proxy limit.
