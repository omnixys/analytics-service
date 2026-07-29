#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: backup-postgres.sh <explicit-backup-directory>" >&2
  exit 64
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 64
fi

backup_dir="$1"
case "$backup_dir" in
  /|"$HOME"|".") echo "refusing unsafe backup directory: $backup_dir" >&2; exit 64 ;;
esac

mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_dir/analytics-$timestamp.dump"
manifest="$archive.sha256"

pg_dump --format=custom --no-owner --no-privileges --file="$archive" "$DATABASE_URL"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$archive" >"$manifest"
else
  shasum -a 256 "$archive" >"$manifest"
fi
echo "$archive"
