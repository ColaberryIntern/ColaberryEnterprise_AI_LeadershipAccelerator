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

# Pull env from running container, filter to vars we need.
# GMAIL_* was added for the student-unblock inbox watcher, which reads inbound
# mail out of Postgres but sends its replies through the Gmail API as
# ali@colaberry.com. Without these it starts, polls, classifies, and then fails
# at the send — which is the silent-no-op shape this list should never cause.
# Adding names here is additive: no existing job can be broken by it.
ENV_VARS=$(docker compose -f docker-compose.production.yml exec -T backend env 2>/dev/null | \
  grep -E "^(BASECAMP_ACCESS_TOKEN|MANDRILL_API_KEY|MANDRILL_USERNAME|OPENAI_API_KEY|TWILIO_ACCOUNT_SID|TWILIO_API_KEY_SID|TWILIO_API_KEY_SECRET|TWILIO_NUMBER|ALI_PHONE_NUMBER|MSSQL_HOST|MSSQL_DATABASE|MSSQL_USER|MSSQL_PASS|MSSQL_PORT|GOV_REPORT_RECIPIENT|DATABASE_URL|POSTGRES_URL|PG_HOST|PG_USER|PG_PASS|PG_DATABASE|PGHOST|PGUSER|PGPASSWORD|PGDATABASE|PGPORT|MS_GRAPH_CLIENT_ID|MS_GRAPH_REFRESH_TOKEN|GMAIL_CLIENT_ID|GMAIL_CLIENT_SECRET|GMAIL_REFRESH_TOKEN|GMAIL_ACCESS_TOKEN|GMAIL_SENDER_EMAIL|GMAIL_COLABERRY_ADDRESS)=" | \
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
#
# WHY THE MINT-ON-STALE BRANCH EXISTS. The daily 07:00 refreshCbSystemToken.sh
# asks the advisor for a token, and the advisor hands back the one it already
# holds whenever that token has more than its refresh buffer (300s) of life
# left. So the daily run can "refresh" a token with only hours remaining and
# declare DONE. Observed 2026-09-21: green refresh at 07:00 UTC, 401 on
# /my/profile.json at 10:30, the dispatcher auto-tripped its kill switch on the
# null identity, and every tick after that was refused here until a manual mint
# at 10:43 - three hours of silence and a hand re-enable, for a token that the
# advisor would have re-minted on request the moment it expired. The Ali-token
# path below has had the same mint-on-dead step since 2026-09-14; this gives the
# CB path its own, against its own store. It never touches CCPP or Ali's grant,
# and it stays fail-closed: refreshCbSystemToken.sh refuses to write anything
# that does not resolve to 37708014, and we still only run on a 200 probe.
CB_SYSTEM_TOKEN_CACHE=/opt/colaberry-accelerator/tmp/ops-engine/cb-system-token.cache
CB_MINT_LOCK=/opt/colaberry-accelerator/tmp/ops-engine/cb-system-mint.lock
CB_MINT_SCRIPT=/opt/colaberry-accelerator/scripts/refreshCbSystemToken.sh
read_cb_system_token() {
  if [ -f "$CB_SYSTEM_TOKEN_CACHE" ]; then
    export BASECAMP_ACCESS_TOKEN="$(cat "$CB_SYSTEM_TOKEN_CACHE" 2>/dev/null)"
  else
    export BASECAMP_ACCESS_TOKEN=""
  fi
}
if [ "${CB_USE_SYSTEM_TOKEN:-}" = "1" ]; then
  read_cb_system_token
  if probe_bc_token; then
    exec node "$@"
  fi
  # Stale or missing: mint a fresh CB System token under a lock (the dispatcher
  # and the CB task runners share this wrapper, so a burst of jobs on a dead
  # token would otherwise all mint at once), then re-read and re-probe. The
  # waiter re-probes after the lock rather than minting a second time.
  if [ -x "$CB_MINT_SCRIPT" ] && command -v flock >/dev/null 2>&1; then
    echo "[cron-env-wrapper] CB System token missing/stale; minting a fresh one" >&2
    mkdir -p "$(dirname "$CB_MINT_LOCK")"
    flock "$CB_MINT_LOCK" "$CB_MINT_SCRIPT" --commit >/dev/null 2>&1 || true
    read_cb_system_token
    if probe_bc_token; then
      echo "[cron-env-wrapper] minted a fresh CB System token; running '$*'" >&2
      exec node "$@"
    fi
  fi
  echo "[cron-env-wrapper] CB System token missing/stale and mint did not recover it; refusing to run '$*' as a non-CB identity (fail-closed)" >&2
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
        # 4. CCPP has the same dead token. Mint a new one.
        #
        # WHY THIS EXISTS. The daily 08:00 refresh asks the advisor for a token,
        # and the advisor returns the one it already holds whenever that token has
        # more than ACCESS_TOKEN_REFRESH_BUFFER_SEC (300s) of life left. So the
        # daily run can write a token with only hours remaining, declare DONE, and
        # leave every Basecamp consumer to die the moment it expires - with nothing
        # re-minting until 08:00 the next day.
        #
        # Observed 2026-09-14: token cached 08:02 after a green refresh, 401 "old
        # age" by 13:45, and the Monday intern delivery briefing failed all three
        # of its harvest retries and never sent. A manual mint at 13:58 fixed it
        # immediately, which is the whole proof that minting here recovers: once
        # the token is genuinely expired the advisor stops serving its cached copy
        # and exchanges the refresh_token for a real new one.
        #
        # flock because every cron job runs this wrapper: without it a burst of
        # jobs on a dead token would all mint at once and rewrite CCPP underneath
        # each other. The waiter re-probes after the lock rather than minting again.
        MINT_LOCK=/opt/colaberry-accelerator/tmp/ops-engine/bc-mint.lock
        MINT_SCRIPT=/opt/colaberry-accelerator/scripts/refreshBasecampTokenFromVault.sh
        if [ -x "$MINT_SCRIPT" ] && command -v flock >/dev/null 2>&1; then
          echo "[cron-env-wrapper] CCPP token also stale; minting a fresh one" >&2
          mkdir -p "$(dirname "$MINT_LOCK")"
          flock "$MINT_LOCK" "$MINT_SCRIPT" --commit >/dev/null 2>&1 || true
          # Re-read whatever the mint left in CCPP and probe it. Never cache a
          # token that has not answered a real API call.
          MINTED=$(node /opt/colaberry-accelerator/backend/src/scripts/lib/printBasecampToken.js 2>/dev/null)
          if [ -n "$MINTED" ]; then
            export BASECAMP_ACCESS_TOKEN="$MINTED"
            if probe_bc_token; then
              mkdir -p "$(dirname "$BC_TOKEN_CACHE")"
              TMP_CACHE="${BC_TOKEN_CACHE}.$$"
              printf '%s' "$MINTED" > "$TMP_CACHE" && chmod 600 "$TMP_CACHE" && mv -f "$TMP_CACHE" "$BC_TOKEN_CACHE"
              echo "[cron-env-wrapper] minted a fresh BC token, cached" >&2
            else
              echo "[cron-env-wrapper] WARN: freshly minted token still failing probe; downstream calls will 401" >&2
            fi
          else
            echo "[cron-env-wrapper] WARN: mint produced no token; downstream calls will 401" >&2
          fi
        else
          echo "[cron-env-wrapper] WARN: refreshed token still failing probe and no mint path available; downstream calls may 401" >&2
        fi
      fi
    else
      echo "[cron-env-wrapper] WARN: could not refetch BC token from CCPP; downstream calls will 401" >&2
    fi
  fi
fi

exec node "$@"
