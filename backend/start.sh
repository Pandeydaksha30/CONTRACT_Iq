#!/bin/sh
# Start the ContractIQ API in a container: bring the database to the current migration, then
# serve on $PORT (default 8000). Migrations are idempotent, so running them on every start is safe.
#
# FORWARDED_ALLOW_IPS: which proxies may set X-Forwarded-For (rate limits use the client address).
# "*" is right when only a trusted proxy (Caddy, the website server, the host's load balancer)
# can reach the API port; narrow it if the port is exposed directly.
set -e
# A host disk mounted over the data directory may start empty or owned by another user.
DATA="${CONTRACTIQ_DATA_DIR:-/srv/data}"
mkdir -p "$DATA/models" "$DATA/uploads" "$DATA/outbox" 2>/dev/null || true
if ! touch "$DATA/.write-test" 2>/dev/null; then
    echo "ERROR: $DATA is not writable by $(id -un) (uid $(id -u)). Uploads would fail." >&2
    echo "Give the disk to uid $(id -u), or mount it elsewhere and set CONTRACTIQ_DATA_DIR." >&2
    exit 1
fi
rm -f "$DATA/.write-test"
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
    --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}"
