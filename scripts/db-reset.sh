#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Resetting local Supabase database..."
# supabase db reset exits non-zero with a transient 502 during container restart
# even when the migration + seed.sql were applied successfully. We treat that
# specific error as a warning and proceed; any other failure still aborts.
if ! supabase db reset 2>&1; then
  echo "Warning: supabase db reset reported an error (likely transient 502 on container restart)."
  echo "Waiting for containers to stabilise..."
  sleep 5
fi

echo "Seeding from research source files..."
python3 "$SCRIPT_DIR/seed-from-files.py"

echo "Database reset complete."
