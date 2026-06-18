#!/usr/bin/env bash
# setup.sh — one-shot installer for the Basecamp access kit.
#
# Wires this project up to see what CB System sees in Basecamp.
#
#   cd ~/path/to/extracted/kit
#   bash setup.sh /path/to/your/project
#
# Idempotent: re-running overwrites the kit files in place, never duplicates.
set -euo pipefail

DEST="${1:?usage: bash setup.sh /path/to/your/project}"
SRC="$(cd "$(dirname "$0")" && pwd)"

[ -d "$DEST" ] || { echo "Destination does not exist: $DEST" >&2; exit 1; }

LIB_DIR="$DEST/backend/src/scripts/lib"
SCRIPTS_DIR="$DEST/scripts"
SAMPLE_DIR="$DEST/backend/src/scripts"

mkdir -p "$LIB_DIR" "$SCRIPTS_DIR" "$SAMPLE_DIR"

cp "$SRC/basecampClient.js"  "$LIB_DIR/basecampClient.js"
cp "$SRC/bc-exec.sh"         "$SCRIPTS_DIR/bc-exec.sh"
cp "$SRC/sample-basecamp.js" "$SAMPLE_DIR/sampleBasecamp.js"
cp "$SRC/basecamp-access.md" "$DEST/basecamp-access.md" 2>/dev/null || true
chmod +x "$SCRIPTS_DIR/bc-exec.sh"

echo "Installed:"
echo "  $LIB_DIR/basecampClient.js"
echo "  $SCRIPTS_DIR/bc-exec.sh"
echo "  $SAMPLE_DIR/sampleBasecamp.js"

# The helper needs `mssql` ONLY when resolving the token from CCPP (prod path).
# If you always pass BASECAMP_ACCESS_TOKEN, you can skip this.
if [ -f "$DEST/package.json" ]; then
  if ! node -e "require.resolve('mssql')" 2>/dev/null; then
    echo
    echo "Optional: the CCPP token path needs 'mssql'. Install it with:"
    echo "  (cd \"$DEST\" && npm install mssql)"
    echo "Skip this if you always export BASECAMP_ACCESS_TOKEN directly."
  fi
fi

cat <<'EOF'

Done. Verify it works:

  # Option A — you have a token:
  export BASECAMP_ACCESS_TOKEN=...        # a live token (see basecamp-access.md)
  node backend/src/scripts/sampleBasecamp.js

  # Option B — running on prod (CCPP env present, no token needed):
  node backend/src/scripts/sampleBasecamp.js

  # Quick one-off call:
  ./scripts/bc-exec.sh GET /my/profile.json

If sampleBasecamp.js lists projects, you now see what CB System sees.
EOF
