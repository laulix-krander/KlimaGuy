#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point at the lifecycle test database}"

./test/postgres/apply-repository-migrations.sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/postgres/catalog-evidence.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/postgres/lifecycle-proof.sql
