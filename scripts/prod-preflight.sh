#!/usr/bin/env bash
#
# Production deploy preflight. Run on the prod host, from the repo root, BEFORE
# `docker compose ... up -d --build`.
#
#   ssh root@95.216.199.47 'cd /opt/colaberry-accelerator && ./scripts/prod-preflight.sh'
#
# Every check here exists because its absence has already cost a deploy on this
# box. None of them is hypothetical:
#
#  1. MODIFIED TRACKED FILES (2026-08-19). The check everyone assumes is enough —
#     "does HEAD match origin/main" — PASSED while the working tree had a
#     just-merged guard stripped out of it. HEAD is a pointer; the files on disk
#     can disagree with it, and `docker build` copies the FILES. A deploy went
#     out that would have shipped code the commit did not contain. This is the
#     single most important check in this script, and the one no one runs.
#
#  2. HEAD == origin/main (2026-06-24). A dirty tree silently blocks `git pull`,
#     and because the usual one-liner pipes the pull through `| tail`, the
#     failure returns tail's exit code 0 and the &&-chained build runs anyway —
#     rebuilding OLD code with no error surfaced.
#
#  3. CONCURRENT DEPLOY. Two simultaneous compose builds race and have taken the
#     site down with Cloudflare 521s. `pgrep` must exclude itself, or it always
#     matches its own command line and reports a deploy that is not running.
#
#  4. DISK. Build cache has filled the root volume and taken Postgres into
#     crash-recovery.
#
# Exit 0 = safe to build. Exit 1 = do not build; the reason is printed.

set -uo pipefail

FAIL=0
say()  { printf '%s\n' "$*"; }
ok()   { printf '  OK    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; FAIL=1; }

say '=== prod deploy preflight ==='

# --- 1. modified tracked files -----------------------------------------------
# Untracked files (??) are noise here — generated reports, cron state. Only
# tracked modifications matter: those are what silently change what gets built.
DIRTY="$(git status --porcelain | grep -v '^??' || true)"
if [ -n "$DIRTY" ]; then
  bad "tracked files modified in the working tree — the build would use THESE, not the commit:"
  printf '%s\n' "$DIRTY" | sed 's/^/          /'
  say  '        Inspect with `git diff`. If they are not deliberate, back them up and'
  say  '        `git checkout -- <paths>` so the tree matches HEAD.'
else
  ok 'working tree clean (no modified tracked files)'
fi

# --- 2. HEAD == origin/main --------------------------------------------------
git fetch origin main --quiet 2>/dev/null || true
HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
if [ "$HEAD_SHA" = "$MAIN_SHA" ]; then
  ok "HEAD == origin/main (${HEAD_SHA:0:8})"
else
  bad "HEAD ${HEAD_SHA:0:8} != origin/main ${MAIN_SHA:0:8} — pull first, and CHECK IT SUCCEEDED"
fi

# --- 3. concurrent deploy ----------------------------------------------------
# $$ is this script; pgrep -f would otherwise match its own invocation.
RUNNING="$(pgrep -af 'docker compose' | grep -v "^$$ " | grep -v pgrep || true)"
if [ -n "$RUNNING" ]; then
  bad 'another compose deploy is already running — wait for it (two at once => CF 521):'
  printf '%s\n' "$RUNNING" | sed 's/^/          /'
else
  ok 'no concurrent compose deploy'
fi

# --- 4. disk -----------------------------------------------------------------
ROOT_PCT="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if [ "${ROOT_PCT:-0}" -ge 90 ]; then
  bad "root volume ${ROOT_PCT}% full — run \`docker builder prune -f\` before building"
else
  ok "root volume ${ROOT_PCT}% used"
fi

say ''
if [ "$FAIL" -eq 0 ]; then
  say 'PREFLIGHT PASSED — safe to build.'
  exit 0
fi
say 'PREFLIGHT FAILED — do NOT build until the above is resolved.'
exit 1
