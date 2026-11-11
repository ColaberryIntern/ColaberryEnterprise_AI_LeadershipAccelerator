#!/bin/bash
# C123: the weekly Open House funnel report, read-only.
#
#   bash scripts/reports/open-house-weekly/run.sh [since='YYYY-MM-DD HH:MM:SS+00'] [until='...'] [--no-mandrill]
#
# Run ON THE PROD HOST from /opt/colaberry-accelerator. Default window: the last 7 days (never before the 10 Nov launch),
# compared with the 7 days before it. Writes, on the host:
#   /tmp/open-house-weekly/snapshot.json   the numbers (people only; no names or addresses)
#   /tmp/open-house-weekly/report.html     the report
# Copy report.html off the host to read it (screenshots are added when rendering locally with --shots).
#
# Safety: the SQL runs in ONE transaction that is always rolled back, with a 60 s statement timeout and ON_ERROR_STOP;
# it creates TEMP tables only. Mandrill is read through the C120 script inside accelerator-backend (the API key is never
# printed; addresses never leave the containers). If Mandrill fails, the report still renders without the email panel.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
audit="$here/../../audits/open-house-funnel"
since="$(date -u -d '7 days ago' '+%Y-%m-%d %H:%M:%S+00')"
until="now"
mandrill=1
for a in "$@"; do
  case "$a" in
    since=*) since="${a#since=}" ;;
    until=*) until="${a#until=}" ;;
    --no-mandrill) mandrill=0 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done
out=/tmp/open-house-weekly
mkdir -p "$out"
rm -f "$out/snapshot.json" "$out/report.html"
work=/tmp/oh-weekly
recipients=/tmp/oh_weekly_recipients.txt

docker exec accelerator-db rm -rf "$work" "$recipients"
docker cp "$here" "accelerator-db:$work"
{
  echo 'BEGIN;'
  echo "SET LOCAL statement_timeout = '60s';"
  echo "\\i $work/collect.sql"
  echo 'ROLLBACK;'
} | docker exec -i accelerator-db sh -c \
  "psql -X -q -At -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 -v since='$since' -v until='$until' -v recipients_out=$recipients" \
  > "$out/db.json"
docker exec accelerator-db rm -rf "$work"

email='null'
if [ "$mandrill" = 1 ]; then
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  docker cp "accelerator-db:$recipients" "$tmp"
  docker cp "$tmp" "accelerator-backend:$recipients"
  docker cp "$audit/mandrillFunnel.js" accelerator-backend:/tmp/oh_weekly_mandrill.js
  mdate="$(docker exec accelerator-db sh -c "psql -X -At -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"SELECT to_char(greatest('$since'::timestamptz, '2026-11-10 21:10:03+00'::timestamptz), 'YYYY-MM-DD')\"")"
  if line="$(docker exec accelerator-backend node /tmp/oh_weekly_mandrill.js "$recipients" "$mdate" | grep '^SUMMARY ')"; then
    email="${line#SUMMARY }"
  else
    echo "WARN Mandrill read failed; rendering without the email panel" >&2
  fi
  docker exec accelerator-backend rm -f "$recipients" /tmp/oh_weekly_mandrill.js
fi
docker exec accelerator-db rm -f "$recipients"

# Merge and render inside accelerator-backend (it has node; the renderer has no dependencies).
docker exec accelerator-backend rm -rf "$work"
docker cp "$here" "accelerator-backend:$work"
docker cp "$out/db.json" "accelerator-backend:$work/db.json"
docker exec accelerator-backend node -e "
  const fs = require('fs'); const s = JSON.parse(fs.readFileSync('$work/db.json', 'utf8')); s.email = $email;
  fs.writeFileSync('$work/snapshot.json', JSON.stringify(s, null, 2));"
docker exec accelerator-backend node "$work/render.js" "$work/snapshot.json" "$work/report.html"
docker cp "accelerator-backend:$work/snapshot.json" "$out/snapshot.json"
docker cp "accelerator-backend:$work/report.html" "$out/report.html"
docker exec accelerator-backend rm -rf "$work"
rm -f "$out/db.json"
echo "DONE $out/report.html"
