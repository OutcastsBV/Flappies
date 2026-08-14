#!/usr/bin/env bash
# Provision a new tenant in the CENTRAL/shared ZITADEL instance: an
# Organization, a "flappies" Project with the admin/manager/cashier roles, an
# OIDC application, a service (machine) user for the impersonation token
# exchange used after password login, and the tenant's first admin user.
#
# Run this ONCE per new tenant, against the central ZITADEL — not something
# each tenant's own Kubernetes/Compose deployment does. It prints the values
# you then paste into that tenant's `secrets.zitadel*` (Helm) or ZITADEL_*
# (Compose) config.
#
# Requires: curl, jq
#
# Required env vars:
#   ZITADEL_URL          Base URL of the central ZITADEL instance
#   ZITADEL_IAM_PAT       PAT of an INSTANCE administrator (IAM_OWNER or
#                          equivalent) — used only for this one-off setup,
#                          never stored in the tenant's own deployment.
#   TENANT_SLUG            Short unique tenant id, e.g. "acme-corp". Used as
#                          the Organization name and TENANT_ID for metrics/logs.
#   TENANT_FRONTEND_URL    Public URL of the tenant's frontend, e.g.
#                          https://acme.flappies.example.com
#   TENANT_ADMIN_EMAIL     Email for the tenant's first admin user
#   TENANT_ADMIN_PASSWORD  Initial password for that admin user
#
# Optional env vars:
#   TENANT_ADMIN_USERNAME  Defaults to the email
#
# NOTE: ZITADEL's HTTP API has evolved across versions — verify the exact
# request/response shapes below against the version your central instance
# runs (see https://zitadel.com/docs/apis) and adjust if needed. This script
# is meant to remove most of the manual console clicking described in
# docs/KUBERNETES.md, not to be a black box.
set -euo pipefail

for cmd in curl jq; do
  command -v "$cmd" >/dev/null || { echo "ERROR: $cmd is required" >&2; exit 1; }
done

: "${ZITADEL_URL:?Set ZITADEL_URL}"
: "${ZITADEL_IAM_PAT:?Set ZITADEL_IAM_PAT (instance admin PAT)}"
: "${TENANT_SLUG:?Set TENANT_SLUG}"
: "${TENANT_FRONTEND_URL:?Set TENANT_FRONTEND_URL}"
: "${TENANT_ADMIN_EMAIL:?Set TENANT_ADMIN_EMAIL}"
: "${TENANT_ADMIN_PASSWORD:?Set TENANT_ADMIN_PASSWORD}"
TENANT_ADMIN_USERNAME="${TENANT_ADMIN_USERNAME:-$TENANT_ADMIN_EMAIL}"

API="${ZITADEL_URL%/}"
AUTH=(-H "Authorization: Bearer ${ZITADEL_IAM_PAT}" -H "Content-Type: application/json")
if [[ -n "${ZITADEL_HOST_HEADER:-}" ]]; then
  AUTH+=(-H "Host: ${ZITADEL_HOST_HEADER}")
fi

call() {
  local method="$1" url="$2" body="${3:-}"
  local response status
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

echo "==> Creating Organization '${TENANT_SLUG}'..."
ORG_RESPONSE=$(call POST "${API}/v2/organizations" "$(jq -n --arg name "$TENANT_SLUG" '{name: $name}')")
ORG_ID=$(jq -r '.organizationId' <<<"$ORG_RESPONSE")
echo "    Organization ID: ${ORG_ID}"

ORG_AUTH=(-H "Authorization: Bearer ${ZITADEL_IAM_PAT}" -H "Content-Type: application/json" -H "x-zitadel-orgid: ${ORG_ID}")
if [[ -n "${ZITADEL_HOST_HEADER:-}" ]]; then
  ORG_AUTH+=(-H "Host: ${ZITADEL_HOST_HEADER}")
fi
call_org() {
  local method="$1" url="$2" body="${3:-}"
  local response status
  if [[ -n "$body" ]]; then
    response=$(curl -sS -w '\n%{http_code}' -X "$method" "${ORG_AUTH[@]}" "${url}" -d "$body")
  else
    response=$(curl -sS -w '\n%{http_code}' -X "$method" "${ORG_AUTH[@]}" "${url}")
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

echo "==> Creating Project 'flappies'..."
PROJECT_RESPONSE=$(call_org POST "${API}/management/v1/projects" '{"name":"flappies"}')
PROJECT_ID=$(jq -r '.id' <<<"$PROJECT_RESPONSE")
echo "    Project ID: ${PROJECT_ID}"

echo "==> Adding project roles (admin, manager, cashier)..."
for role in admin manager cashier; do
  call_org POST "${API}/management/v1/projects/${PROJECT_ID}/roles" \
    "$(jq -n --arg key "$role" --arg name "$role" '{roleKey: $key, displayName: $name}')" >/dev/null
done

echo "==> Creating OIDC application 'flappies'..."
REDIRECT_URI="${TENANT_FRONTEND_URL%/}/callback"
LOGOUT_URI="${TENANT_FRONTEND_URL%/}/"
APP_RESPONSE=$(call_org POST "${API}/management/v1/projects/${PROJECT_ID}/apps/oidc" "$(jq -n \
  --arg name "flappies" \
  --arg redirect "$REDIRECT_URI" \
  --arg logout "$LOGOUT_URI" \
  '{
    name: $name,
    redirectUris: [$redirect],
    postLogoutRedirectUris: [$logout],
    responseTypes: ["OIDC_RESPONSE_TYPE_CODE"],
    grantTypes: [
      "OIDC_GRANT_TYPE_AUTHORIZATION_CODE",
      "OIDC_GRANT_TYPE_REFRESH_TOKEN",
      "OIDC_GRANT_TYPE_TOKEN_EXCHANGE"
    ],
    appType: "OIDC_APP_TYPE_WEB",
    authMethodType: "OIDC_AUTH_METHOD_TYPE_BASIC",
    accessTokenType: "OIDC_TOKEN_TYPE_JWT"
  }')")
CLIENT_ID=$(jq -r '.clientId' <<<"$APP_RESPONSE")
CLIENT_SECRET=$(jq -r '.clientSecret' <<<"$APP_RESPONSE")
echo "    Client ID: ${CLIENT_ID}"

echo "==> Creating service (machine) user for impersonation..."
MACHINE_RESPONSE=$(call_org POST "${API}/management/v1/users/machine" "$(jq -n --arg name "flappies-service-${TENANT_SLUG}" \
  '{userName: $name, name: $name, description: "Flappies API service account", accessTokenType: "ACCESS_TOKEN_TYPE_JWT"}')")
MACHINE_ID=$(jq -r '.userId' <<<"$MACHINE_RESPONSE")
echo "    Machine user ID: ${MACHINE_ID}"

echo "==> Generating machine user client credentials..."
MACHINE_SECRET_RESPONSE=$(call_org PUT "${API}/management/v1/users/${MACHINE_ID}/secret" '{}')
IMPERSONATOR_CLIENT_ID=$(jq -r '.clientId' <<<"$MACHINE_SECRET_RESPONSE")
IMPERSONATOR_CLIENT_SECRET=$(jq -r '.clientSecret' <<<"$MACHINE_SECRET_RESPONSE")

echo "==> Generating machine user PAT (for Session/Management API calls)..."
PAT_RESPONSE=$(call_org POST "${API}/management/v1/users/${MACHINE_ID}/pats" '{}')
IMPERSONATOR_PAT=$(jq -r '.token' <<<"$PAT_RESPONSE")

echo "==> Enabling impersonation on the instance..."
imp_resp=$(curl -sS -w '\n%{http_code}' -X PUT "${AUTH[@]}" "${API}/admin/v1/policies/security" \
  -d '{"enableImpersonation": true}')
imp_status=$(tail -n1 <<<"$imp_resp")
if [[ "$imp_status" -ge 400 ]]; then
  echo "    WARNING: could not enable impersonation automatically (HTTP $imp_status) — enable it in Console → Instance → Security Settings." >&2
fi

echo "==> Granting IAM_LOGIN_CLIENT (instance-level) to the service user..."
login_resp=$(curl -sS -w '\n%{http_code}' -X POST "${AUTH[@]}" "${API}/admin/v1/members" \
  -d "$(jq -n --arg id "$MACHINE_ID" '{userId: $id, roles: ["IAM_LOGIN_CLIENT"]}')")
login_status=$(tail -n1 <<<"$login_resp")
if [[ "$login_status" -ge 400 ]]; then
  echo "    WARNING: could not grant IAM_LOGIN_CLIENT automatically (HTTP $login_status) — grant it manually (Console → Instance → Members)." >&2
fi

echo "==> Granting ORG_END_USER_IMPERSONATOR (org-level) to the service user..."
member_body=$(jq -n --arg id "$MACHINE_ID" '{userId: $id, roles: ["ORG_END_USER_IMPERSONATOR"]}')
member_resp=$(curl -sS -w '\n%{http_code}' -X POST "${ORG_AUTH[@]}" "${API}/management/v1/orgs/me/members" -d "$member_body")
member_status=$(tail -n1 <<<"$member_resp")
if [[ "$member_status" -ge 400 ]]; then
  echo "    WARNING: could not grant ORG_END_USER_IMPERSONATOR automatically (HTTP $member_status) — grant it manually (Console → Org → Members)." >&2
fi

echo "==> Creating tenant admin user '${TENANT_ADMIN_USERNAME}'..."
ADMIN_RESPONSE=$(call_org POST "${API}/v2/users/human" "$(jq -n \
  --arg username "$TENANT_ADMIN_USERNAME" \
  --arg email "$TENANT_ADMIN_EMAIL" \
  --arg password "$TENANT_ADMIN_PASSWORD" \
  '{
    username: $username,
    profile: { givenName: "Admin", familyName: "User", displayName: $username },
    email: { email: $email, isVerified: true },
    password: { password: $password, changeRequired: false }
  }')")
ADMIN_USER_ID=$(jq -r '.userId' <<<"$ADMIN_RESPONSE")
echo "    Admin user ID: ${ADMIN_USER_ID}"

echo "==> Granting the 'admin' app role to the tenant admin user..."
call_org POST "${API}/zitadel.authorization.v2.AuthorizationService/CreateAuthorization" "$(jq -n \
  --arg userId "$ADMIN_USER_ID" --arg projectId "$PROJECT_ID" --arg orgId "$ORG_ID" \
  '{userId: $userId, projectId: $projectId, organizationId: $orgId, roleKeys: ["admin"]}')" >/dev/null

cat <<SUMMARY

=============================================================================
Tenant '${TENANT_SLUG}' provisioned.

Paste these into the tenant's deployment (Helm secrets.* / Compose .env):

  ZITADEL_URL=${ZITADEL_URL}
  ZITADEL_ORG_ID=${ORG_ID}
  ZITADEL_PROJECT_ID=${PROJECT_ID}
  ZITADEL_CLIENT_ID=${CLIENT_ID}
  ZITADEL_CLIENT_SECRET=${CLIENT_SECRET}
  ZITADEL_AUDIENCE=${CLIENT_ID}
  ZITADEL_IMPERSONATOR_PAT=${IMPERSONATOR_PAT}
  ZITADEL_IMPERSONATOR_CLIENT_ID=${IMPERSONATOR_CLIENT_ID}
  ZITADEL_IMPERSONATOR_CLIENT_SECRET=${IMPERSONATOR_CLIENT_SECRET}
  TENANT_ID=${TENANT_SLUG}

Then link the tenant admin into the app database once it's deployed:
  ./deploy/scripts/bootstrap-app-admin.sh ${ADMIN_USER_ID} "${TENANT_ADMIN_USERNAME}" "${TENANT_ADMIN_EMAIL}"

The tenant admin can sign in with:
  Username: ${TENANT_ADMIN_USERNAME}
  Password: (the TENANT_ADMIN_PASSWORD you set)
=============================================================================
SUMMARY
