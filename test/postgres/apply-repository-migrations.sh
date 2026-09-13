#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point at the fresh lifecycle test database}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/postgres/bootstrap-supabase.sql

# These three migrations contain only Supabase-hosted pg_cron/pg_net scheduling
# (and, for first contact, recovery discovery). Stock postgres:16.4 does not ship
# those extensions. They do not define or replace any authority exercised by this
# proof. Every other repository migration is replayed byte-for-byte in order.
readonly skipped=(
  202609020004_productive_conversation_cycle_recovery.sql
  202609030002_productive_whatsapp_delivery_recovery.sql
  202609040003_productive_first_contact_recovery.sql
)

should_skip() {
  local candidate=$1
  local item
  for item in "${skipped[@]}"; do
    [[ "$candidate" == "$item" ]] && return 0
  done
  return 1
}

while IFS= read -r migration; do
  filename=$(basename "$migration")
  if should_skip "$filename"; then
    printf 'SKIP platform scheduler migration: %s\n' "$filename"
    continue
  fi
  printf 'APPLY %s\n' "$filename"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort)
