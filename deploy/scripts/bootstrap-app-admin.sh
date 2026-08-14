#!/usr/bin/env bash
# Link the ZITADEL instance admin (or any ZITADEL user) to the Flappies app database.
# Required before you can sign in at http://YOUR_IP:3002/login
#
# Usage:
#   ./deploy/scripts/bootstrap-app-admin.sh
#   ./deploy/scripts/bootstrap-app-admin.sh <zitadel-user-uuid> [username] [email]
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
USERNAME="${2:-${ZITADEL_ADMIN_USER:-admin}}"
EMAIL="${3:-${ZITADEL_ADMIN_EMAIL:-admin@localhost}}"

if [[ -z "$ZITADEL_ID" ]]; then
  echo "This script inserts an app-database user linked to a ZITADEL account."
  echo ""
  echo "1. Open ZITADEL (once running): http://${PUBLIC_HOST:-10.61.2.101}:${ZITADEL_EXTERNALPORT:-8080}"
  echo "2. Sign in with ZITADEL_ADMIN_USER / ZITADEL_ADMIN_PASSWORD from .env"
  echo "3. Go to Users → open the admin user → copy the User ID (UUID)"
  echo "4. Re-run: ./deploy/scripts/bootstrap-app-admin.sh <that-uuid>"
  echo ""
  echo "Also assign the 'admin' role to this user in your ZITADEL project (Console → Projects → flappies → Authorizations)."
  exit 1
fi

echo "Inserting app user: username=${USERNAME}, keycloak_id=${ZITADEL_ID}"

docker exec -i flappies_postgres psql -U "${POSTGRES_USER:-flappies}" -d "${POSTGRES_DB:-flappies}" <<SQL
INSERT INTO "user" (username, email, keycloak_id, balance, is_active)
VALUES ('${USERNAME}', '${EMAIL}', '${ZITADEL_ID}', 0, true)
ON CONFLICT (keycloak_id) DO UPDATE
  SET username = EXCLUDED.username,
      email = EXCLUDED.email,
      is_active = true;
SQL

echo ""
echo "Done. Users in app database:"
docker exec flappies_postgres psql -U "${POSTGRES_USER:-flappies}" -d "${POSTGRES_DB:-flappies}" -c \
  'SELECT id, username, email, keycloak_id FROM "user";'

echo ""
echo "You can now sign in at http://${PUBLIC_HOST:-10.61.2.101}:${FRONTEND_PORT:-3002}/login"
echo "with the ZITADEL password from .env (if this is the instance admin user)."
