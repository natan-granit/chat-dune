#!/usr/bin/env python3
"""
Seed address_mappings and starknet_selectors from research source files
via the Supabase PostgREST REST API (no psql required).

Usage:
  python3 scripts/seed-from-files.py [--url http://...] [--secret-key sb_secret_...]

Defaults:
  URL:        http://127.0.0.1:54321  (local Supabase)
  secret key: SUPABASE_SERVICE_ROLE_KEY env var, or auto-detected from `supabase status`
"""

import csv
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
from typing import Any

DEFAULT_URL = "http://127.0.0.1:54321"
BATCH_SIZE = 100


def get_secret_key_from_status() -> str | None:
    """Try to read the secret key from `supabase status` output."""
    try:
        out = subprocess.check_output(
            ["supabase", "status"], stderr=subprocess.DEVNULL, text=True
        )
        for line in out.splitlines():
            if "Secret" in line and "sb_secret_" in line:
                parts = line.split("│")
                for part in parts:
                    part = part.strip()
                    if part.startswith("sb_secret_"):
                        return part
    except Exception:
        pass
    return None


def resolve_secret_key(cli_key: str | None) -> str:
    if cli_key:
        return cli_key
    env_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if env_key:
        return env_key
    detected = get_secret_key_from_status()
    if detected:
        return detected
    print(
        "ERROR: Could not determine Supabase secret key.\n"
        "Pass it via --secret-key, or set SUPABASE_SERVICE_ROLE_KEY.",
        file=sys.stderr,
    )
    sys.exit(1)


def postgrest_upsert(
    base_url: str, secret_key: str, table: str, rows: list[dict[str, Any]]
) -> None:
    """POST a batch of rows to PostgREST with upsert (merge-duplicates)."""
    url = f"{base_url}/rest/v1/{table}"
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {secret_key}",
            "apikey": secret_key,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"PostgREST error {e.code} on {table}: {body}", file=sys.stderr)
        sys.exit(1)


def seed_address_mappings(base_url: str, secret_key: str, csv_path: str) -> None:
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows_csv = list(reader)

    rows: list[dict[str, Any]] = []
    for row in rows_csv:
        tags_raw = row.get("tags", "").strip().strip('"')
        tags = [t.strip() for t in tags_raw.split(",")] if tags_raw else None
        rows.append(
            {
                "workspace": "default",
                "address": row["address"],
                "chain": row["chain"],
                "name": row.get("name") or None,
                "entity": row.get("entity") or None,
                "category": row.get("category") or None,
                "tags": tags,
            }
        )

    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        postgrest_upsert(base_url, secret_key, "address_mappings", batch)
        print(f"  {min(i + BATCH_SIZE, total)}/{total} rows inserted")


def seed_starknet_selectors(base_url: str, secret_key: str, json_path: str) -> None:
    with open(json_path, encoding="utf-8") as f:
        entries = json.load(f)

    rows = [
        {
            "selector": e["selector"],
            "event_name": e["event_name"],
            "protocol": e.get("protocol") or None,
            "contract_addresses": e.get("contract_addresses") or [],
            "keys_layout": e.get("keys_layout") or [],
            "data_layout": e.get("data_layout") or [],
        }
        for e in entries
    ]

    postgrest_upsert(base_url, secret_key, "starknet_selectors", rows)
    print(f"  {len(rows)} rows inserted")


def main() -> None:
    base_url = DEFAULT_URL
    secret_key_arg = None

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i].startswith("--url="):
            base_url = args[i][len("--url="):]
        elif args[i] == "--url" and i + 1 < len(args):
            base_url = args[i + 1]
            i += 1
        elif args[i].startswith("--secret-key="):
            secret_key_arg = args[i][len("--secret-key="):]
        elif args[i] == "--secret-key" and i + 1 < len(args):
            secret_key_arg = args[i + 1]
            i += 1
        i += 1

    secret_key = resolve_secret_key(secret_key_arg)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    csv_path = os.path.join(project_dir, "research", "address-mappings-seed.csv")
    json_path = os.path.join(project_dir, "research", "starknet-selectors.json")

    print(f"Seeding address_mappings ({csv_path})...")
    seed_address_mappings(base_url, secret_key, csv_path)
    print("  Done.")

    print(f"Seeding starknet_selectors ({json_path})...")
    seed_starknet_selectors(base_url, secret_key, json_path)
    print("  Done.")


if __name__ == "__main__":
    main()
