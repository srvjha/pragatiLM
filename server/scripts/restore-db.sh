#!/usr/bin/env bash
#
# Restores a dump written by backup-db.sh.
#
#   ./scripts/restore-db.sh backups/notebook_rag-20260801-030000.sql.gz
#
# A backup nobody has ever restored is a hope, not a backup. Run this once
# against a throwaway database before you need it for real:
#
#   DB_NAME=notebook_rag_restore_test ./scripts/restore-db.sh <dump>
#
# After restoring, the vector store will be empty — Qdrant is not in this dump
# because it is derived. Re-index each source from the app and the vectors are
# rebuilt from the chunks that came back with the database.

set -euo pipefail

CONTAINER="${CONTAINER:-notebook-rag-postgres}"
DB_NAME="${DB_NAME:-notebook_rag}"
DB_USER="${DB_USER:-postgres}"

dump="${1:-}"

if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "usage: $0 <path-to-dump.sql.gz>" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "restore: container '$CONTAINER' is not running" >&2
  exit 1
fi

if ! gzip -t "$dump"; then
  echo "restore: '$dump' is not a valid gzip archive" >&2
  exit 1
fi

echo "restore: this will overwrite the contents of '$DB_NAME' on $CONTAINER"
read -r -p "restore: type the database name to confirm: " confirm

if [ "$confirm" != "$DB_NAME" ]; then
  echo "restore: cancelled" >&2
  exit 1
fi

# Created if it is missing, so this same script can restore onto a brand new
# machine where nothing but Postgres exists yet.
docker exec "$CONTAINER" psql --username "$DB_USER" --dbname postgres \
  -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 \
  || docker exec "$CONTAINER" createdb --username "$DB_USER" "$DB_NAME"

echo "restore: loading $dump"

# ON_ERROR_STOP so a failed restore exits non-zero instead of leaving a
# half-populated database that looks like it worked.
gunzip -c "$dump" \
  | docker exec -i "$CONTAINER" psql \
      --username "$DB_USER" \
      --dbname "$DB_NAME" \
      --set ON_ERROR_STOP=on \
      --quiet

echo "restore: done. Re-index the sources to rebuild the vector store."
