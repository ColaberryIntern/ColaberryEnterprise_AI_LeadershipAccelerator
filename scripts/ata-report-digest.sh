#!/bin/bash
# Ali Task Agent - report-only digest, host cron wrapper.
#
# Resolves a fresh Basecamp token from CCPP (via the backend container's token
# provider), dumps Ali's assigned + active todos from the ops_bc_todos mirror,
# and runs runAliTaskAgent.js in --report-only mode: it emails Ali the filtered
# priority digest (todos he commented on in the last 30 days, ranked by urgency)
# and attaches the HTML to his home-base todo. It posts to NO other tickets.
#
# Scheduled 3x/day (see crontab). Runs host-side from source, like the daily
# report suite - the Postgres mirror is reached via `docker compose exec postgres`
# because it is not published to the host, and the fed rows-file lets the script
# run outside the compose network.
#
# Idempotent + safe to re-run: each run is a fresh digest (distinct runId), and a
# flock prevents overlapping runs. On any resolve/dump failure it exits non-zero
# without sending a partial digest.
set -o pipefail
# cron runs with a minimal PATH; pin the standard locations so node/docker/flock
# resolve the same as an interactive shell (this stack has a history of silent
# cron failures from a bare environment).
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ROOT=/opt/colaberry-accelerator
cd "$ROOT" || exit 1
mkdir -p "$ROOT/tmp"
LOG="$ROOT/tmp/ata-digest.log"
exec >> "$LOG" 2>&1
echo "===== ATA digest $(date -u +%FT%TZ) ====="

DC="docker compose -f docker-compose.production.yml"

# Single-flight: never overlap runs.
exec 9>"$ROOT/tmp/ata-digest.lock"
if ! flock -n 9; then echo "another run in progress; skipping"; exit 0; fi

# Fresh Basecamp token from CCPP (the provider caches it synchronously; we read
# the cache after a short delay and hard-exit so an open mssql handle can't hang).
FRESH=$($DC exec -T backend node -e 'const bt=require("./dist/services/ops/basecampToken");bt.refreshBcToken().catch(()=>{});setTimeout(()=>{let t="";try{t=bt.getBcToken()}catch(e){}process.stdout.write(t);process.exit(0)},6000)' 2>/dev/null | tr -d "\r\n")
if [ -z "$FRESH" ]; then echo "TOKEN_RESOLVE_FAILED"; exit 1; fi

# Dump Ali's assigned + active todos from the mirror (with project names).
ROWS=$(mktemp "$ROOT/tmp/ata_rows.XXXXXX.json")
$DC exec -T postgres psql -U accelerator -d accelerator_prod -tAc "select coalesce(json_agg(t),'[]') from (select t.bc_id,t.project_id,p.name as project_name,t.todolist_name,t.title,left(coalesce(t.description,''),800) as description,t.due_on::text as due_on,t.bc_app_url,t.urgency_score,t.bc_updated_at from ops_bc_todos t left join ops_bc_projects p on p.bc_id=t.project_id where t.assignee_ids @> '[\"17454835\"]'::jsonb and t.status='active' and (t.is_dismissed is false or t.is_dismissed is null)) t" 2>/dev/null > "$ROWS"
if [ ! -s "$ROWS" ]; then echo "ROWS_DUMP_FAILED"; rm -f "$ROWS"; exit 1; fi

env BASECAMP_ACCESS_TOKEN="$FRESH" node backend/src/scripts/runAliTaskAgent.js --report-only --rows-file="$ROWS" --max=15
rc=$?
rm -f "$ROWS"
echo "exit $rc"
exit $rc
