#!/usr/bin/env bash
#
# syncDevSchemaFromProd.sh — make the dev database SCHEMA-faithful to prod.
#
# Why: the app runs NO global sequelize.sync at boot, so a table (or column)
# exists on dev only if it has an ensure*Schema() hook or was seeded. Over time
# dev drifts behind prod and features "work on dev" then fail on prod (or vice
# versa). A faithful rehearsal environment is the cheapest insurance against that
# class of silent bug.
#
# What it does (SCHEMA only — NEVER copies row data, so no student PII reaches
# dev), in three passes:
#   1. missing ENUM types  -> CREATE TYPE
#   2. missing TABLES      -> schema-only pg_dump (indexes + constraints)
#   3. missing COLUMNS on tables that exist on BOTH -> ALTER TABLE ADD COLUMN
#      (this pass matters: table-level presence is NOT enough — a table can exist
#      on dev with a drifted/older column set. Missing this is how two wrong-shape
#      tables — student_tasks, community_posts — silently hid.)
# All inside one transaction.
#
# It does NOT fix a table whose existing columns are WRONG-shaped (e.g. an old
# story-driven student_tasks with no task_list_id). Adding columns can't undo a
# wrong base schema — that needs a manual rename-aside + recreate (see the
# repair pattern in project memory). A table showing many missing columns here is
# the signal that it needs that heavier repair.
#
# Safe by default: DRY-RUN unless you pass --apply. Reads prod read-only; writes
# only the dev database. Run it ON the VPS host (needs docker access), e.g.:
#
#   scripts/syncDevSchemaFromProd.sh            # show what WOULD change
#   scripts/syncDevSchemaFromProd.sh --apply    # create missing objects
#
# Overridable via env: PG_CONTAINER, PG_USER, PROD_DB, DEV_DB, EXCLUDE_REGEX.
# EXCLUDE_REGEX skips prod-only artifacts (default: *_legacy_* / *_backup_*).
#
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-accelerator-db}"
PG_USER="${PG_USER:-accelerator}"
PROD_DB="${PROD_DB:-accelerator_prod}"
DEV_DB="${DEV_DB:-accelerator_dev1}"
EXCLUDE_REGEX="${EXCLUDE_REGEX:-_legacy_|_backup_|_bak$}"
US=$'\x1f'   # unit-separator field delim (defaults can contain commas/pipes, never this)
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

pq() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" -tA -P pager=off "$@" 2>/dev/null | grep -vi 'collation version'; }

list_tables() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -tA -P pager=off -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;" 2>/dev/null | grep -vi collation | grep -v '^$' | sort; }
list_enums() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -tA -P pager=off -c \
  "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' ORDER BY 1;" 2>/dev/null | grep -vi collation | grep -v '^$' | sort; }
# table.column pairs, sorted — SAME source (information_schema) on both sides so the
# diff is apples-to-apples (mixing pg_catalog on one side and information_schema on
# the other yields false positives, since information_schema is privilege-filtered).
list_colpairs() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -tA -P pager=off -c \
  "SELECT table_name||'.'||column_name FROM information_schema.columns WHERE table_schema='public';" 2>/dev/null | grep -vi collation | grep -v '^$' | sort; }
# Exact ADD-COLUMN spec for ONE prod column: exacttype<US>notnull(NO=notnull)<US>default
prod_coldef() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" -tA -P pager=off -c \
  "SELECT format_type(a.atttypid,a.atttypmod) || chr(31) || (CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END) || chr(31) || coalesce(pg_get_expr(ad.adbin,ad.adrelid),'') \
   FROM pg_attribute a JOIN pg_class k ON k.oid=a.attrelid JOIN pg_namespace n ON n.oid=k.relnamespace \
   LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum \
   WHERE n.nspname='public' AND k.relname='$1' AND a.attname='$2' AND a.attnum>0;" 2>/dev/null | grep -vi collation | grep -v '^$'; }

echo "== schema parity: $PROD_DB -> $DEV_DB (container $PG_CONTAINER) =="

PROD_TABLES=$(list_tables "$PROD_DB"); DEV_TABLES=$(list_tables "$DEV_DB")
MISSING_TABLES=$(comm -23 <(printf '%s\n' "$PROD_TABLES") <(printf '%s\n' "$DEV_TABLES") | grep -vE "$EXCLUDE_REGEX" || true)
MISSING_ENUMS=$(comm -23 <(list_enums "$PROD_DB") <(list_enums "$DEV_DB") || true)

# Missing columns = prod colpairs minus dev colpairs (same source both sides), then
# keep only those whose table already exists on dev (a missing table's columns come
# with the table pass). Types/defaults for the small drift set are fetched per column.
MISSING_COLPAIRS=$(comm -23 <(list_colpairs "$PROD_DB") <(list_colpairs "$DEV_DB") | grep -vE "$EXCLUDE_REGEX" || true)
COL_ALTERS=""; COL_REPORT=""; WARNINGS=""
while IFS= read -r tc; do
  [ -z "${tc:-}" ] && continue
  t="${tc%%.*}"; c="${tc#*.}"
  printf '%s\n' "$DEV_TABLES" | grep -qxF "$t" || continue          # column of a missing table -> table pass
  IFS="$US" read -r typ nn def <<< "$(prod_coldef "$t" "$c")"
  [ -z "${typ:-}" ] && continue                                     # defensive: couldn't resolve
  stmt="ALTER TABLE public.\"$t\" ADD COLUMN IF NOT EXISTS \"$c\" $typ"
  if [ "$nn" = "NO" ]; then                                         # NOT NULL on prod
    if [ -n "$def" ]; then stmt="$stmt NOT NULL DEFAULT $def"
    else WARNINGS+="  ! $t.$c is NOT NULL on prod with no default -> added NULLABLE (backfill+enforce manually)"$'\n'; fi
  elif [ -n "$def" ]; then stmt="$stmt DEFAULT $def"; fi
  COL_ALTERS+="$stmt;"$'\n'
  COL_REPORT+="  $t.$c ($typ)"$'\n'
done <<< "$MISSING_COLPAIRS"

if [ -z "$MISSING_TABLES" ] && [ -z "$MISSING_ENUMS" ] && [ -z "$COL_ALTERS" ]; then
  echo "dev is already schema-faithful to prod (tables, enums, and columns). Nothing to do."
  exit 0
fi

echo "-- missing enum types --"; echo "${MISSING_ENUMS:-(none)}"
echo "-- missing tables --";     echo "${MISSING_TABLES:-(none)}"
echo "-- missing columns (drift on existing tables) --"; echo "${COL_REPORT:-(none)}"
[ -n "$WARNINGS" ] && { echo "-- warnings --"; printf '%s' "$WARNINGS"; }

# Build the apply SQL: enums, then table schema dump, then column ALTERs.
APPLY_SQL=""
if [ -n "$MISSING_ENUMS" ]; then
  while IFS= read -r ty; do [ -z "$ty" ] && continue
    APPLY_SQL+=$(pq -c "SELECT 'CREATE TYPE public.' || quote_ident('$ty') || ' AS ENUM (' || string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) || ');' FROM pg_enum e WHERE e.enumtypid = 'public.$ty'::regtype;")$'\n'
  done <<< "$MISSING_ENUMS"
fi
if [ -n "$MISSING_TABLES" ]; then
  TFLAGS=""; while IFS= read -r t; do [ -n "$t" ] && TFLAGS+=" -t public.$t"; done <<< "$MISSING_TABLES"
  APPLY_SQL+=$(docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PROD_DB" --schema-only --no-owner --no-privileges $TFLAGS 2>/dev/null | grep -vi 'collation version')$'\n'
fi
APPLY_SQL+="$COL_ALTERS"

if [ "$APPLY" -eq 0 ]; then
  echo; echo "DRY-RUN: re-run with --apply to create the above on $DEV_DB (single transaction)."
  exit 0
fi

echo; echo "Applying to $DEV_DB (single transaction, ON_ERROR_STOP)..."
printf '%s' "$APPLY_SQL" | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$DEV_DB" --single-transaction -v ON_ERROR_STOP=1 -q 2>&1 | grep -viE 'collation version|^HINT|^DETAIL' || true
echo "Done. Re-run a dry-run to confirm 'already schema-faithful'."
