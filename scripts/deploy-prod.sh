#!/usr/bin/env bash
#
# deploy-prod.sh — serialise production deploys, and prove the result.
#
# WHY THIS EXISTS
#
# On 2026-08-28 a production deploy raced another session's, exited 1 on a
# container-naming collision, and left `accelerator-backend` in `Created` state —
# not running — for about four minutes. The site returned 200 the whole time,
# because nginx serves the static frontend without the backend, so from outside it
# looked healthy while every API call failed.
#
# That was the SIXTH concurrent-deploy collision in a single session. Each time,
# the deploying session had checked for a running deploy first and found none —
# but a check is a snapshot, and another deploy can start between the check and
# the build. Waiting-and-looking is not a control. A lock is.
#
# TWO THINGS THIS SCRIPT DOES THAT A BARE COMPOSE COMMAND DOES NOT
#
#   1. Holds an exclusive flock for the whole deploy, so two deploys cannot
#      interleave no matter how they are launched.
#
#   2. Verifies the containers are actually RUNNING afterwards. The incident was
#      not caught by the exit code alone in previous deploys — a pipe through
#      `tail` had masked it once before — and it would not have been caught by the
#      site responding either. The only honest check is: did the thing come up.
#
# It also refuses to build from a dirty tree, because a dirty tree silently
# rebuilds stale code, and confirms HEAD matches origin/main.
#
# USAGE
#   ./scripts/deploy-prod.sh                 # deploy backend + nginx (the usual)
#   ./scripts/deploy-prod.sh backend         # one service
#   ./scripts/deploy-prod.sh backend nginx
#   LOCK_WAIT=900 ./scripts/deploy-prod.sh   # wait longer for a busy box
#   SKIP_PULL=1 ./scripts/deploy-prod.sh     # deploy what is already checked out
#
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/colaberry-accelerator}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
LOCK_FILE="${LOCK_FILE:-/var/lock/colaberry-deploy.lock}"
# Long enough to queue behind a real build, short enough to fail rather than hang
# forever if a lock is somehow orphaned.
LOCK_WAIT="${LOCK_WAIT:-600}"
SERVICES=("$@")
if [ ${#SERVICES[@]} -eq 0 ]; then
  SERVICES=(backend nginx)
fi

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] FAILED: %s\n' "$*" >&2; exit 1; }

command -v flock >/dev/null 2>&1 || fail "flock not available; cannot serialise deploys"
cd "$STACK_DIR" || fail "stack directory not found: $STACK_DIR"

# ---------------------------------------------------------------------------
# The lock. Everything below runs while holding it.
# ---------------------------------------------------------------------------
exec 9>"$LOCK_FILE" || fail "cannot open lock file $LOCK_FILE"

if ! flock -w "$LOCK_WAIT" -x 9; then
  fail "another deploy has held the lock for over ${LOCK_WAIT}s. Not racing it."
fi

# Recorded inside the lock so a stuck deploy can be attributed rather than guessed at.
printf 'pid=%s user=%s started=%s services=%s\n' \
  "$$" "${SUDO_USER:-${USER:-unknown}}" "$(date -u +%FT%TZ)" "${SERVICES[*]}" >&9 || true

log "lock acquired; deploying: ${SERVICES[*]}"

# ---------------------------------------------------------------------------
# Preflight. A dirty tree silently rebuilds stale code.
# ---------------------------------------------------------------------------
DIRTY="$(git status --porcelain | grep -v '^??' || true)"
if [ -n "$DIRTY" ]; then
  printf '%s\n' "$DIRTY" >&2
  fail "tracked files are modified. Build would ship something other than origin/main."
fi

if [ "${SKIP_PULL:-0}" != "1" ]; then
  log "pulling origin/main"
  git pull origin main --quiet || fail "git pull failed"
fi

git fetch origin --quiet || true
HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
if [ "$HEAD_SHA" != "$MAIN_SHA" ]; then
  fail "HEAD ($HEAD_SHA) is not origin/main ($MAIN_SHA). Refusing to build."
fi
log "building $HEAD_SHA"

# ---------------------------------------------------------------------------
# The build. NOT piped — a pipe makes $? the exit code of the pipe's last
# command, which has already reported a build failure as success in this repo.
# ---------------------------------------------------------------------------
BUILD_LOG="$(mktemp /tmp/deploy-XXXXXX.log)"
set +e
docker compose -f "$COMPOSE_FILE" up -d --build --no-deps "${SERVICES[@]}" >"$BUILD_LOG" 2>&1
BUILD_EXIT=$?
set -e

tail -n 20 "$BUILD_LOG"

if [ "$BUILD_EXIT" -ne 0 ]; then
  log "compose exited $BUILD_EXIT — full log at $BUILD_LOG"
  # Name the specific failure that caused the outage, because the recovery is
  # non-obvious and the error text alone does not suggest it.
  if grep -q "No such container" "$BUILD_LOG"; then
    log "This looks like the container-naming race. Check for an orphaned"
    log "container (docker ps -a | grep _accelerator-) and remove it, then rerun."
  fi
  fail "build/up failed (exit $BUILD_EXIT)"
fi

# ---------------------------------------------------------------------------
# Prove it came up. This is the check the incident actually needed: exit 0 and a
# 200 from the site were both true while the backend was down.
# ---------------------------------------------------------------------------
sleep 3
BAD=0
for svc in "${SERVICES[@]}"; do
  CID="$(docker compose -f "$COMPOSE_FILE" ps -q "$svc" || true)"
  if [ -z "$CID" ]; then
    log "NOT RUNNING: $svc has no container"
    BAD=1
    continue
  fi
  STATE="$(docker inspect -f '{{.State.Status}}' "$CID" 2>/dev/null || echo unknown)"
  log "$svc: $STATE"
  # `created` is exactly the state the outage left the backend in.
  [ "$STATE" = "running" ] || BAD=1
done

[ "$BAD" -eq 0 ] || fail "one or more services are not running. Production may be degraded."

log "all requested services are running"
log "NOTE: this proves the containers are up, not that the app is healthy."
log "Verify the surface through the real hostname — localhost does not match"
log "server_name and falls through to a default block that 404s /api."
