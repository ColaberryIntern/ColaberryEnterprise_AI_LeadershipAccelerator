#!/bin/bash
# C120: the Open House funnel report, read-only, every step with conversion rates.
#
#   bash scripts/audits/open-house-funnel/run.sh [since='YYYY-MM-DD HH:MM:SS+00']
#
# Run ON THE PROD HOST from /opt/colaberry-accelerator. Default window starts when the ad LP switched to /open-house
# (2026-11-10 21:10:03 UTC = 3:10 PM CST). The SQL runs in one transaction that is always rolled back, with a 60 s
# statement timeout and ON_ERROR_STOP. Step 5 (email opened/clicked) is not in our database, so it is read from Mandrill
# inside accelerator-backend; addresses are masked in the output and the API key is never printed.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
since="${1:-2026-11-10 21:10:03+00}"
since="${since#since=}"
work=/tmp/open-house-funnel
recipients=/tmp/oh_funnel_recipients.txt

docker exec accelerator-db rm -rf "$work" "$recipients"
docker cp "$here" "accelerator-db:$work"
{
  echo 'BEGIN;'
  echo "SET LOCAL statement_timeout = '60s';"
  echo "\\i $work/funnel.sql"
  echo 'ROLLBACK;'
} | docker exec -i accelerator-db sh -c \
  "psql -X -q -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -P pager=off -v ON_ERROR_STOP=1 -v since='$since' -v recipients_out=$recipients"

echo
echo "== step 5: welcome email delivered / opened / clicked, per Mandrill (search lags about 10 minutes) =="
local_copy="$(mktemp)"
trap 'rm -f "$local_copy"' EXIT
docker cp "accelerator-db:$recipients" "$local_copy"
docker exec accelerator-db rm -f "$recipients"
docker cp "$local_copy" "accelerator-backend:$recipients"
docker cp "$here/mandrillFunnel.js" accelerator-backend:/tmp/oh_mandrillFunnel.js
docker exec accelerator-backend node /tmp/oh_mandrillFunnel.js "$recipients" "${since%% *}"
docker exec accelerator-backend rm -f "$recipients" /tmp/oh_mandrillFunnel.js
