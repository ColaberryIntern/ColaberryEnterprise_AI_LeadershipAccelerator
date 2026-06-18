#!/usr/bin/env bash
# bc-exec.sh — one-off Basecamp API calls from the terminal, using the same
# token CB System uses. Read-only by default; pass a method to mutate.
#
#   ./bc-exec.sh GET  /projects.json
#   ./bc-exec.sh GET  /my/profile.json
#   ./bc-exec.sh GET  /projects/47477101/people.json
#   ./bc-exec.sh PUT  /projects/47477101/people/users.json '{"grant":[34920126]}'
#
# Token resolution:
#   - If BASECAMP_ACCESS_TOKEN is set in the env, it is used.
#   - Else, on prod, this pulls a live token via printBasecampToken.js (CCPP).
set -euo pipefail

ACCOUNT_ID="${BASECAMP_ACCOUNT_ID:-3945211}"
METHOD="${1:-GET}"
PATH_ARG="${2:?usage: bc-exec.sh <METHOD> <PATH> [JSON_BODY]}"
BODY="${3:-}"

TOKEN="${BASECAMP_ACCESS_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  # Fall back to the repo's CCPP-backed resolver if present.
  for candidate in \
    "backend/src/scripts/lib/printBasecampToken.js" \
    "./printBasecampToken.js"; do
    if [ -f "$candidate" ]; then
      TOKEN="$(node "$candidate")"
      break
    fi
  done
fi
if [ -z "$TOKEN" ]; then
  echo "No BASECAMP_ACCESS_TOKEN and no printBasecampToken.js found." >&2
  echo "On prod: export BASECAMP_ACCESS_TOKEN=\$(node backend/src/scripts/lib/printBasecampToken.js)" >&2
  exit 1
fi
TOKEN="${TOKEN#Bearer }"

URL="https://3.basecampapi.com/${ACCOUNT_ID}${PATH_ARG}"
UA="Colaberry AI Ops Command Center (ali@colaberry.com)"

if [ -n "$BODY" ]; then
  curl -sS -X "$METHOD" "$URL" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "User-Agent: ${UA}" \
    -H "Content-Type: application/json" \
    -d "$BODY"
else
  curl -sS -X "$METHOD" "$URL" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "User-Agent: ${UA}"
fi
echo
