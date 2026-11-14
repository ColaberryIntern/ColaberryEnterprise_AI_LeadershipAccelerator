#!/usr/bin/env bash
# refreshBasecampTokenFromVault.sh — keep CCPP.Basecamp_AuthInfo perpetually fresh
# so the host-cron Basecamp path never dies on the ~14-day token rotation.
#
# Design (the durable fix; do NOT change basecampToken.js or the CCPP read path):
#   The advisor app owns minting — it holds the Fernet vault (master key only in
#   ITS container env) and the auto-refreshing OAuth grant. This job shells into the
#   advisor to mint, probes Basecamp, then does an IN-PLACE UPDATE of the single
#   active CCPP row (id 237) and clears the on-disk cache. No secrets cross repos;
#   the Node read path is untouched. Advisor mints, this cron keeps CCPP fresh.
#
# Runs on the prod VPS host (it docker-execs two containers). DRY-RUN by default
# (mint + probe, no write); pass --commit to write. The cron runs it with --commit.
# Logs to tmp/basecamp-refresh.log; never prints the token (only an 8-char prefix).
#
#   manual check:  bash scripts/refreshBasecampTokenFromVault.sh
#   commit:        bash scripts/refreshBasecampTokenFromVault.sh --commit
#
# CRON, as actually installed on the prod host, read from `crontab -l` on 2026-11-14:
#   0 8 * * * /opt/colaberry-accelerator/scripts/refreshBasecampTokenFromVault.sh --commit >> /var/log/bc-token-refresh.log 2>&1
# Daily at 08:00 UTC, which is 02:00 Central. This line said "cron (weekly): 0 6 * * 1"
# until 2026-11-14 and a sibling branch said "every 3d: 0 8 */3"; neither matched the
# installed job. A cadence comment nobody checks against `crontab -l` is how a session
# ends up reasoning about a schedule that does not exist, so it is now dated and sourced.
#
# WHAT THIS CADENCE DOES AND DOES NOT BOUND. The legacy CCPP refresher INSERTS a new
# active row roughly every 14 days (rows 245-249 are 14 days apart, at 15:00, 21:00 and
# 20:45 UTC, so the hour varies). basecampToken resolves with ORDER BY
# BasecampAuthInfoID DESC, which prefers whichever row is newest, so between that insert
# and this job's next run the whole platform acts as whoever the legacy refresher wrote.
# On 2026-11-13 that was CB System and the window was 17 hours. Running daily bounds the
# window at roughly 23 hours, not at zero. The identity probe below stops this job from
# WRITING a wrong token; it cannot stop the other writer from inserting one.

set -uo pipefail

ADVISOR='ai-project-architect-app-1'   # owns the Fernet vault + OAuth mint
BACKEND='accelerator-backend'          # owns the CCPP (MSSQL) connection
OPERATOR='usr-cbdd2c8ffc'              # Ali's vault grant -> ali@colaberry.com, bc person 17454835
                                       # (was documented as 16988292; /my/profile.json returns
                                       # 17454835 for a token minted from this grant, checked
                                       # 2026-11-13. EXPECT_PERSON below asserts it on every run.)
# NOTE: there is deliberately no hardcoded row id here. The UPDATE below targets
# MAX(BasecampAuthInfoID) WHERE IsActive=1 and reports the id it actually wrote.
# A CCPP_ROW='237' constant used to be echoed as "row 237 refreshed" on every
# run while the SQL wrote whichever row was newest (242 as of 2026-08-17), which
# sent the next person debugging a token failure to the wrong row.
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

# 2) Probe Basecamp: must be 200 AND must be the expected person before we touch
#    CCPP (never write a bad token, and never write SOMEBODY ELSE'S token).
#
#    This probe used to request /projects.json and assert only HTTP 200. That is
#    not enough, and the gap is not theoretical: on 2026-11-13 the active CCPP row
#    carried a grant for CB System <ali+999@colaberry.com> id 37708014 instead of
#    Ali. CB System returns 200 on /projects.json too, since it can see 65 projects,
#    so a status-only probe is satisfied by the wrong identity. What it could NOT
#    see was project 49210714 Colaberry Live, and Basecamp answers 404 rather than
#    403 for a resource the caller cannot see, so every read and write against
#    that project failed in a way indistinguishable from a deleted ticket.
#
#    A 200 is not an identity. /my/profile.json is the only endpoint that answers
#    "who is this token", so that is what is asked, and the id is compared.
EXPECT_PERSON='17454835'   # Ali Muwwakkil, ali@colaberry.com. Verified live 2026-11-13
                           # against /my/profile.json with a token minted from the
                           # OPERATOR grant above. The old comment on OPERATOR said
                           # 16988292, which no endpoint returns; do not restore it.
PROBE=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $NEW" -H "User-Agent: Colaberry" \
  "https://3.basecampapi.com/$ACCOUNT/my/profile.json")
CODE=$(printf '%s' "$PROBE" | tail -1)
BODY=$(printf '%s' "$PROBE" | sed '$d')
echo "probe HTTP $CODE (expect 200)"
[ "$CODE" = "200" ] || { echo "token not valid (HTTP $CODE); NOT writing CCPP"; exit 1; }

# Identity, read off the profile. grep -o and head -1 rather than sed, deliberately:
# the profile is one line and carries nested objects that also have an "id" (the
# company, for one), and `sed 's/.*"id":\([0-9]*\).*/\1/'` is GREEDY, so .* runs to
# the LAST "id" in the body and returns the company's. grep -o emits matches in
# order, so head -1 is the top-level person. Getting this wrong fails closed, which
# is safe but would silently stop every refresh, so it is worth the two extra words.
PERSON=$(printf '%s' "$BODY" | grep -o '"id":[0-9][0-9]*' | head -1 | cut -d: -f2)
PERSON_EMAIL=$(printf '%s' "$BODY" | grep -o '"email_address":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "probe identity: id=${PERSON:-unknown} email=${PERSON_EMAIL:-unknown} (expect id=$EXPECT_PERSON)"
if [ "$PERSON" != "$EXPECT_PERSON" ]; then
  echo "IDENTITY MISMATCH: minted token is id=${PERSON:-unknown} (${PERSON_EMAIL:-unknown}), expected $EXPECT_PERSON."
  echo "NOT writing CCPP. The vault grant for OPERATOR=$OPERATOR no longer resolves to the expected person."
  echo "Fix the grant rather than relaxing this check: writing the wrong identity surfaces downstream as a 404."
  exit 1
fi

if [ "$COMMIT" != 'yes' ]; then
  echo "DRY-RUN ok: mint + probe succeeded. Re-run with --commit to update the newest active CCPP row."
  exit 0
fi

# 3) In-place UPDATE of the active CCPP row via the backend container's MSSQL env.
docker exec -e NEW_TOKEN="$NEW" -e EXPIRES="$EXPIRES" "$BACKEND" node -e '
const sql=require("mssql");(async()=>{
  await sql.connect({server:process.env.MSSQL_HOST,port:parseInt(process.env.MSSQL_PORT||"1433",10),user:process.env.MSSQL_USER,password:process.env.MSSQL_PASS,database:process.env.MSSQL_DATABASE||"CCPP",options:{encrypt:true,trustServerCertificate:true}});
  // Target the NEWEST active row to match every CCPP reader (SELECT TOP 1 ... WHERE IsActive=1 ORDER BY BasecampAuthInfoID DESC).
  // Updating a hardcoded id (was 237) silently orphaned the refresh whenever the rotation worker inserted a newer active row.
  const target=(await new sql.Request().query("SELECT MAX(BasecampAuthInfoID) AS id FROM Basecamp_AuthInfo WHERE IsActive=1")).recordset[0];
  if(!target||!target.id){console.error("CCPP WRITE FAILED: no IsActive=1 row to update");process.exit(1)}
  const r=new sql.Request();
  r.input("t",process.env.NEW_TOKEN); r.input("e",parseInt(process.env.EXPIRES,10)); r.input("id",target.id);
  const res=await r.query("UPDATE Basecamp_AuthInfo SET AccessToken=@t, ExpiresAt=@e WHERE BasecampAuthInfoID=@id");
  await sql.close();
  // Report the row actually written, never a constant.
  console.log("CCPP rows updated: "+((res.rowsAffected&&res.rowsAffected[0])||0)+" (row "+target.id+")");
})().catch(e=>{console.error("CCPP WRITE FAILED: "+e.message);process.exit(1)})' || { echo "CCPP write failed"; exit 1; }

# 4) Clear the stale on-disk cache so consumers refetch the new token immediately.
rm -f "$CACHE"
echo "DONE: newest active CCPP row refreshed (ExpiresAt=$EXPIRES), cache cleared. Every BC consumer recovers on next call."
