#!/usr/bin/env bash
# refreshBasecampTokenFromVault.sh — keep CCPP.Basecamp_AuthInfo perpetually fresh
# so the host-cron Basecamp path never dies on the ~14-day token rotation.
#
# Design (the durable fix; do NOT change basecampToken.js or the CCPP read path):
#   The advisor app owns minting — it holds the Fernet vault (master key only in
#   ITS container env) and the auto-refreshing OAuth grant. This job shells into the
#   advisor to mint, probes Basecamp, then does an IN-PLACE UPDATE of whichever
#   row is currently IsActive=1 and clears the on-disk cache. No secrets cross repos;
#   the Node read path is untouched. Advisor mints, this cron keeps CCPP fresh.
#
# Runs on the prod VPS host (it docker-execs two containers). DRY-RUN by default
# (mint + probe, no write); pass --commit to write. The cron runs it with --commit.
# Logs to tmp/basecamp-refresh.log; never prints the token (only an 8-char prefix).
#
#   manual check:  bash scripts/refreshBasecampTokenFromVault.sh
#   commit:        bash scripts/refreshBasecampTokenFromVault.sh --commit
#   cron (every 3d): 0 8 */3 * * /opt/colaberry-accelerator/scripts/refreshBasecampTokenFromVault.sh --commit
#                  (every 3 days, well inside the ~14d token life = always >10d of margin)

set -uo pipefail

ADVISOR='ai-project-architect-app-1'   # owns the Fernet vault + OAuth mint
BACKEND='accelerator-backend'          # owns the CCPP (MSSQL) connection
OPERATOR='usr-cbdd2c8ffc'              # Ali's vault grant -> ali@colaberry.com (#17454835)
EXPIRES='1209600'                      # token lifetime seconds (~14d); ExpiresAt is NOT-NULL INT
ACCOUNT='3945211'
CACHE='/opt/colaberry-accelerator/tmp/ops-engine/bc-token.cache'
LOG='/opt/colaberry-accelerator/tmp/basecamp-refresh.log'

COMMIT='no'; [ "${1:-}" = '--commit' ] && COMMIT='yes'

mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1   # echoes go to the log; $(...) captures are unaffected, so the token is never logged
echo "===== basecamp-refresh $(date -u +%Y-%m-%dT%H:%M:%SZ) commit=$COMMIT ====="

# 1) Mint a fresh access token via the advisor's vault (it auto-refreshes the grant).
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

# 2) Probe Basecamp — must be 200 before we touch CCPP (never write a bad token).
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $NEW" -H "User-Agent: Colaberry" "https://3.basecampapi.com/$ACCOUNT/projects.json")
echo "probe HTTP $CODE (expect 200)"
[ "$CODE" = "200" ] || { echo "token not valid (HTTP $CODE); NOT writing CCPP"; exit 1; }

if [ "$COMMIT" != 'yes' ]; then
  echo "DRY-RUN ok: mint + probe succeeded. Re-run with --commit to update CCPP row $CCPP_ROW."
  exit 0
fi

# 3) In-place UPDATE of the active CCPP row via the backend container's MSSQL env.
docker exec -e NEW_TOKEN="$NEW" -e EXPIRES="$EXPIRES" "$BACKEND" node -e '
const sql=require("mssql");(async()=>{
  await sql.connect({server:process.env.MSSQL_HOST,port:parseInt(process.env.MSSQL_PORT||"1433",10),user:process.env.MSSQL_USER,password:process.env.MSSQL_PASS,database:process.env.MSSQL_DATABASE||"CCPP",options:{encrypt:true,trustServerCertificate:true}});
  const r=new sql.Request();
  r.input("t",process.env.NEW_TOKEN); r.input("e",parseInt(process.env.EXPIRES,10));
  // Target whichever row is currently active. Hardcoding an id would silently
  // no-op the moment the legacy CCPP refresher inserts a new active row.
  const res=await r.query("UPDATE Basecamp_AuthInfo SET AccessToken=@t, ExpiresAt=@e WHERE BasecampAuthInfoID=(SELECT MAX(BasecampAuthInfoID) FROM Basecamp_AuthInfo WHERE IsActive=1)");
  await sql.close();
  console.log("CCPP rows updated: "+((res.rowsAffected&&res.rowsAffected[0])||0));
})().catch(e=>{console.error("CCPP WRITE FAILED: "+e.message);process.exit(1)})' || { echo "CCPP write failed"; exit 1; }

# 4) Clear the stale on-disk cache so consumers refetch the new token immediately.
rm -f "$CACHE"
echo "DONE: active CCPP row refreshed (ExpiresAt=$EXPIRES), cache cleared. Every BC consumer recovers on next call."
