#!/bin/bash
# Cron env wrapper - pulls env from running backend container, runs node script.
# Also provides static fallbacks for tokens that aren't in the backend container env.
#
# Deployment: copy to /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh on
# the VPS. The crontab references the VPS path; this file in the repo is the
# tracked source of truth.
#
# Token health: validates BASECAMP_ACCESS_TOKEN with a real API call before use,
# refetching from CCPP.Basecamp_AuthInfo if the container token is stale/expired.
# Root cause for the 2026-06-09 audit: the container env held a stale token that
# returned 401 on every BC endpoint, but the original `if [ -z "$TOKEN" ]` guard
# only caught EMPTY, not INVALID. Without the probe, downstream scripts (tracker,
# nudger, reinstatement, reporting) would silently return 0 rows or fail.
set -e
cd /opt/colaberry-accelerator

# Pull env from running container, filter to vars we need
ENV_VARS=$(docker compose -f docker-compose.production.yml exec -T backend env 2>/dev/null | \
  grep -E "^(BASECAMP_ACCESS_TOKEN|MANDRILL_API_KEY|MANDRILL_USERNAME|OPENAI_API_KEY|TWILIO_ACCOUNT_SID|TWILIO_API_KEY_SID|TWILIO_API_KEY_SECRET|TWILIO_NUMBER|ALI_PHONE_NUMBER|MSSQL_HOST|MSSQL_DATABASE|MSSQL_USER|MSSQL_PASS|MSSQL_PORT|GOV_REPORT_RECIPIENT|DATABASE_URL|POSTGRES_URL|PG_HOST|PG_USER|PG_PASS|PG_DATABASE|PGHOST|PGUSER|PGPASSWORD|PGDATABASE|PGPORT)=" | \
  sed "s/^/export /")

eval "$ENV_VARS"

# Token health probe: if BASECAMP_ACCESS_TOKEN is missing OR returns non-200 on
# a real BC API call, refetch from CCPP. /3945211/projects.json is the canonical
# lightweight probe — any token with account access returns 200; stale/rotated
# tokens return 401. (BC3 has no /authorization.json endpoint.)
probe_bc_token() {
  if [ -z "$BASECAMP_ACCESS_TOKEN" ]; then
    return 1
  fi
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $BASECAMP_ACCESS_TOKEN" \
    -H "User-Agent: Colaberry CronEnvProbe" \
    --max-time 10 \
    https://3.basecampapi.com/3945211/projects.json 2>/dev/null)
  [ "$code" = "200" ]
}

if ! probe_bc_token; then
  echo "[cron-env-wrapper] BC token missing or stale (probe failed); refetching from CCPP" >&2
  FRESH=$(node /opt/colaberry-accelerator/backend/src/scripts/lib/printBasecampToken.js 2>/dev/null)
  if [ -n "$FRESH" ]; then
    export BASECAMP_ACCESS_TOKEN="$FRESH"
    if probe_bc_token; then
      echo "[cron-env-wrapper] refreshed BC token verified ok" >&2
    else
      echo "[cron-env-wrapper] WARN: refreshed token still failing probe; downstream calls may 401" >&2
    fi
  else
    echo "[cron-env-wrapper] WARN: could not refetch BC token from CCPP; downstream calls will 401" >&2
  fi
fi

exec node "$@"
