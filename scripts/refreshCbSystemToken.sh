#!/usr/bin/env bash
# refreshCbSystemToken.sh — keep a fresh CB System (37708014) Basecamp token on
# the host so the @CB inbound-dispatcher always posts as CB System, never as a
# real person. This is the durable fix for the recurring self-reply flood
# (2026-06-22): the only previously-working CB System bearer was a static token
# that expired, after which every consumer fell back to Ali's token and CB
# answered itself ~60x/hr.
#
# Design (mirrors refreshBasecampTokenFromVault.sh, but for the CB System
# operator and a DEDICATED token store — it never touches CCPP/Ali):
#   The advisor app owns minting (Fernet vault + auto-refreshing OAuth grant).
#   This job shells into the advisor to mint a token for the CB System operator,
#   asserts the token resolves to 37708014, then writes it to a dedicated cache
#   the dispatcher's cron-env-wrapper reads. CCPP and Ali's grant are untouched.
#
# IDENTITY GUARD: we write the cache ONLY if /my/profile.json returns id
# 37708014. A token that resolves to anyone else is the exact failure that
# caused the flood, so we refuse to persist it.
#
# Runs on the prod VPS host. DRY-RUN by default (mint + probe, no write); pass
# --commit to write the cache. Never logs the token (only an 8-char prefix).
#
#   manual check:  bash scripts/refreshCbSystemToken.sh
#   commit:        bash scripts/refreshCbSystemToken.sh --commit
#   cron (every 3d): 0 7 */3 * * /opt/colaberry-accelerator/scripts/refreshCbSystemToken.sh --commit

set -uo pipefail

ADVISOR='ai-project-architect-app-1'      # owns the Fernet vault + OAuth mint
# The advisor vault principal that holds the CB System (37708014) OAuth grant.
# This is the synthetic shared principal (basecamp_oauth_token.SHARED_CB_SYSTEM_USER_ID
# == "cb-system"), populated by the one-time OAuth consent AS the CB System account
# (now ali+999@colaberry.com, formerly vishnu@colaberry.com). get_access_token_for_operator
# with this user_id reads + auto-refreshes that stored grant.
OPERATOR='cb-system'
EXPECT_BC_ID='37708014'                    # CB System; the ONLY identity we accept
ACCOUNT='3945211'
CACHE='/opt/colaberry-accelerator/tmp/ops-engine/cb-system-token.cache'
LOG='/opt/colaberry-accelerator/tmp/cb-system-token-refresh.log'

COMMIT='no'; [ "${1:-}" = '--commit' ] && COMMIT='yes'

mkdir -p "$(dirname "$LOG")" "$(dirname "$CACHE")"
exec > >(tee -a "$LOG") 2>&1
echo "===== cb-system-token-refresh $(date -u +%Y-%m-%dT%H:%M:%SZ) commit=$COMMIT ====="

if [ "$OPERATOR" = '__CB_SYSTEM_OPERATOR__' ]; then
  echo "ABORT: CB System operator not configured yet (OAuth grant not created)."; exit 3
fi

# 1) Mint a fresh CB System access token via the advisor vault.
RAW=$(docker exec -i "$ADVISOR" python3 - <<PY
import sys, types
sys.path.insert(0, "/app")
try:
    from execution.products.library.basecamp_oauth_token import get_access_token_for_operator, OAuthError
except Exception as e:
    print("IMPORT_ERR=" + repr(e)); sys.exit(3)
try:
    tok = get_access_token_for_operator(types.SimpleNamespace(user_id="$OPERATOR"))
    print("ACCESS_TOKEN=" + tok)
except OAuthError as e:
    print("OAUTH_ERR=" + repr(e)); sys.exit(4)
except Exception as e:
    print("MINT_ERR=" + repr(e)); sys.exit(5)
PY
)
if printf '%s' "$RAW" | grep -q '_ERR='; then
  echo "MINT FAILED: $(printf '%s' "$RAW" | grep '_ERR=' | tail -1)"; exit 1
fi
NEW=$(printf '%s' "$RAW" | sed -n 's/^ACCESS_TOKEN=//p' | tail -1 | tr -d '\r')
[ -n "$NEW" ] || { echo "MINT FAILED: no ACCESS_TOKEN in advisor output"; exit 1; }
echo "minted token prefix: ${NEW:0:8}..."

# 2) IDENTITY GUARD — the token MUST resolve to CB System (37708014). Never
#    persist a token that posts as anyone else; that is the flood condition.
PROFILE=$(curl -s -m 15 -H "Authorization: Bearer $NEW" -H "User-Agent: Colaberry CB" "https://3.basecampapi.com/$ACCOUNT/my/profile.json")
GOT_ID=$(printf '%s' "$PROFILE" | grep -oE '"id":[0-9]+' | head -1 | cut -d: -f2)
echo "token resolves to BC id: ${GOT_ID:-<none>} (expect $EXPECT_BC_ID)"
[ "$GOT_ID" = "$EXPECT_BC_ID" ] || { echo "IDENTITY MISMATCH: token is not CB System; NOT writing cache"; exit 1; }

if [ "$COMMIT" != 'yes' ]; then
  echo "DRY-RUN ok: mint + identity probe succeeded. Re-run with --commit to write $CACHE."
  exit 0
fi

# 3) Atomic write of the dedicated CB System token cache.
TMP="$CACHE.tmp.$$"
printf '%s' "$NEW" > "$TMP" && mv -f "$TMP" "$CACHE"
chmod 600 "$CACHE" 2>/dev/null || true
echo "DONE: wrote CB System token to $CACHE (id $EXPECT_BC_ID). Dispatcher uses it on next tick."
