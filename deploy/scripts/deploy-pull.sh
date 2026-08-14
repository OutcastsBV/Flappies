#!/usr/bin/env bash
# Pull latest images and start the app-only production stack (Postgres, API, frontend).
# Identity comes from a central/shared ZITADEL instance — this script does not
# start or configure ZITADEL itself, see docs/DEPLOYMENT.md.
# Run on the VPS after: cp deploy/.env.production.example deploy/.env && docker login ghcr.io
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.prod.yml)

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.production.example to .env and edit secrets first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

for var in ZITADEL_URL ZITADEL_CLIENT_ID ZITADEL_CLIENT_SECRET ZITADEL_PROJECT_ID ZITADEL_IMPERSONATOR_PAT POSTGRES_PASSWORD CONFIG_ENCRYPTION_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is not set in .env." >&2
    echo "Provision this tenant in the central ZITADEL first: ./deploy/scripts/provision-tenant-zitadel.sh" >&2
    exit 1
  fi
done

echo "Pulling all images (postgres, api, frontend)..."
"${COMPOSE[@]}" pull

echo "Starting app stack..."
"${COMPOSE[@]}" up -d --remove-orphans

echo ""
echo "Waiting for the API to become ready (up to 1 min)..."
API_BASE="http://${PUBLIC_HOST:-10.61.2.101}:${API_PORT:-3001}"
ready=0
for _ in $(seq 1 20); do
  if curl -fsS "${API_BASE}/ready" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done

if [[ "$ready" -eq 0 ]]; then
  echo "WARNING: API did not respond yet. Check: docker logs flappies_api --tail 40" >&2
fi

echo ""
echo "Stack status:"
"${COMPOSE[@]}" ps

HOST="${PUBLIC_HOST:-10.61.2.101}"
echo ""
echo "=== URLs ==="
echo "  Frontend: http://${HOST}:${FRONTEND_PORT:-3002}"
echo "  API:      ${API_BASE}"
echo "  ZITADEL:  ${ZITADEL_URL} (shared/central instance — not managed by this stack)"
echo ""
echo "=== Flappies app login (http://${HOST}:${FRONTEND_PORT:-3002}/login) ==="
echo "  Requires BOTH a ZITADEL account (in this tenant's Organization/Project)"
echo "  AND a row in the app database."
echo "  After the ZITADEL user exists: ./deploy/scripts/bootstrap-app-admin.sh <zitadel-user-uuid>"
