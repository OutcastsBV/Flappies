#!/usr/bin/env bash
# Seed a manager + cashier test account for manual QA, in BOTH ZITADEL and the
# app database. Intended for the local docker_infra stack (see
# docs/MANUAL_QA.md), but works against any ZITADEL org/project + Postgres you
# point it at.
#
# Assumes the ZITADEL Organization/Project/roles already exist â€” either
# created by hand ("Configure ZITADEL for login" in docs/DEPLOYMENT.md) or via
# ./deploy/scripts/provision-tenant-zitadel.sh.
#
# Requires: curl, jq, and either `docker` (default) or a `psql` on PATH.
#
# Required env vars:
#   ZITADEL_URL          Base URL of the ZITADEL instance (e.g. http://localhost:8080)
#   ZITADEL_PAT          A PAT with rights to create users/grants in the org
#                          below (an org-scoped admin, or an instance PAT).
#   ZITADEL_ORG_ID       Organization ID the users are created in.
#   ZITADEL_PROJECT_ID   Project ID the manager/cashier roles are granted on.
#
# Optional env vars:
#   MANAGER_EMAIL / MANAGER_PASSWORD / MANAGER_USERNAME   default test.manager@example.com / TestManager123! / <email>
#   CASHIER_EMAIL / CASHIER_PASSWORD / CASHIER_USERNAME   default test.cashier@example.com / TestCashier123! / <email>
#   DB_MODE              "docker" (default, docker exec into APP_DB_CONTAINER)
#                          or "psql" (connect directly with PG* env vars).
#   APP_DB_CONTAINER     Docker container name for the app Postgres. Default: postgres_app
#   APP_POSTGRES_USER    Default: flappies
#   APP_POSTGRES_DB      Default: flappies
set -euo pipefail

for cmd in curl jq; do
  command -v "$cmd" >/dev/null || { echo "ERROR: $cmd is required" >&2; exit 1; }
done

: "${ZITADEL_URL:?Set ZITADEL_URL}"
: "${ZITADEL_PAT:?Set ZITADEL_PAT}"
: "${ZITADEL_ORG_ID:?Set ZITADEL_ORG_ID}"
: "${ZITADEL_PROJECT_ID:?Set ZITADEL_PROJECT_ID}"

MANAGER_EMAIL="${MANAGER_EMAIL:-test.manager@example.com}"
MANAGER_PASSWORD="${MANAGER_PASSWORD:-TestManager123!}"
MANAGER_USERNAME="${MANAGER_USERNAME:-$MANAGER_EMAIL}"

CASHIER_EMAIL="${CASHIER_EMAIL:-test.cashier@example.com}"
CASHIER_PASSWORD="${CASHIER_PASSWORD:-TestCashier123!}"
CASHIER_USERNAME="${CASHIER_USERNAME:-$CASHIER_EMAIL}"

DB_MODE="${DB_MODE:-docker}"
APP_DB_CONTAINER="${APP_DB_CONTAINER:-postgres_app}"
APP_POSTGRES_USER="${APP_POSTGRES_USER:-flappies}"
APP_POSTGRES_DB="${APP_POSTGRES_DB:-flappies}"

API="${ZITADEL_URL%/}"
AUTH=(-H "Authorization: Bearer ${ZITADEL_PAT}" -H "Content-Type: application/json" -H "x-zitadel-orgid: ${ZITADEL_ORG_ID}")

call() {
  local method="$1" url="$2" body="${3:-}"
  local response status body_out
  if [[ -n "$body" ]]; then
    response=$(curl -sS -w '\n%{http_code}' -X "$method" "${AUTH[@]}" "${url}" -d "$body")
  else
    response=$(curl -sS -w '\n%{http_code}' -X "$method" "${AUTH[@]}" "${url}")
  fi
  status=$(tail -n1 <<<"$response")
  body_out=$(sed '$d' <<<"$response")
  if [[ "$status" -ge 400 ]]; then
    echo "ERROR calling $method $url (HTTP $status):" >&2
    echo "$body_out" >&2
    exit 1
  fi
  echo "$body_out"
}

run_sql() {
  local sql="$1"
  if [[ "$DB_MODE" == "docker" ]]; then
    docker exec -i "$APP_DB_CONTAINER" psql -U "$APP_POSTGRES_USER" -d "$APP_POSTGRES_DB" -v ON_ERROR_STOP=1 <<SQL
$sql
SQL
  else
    psql -v ON_ERROR_STOP=1 <<SQL
$sql
SQL
  fi
}

create_user_and_link() {
  local role="$1" username="$2" email="$3" password="$4"

  echo "==> Creating ZITADEL user '${username}' (role: ${role})..."
  local user_response user_id
  user_response=$(call POST "${API}/v2/users/human" "$(jq -n \
    --arg username "$username" \
    --arg email "$email" \
    --arg password "$password" \
    --arg given "${role^}" \
    '{
      username: $username,
      profile: { givenName: $given, familyName: "TestAccount", displayName: $username },
      email: { email: $email, isVerified: true },
      password: { password: $password, changeRequired: false }
    }')")
  user_id=$(jq -r '.userId' <<<"$user_response")
  echo "    User ID: ${user_id}"

  echo "==> Granting the '${role}' app role..."
  call POST "${API}/zitadel.authorization.v2.AuthorizationService/CreateAuthorization" "$(jq -n \
    --arg userId "$user_id" --arg projectId "$ZITADEL_PROJECT_ID" --arg orgId "$ZITADEL_ORG_ID" --arg role "$role" \
    '{userId: $userId, projectId: $projectId, organizationId: $orgId, roleKeys: [$role]}')" >/dev/null

  echo "==> Linking into the app database as role '${role}'..."
  run_sql "
INSERT INTO \"user\" (username, email, keycloak_id, role, is_active)
VALUES ('${username//\'/\'\'}', '${email//\'/\'\'}', '${user_id}', '${role}', true)
ON CONFLICT (keycloak_id) DO UPDATE
  SET username = EXCLUDED.username,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      is_active = true;
"

  echo "    Done: ${username} / ${password}"
  echo ""
}

create_user_and_link "manager" "$MANAGER_USERNAME" "$MANAGER_EMAIL" "$MANAGER_PASSWORD"
create_user_and_link "cashier" "$CASHIER_USERNAME" "$CASHIER_EMAIL" "$CASHIER_PASSWORD"

cat <<SUMMARY
=============================================================================
Test accounts ready. Sign in at the frontend URL with:

  Manager  â€” username: ${MANAGER_USERNAME}  password: ${MANAGER_PASSWORD}
  Cashier  â€” username: ${CASHIER_USERNAME}  password: ${CASHIER_PASSWORD}

See docs/MANUAL_QA.md for the test scenarios to run with these accounts
(and the admin account already created via docs/DEPLOYMENT.md).
=============================================================================
SUMMARY
