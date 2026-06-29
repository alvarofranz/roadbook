#!/usr/bin/env bash
# Apply pending SQL migrations into the local dev DB, tracked in a `_migrations` table so
# newly-added migration files are picked up automatically on every `ddev start` (not only
# on a brand-new DB). An EXISTING database with no tracking table yet is baselined once:
# its current migration files are recorded as applied WITHOUT being re-run (we assume a
# pre-tracking dev DB is already up to date). Run from the project root by the post-start hook.
set -e
mysql db -e "CREATE TABLE IF NOT EXISTS _migrations (file VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
# One-time baseline: tracking table empty but the schema already exists (users present).
if [ -z "$(mysql db -N -e 'SELECT 1 FROM _migrations LIMIT 1')" ] && mysql db -e 'SELECT 1 FROM users LIMIT 1' >/dev/null 2>&1; then
  for f in migrations/*.sql; do mysql db -e "INSERT IGNORE INTO _migrations (file) VALUES ('$(basename "$f")')"; done
  echo "migrations: baselined existing DB (current files recorded as applied, not re-run)"
fi
# Apply every migration not yet recorded (covers a fresh DB and any newly-added files).
for f in migrations/*.sql; do
  n=$(basename "$f")
  if [ -z "$(mysql db -N -e "SELECT 1 FROM _migrations WHERE file='$n'")" ]; then
    echo "applying $n"
    tr -d '\r' < "$f" | mysql db
    mysql db -e "INSERT IGNORE INTO _migrations (file) VALUES ('$n')"
  fi
done
