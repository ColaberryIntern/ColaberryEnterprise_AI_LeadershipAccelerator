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
#   # dev, which needs its own project name and deploys detached commits:
#   STACK_DIR=/opt/acc-rename COMPOSE_FILE=docker-compose.dev.yml \
#     COMPOSE_PROJECT=accelerator-dev SKIP_PULL=1 ALLOW_DETACHED_HEAD=1 \
#     DIRTY_ALLOW=.env.dev \
#     ./scripts/deploy-prod.sh backend
#
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/colaberry-accelerator}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
# Dev compose ALWAYS needs an explicit -p; without it the project name is derived
# from the directory and the containers are not the ones you think they are.
COMPOSE_PROJECT="${COMPOSE_PROJECT:-}"
# ONE LOCK PER BOX, not per stack, and deliberately so. Dev and production share a
# Docker daemon, CPU and a Postgres on this host, and parallel builds have OOM-ed
# Postgres here before. A dev deploy queueing behind a production one is correct
# behaviour rather than an inconvenience.
LOCK_FILE="${LOCK_FILE:-/var/lock/colaberry-deploy.lock}"
# Dev runs detached at whatever commit is being tested, so the origin/main check is
# skipped there. It stays ON by default: silently letting production build something
# other than main is exactly the mistake that check exists to prevent.
ALLOW_DETACHED_HEAD="${ALLOW_DETACHED_HEAD:-0}"
# Paths permitted to differ from the checkout. EMPTY by default, so production keeps
# refusing any modification. Dev needs `.env.dev`, which is tracked and legitimately
# differs per environment - without this the dirty-tree guard blocks every dev deploy,
# and a guard that always fires gets bypassed rather than heeded.
#
# Space-separated exact paths, never a pattern: a pattern is how this quietly grows
# until it covers the file that actually mattered.
DIRTY_ALLOW="${DIRTY_ALLOW:-}"
# Long enough to queue behind a real build, short enough to fail rather than hang
# forever if a lock is somehow orphaned.
LOCK_WAIT="${LOCK_WAIT:-600}"

# build | registry.
#
# `registry` pulls the images CI already built instead of building on this host.
# That matters because building here is the largest recurring memory spike on a
# box that also runs five Postgres instances: the kernel journal recorded 344 OOM
# kills, and the 2026-09-08 cascade opens with "docker-buildx invoked oom-killer".
#
# It stays OPT-IN rather than becoming the default, because the build path has
# years of mileage and this one has a single proven run (2026-09-10, all three
# services, digests verified against origin/main).
#
# DECISION, Ali, 2026-09-10: leave it opt-in and flip the default after it has
# more runs behind it. "More runs" is deliberately not left to memory — every
# successful registry deploy appends a line to REGISTRY_DEPLOY_LOG below, so the
# bar is checkable rather than felt:
#
#   THE BAR: flip DEPLOY_MODE's default to `registry` once that log shows at
#   least 5 successful registry deploys spanning at least 14 days. Until then a
#   deploy that does not pass DEPLOY_MODE=registry still builds on the host.
#
# The 2026-09-10 run is deliberately NOT seeded into that log: it happened before
# this recording existed, and back-writing a line for it would be inventing
# evidence. The count therefore starts at zero and the real bar is six runs.
#
# Check it with: wc -l < /var/log/colaberry-registry-deploys.log
DEPLOY_MODE="${DEPLOY_MODE:-build}"
# Durable record of registry-mode deploys. Only successful ones are recorded, so
# the count means "this path worked", not "this path was attempted".
REGISTRY_DEPLOY_LOG="${REGISTRY_DEPLOY_LOG:-/var/log/colaberry-registry-deploys.log}"
# Where CI publishes. Public packages, so no registry credential is needed here.
REGISTRY_PREFIX="${REGISTRY_PREFIX:-ghcr.io/colaberryintern/accelerator-}"

SERVICES=("$@")
if [ ${#SERVICES[@]} -eq 0 ]; then
  SERVICES=(backend nginx)
fi

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] FAILED: %s\n' "$*" >&2; exit 1; }

command -v flock >/dev/null 2>&1 || fail "flock not available; cannot serialise deploys"
cd "$STACK_DIR" || fail "stack directory not found: $STACK_DIR"

COMPOSE_ARGS="-f $COMPOSE_FILE"
if [ -n "$COMPOSE_PROJECT" ]; then
  COMPOSE_ARGS="-p $COMPOSE_PROJECT $COMPOSE_ARGS"
fi

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
for allowed in $DIRTY_ALLOW; do
  # Drop only lines whose path is exactly this entry.
  DIRTY="$(printf '%s\n' "$DIRTY" | awk -v f="$allowed" '$NF != f' || true)"
done
DIRTY="$(printf '%s' "$DIRTY" | sed '/^[[:space:]]*$/d')"
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
if [ "$HEAD_SHA" != "$MAIN_SHA" ] && [ "$ALLOW_DETACHED_HEAD" != "1" ]; then
  fail "HEAD ($HEAD_SHA) is not origin/main ($MAIN_SHA). Refusing to build."
fi
BUILD_LOG="$(mktemp /tmp/deploy-XXXXXX.log)"

if [ "$DEPLOY_MODE" = "registry" ]; then
  # -------------------------------------------------------------------------
  # THE GUARD THAT MAKES THIS SAFE. `:main` is a moving tag. If CI has not yet
  # finished publishing for THIS commit, pulling `:main` deploys an OLDER build
  # while every other check in this script still passes — HEAD matches
  # origin/main, the tree is clean, the containers come up. Nothing would look
  # wrong. So the digest behind `:main` must equal the digest behind the tag for
  # this exact commit, or we refuse.
  # -------------------------------------------------------------------------
  log "registry mode: verifying published images match $HEAD_SHA"
  for svc in "${SERVICES[@]}"; do
    IMAGE="${REGISTRY_PREFIX}${svc}"
    D_MOVING="$(docker manifest inspect "${IMAGE}:main" 2>/dev/null | sha256sum | awk '{print $1}')"
    D_PINNED="$(docker manifest inspect "${IMAGE}:sha-${HEAD_SHA}" 2>/dev/null | sha256sum | awk '{print $1}')"
    if [ -z "$D_PINNED" ]; then
      fail "no image ${IMAGE}:sha-${HEAD_SHA}. CI has not published this commit yet — wait for the Build images workflow, or use the default build mode."
    fi
    if [ "$D_MOVING" != "$D_PINNED" ]; then
      fail "${IMAGE}:main does not match sha-${HEAD_SHA}. Pulling :main would deploy a different commit."
    fi
    log "  $svc: :main matches sha-${HEAD_SHA}"
  done

  log "pulling images for $HEAD_SHA"
  set +e
  docker compose $COMPOSE_ARGS pull "${SERVICES[@]}" >"$BUILD_LOG" 2>&1
  BUILD_EXIT=$?
  set -e
  if [ "$BUILD_EXIT" -ne 0 ]; then
    tail -n 20 "$BUILD_LOG"
    fail "docker compose pull failed (exit $BUILD_EXIT) — full log at $BUILD_LOG"
  fi

  log "recreating containers from pulled images"
  set +e
  docker compose $COMPOSE_ARGS up -d --no-deps "${SERVICES[@]}" >>"$BUILD_LOG" 2>&1
  BUILD_EXIT=$?
  set -e
else
  log "building $HEAD_SHA"

  # -------------------------------------------------------------------------
  # The build. NOT piped — a pipe makes $? the exit code of the pipe's last
  # command, which has already reported a build failure as success in this repo.
  # -------------------------------------------------------------------------
  set +e
  docker compose $COMPOSE_ARGS up -d --build --no-deps "${SERVICES[@]}" >"$BUILD_LOG" 2>&1
  BUILD_EXIT=$?
  set -e
fi

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
  CID="$(docker compose $COMPOSE_ARGS ps -q "$svc" || true)"
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

# Recorded only here, AFTER the running-state check, so the count cannot include
# a deploy that pulled cleanly and then failed to come up. Never allowed to fail
# the deploy: an unwritable log is a bookkeeping problem, not a production one.
if [ "$DEPLOY_MODE" = "registry" ]; then
  printf '%s %s services=%s
' "$(date -u +%FT%TZ)" "$HEAD_SHA" "${SERVICES[*]}"     >>"$REGISTRY_DEPLOY_LOG" 2>/dev/null || log "note: could not write $REGISTRY_DEPLOY_LOG"
  RUNS="$(wc -l <"$REGISTRY_DEPLOY_LOG" 2>/dev/null || echo '?')"
  log "registry-mode deploys recorded: $RUNS (default flips at 5 spanning 14 days)"
fi
log "NOTE: this proves the containers are up, not that the app is healthy."
log "Verify the surface through the real hostname — localhost does not match"
log "server_name and falls through to a default block that 404s /api."
