#!/bin/bash
# Task Prompt Worker - report-only digest, host cron wrapper.
#
# Sibling of ata-report-digest.sh. Resolves a fresh Basecamp token from CCPP (via
# the backend container's token provider), dumps Ali's assigned + active todos
# from the ops_bc_todos mirror, and runs runTaskPromptWorker.js in --report-only
# mode: it turns each AI-doable task into a ready-to-run Claude Code prompt and
# emails Ali the pack. It EXECUTES nothing and POSTS nothing to task tickets.
#
# Scheduled 3x/day (see crontab). Runs host-side from source, like ATA and the
# daily report suite. A flock prevents overlapping runs.
set -o pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ROOT=/opt/colaberry-accelerator
cd "$ROOT" || exit 1
mkdir -p "$ROOT/tmp"
LOG="$ROOT/tmp/task-prompt-worker.log"
exec >> "$LOG" 2>&1
echo "===== Task Prompt Worker $(date -u +%FT%TZ) ====="

DC="docker compose -f docker-compose.production.yml"

# Single-flight: never overlap runs.
exec 9>"$ROOT/tmp/task-prompt-worker.lock"
if ! flock -n 9; then echo "another run in progress; skipping"; exit 0; fi

# Fresh Basecamp token from CCPP (read the provider cache after a short delay,
# then hard-exit so an open mssql handle can't hang).
FRESH=$($DC exec -T backend node -e 'const bt=require("./dist/services/ops/basecampToken");bt.refreshBcToken().catch(()=>{});setTimeout(()=>{let t="";try{t=bt.getBcToken()}catch(e){}process.stdout.write(t);process.exit(0)},6000)' 2>/dev/null | tr -d "\r\n")
if [ -z "$FRESH" ]; then echo "TOKEN_RESOLVE_FAILED"; exit 1; fi

# Dump Ali's assigned + active todos from the mirror (with project names).
ROWS=$(mktemp "$ROOT/tmp/tpw_rows.XXXXXX.json")
$DC exec -T postgres psql -U accelerator -d accelerator_prod -tAc "select coalesce(json_agg(t),'[]') from (select t.bc_id,t.project_id,p.name as project_name,t.todolist_name,t.title,left(coalesce(t.description,''),800) as description,t.due_on::text as due_on,t.bc_app_url,t.urgency_score,t.bc_updated_at from ops_bc_todos t left join ops_bc_projects p on p.bc_id=t.project_id where t.assignee_ids @> '[\"17454835\"]'::jsonb and t.status='active' and (t.is_dismissed is false or t.is_dismissed is null)) t" 2>/dev/null > "$ROWS"
if [ ! -s "$ROWS" ]; then echo "ROWS_DUMP_FAILED"; rm -f "$ROWS"; exit 1; fi

env BASECAMP_ACCESS_TOKEN="$FRESH" node backend/src/scripts/runTaskPromptWorker.js --report-only --rows-file="$ROWS" --max=15
rc=$?
rm -f "$ROWS"
echo "exit $rc"
exit $rc
