#!/usr/bin/env bash
# Stop hook — PROGRESS.md session-end audit.
#
# Fires when the main session ends (Stop event). Runs the audit CLAUDE.md
# mandates: list every file modified in the session, confirm each has a
# corresponding PROGRESS.md entry for the day.
#
# This hook is INFORMATIONAL — it prints findings to stderr so Claude (and
# the operator) see them, but it does not block exit. Blocking on Stop is
# usually disruptive; we want awareness, not a forced loop.
#
# Exit codes:
#   0  - always (informational only)
#
# Output is prefixed with [hook:progress-audit] so it stands out in the
# session transcript.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT" || exit 0

TODAY=$(date +%Y-%m-%d)
PROGRESS_FILE="$REPO_ROOT/PROGRESS.md"

if [ ! -f "$PROGRESS_FILE" ]; then
  echo "[hook:progress-audit] WARN: PROGRESS.md not found at repo root." >&2
  exit 0
fi

# Count lines in PROGRESS.md mentioning today's date
TODAY_ENTRIES=$(grep -c "$TODAY" "$PROGRESS_FILE" 2>/dev/null || echo 0)

# Files modified today in the gated paths per CLAUDE.md
# (backend/, frontend/, scripts/, nginx/, directives/)
MODIFIED_TODAY=$(git diff --name-only HEAD --diff-filter=AM 2>/dev/null | \
  grep -E '^(backend|frontend|scripts|nginx|directives)/' | \
  head -50 || true)

MODIFIED_COUNT=$(echo "$MODIFIED_TODAY" | grep -c . || echo 0)

echo "[hook:progress-audit] Session-end audit for $TODAY:" >&2
echo "[hook:progress-audit]   PROGRESS.md entries mentioning today: $TODAY_ENTRIES" >&2
echo "[hook:progress-audit]   Files modified in gated paths (uncommitted): $MODIFIED_COUNT" >&2

if [ "$MODIFIED_COUNT" -gt 0 ] && [ "$TODAY_ENTRIES" -eq 0 ]; then
  echo "[hook:progress-audit] *** GATE WARNING ***" >&2
  echo "[hook:progress-audit] You have $MODIFIED_COUNT modified file(s) in gated paths but ZERO PROGRESS.md entries dated $TODAY." >&2
  echo "[hook:progress-audit] Per CLAUDE.md > Logging, Reporting & Progress Tracking, every commit that touches" >&2
  echo "[hook:progress-audit] backend/frontend/scripts/nginx/directives MUST also touch PROGRESS.md." >&2
  echo "[hook:progress-audit] Modified files:" >&2
  echo "$MODIFIED_TODAY" | while IFS= read -r f; do
    [ -n "$f" ] && echo "[hook:progress-audit]   - $f" >&2
  done
elif [ "$MODIFIED_COUNT" -gt 0 ] && [ "$TODAY_ENTRIES" -gt 0 ]; then
  echo "[hook:progress-audit] audit clean: PROGRESS.md has $TODAY_ENTRIES entries for $TODAY, $MODIFIED_COUNT files staged/modified." >&2
fi

# Recently-committed files (last commit) — also check for PROGRESS.md coverage
LAST_COMMIT_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | \
  grep -E '^(backend|frontend|scripts|nginx|directives)/' || true)
LAST_COMMIT_HAS_PROGRESS=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | \
  grep -c '^PROGRESS\.md$' || echo 0)
LAST_COMMIT_COUNT=$(echo "$LAST_COMMIT_FILES" | grep -c . || echo 0)

if [ "$LAST_COMMIT_COUNT" -gt 0 ] && [ "$LAST_COMMIT_HAS_PROGRESS" -eq 0 ]; then
  echo "[hook:progress-audit] WARN: last commit touched $LAST_COMMIT_COUNT gated file(s) but did NOT touch PROGRESS.md." >&2
fi

exit 0
