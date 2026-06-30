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

# Host-reachable DATABASE_URL. The backend container's DATABASE_URL points at the
# in-network host `postgres`, which the HOST cannot resolve - so host-run scripts
# that talk to Postgres (e.g. the TBI ai_events instrumentation in
# backend/src/scripts/lib/openaiInstrumented.js) would fail to connect. Resolve the
# accelerator-db container's bridge IP (reachable from the host) and swap it in.
# Best-effort: on any failure DATABASE_URL is left unchanged - the instrumentation
# is swallow-safe, so the worst case is simply that no event row is recorded, never
# a broken cron job. The IP is resolved fresh each tick, so container recreation is
# handled automatically. Scripts that don't use Postgres are unaffected either way.
if [ -n "${DATABASE_URL:-}" ]; then
  case "$DATABASE_URL" in
    *@postgres:*)
      DB_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' accelerator-db 2>/dev/null | awk '{print $1}') || true
      if [ -n "$DB_IP" ]; then
        export DATABASE_URL="${DATABASE_URL/@postgres:/@${DB_IP}:}"
      fi
      ;;
  esac
fi

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

# CB System identity preference (fail-closed). Jobs that MUST post as the CB
# System account (37708014) — the @CB inbound-dispatcher and the CB task runners
# — set CB_USE_SYSTEM_TOKEN=1 on their cron line. For those jobs we use ONLY the
# dedicated CB System token (kept fresh by refreshCbSystemToken.sh) and NEVER
# fall back to the CCPP/Ali token: posting as a real person is exactly the
# 2026-06-22 self-reply flood condition. If the CB System token is absent or
# stale, the job does not run (the dispatcher's own identity-halt is then just a
# second layer of the same guarantee). refreshCbSystemToken.sh asserts the cached
# token resolves to 37708014 before writing, so a 200 here is trustworthy.
CB_SYSTEM_TOKEN_CACHE=/opt/colaberry-accelerator/tmp/ops-engine/cb-system-token.cache
if [ "${CB_USE_SYSTEM_TOKEN:-}" = "1" ]; then
  if [ -f "$CB_SYSTEM_TOKEN_CACHE" ]; then
    export BASECAMP_ACCESS_TOKEN="$(cat "$CB_SYSTEM_TOKEN_CACHE" 2>/dev/null)"
  else
    export BASECAMP_ACCESS_TOKEN=""
  fi
  if probe_bc_token; then
    exec node "$@"
  fi
  echo "[cron-env-wrapper] CB System token missing/stale; refusing to run '$*' as a non-CB identity (fail-closed)" >&2
  exit 0
fi

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
