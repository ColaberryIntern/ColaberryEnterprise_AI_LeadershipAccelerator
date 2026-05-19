#!/usr/bin/env bash
# PostToolUse hook — em-dash check on Mandrill send scripts.
#
# Fires after Edit, Write, MultiEdit, or NotebookEdit on any path matching
# backend/src/scripts/send*.js OR backend/src/scripts/send*.ts.
#
# Hard rule per CLAUDE.md and reference_email_signature.md: no em-dash
# (U+2014, byte sequence 0xE2 0x80 0x94) in any outgoing email content.
#
# Exit codes:
#   0  - no em-dash; allow the next step
#   2  - em-dash found; print the offending lines to stderr (Claude will see
#        this and self-correct in the next turn)
#
# Claude Code's hook input is JSON on stdin: { "tool_input": { "file_path": ... } }
# We extract the path with grep/sed to avoid jq dependency.
set -euo pipefail

# Read hook payload from stdin
PAYLOAD="$(cat)"

# Extract file_path from JSON (no jq dependency)
FILE_PATH=$(echo "$PAYLOAD" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' | sed 's/.*: *"\(.*\)"/\1/' | head -1)

if [ -z "${FILE_PATH:-}" ]; then
  # Nothing to check
  exit 0
fi

# Only fire on Mandrill send scripts
if ! echo "$FILE_PATH" | grep -qE 'backend/src/scripts/send.*\.(js|ts|mjs|cjs)$'; then
  exit 0
fi

# File must exist (Edit could have failed silently)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Count em-dash byte sequences (U+2014 = 0xE2 0x80 0x94)
# grep -c always prints a number and exits 1 when no matches; trailing
# `|| true` ensures we don't trip `set -e` on the no-match case.
COUNT=$(grep -c $'\xe2\x80\x94' "$FILE_PATH" 2>/dev/null || true)
COUNT=${COUNT:-0}
if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  COUNT=0
fi

if [ "$COUNT" -gt 0 ]; then
  # Find line numbers and content for the offending lines
  LINES=$(grep -n $'\xe2\x80\x94' "$FILE_PATH" 2>/dev/null | head -10)
  echo "[hook:check-emdash] BLOCK: ${COUNT} em-dash character(s) found in ${FILE_PATH}" >&2
  echo "[hook:check-emdash] Em-dash (U+2014) is banned in outgoing email content per CLAUDE.md." >&2
  echo "[hook:check-emdash] Offending line(s):" >&2
  echo "$LINES" | while IFS= read -r line; do
    echo "[hook:check-emdash]   $line" >&2
  done
  echo "[hook:check-emdash] Replace each em-dash with a hyphen, comma, period, or rewrite." >&2
  exit 2
fi

exit 0
