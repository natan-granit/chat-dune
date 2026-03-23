#!/usr/bin/env bash
set -euo pipefail

OUTPUT_PATH="frontend/src/lib/db/types.ts"

echo "Generating TypeScript types from local Supabase schema..."

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_PATH")"

supabase gen types typescript --local > "$OUTPUT_PATH"

echo "Types written to $OUTPUT_PATH"
