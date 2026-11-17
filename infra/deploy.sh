#!/usr/bin/env bash
# One-command deploy of the all-in-one Docker stack on an Ubuntu/Debian server (or any machine
# with Docker). Optional: the default deployment is Vercel + Render (DEPLOYMENT_GUIDE.md).
#
# Run from the project root on the server:
#   DOMAIN=contractiq.example.org bash infra/deploy.sh                     # public HTTPS site
#   DOMAIN=contractiq.example.org SITE_PASSWORD='...' ALLOW_DEMO_CASES=true bash infra/deploy.sh
#                                                                          # private evaluation site
#   DOMAIN=none bash infra/deploy.sh                                       # http, behind a firewall
#
# Optional, as environment variables (or edit infra/.env.prod afterwards and run again):
#   GEMINI_API_KEY, GOOGLE_CLIENT_ID/SECRET, SMTP_HOST/PORT/USER/PASSWORD/FROM
#   DATA=release/nyayasim-public-orders.dump   load the public orders into an empty database
#
# It installs Docker if missing, writes infra/.env.prod on the first run (random database
# password), builds and starts everything, loads the data if asked, and checks /health.
set -euo pipefail
trap 'echo "error: deploy stopped at line $LINENO" >&2' ERR
cd "$(dirname "$0")/.."

ENV_FILE=infra/.env.prod
COMPOSE=(docker compose -f infra/docker-compose.prod.yml --env-file "$ENV_FILE")
say() { printf '\n== %s\n' "$*"; }
die() { echo "error: $*" >&2; exit 1; }
env_get() { grep -E "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }

# 1. Docker -------------------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker (official script from get.docker.com)"
  [ "$(id -u)" = 0 ] || command -v sudo >/dev/null || die "need root or sudo to install Docker"
  curl -fsSL https://get.docker.com | sh
  [ "$(id -u)" = 0 ] || sudo usermod -aG docker "$USER" || true
fi
if ! docker info >/dev/null 2>&1; then
  if [ "$(id -u)" != 0 ] && sudo docker info >/dev/null 2>&1; then
    COMPOSE=(sudo "${COMPOSE[@]}")
  else
    die "Docker is installed but not running (try: sudo systemctl start docker)"
  fi
fi

# 2. Settings -----------------------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  say "Creating $ENV_FILE"
  if [ -z "${DOMAIN:-}" ]; then read -rp "Domain pointing at this server, or 'none': " DOMAIN; fi
  [ -n "$DOMAIN" ] || die "DOMAIN is required ('none' for no HTTPS)"
  if [ -n "${SITE_PASSWORD:-}" ] && [ "${#SITE_PASSWORD}" -lt 10 ]; then die "SITE_PASSWORD must be at least 10 characters"; fi
  if [ "${ALLOW_DEMO_CASES:-false}" = "true" ] && [ -z "${SITE_PASSWORD:-}" ]; then
    die "ALLOW_DEMO_CASES=true needs SITE_PASSWORD (a private site): on an open site anyone could send real documents to the model"
  fi
  db_pw="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
  if [ "$DOMAIN" = "none" ]; then
    ip="$( (hostname -I 2>/dev/null || true) | awk '{print $1}')"; ip="${ip:-localhost}"
    web_url="http://$ip:${WEB_PORT:-3000}"; bind=0.0.0.0; domain_line=""; secure=false
  else
    web_url="https://$DOMAIN"; bind=127.0.0.1; domain_line="$DOMAIN"; secure=true
  fi
  umask 077
  cat > "$ENV_FILE" <<EOF
# Written by infra/deploy.sh on $(date -u +%F). Never commit this file.
POSTGRES_PASSWORD=$db_pw
PUBLIC_WEB_URL=$web_url
COOKIE_SECURE=$secure
SITE_PASSWORD=${SITE_PASSWORD:-}
ALLOW_DEMO_CASES=${ALLOW_DEMO_CASES:-false}
GEMINI_API_KEY=${GEMINI_API_KEY:-}
NYAYASIM_PRIVATE_LLM_OK=false
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
SMTP_FROM=${SMTP_FROM:-ContractIQ <no-reply@${DOMAIN}>}
API_BIND=127.0.0.1
WEB_BIND=$bind
API_PORT=${API_PORT:-8000}
WEB_PORT=${WEB_PORT:-3000}
DOMAIN=$domain_line
EOF
  echo "Saved (readable by you only)."
else
  say "Using existing $ENV_FILE"
fi

domain="$(env_get DOMAIN)"
profile=()
[ -n "$domain" ] && profile=(--profile https)
[ -n "$(env_get SMTP_HOST)" ] || echo "note: no SMTP_HOST: confirmation emails are only saved on the server. Confirm accounts with
      ${COMPOSE[*]} exec api python -m scripts.admin_users verify EMAIL"

# 3. Build and start ----------------------------------------------------------------------------
say "Building and starting (the first build takes 5-15 minutes)"
"${COMPOSE[@]}" "${profile[@]}" up -d --build

say "Waiting for the API"
ok=0
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T api curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done
[ "$ok" = 1 ] || { "${COMPOSE[@]}" logs --tail 60 api; die "API did not become healthy"; }

# 4. Public order data --------------------------------------------------------------------------
if [ -n "${DATA:-}" ]; then
  orders="$("${COMPOSE[@]}" exec -T postgres psql -U nyayasim -d nyayasim -tAc 'select count(*) from orders')"
  if [ "$orders" = "0" ]; then
    say "Loading order data from $DATA"
    PROD=1 bash infra/import-data.sh "$DATA"
  else
    say "Database already has $orders orders; not loading $DATA"
  fi
fi

# 5. Check --------------------------------------------------------------------------------------
if [ -n "$domain" ]; then
  say "Checking https://$domain/health (the certificate can take a minute on first start)"
  code=000
  for _ in $(seq 1 24); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "https://$domain/health" || true)"
    [ "$code" = 200 ] && break; sleep 5
  done
  if [ "$code" = 200 ]; then echo "OK: https://$domain is live."
  else echo "Not reachable yet (HTTP $code). Check DNS and that ports 80/443 are open, then: ${COMPOSE[*]} logs caddy"
  fi
else
  echo "Running on $(env_get PUBLIC_WEB_URL) without HTTPS. Keep this server behind a firewall."
fi
