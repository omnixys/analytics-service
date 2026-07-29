#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_RESTORE_DRILL:-}" != "true" ]]; then
  echo "set ALLOW_RESTORE_DRILL=true for an isolated disposable database" >&2
  exit 64
fi
if [[ -z "${RESTORE_DATABASE_URL:-}" || $# -ne 1 ]]; then
  echo "RESTORE_DATABASE_URL and one dump path are required" >&2
  exit 64
fi

archive="$1"
if [[ ! -f "$archive" || ! -f "$archive.sha256" ]]; then
  echo "dump and checksum manifest are required" >&2
  exit 66
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check "$archive.sha256"
else
  shasum -a 256 --check "$archive.sha256"
fi

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --dbname="$RESTORE_DATABASE_URL" \
  "$archive"

psql "$RESTORE_DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --command='SELECT count(*) AS analytics_tables FROM information_schema.tables WHERE table_schema = '\''analytics'\'';'
