#!/bin/bash
# Morning Five - the daily email, host cron wrapper. Weekdays, 7:00 AM Central.
#
# Sends Ali the five most pressing tasks on his backlog, walked through, with the prompt for the
# one move worth making today, plus two attachments (the interactive Backlog Navigator board and a
# PDF of the report). Every send is recorded on Basecamp ticket 10501226498.
# Code: backend/src/scripts/sendMorningFive.js (sender), scripts/ataMorningFive.js (report),
# scripts/ataTriageBoard.js (board). Session CC-20261111-t8w3.
#
# HOW IT RUNS: the report scripts need the backend container (database credentials, /app/dist
# services), but they are not built into the image. So this stages them from the host's source
# checkout into the container in the REPO'S OWN LAYOUT, links node_modules, and runs the sender
# there. That is exactly how the 2026-11-11 test send ran.
#
# CRONTAB (installing it is a production change and was approved by Ali on 2026-11-12). Two UTC
# times cover both CST (13:00 UTC) and CDT (12:00 UTC); the Central-hour gate below lets exactly
# one of them through, so DST needs no edit:
#   5 12,13 * * 1-5  /opt/colaberry-accelerator/scripts/morning-five-daily.sh
#
# IDEMPOTENT: a lock on the host keyed on the Central date allows one send per day; a re-run after
# a send is a no-op. A failed run writes no lock, so a manual re-run is safe. flock prevents
# overlap. FAILURE: any staging or send error exits non-zero and is logged; the sender itself
# aborts before Mandrill if a report or the PDF fails, so no partial email is ever sent.
# Manual run, bypassing the time gate:  MORNING_FIVE_FORCE_HOUR=1 scripts/morning-five-daily.sh
# Verification without sending:        MORNING_FIVE_DRY=1 (builds everything, sends nothing, no lock)
# Stage from another checkout:         MORNING_FIVE_SRC=/path/to/tree (default: the deployed checkout)
set -o pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ROOT=/opt/colaberry-accelerator
SRC=${MORNING_FIVE_SRC:-$ROOT}
cd "$ROOT" || exit 1
mkdir -p "$ROOT/tmp"
LOG="$ROOT/tmp/morning-five.log"
exec >> "$LOG" 2>&1
echo "===== Morning Five $(date -u +%FT%TZ) ====="

exec 9>"$ROOT/tmp/morning-five.flock"
if ! flock -n 9; then echo "another run in progress; skipping"; exit 0; fi

DAY=$(TZ=America/Chicago date +%F)
DOW=$(TZ=America/Chicago date +%u)      # 1 = Monday ... 7 = Sunday
HOUR=$(TZ=America/Chicago date +%H)
if [ "$DOW" -gt 5 ]; then echo "weekend in Central ($DAY); skipping"; exit 0; fi
if [ "$HOUR" != "07" ] && [ -z "$MORNING_FIVE_FORCE_HOUR" ]; then echo "Central hour is $HOUR, not 07; skipping"; exit 0; fi
SENT="$ROOT/tmp/morning-five-sent-$DAY"
if [ -e "$SENT" ]; then echo "already sent for $DAY; skipping"; exit 0; fi

DC="docker compose -f docker-compose.production.yml"
CID=$($DC ps -q backend)
if [ -z "$CID" ]; then echo "BACKEND_CONTAINER_NOT_FOUND"; exit 1; fi

TAR=$(mktemp "$ROOT/tmp/morning-five.XXXXXX.tar")
tar -C "$SRC" -cf "$TAR" scripts/ataMorningFive.js scripts/ataTriageBoard.js \
  backend/src/scripts/sendMorningFive.js backend/src/scripts/lib/sendWithBcAttach.js \
  backend/src/scripts/lib/mandrillPreflight.js backend/src/scripts/lib/basecampToken.js \
  backend/src/scripts/lib/aliTaskAgent || { echo "STAGE_TAR_FAILED"; rm -f "$TAR"; exit 1; }
docker cp "$TAR" "$CID:/tmp/morning-five-stage.tar" || { echo "STAGE_COPY_FAILED"; rm -f "$TAR"; exit 1; }
rm -f "$TAR"
$DC exec -T backend sh -c 'rm -rf /tmp/mfrepo && mkdir -p /tmp/mfrepo && cd /tmp/mfrepo && tar -xf /tmp/morning-five-stage.tar && rm -f /tmp/morning-five-stage.tar && ln -s /app/node_modules /tmp/mfrepo/node_modules' \
  || { echo "STAGE_EXTRACT_FAILED"; exit 1; }

if [ -n "$MORNING_FIVE_DRY" ]; then
  $DC exec -T -w /app backend node /tmp/mfrepo/backend/src/scripts/sendMorningFive.js --dry-run
  rc=$?
else
  $DC exec -T -w /app backend node /tmp/mfrepo/backend/src/scripts/sendMorningFive.js
  rc=$?
  if [ $rc -eq 0 ]; then date -u +%FT%TZ > "$SENT"; fi
fi
echo "exit $rc"
exit $rc
