#!/usr/bin/env bash
# Quick diagnostics for the production stack on the VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "=== Container status ==="
"${COMPOSE[@]}" ps -a

echo ""
echo "=== Port checks (from this host) ==="
for spec in "3002:frontend" "3001:api" "8080:zitadel"; do
  port="${spec%%:*}"
  name="${spec##*:}"
  if curl -fsS -o /dev/null -m 3 "http://127.0.0.1:${port}/" 2>/dev/null \
    || curl -fsS -o /dev/null -m 3 "http://127.0.0.1:${port}/health" 2>/dev/null \
    || curl -fsS -o /dev/null -m 3 "http://127.0.0.1:${port}/debug/ready" 2>/dev/null; then
    echo "  OK  ${name} responds on port ${port}"
  else
    echo "  FAIL ${name} not responding on port ${port}"
  fi
done

echo ""
echo "=== Recent ZITADEL logs (last 30 lines) ==="
docker logs kassa_zitadel --tail 30 2>&1 || echo "  (container not found)"

echo ""
echo "=== Recent API logs (last 15 lines) ==="
docker logs kassa_api --tail 15 2>&1 || echo "  (container not found)"

echo ""
echo "=== App database users ==="
docker exec kassa_postgres psql -U kassa -d kassasysteem -c \
  'SELECT id, username, email, keycloak_id FROM "user";' 2>&1 || echo "  (postgres not reachable)"

echo ""
echo "Tips:"
echo "  - ZITADEL can take 1–3 minutes to become ready on first boot."
echo "  - If kassa_zitadel is Restarting/Exited, check: docker logs kassa_zitadel"
echo "  - 1 GB RAM may OOM-kill ZITADEL; add Proxmox swap for the CT."
echo "  - App login needs a row in the app DB; run: ./deploy/scripts/bootstrap-app-admin.sh"
