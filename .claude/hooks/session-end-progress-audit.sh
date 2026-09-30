#!/usr/bin/env bash
# Stop hook — session-end progress audit.
#
# Fires when the main session ends (Stop event). Runs the audit CLAUDE.md
# mandates: list every file modified in the session, confirm this session
# recorded them in its own progress log.
#
# Since 2026-08-23 the progress log is ONE MARKDOWN FILE PER SESSION:
#     docs/sessions/CC-<YYYYMMDD>-<id>.md
# PROGRESS.md is a sealed pre-cutover archive and is deliberately NOT consulted.
#
# Why this hook changed shape (all four were real defects):
#   1. It counted `grep -c "$TODAY" PROGRESS.md`. Any line anywhere in a 16k-line
#      shared file containing today's date satisfied it — including another
#      session's entry — so it passed VACUOUSLY while this session logged nothing.
#      It now counts entries only in session logs THIS session actually touched
#      (dirty in the worktree, or present in the last commit).
#   2. Its gated-path filter excluded docs/, so in-repo documentation work — which
#      CLAUDE.md explicitly says belongs in the log — was invisible. docs/ is now
#      gated, with docs/sessions/ excluded so the log never counts as work needing
#      its own log.
#   3. Its last-commit check grepped the exact path '^PROGRESS\.md$'. Under
#      per-session files that can never match, so it would have printed a WARN on
#      every commit forever. A permanently-firing warning trains everyone to
#      ignore the hook, which is worse than no hook.
#   4. `$(... | grep -c . || echo 0)` printed "0" AND exited 1 when there were no
#      matches, so `|| echo 0` appended a SECOND "0". The variable became "0\n0"
#      and every `[ "$X" -gt 0 ]` died with "integer expression expected" — both
#      gate branches were dead code and the warning had never once fired.
#
# This hook is INFORMATIONAL — it prints findings to stderr so Claude (and the
# operator) see them, but it does not block exit. Blocking on Stop is usually
# disruptive; we want awareness, not a forced loop.
#
# Exit codes:
#   0  - always (informational only)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT" || exit 0

TODAY=$(date +%Y-%m-%d)

# Canonical gated paths. CLAUDE.md's prose list and docs/DEV_GUIDE.md disagreed
# with docs/architect-mindset/ (five dirs vs three); this is the canonical six.
# docs/sessions/ is excluded — that IS the log.
GATED='^(backend|frontend|scripts|nginx|directives|docs)/'
LOG_GLOB='^docs/sessions/CC-[0-9]{8}-[A-Za-z0-9]+\.md$'
NOT_LOG='^docs/sessions/'

# Count non-empty lines in a string WITHOUT the `|| echo 0` double-print bug.
count_lines() {
  local n
  n=$(printf '%s\n' "${1:-}" | grep -c '.' ) || n=0
  printf '%s' "${n:-0}"
}

# --- work this session touched (uncommitted), excluding the log itself --------
MODIFIED=$(git diff --name-only HEAD --diff-filter=AM 2>/dev/null | \
  grep -E "$GATED" | grep -Ev "$NOT_LOG" | head -50 || true)
MODIFIED_COUNT=$(count_lines "$MODIFIED")

# --- this session's own log files (uncommitted: modified or untracked) --------
DIRTY_LOGS=$( { git diff --name-only HEAD --diff-filter=AM 2>/dev/null || true; \
                git ls-files --others --exclude-standard 2>/dev/null || true; } | \
  grep -E "$LOG_GLOB" | sort -u || true)
DIRTY_LOG_COUNT=$(count_lines "$DIRTY_LOGS")

# Entries dated today inside those logs. Non-vacuous: only logs this session
# actually touched are counted, so another session's file cannot satisfy it.
TODAY_ENTRIES=0
if [ "$DIRTY_LOG_COUNT" -gt 0 ]; then
  while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f" ] || continue
    n=$(grep -cE "^[[:space:]]*-[[:space:]]*Date:[[:space:]]*$TODAY" "$f") || n=0
    TODAY_ENTRIES=$(( TODAY_ENTRIES + n ))
  done <<< "$DIRTY_LOGS"
fi

echo "[hook:progress-audit] Session-end audit for $TODAY:" >&2
echo "[hook:progress-audit]   Session logs written this session: $DIRTY_LOG_COUNT (entries dated today: $TODAY_ENTRIES)" >&2
echo "[hook:progress-audit]   Files modified in gated paths (uncommitted): $MODIFIED_COUNT" >&2

if [ "$MODIFIED_COUNT" -gt 0 ] && [ "$TODAY_ENTRIES" -eq 0 ]; then
  echo "[hook:progress-audit] *** GATE WARNING ***" >&2
  echo "[hook:progress-audit] $MODIFIED_COUNT modified file(s) in gated paths, but NO entry dated $TODAY in this session's log." >&2
  echo "[hook:progress-audit] Per CLAUDE.md > Logging, Reporting & Progress Tracking, write docs/sessions/CC-<YYYYMMDD>-<id>.md" >&2
  echo "[hook:progress-audit] with an entry carrying a Verification line, then: node scripts/generateSessionChangelog.js <SessionID>" >&2
  echo "[hook:progress-audit] Modified files:" >&2
  printf '%s\n' "$MODIFIED" | while IFS= read -r f; do
    [ -n "$f" ] && echo "[hook:progress-audit]   - $f" >&2
  done
elif [ "$MODIFIED_COUNT" -gt 0 ]; then
  echo "[hook:progress-audit] audit clean: $TODAY_ENTRIES entr(y/ies) dated $TODAY across $DIRTY_LOG_COUNT session log(s), $MODIFIED_COUNT file(s) modified." >&2
fi

# --- last commit: did it carry its session log? -------------------------------
LAST_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null || true)
LAST_GATED=$(printf '%s\n' "$LAST_FILES" | grep -E "$GATED" | grep -Ev "$NOT_LOG" || true)
LAST_LOGS=$(printf '%s\n' "$LAST_FILES" | grep -E "$LOG_GLOB" || true)
LAST_GATED_COUNT=$(count_lines "$LAST_GATED")
LAST_LOG_COUNT=$(count_lines "$LAST_LOGS")

if [ "$LAST_GATED_COUNT" -gt 0 ] && [ "$LAST_LOG_COUNT" -eq 0 ]; then
  echo "[hook:progress-audit] WARN: last commit touched $LAST_GATED_COUNT gated file(s) but no docs/sessions/CC-*.md log." >&2
fi

exit 0
