#!/usr/bin/env bash
# Clean restart of the production stack (keeps database volumes).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "Stopping stack..."
"${COMPOSE[@]}" down

echo "Starting stack..."
exec "$ROOT/scripts/deploy-pull.sh"
