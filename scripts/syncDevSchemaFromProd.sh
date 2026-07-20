#!/usr/bin/env bash
#
# syncDevSchemaFromProd.sh — make the dev database SCHEMA-faithful to prod.
#
# Why: the app runs NO global sequelize.sync at boot, so a table exists on dev
# only if it has an ensure*Schema() hook or was seeded manually. Over time dev
# drifts behind prod, and features "work on dev" only to fail on prod (or vice
# versa) against tables the other environment lacks. A faithful rehearsal
# environment is the cheapest insurance against that class of silent bug.
#
# What it does (schema only — NEVER copies row data, so no student PII reaches
# dev): finds every enum type and table that prod has and dev lacks, then creates
# the missing enums and CREATE-TABLEs the missing tables (with their indexes and
# constraints) on dev, inside one transaction.
#
# Safe by default: DRY-RUN unless you pass --apply. Reads prod read-only; writes
# only to the dev database. Run it ON the VPS host (needs docker access to the
# shared Postgres container), e.g.:
#
#   scripts/syncDevSchemaFromProd.sh            # show what WOULD change
#   scripts/syncDevSchemaFromProd.sh --apply    # actually create missing objects
#
# Overridable via env: PG_CONTAINER, PG_USER, PROD_DB, DEV_DB, EXCLUDE_REGEX.
# EXCLUDE_REGEX skips prod-only artifacts (default: repair/backup leftovers like
# *_legacy_* and *_backup_*) so they are not recreated on dev.
#
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-accelerator-db}"
PG_USER="${PG_USER:-accelerator}"
PROD_DB="${PROD_DB:-accelerator_prod}"
DEV_DB="${DEV_DB:-accelerator_dev1}"
EXCLUDE_REGEX="${EXCLUDE_REGEX:-_legacy_|_backup_|_bak$}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

# psql on prod (read-only queries) and dev (target). -q quiet, tuples-only where asked.
pq() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" "$@" 2>/dev/null | grep -vi 'collation version'; }
dq() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$DEV_DB"  "$@" 2>/dev/null | grep -vi 'collation version'; }

list_tables() { local db="$1"; docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$db" -tAc \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;" 2>/dev/null | grep -vi collation | grep -v '^$' | sort; }
list_enums() { local db="$1"; docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$db" -tAc \
  "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' ORDER BY 1;" 2>/dev/null | grep -vi collation | grep -v '^$' | sort; }

echo "== schema parity: $PROD_DB -> $DEV_DB (container $PG_CONTAINER) =="

# 1) Missing tables (prod minus dev), less excluded prod-only artifacts.
MISSING_TABLES=$(comm -23 <(list_tables "$PROD_DB") <(list_tables "$DEV_DB") | grep -vE "$EXCLUDE_REGEX" || true)
# 2) Missing enum types (prod minus dev).
MISSING_ENUMS=$(comm -23 <(list_enums "$PROD_DB") <(list_enums "$DEV_DB") || true)

if [ -z "$MISSING_TABLES" ] && [ -z "$MISSING_ENUMS" ]; then
  echo "dev is already schema-faithful to prod. Nothing to do."
  exit 0
fi

echo "-- missing enum types --"; echo "${MISSING_ENUMS:-(none)}"
echo "-- missing tables --";     echo "${MISSING_TABLES:-(none)}"

# Build the apply SQL: CREATE TYPE for missing enums, then a schema-only pg_dump of the missing tables.
APPLY_SQL=""
if [ -n "$MISSING_ENUMS" ]; then
  while IFS= read -r ty; do
    [ -z "$ty" ] && continue
    stmt=$(pq -tAc "SELECT 'CREATE TYPE public.' || quote_ident('$ty') || ' AS ENUM (' || string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) || ');' FROM pg_enum e WHERE e.enumtypid = 'public.$ty'::regtype;")
    APPLY_SQL+="$stmt"$'\n'
  done <<< "$MISSING_ENUMS"
fi
if [ -n "$MISSING_TABLES" ]; then
  TFLAGS=""; while IFS= read -r t; do [ -n "$t" ] && TFLAGS+=" -t public.$t"; done <<< "$MISSING_TABLES"
  DUMP=$(docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PROD_DB" --schema-only --no-owner --no-privileges $TFLAGS 2>/dev/null | grep -vi 'collation version')
  APPLY_SQL+="$DUMP"$'\n'
fi

if [ "$APPLY" -eq 0 ]; then
  echo
  echo "DRY-RUN: re-run with --apply to create the above on $DEV_DB (single transaction)."
  exit 0
fi

echo
echo "Applying to $DEV_DB (single transaction, ON_ERROR_STOP)..."
printf '%s' "$APPLY_SQL" | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$DEV_DB" --single-transaction -v ON_ERROR_STOP=1 -q 2>&1 | grep -viE 'collation version|^HINT|^DETAIL' || true
echo "Done. Verify with a fresh dry-run (should report 'already schema-faithful')."
