#!/bin/sh
set -e

for migration in \
  db_init.sql \
  db_patch_1.sql \
  db_patch_2.sql \
  db_patch_3.sql \
  db_patch_4.sql \
  db_patch_5.sql \
  db_patch_6.sql \
  db_patch_7.sql \
  db_patch_8.sql
do
  echo "Running migration: $migration"
  psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    -f "/migrations/$migration"
done

echo "App database migrations complete."
