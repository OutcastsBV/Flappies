#!/usr/bin/env bash
# Link a user from the central/shared ZITADEL instance to the Flappies app
# database as an admin. Required before that user can sign in at
# http://YOUR_IP:3002/login — see docs/DEPLOYMENT.md.
#
# Usage:
#   ./deploy/scripts/bootstrap-app-admin.sh
#   ./deploy/scripts/bootstrap-app-admin.sh <zitadel-user-uuid> <username> <email>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy deploy/.env.production.example to deploy/.env first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

ZITADEL_ID="${1:-}"
USERNAME="${2:-}"
EMAIL="${3:-}"

if [[ -z "$ZITADEL_ID" || -z "$USERNAME" || -z "$EMAIL" ]]; then
  echo "This script inserts an app-database user linked to a ZITADEL account."
  echo ""
  echo "1. Open the central ZITADEL console: ${ZITADEL_URL:-<ZITADEL_URL from .env>}"
  echo "2. Sign in and go to Users → the target user → copy the User ID (UUID)"
  echo "3. Make sure that user is authorized in this tenant's ZITADEL Project"
  echo "   with an app role (admin/manager/cashier) — see"
  echo "   docs/KUBERNETES.md#tenant-onboarding or run"
  echo "   ./deploy/scripts/provision-tenant-zitadel.sh"
  echo "4. Re-run: ./deploy/scripts/bootstrap-app-admin.sh <uuid> <username> <email>"
  exit 1
fi

echo "Inserting app user: username=${USERNAME}, keycloak_id=${ZITADEL_ID}"

docker exec -i flappies_postgres psql -U "${POSTGRES_USER:-flappies}" -d "${POSTGRES_DB:-flappies}" <<SQL
INSERT INTO "user" (username, email, keycloak_id, role, is_active)
VALUES ('${USERNAME}', '${EMAIL}', '${ZITADEL_ID}', 'admin', true)
ON CONFLICT (keycloak_id) DO UPDATE
  SET username = EXCLUDED.username,
      email = EXCLUDED.email,
      role = 'admin',
      is_active = true;
SQL

echo ""
echo "Done. Users in app database:"
docker exec flappies_postgres psql -U "${POSTGRES_USER:-flappies}" -d "${POSTGRES_DB:-flappies}" -c \
  'SELECT id, username, email, keycloak_id FROM "user";'

echo ""
echo "You can now sign in at http://${PUBLIC_HOST:-10.61.2.101}:${FRONTEND_PORT:-3002}/login"
echo "with that user's ZITADEL password."
