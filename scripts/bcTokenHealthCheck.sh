#!/usr/bin/env bash
# bcTokenHealthCheck.sh — daily probe of the active Basecamp token in
# CCPP.Basecamp_AuthInfo. If it is not healthy (BC /my/profile.json != 200) it
# first tries to HEAL it by running refreshBasecampTokenFromVault.sh --commit,
# re-probes, and emails ali@colaberry.com only if the token is STILL unhealthy.
#
# Why self-heal before alerting (2026-11-23, CC-20261123-q7vk): the advisor only
# mints a new token once the old one has actually expired, so every ~14 days the
# token dies at ~12:58 UTC and stays dead until something triggers a mint. That
# expiry lands two minutes before this 13:00 UTC check, which therefore emailed
# "UNHEALTHY" for a gap one refresh closes. Running the refresh here closes the
# gap and turns the email into a signal that a human is actually needed (the
# advisor grant needs a browser re-auth, or the mint itself fails).
#
# Correction (2026-11-25): on 2026-11-23 the token was replaced during this check's
# 30s confirm wait (8 refreshes, 13:00:05-13:00:30 UTC), but the confirm retested the
# copy read at 13:00:01. The confirm now rereads CCPP. The refresh takes the same
# bc-mint.lock as cron-env-wrapper.sh, so the two never mint at the same time.
#
# Failure modes handled:
#   - token replaced mid-check                 -> confirm rereads CCPP, no refresh
#   - another job is minting                   -> wait up to 120s (one attempt); on lock
#                                                 timeout skip the refresh and re-probe
#   - transient Basecamp 401 on a valid token -> 30s confirm re-probe, no refresh
#   - expired token                            -> refresh, re-probe, no alert if 200
#   - refresh fails / grant dead               -> alert, with the refresh tail in it
#   - probe step itself errors (CCPP down)     -> refresh attempted, re-probed; if it
#                                                 still errors: logged, exit 3, no email
# Not handled: Mandrill down or CCPP unreachable (logged, exit non-zero; the cron
# log /var/log/bc-token-health.log is the record).
#
# Runs on the prod VPS host; probe work happens inside the backend container, which
# holds the CCPP (MSSQL) creds AND the Mandrill creds. Never prints the token.
# Idempotent: a healthy run is read-only; the refresh it may run is itself safe to rerun.
#
#   manual:  bash scripts/bcTokenHealthCheck.sh
#   cron:    0 13 * * * /opt/colaberry-accelerator/scripts/bcTokenHealthCheck.sh
#   test:    bash scripts/__tests__/bcTokenHealthCheck.test.sh
set -uo pipefail

ACCOUNT='3945211'
BACKEND='accelerator-backend'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REFRESH_SCRIPT="${BC_REFRESH_SCRIPT:-$SCRIPT_DIR/refreshBasecampTokenFromVault.sh}"
LOG="${BC_HEALTH_LOG:-/opt/colaberry-accelerator/tmp/basecamp-health.log}"
CONFIRM_DELAY_MS="${BC_HEALTH_CONFIRM_DELAY_MS:-30000}"
MINT_LOCK="${BC_MINT_LOCK:-/opt/colaberry-accelerator/tmp/ops-engine/bc-mint.lock}"   # same file as cron-env-wrapper.sh

mkdir -p "$(dirname "$LOG")" "$(dirname "$MINT_LOCK")"
exec > >(tee -a "$LOG") 2>&1
echo "===== bc-token-health $(date -u +%Y-%m-%dT%H:%M:%SZ) ====="

# Probe the active CCPP token. Exit 0 = healthy, 2 = unhealthy, 3 = probe error.
# With BC_ALERT=1 an unhealthy result also emails Ali (BC_REFRESH_NOTE is included).
PROBE_JS='
const sql = require("mssql");
async function readToken() {
  await sql.connect({
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || "1433", 10),
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE || "CCPP",
    options: { encrypt: true, trustServerCertificate: true },
  });
  const row = (await new sql.Request().query(
    "SELECT TOP 1 AccessToken FROM Basecamp_AuthInfo WHERE IsActive=1 ORDER BY BasecampAuthInfoID DESC"
  )).recordset[0];
  await sql.close();
  return String((row && row.AccessToken) || "").replace(/^Bearer\s+/i, "").trim();
}
(async () => {
  let who = "";
  async function probe() {
    const tok = await readToken();   // every probe rereads: another job may have replaced the token
    try {
      const r = await fetch("https://3.basecampapi.com/'"$ACCOUNT"'/my/profile.json",
        { headers: { Authorization: "Bearer " + tok, "User-Agent": "bc-token-health" },
          signal: AbortSignal.timeout(15000) });
      if (r.status === 200) { const p = await r.json(); who = p.name + " #" + p.id; }
      return r.status;
    } catch (e) { return -1; }
  }

  // Basecamp transiently rejects a perfectly valid token: on 2026-08-17 the
  // byte-identical token probed 200 at 08:00, 401 at 08:45, and 200 again nine
  // minutes later. An unhealthy result must be confirmed by a second probe.
  let status = await probe();
  if (status !== 200) {
    console.log("PROBE HTTP " + status + " - re-probing in " + process.env.BC_CONFIRM_DELAY_MS + "ms");
    await new Promise((done) => setTimeout(done, parseInt(process.env.BC_CONFIRM_DELAY_MS, 10)));
    const confirm = await probe();
    console.log("CONFIRM HTTP " + confirm);
    if (confirm === 200) {
      console.log("recovered after " + status + " (transient or token replaced); token is healthy");
      return;
    }
    status = confirm;
  }

  console.log("PROBE HTTP " + status + (who ? " (" + who + ")" : ""));
  if (status === 200) return;                 // healthy -> nothing to do
  if (process.env.BC_ALERT !== "1") process.exit(2);

  if (!process.env.MANDRILL_API_KEY) { console.error("UNHEALTHY (" + status + ") and MANDRILL_API_KEY unset; logged only"); process.exit(2); }
  const nm = require("nodemailer");
  const t = nm.createTransport({ host: "smtp.mandrillapp.com", port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || "ali@colaberry.com", pass: process.env.MANDRILL_API_KEY } });
  await t.sendMail({
    from: "\"BC Token Health\" <ali@colaberry.com>", to: "ali@colaberry.com",
    subject: "[Basecamp Token] UNHEALTHY after auto-refresh - active CCPP token probes HTTP " + status,
    text: "The active Basecamp token in CCPP.Basecamp_AuthInfo failed its health probe, the health check then ran "
      + "refreshBasecampTokenFromVault.sh --commit itself, and the token STILL fails (HTTP " + status + ").\n\n"
      + "Until this is fixed, every Basecamp-dependent job and Claude Code session across all projects will 401.\n\n"
      + "Refresh output (tail):\n" + (process.env.BC_REFRESH_NOTE || "(none)") + "\n\n"
      + "Most likely the advisor app vault grant needs a browser re-auth:\n"
      + "  https://advisor.colaberry.ai/profile/connect-basecamp (sign in as the human colaberry.com account)\n"
      + "Then on root@95.216.199.47 run\n"
      + "  /opt/colaberry-accelerator/scripts/refreshBasecampTokenFromVault.sh --commit",
    headers: { "X-MC-Track": "none", "X-MC-AutoText": "false" },
  });
  console.error("UNHEALTHY (" + status + ") - alert emailed to ali@colaberry.com");
  process.exit(2);
})().catch((e) => { console.error("health check error: " + e.message); process.exit(3); });
'

run_probe() {  # $1 = alert flag (0|1), $2 = refresh note
  docker exec -e BC_ALERT="$1" -e BC_REFRESH_NOTE="$2" -e BC_CONFIRM_DELAY_MS="$CONFIRM_DELAY_MS" \
    "$BACKEND" node -e "$PROBE_JS"
}

run_probe 0 ''
rc=$?
[ "$rc" -eq 0 ] && exit 0

echo "UNHEALTHY (probe exit $rc) - running $REFRESH_SCRIPT --commit before alerting"
# The refresh never prints the token (8-char prefix only). Exit 75 = lock not acquired.
REFRESH_OUT=$(flock -w 120 -E 75 "$MINT_LOCK" "$REFRESH_SCRIPT" --commit 2>&1)
refresh_rc=$?
printf '%s\n' "$REFRESH_OUT" | tail -n 8 | sed 's/^/  refresh| /'
[ "$refresh_rc" -eq 75 ] && REFRESH_OUT="mint lock busy for 120s; refresh skipped"
echo "refresh exit $refresh_rc - re-probing"

run_probe 1 "exit $refresh_rc
$(printf '%s\n' "$REFRESH_OUT" | tail -n 8)"
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "HEALED by refresh - token healthy, no alert sent"
  exit 0
fi
exit "$rc"
