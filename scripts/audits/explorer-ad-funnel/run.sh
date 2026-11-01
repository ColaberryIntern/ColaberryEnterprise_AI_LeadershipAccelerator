#!/bin/bash
# Run one Explorer ad-funnel audit query file against production, read-only.
#
#   bash scripts/audits/explorer-ad-funnel/run.sh funnel|behavior|cutover|returnpath [since=YYYY-MM-DD] [cutover='YYYY-MM-DD HH:MM:SS+00']
#
# Run ON THE PROD HOST from /opt/colaberry-accelerator. Everything happens inside one transaction that is always
# rolled back (the temp views vanish with it), with a 60 s statement timeout, and ON_ERROR_STOP so a broken query
# fails loudly instead of printing a partial result that reads as complete.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
which="${1:?usage: run.sh funnel|behavior|cutover|returnpath [since=...] [cutover=...]}"; shift
[ -f "$here/$which.sql" ] || { echo "no such query file: $which.sql" >&2; exit 2; }

vars=()
for kv in "$@"; do vars+=(-v "$kv"); done

work=/tmp/explorer-ad-funnel
docker exec accelerator-db rm -rf "$work"
docker cp "$here" "accelerator-db:$work"
{
  echo 'BEGIN;'
  echo "SET LOCAL statement_timeout = '60s';"
  echo "\\i $work/base.sql"
  echo "\\i $work/$which.sql"
  echo 'ROLLBACK;'
} | docker exec -i accelerator-db sh -c \
  'psql -X -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -v ON_ERROR_STOP=1 '"${vars[*]:-}"
