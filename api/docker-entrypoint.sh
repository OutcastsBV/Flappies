#!/bin/sh
set -e
echo "Running database migrations..."
node scripts/migrate.js
echo "Starting API..."
exec node server.js
