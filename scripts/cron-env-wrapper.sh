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

# Token resolution order, cheapest first:
#   1. Container env token (from the eval above).
#   2. File-cached last-known-good token (avoids a CCPP roundtrip every tick).
#   3. Refetch from CCPP.Basecamp_AuthInfo, then re-cache.
# The backend container's token is baked at deploy time and goes stale on the
# 2-week BC rotation, so in steady state step 1 fails and step 2 serves every
# tick with a single extra probe (no CCPP query). Before this cache the wrapper
# hit CCPP ~480x/day. The probe is authoritative: a cached token that has since
# rotated fails the probe and falls through to a single CCPP refetch + re-cache.
BC_TOKEN_CACHE=/opt/colaberry-accelerator/tmp/ops-engine/bc-token.cache

if ! probe_bc_token; then
  # 2. Try the file cache.
  if [ -f "$BC_TOKEN_CACHE" ]; then
    CACHED=$(cat "$BC_TOKEN_CACHE" 2>/dev/null)
    if [ -n "$CACHED" ]; then export BASECAMP_ACCESS_TOKEN="$CACHED"; fi
  fi

  if probe_bc_token; then
    echo "[cron-env-wrapper] using cached BC token (container token stale)" >&2
  else
    # 3. Refetch from CCPP and re-cache atomically.
    echo "[cron-env-wrapper] BC token stale (container+cache); refetching from CCPP" >&2
    FRESH=$(node /opt/colaberry-accelerator/backend/src/scripts/lib/printBasecampToken.js 2>/dev/null)
    if [ -n "$FRESH" ]; then
      export BASECAMP_ACCESS_TOKEN="$FRESH"
      if probe_bc_token; then
        mkdir -p "$(dirname "$BC_TOKEN_CACHE")"
        TMP_CACHE="${BC_TOKEN_CACHE}.$$"
        printf '%s' "$FRESH" > "$TMP_CACHE" && chmod 600 "$TMP_CACHE" && mv -f "$TMP_CACHE" "$BC_TOKEN_CACHE"
        echo "[cron-env-wrapper] refreshed BC token from CCPP, cached" >&2
      else
        echo "[cron-env-wrapper] WARN: refreshed token still failing probe; downstream calls may 401" >&2
      fi
    else
      echo "[cron-env-wrapper] WARN: could not refetch BC token from CCPP; downstream calls will 401" >&2
    fi
  fi
fi

exec node "$@"
