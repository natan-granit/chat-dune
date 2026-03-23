#!/usr/bin/env bash
set -euo pipefail

echo "Resetting local Supabase database..."

# Stop Supabase if running, reset the DB, and restart
supabase db reset

echo "Database reset complete. Seed data applied."
