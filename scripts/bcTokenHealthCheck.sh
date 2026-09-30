#!/usr/bin/env bash
# bcTokenHealthCheck.sh — daily probe of the active Basecamp token in
# CCPP.Basecamp_AuthInfo. If it is not healthy (BC /my/profile.json != 200) it
# emails ali@colaberry.com, so a failed refresh surfaces as an ALERT instead of
# silently breaking every Basecamp-dependent job and Claude Code session.
#
# Backstop to scripts/refreshBasecampTokenFromVault.sh: the refresh cron keeps
# CCPP fresh every ~3 days; this is the smoke detector for when that fails (e.g.
# the advisor OAuth grant itself needs re-authorization). Read-only on success.
#
# Runs on the prod VPS host; all work happens inside the backend container, which
# holds the CCPP (MSSQL) creds AND the Mandrill creds. Never prints the token.
#
#   manual:  bash scripts/bcTokenHealthCheck.sh
#   cron:    0 13 * * * /opt/colaberry-accelerator/scripts/bcTokenHealthCheck.sh
set -uo pipefail

ACCOUNT='3945211'
BACKEND='accelerator-backend'
LOG='/opt/colaberry-accelerator/tmp/basecamp-health.log'

mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1
echo "===== bc-token-health $(date -u +%Y-%m-%dT%H:%M:%SZ) ====="

docker exec "$BACKEND" node -e '
const sql = require("mssql");
(async () => {
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
  const tok = String((row && row.AccessToken) || "").replace(/^Bearer\s+/i, "").trim();

  let who = "";
  async function probe() {
    try {
      const r = await fetch("https://3.basecampapi.com/'"$ACCOUNT"'/my/profile.json",
        { headers: { Authorization: "Bearer " + tok, "User-Agent": "bc-token-health" } });
      if (r.status === 200) { const p = await r.json(); who = p.name + " #" + p.id; }
      return r.status;
    } catch (e) { return -1; }
  }

  // Basecamp transiently rejects a perfectly valid token: on 2026-08-17 the
  // byte-identical token probed 200 at 08:00, 401 at 08:45, and 200 again nine
  // minutes later. A smoke detector that alerts on one bad probe would page Ali
  // for a blip, so an unhealthy result must be confirmed by a second probe.
  let status = await probe();
  if (status !== 200) {
    console.log("PROBE HTTP " + status + " - re-probing in 30s before alerting");
    await new Promise((done) => setTimeout(done, 30000));
    const confirm = await probe();
    console.log("CONFIRM HTTP " + confirm);
    if (confirm === 200) {
      console.log("transient " + status + "; token is healthy, no alert sent");
      return;
    }
    status = confirm;
  }

  console.log("PROBE HTTP " + status + (who ? " (" + who + ")" : ""));
  if (status === 200) return;                 // healthy -> nothing to do

  // Unhealthy: alert.
  if (!process.env.MANDRILL_API_KEY) { console.error("UNHEALTHY (" + status + ") and MANDRILL_API_KEY unset; logged only"); process.exit(2); }
  const nm = require("nodemailer");
  const t = nm.createTransport({ host: "smtp.mandrillapp.com", port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || "ali@colaberry.com", pass: process.env.MANDRILL_API_KEY } });
  await t.sendMail({
    from: "\"BC Token Health\" <ali@colaberry.com>", to: "ali@colaberry.com",
    subject: "[Basecamp Token] UNHEALTHY - active CCPP token probes HTTP " + status,
    text: "The active Basecamp token in CCPP.Basecamp_AuthInfo failed its health probe TWICE, 30s apart (HTTP " + status + "), so this is not a transient blip.\n\n"
      + "The 3-day refresh cron likely failed, or the advisor OAuth grant needs re-authorization. Until this is fixed, "
      + "every Basecamp-dependent job and Claude Code session across all projects will 401.\n\n"
      + "Fix: ssh root@95.216.199.47, then\n"
      + "  /opt/colaberry-accelerator/scripts/refreshBasecampTokenFromVault.sh --commit\n"
      + "If that also fails, the advisor app vault grant needs a browser re-auth.",
    headers: { "X-MC-Track": "none", "X-MC-AutoText": "false" },
  });
  console.error("UNHEALTHY (" + status + ") - alert emailed to ali@colaberry.com");
  process.exit(2);
})().catch((e) => { console.error("health check error: " + e.message); process.exit(3); });
'
