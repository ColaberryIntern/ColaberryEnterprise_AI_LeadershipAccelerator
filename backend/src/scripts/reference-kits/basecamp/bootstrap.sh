#!/usr/bin/env bash
# bootstrap.sh — give a project that CANNOT yet read Basecamp the ability to
# read it, by pulling the Basecamp access kit straight from its Reference Kit
# ticket using ONLY a token. No prior Basecamp access, no git access to this
# repo, nothing pre-installed beyond bash + curl + node (or python3).
#
# This is the one file you deliver out-of-band (paste it, or copy it from git).
# It fetches everything else from Basecamp itself.
#
#   BASECAMP_ACCESS_TOKEN=<token> bash bootstrap.sh /path/to/your/project
#
# If BASECAMP_ACCESS_TOKEN is unset, it tries to pull a live one from prod over
# SSH (needs prod SSH access). The token is the only credential needed; it is
# never written to disk or logged.
set -euo pipefail

ACCOUNT="${BASECAMP_ACCOUNT_ID:-3945211}"
BUCKET="${BASECAMP_BUCKET_ID:-7463955}"
TICKET="${BASECAMP_KIT_TICKET:-10008694717}"   # the Basecamp access kit Reference Kit
API="https://3.basecampapi.com/${ACCOUNT}"
UA="Colaberry bootstrap (ali@colaberry.com)"
DEST="${1:-}"

# --- 1. resolve a token (env, else pull from prod over SSH) ---
TOKEN="${BASECAMP_ACCESS_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "No BASECAMP_ACCESS_TOKEN set; trying to pull a live one from prod over SSH..." >&2
  TOKEN="$(ssh -o ConnectTimeout=15 root@95.216.199.47 \
    'docker exec accelerator-backend node backend/src/scripts/lib/printBasecampToken.js' 2>/dev/null || true)"
fi
if [ -z "$TOKEN" ]; then
  echo "ERROR: no token. Set BASECAMP_ACCESS_TOKEN=... and re-run." >&2
  exit 1
fi
TOKEN="${TOKEN#Bearer }"
AUTH=(-H "Authorization: Bearer ${TOKEN}" -H "User-Agent: ${UA}")

# --- JSON field extractor (node preferred, python3 fallback) ---
json_field() {  # usage: printf '%s' "$json" | json_field download_url
  if command -v node >/dev/null 2>&1; then
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s)["'"$1"'"]||""))}catch(e){}})'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("'"$1"'",""),end="")
except Exception:
    pass'
  else
    echo "ERROR: need node or python3 to parse JSON." >&2; exit 1
  fi
}

# --- 2. prove the token works + show who it is (== what this project will see) ---
me="$(curl -sf "${AUTH[@]}" "${API}/my/profile.json")" || { echo "Token rejected by Basecamp." >&2; exit 1; }
echo "Token authenticates as: $(printf '%s' "$me" | json_field name) <$(printf '%s' "$me" | json_field email_address)>"
echo "(Everything this token can read is what your project will be able to read.)"

# --- 3. read the Reference Kit ticket's comments, find the attached uploads ---
echo "Reading kit ticket ${TICKET}..."
comments="$(curl -sf "${AUTH[@]}" "${API}/buckets/${BUCKET}/recordings/${TICKET}/comments.json")"
ids="$(printf '%s' "$comments" | grep -oE 'uploads/[0-9]+' | grep -oE '[0-9]+' | sort -u || true)"
if [ -z "$ids" ]; then
  echo "ERROR: no upload links found on ticket ${TICKET}. Wrong ticket id, or no access." >&2
  exit 1
fi

# --- 4. download each attached file into a staging dir ---
STAGE="$(mktemp -d 2>/dev/null || echo "/tmp/bc-kit-$$")"
mkdir -p "$STAGE"
count=0
for id in $ids; do
  meta="$(curl -sf "${AUTH[@]}" "${API}/buckets/${BUCKET}/uploads/${id}.json")" || continue
  fname="$(printf '%s' "$meta" | json_field filename)"
  durl="$(printf '%s' "$meta" | json_field download_url)"
  [ -n "$fname" ] && [ -n "$durl" ] || continue
  # download_url 302-redirects to signed storage; -L follows (auth is dropped on the
  # cross-host hop, which is correct: the storage url is already signed).
  if curl -sfL "${AUTH[@]}" "$durl" -o "${STAGE}/${fname}"; then
    echo "  + ${fname}"; count=$((count + 1))
  else
    echo "  ! failed ${fname}"
  fi
done
echo "Downloaded ${count} file(s) to ${STAGE}"

# --- 5. run the kit's installer against the target project (if one was given) ---
if [ -n "$DEST" ] && [ -f "${STAGE}/setup.sh" ]; then
  echo "Installing into ${DEST}..."
  bash "${STAGE}/setup.sh" "$DEST"
  echo
  echo "Done. Verify with:  node backend/src/scripts/sampleBasecamp.js"
else
  echo
  echo "Files are in ${STAGE}. To install:"
  echo "  bash ${STAGE}/setup.sh /path/to/your/project"
fi
