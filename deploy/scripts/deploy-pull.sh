#!/usr/bin/env bash
# Pull latest images and start the full production stack (Postgres ×2, ZITADEL, API, frontend).
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

if [[ ${#ZITADEL_MASTERKEY} -ne 32 ]]; then
  echo "ERROR: ZITADEL_MASTERKEY must be exactly 32 characters (got ${#ZITADEL_MASTERKEY})." >&2
  echo "Generate one with: tr -dc A-Za-z0-9 </dev/urandom | head -c 32" >&2
  exit 1
fi

if [[ ${#ZITADEL_ADMIN_PASSWORD} -lt 8 ]] \
  || ! [[ "$ZITADEL_ADMIN_PASSWORD" =~ [A-Z] ]] \
  || ! [[ "$ZITADEL_ADMIN_PASSWORD" =~ [a-z] ]] \
  || ! [[ "$ZITADEL_ADMIN_PASSWORD" =~ [0-9] ]]; then
  echo "ERROR: ZITADEL_ADMIN_PASSWORD must be at least 8 chars with upper, lower, and a digit." >&2
  echo "Example: ChangeMe-Admin-Password1!" >&2
  exit 1
fi

echo "Pulling all images (postgres, zitadel, api, frontend)..."
"${COMPOSE[@]}" pull

echo "Starting full stack..."
"${COMPOSE[@]}" up -d --remove-orphans

ZITADEL_PORT="${ZITADEL_EXTERNALPORT:-8080}"
ZITADEL_BASE="http://${PUBLIC_HOST:-10.61.2.101}:${ZITADEL_PORT}"
echo ""
echo "Waiting for ZITADEL at ${ZITADEL_BASE} (up to 3 min)..."
ready=0
for _ in $(seq 1 60); do
  if curl -fsS "${ZITADEL_BASE}/debug/ready" >/dev/null 2>&1 \
    || curl -fsS "${ZITADEL_BASE}/ui/login" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done

if [[ "$ready" -eq 0 ]]; then
  echo "WARNING: ZITADEL did not respond yet. Check: docker logs kassa_zitadel --tail 40" >&2
fi

echo ""
echo "Stack status:"
"${COMPOSE[@]}" ps

HOST="${PUBLIC_HOST:-10.61.2.101}"
echo ""
echo "=== URLs ==="
echo "  Frontend: http://${HOST}:${FRONTEND_PORT:-3002}"
echo "  API:      http://${HOST}:${API_PORT:-3001}"
echo "  ZITADEL:  ${ZITADEL_BASE}"
echo ""
echo "=== ZITADEL console login (from your .env — not a built-in default) ==="
echo "  Username: ${ZITADEL_ADMIN_USER:-admin}"
echo "  Password: (value of ZITADEL_ADMIN_PASSWORD in .env)"
echo ""
echo "=== Kassa app login (http://${HOST}:${FRONTEND_PORT:-3002}/login) ==="
echo "  Requires BOTH ZITADEL account AND a row in the app database."
echo "  After ZITADEL works: ./deploy/scripts/bootstrap-app-admin.sh <zitadel-user-uuid>"
echo ""
echo "First-time ZITADEL setup:"
echo "  1. Open ${ZITADEL_BASE} and sign in with the credentials above"
echo "  2. Create OAuth app '${ZITADEL_CLIENT_ID:-kassasysteem}' (Web → Code, not User Agent)"
echo "     Enable Authorization Code + Refresh Token + Token Exchange → copy secret to .env"
echo "  3. Instance → Members: service user gets IAM_LOGIN_CLIENT"
echo "     Instance → Security Settings: enable Allow Impersonation"
echo "     Org → Members: service user gets Org End User Impersonator"
echo "     Machine user → Keys: client id + secret → ZITADEL_IMPERSONATOR_CLIENT_* in .env"
echo "     Machine user → PAT → ZITADEL_IMPERSONATOR_PAT in .env"
echo "  4. docker compose -f deploy/docker-compose.prod.yml up -d api"
echo "  5. ./deploy/scripts/bootstrap-app-admin.sh <admin-user-uuid-from-zitadel>"
