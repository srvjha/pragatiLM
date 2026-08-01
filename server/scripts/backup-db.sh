#!/usr/bin/env bash
#
# Backs up Postgres, which is the only thing here that cannot be rebuilt.
#
#   Redis holds jobs that are currently running and nothing else.
#   Qdrant holds vectors, which the app regenerates from the chunks in
#   Postgres whenever a source is re-indexed.
#   Postgres holds everything else: accounts, sources, the uploaded files
#   themselves, chats, citations and generated audio.
#
# So one dump of one database is the whole backup story.
#
# Usage
#   ./scripts/backup-db.sh                  # dump to ./backups
#   BACKUP_DIR=/srv/backups ./scripts/backup-db.sh
#   RCLONE_REMOTE=r2:dochat-backups ./scripts/backup-db.sh   # and push off the box
#
# On a server, run it from cron at 3am and keep the output:
#   0 3 * * * /opt/dochatlm/server/scripts/backup-db.sh >> /var/log/dochat-backup.log 2>&1
#
# A backup that lives only on the machine it is backing up protects you from
# deleting a table. It does not protect you from losing the machine, which is
# the failure that actually ends a product — so set RCLONE_REMOTE.

set -euo pipefail

CONTAINER="${CONTAINER:-notebook-rag-postgres}"
DB_NAME="${DB_NAME:-notebook_rag}"
DB_USER="${DB_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups}"
KEEP="${KEEP:-14}"
# An rclone remote and path, e.g. "r2:dochat-backups". Empty means local only.
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

# The smallest a real dump of this schema can plausibly be. A backup job that
# silently writes an empty file is worse than one that fails, because it fails
# on the day you need it rather than the day it broke.
MIN_BYTES="${MIN_BYTES:-2000}"

stamp=$(date -u +%Y%m%d-%H%M%S)
target="$BACKUP_DIR/${DB_NAME}-${stamp}.sql.gz"

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "backup: container '$CONTAINER' is not running" >&2
  exit 1
fi

echo "backup: dumping $DB_NAME from $CONTAINER"

# --clean --if-exists so the dump can be restored over an existing database
# without hand-dropping it first, which is exactly the state you are in when
# restoring in a hurry.
docker exec "$CONTAINER" pg_dump \
  --username "$DB_USER" \
  --dbname "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "$target"

size=$(wc -c < "$target" | tr -d ' ')

if [ "$size" -lt "$MIN_BYTES" ]; then
  echo "backup: dump is only ${size} bytes, refusing to keep it" >&2
  rm -f "$target"
  exit 1
fi

# Reading it back catches a truncated or corrupt archive now rather than
# during a restore, when it is the only copy you have.
if ! gzip -t "$target"; then
  echo "backup: archive did not verify, removing" >&2
  rm -f "$target"
  exit 1
fi

echo "backup: wrote $target ($(numfmt --to=iec "$size" 2>/dev/null || echo "${size} bytes"))"

if [ -n "$RCLONE_REMOTE" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "backup: RCLONE_REMOTE is set but rclone is not installed" >&2
    exit 1
  fi

  echo "backup: copying to $RCLONE_REMOTE"
  rclone copy "$target" "$RCLONE_REMOTE" --no-traverse
  echo "backup: off-box copy done"
else
  echo "backup: RCLONE_REMOTE is unset, so this copy only exists on this machine"
fi

# Old local dumps are pruned; whatever is off the box is governed by that
# provider's own lifecycle rules rather than by this script.
if [ "$KEEP" -gt 0 ]; then
  # shellcheck disable=SC2012
  ls -1t "$BACKUP_DIR"/${DB_NAME}-*.sql.gz 2>/dev/null \
    | tail -n +$((KEEP + 1)) \
    | while read -r old; do
        echo "backup: pruning $(basename "$old")"
        rm -f "$old"
      done
fi

echo "backup: ok"
