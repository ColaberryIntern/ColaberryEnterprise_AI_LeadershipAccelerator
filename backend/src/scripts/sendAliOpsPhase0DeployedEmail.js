#!/usr/bin/env node
// AI Ops Command Center is LIVE on prod. Status report + one ask: add
// BASECAMP_ACCESS_TOKEN to /opt/colaberry-accelerator/.env so the mirror
// can start populating.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">AI Ops Command Center · LIVE on prod</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">Deployed. Tables created. Endpoints up. One ask: drop the BC token into prod .env.</h1>
<div style="font-size:13px;color:#cbd5e0">Per your "deploy and proceed", just pushed Phase 0 to the VPS. Backend + nginx rebuilt + recreated. All four <code>ops_*</code> tables exist in <code>accelerator_prod</code>. <code>/admin/ops</code> page is reachable. BC mirror is wired but waiting on a token that the prod env doesn't have.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What is live (verified just now)</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px">Check</th>
<th style="padding:10px 14px;text-align:left;font-size:11px">Status</th>
</tr></thead>
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Backend boot</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d"><strong>OK</strong> - <code>Server running on port 3001</code></td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Backend <code>/health</code></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d"><strong>HTTP 200</strong></td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Ops route <code>/api/admin/ops/health</code></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d"><strong>HTTP 401</strong> - route is alive, <code>requireAdmin</code> gate working as designed</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><code>ops_bc_todos</code> table</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d"><strong>Created</strong></td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><code>ops_ai_assessments</code> table</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d"><strong>Created</strong></td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><code>ops_approval_queue</code> table</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d"><strong>Created</strong></td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><code>ops_metrics_daily</code> table</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d"><strong>Created</strong></td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Frontend <code>/admin/ops</code> route</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d"><strong>Live</strong> - nginx multi-stage build deployed</td></tr>
<tr><td style="padding:8px 12px">BC sync cron (every 2 min)</td><td style="padding:8px 12px;color:#7f1d1d"><strong>Firing but failing auth</strong> - prod .env missing BASECAMP_ACCESS_TOKEN</td></tr>
</tbody>
</table>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">One issue surfaced + fixed mid-deploy</h2>
<p style="font-size:14px"><code>sequelize.sync({ alter: true })</code> on prod was failing on a pre-existing <code>ux_remediation_outcomes</code> index conflict - then the fallback create-only sync was hitting the same conflict, so NONE of the 215 models were syncing. The four new <code>ops_*</code> tables were never created on the first deploy.</p>
<p style="font-size:14px">Fixed by adding <code>ensureOpsCommandCenterSchema()</code> in <code>server.ts</code> that runs explicit <code>CREATE TABLE IF NOT EXISTS</code> for the four tables BEFORE the sync, same pattern as <code>ensureIngestionSchema</code> already does for lead-ingestion tables. Committed (<code>778144f3</code>), redeployed, all four tables now exist.</p>

<div style="background:#fef2f2;border-left:5px solid #c1272d;border-radius:0 6px 6px 0;padding:14px 18px;margin-top:18px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7f1d1d;font-weight:700">One ask before mirror goes live</div>
<div style="font-size:14px;color:#1f2937;margin-top:6px">Add this line to <code>/opt/colaberry-accelerator/.env</code> on the VPS, then <code>docker compose -f docker-compose.production.yml restart backend</code>:</div>
<pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px 14px;font-size:12px;margin-top:8px;overflow-x:auto">BASECAMP_ACCESS_TOKEN=&lt;your current BC token&gt;</pre>
<div style="font-size:13px;color:#475569;margin-top:8px">Token rotates every 2 weeks - pull the live one from <code>CCPP.Basecamp_AuthInfo</code> per the standing pattern. Within 2 minutes of the restart the mirror starts populating; <code>/admin/ops</code> will show the open queue.</div>
<div style="font-size:13px;color:#475569;margin-top:8px">Long-term fix for Phase 1: wire <code>bcSyncService</code> to pull the token from CCPP on each run so the 2-week rotation is auto-handled. Tracking that as a Phase 1 task.</div>
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Reach the page now</h2>
<p style="font-size:14px"><a href="https://enterprise.colaberry.ai/admin/ops" style="color:#1a365d;font-weight:700">enterprise.colaberry.ai/admin/ops</a> - log in with your admin_token first (same JWT the rest of <code>/admin</code> uses). You will see the 3-column shell (KPI tiles, Waiting on Human, Today's Pulse placeholder, System Health). Open queue + sync stats will populate within 2 min of the token being added.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What I am doing next (no input needed)</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li>Starting Phase 1 — rule-based Priority Engine (no LLM), Approval workspace UI, Run My Day basic, nightly <code>metrics_daily</code> rollup. Target ship date unchanged: 2026-06-16.</li>
<li>Will not deploy again mid-day. Phase 1 code goes into <code>main</code> as it lands; you greenlight the next after-hours deploy.</li>
</ul>

<p style="font-size:14px;margin:18px 0 0">If anything in the shell looks wrong once you log in, tell me and I tighten it before Phase 1 lands on top.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Ali - AI Ops Command Center is LIVE on prod. One ask: drop BC token into prod .env.

VERIFIED JUST NOW:
- Backend /health: HTTP 200
- Ops route /api/admin/ops/health: HTTP 401 (requireAdmin gate working as designed)
- ops_bc_todos table: created
- ops_ai_assessments table: created
- ops_approval_queue table: created
- ops_metrics_daily table: created
- Frontend /admin/ops: live
- BC sync cron (every 2 min): firing but failing auth (token missing)

ONE ISSUE SURFACED + FIXED MID-DEPLOY: sequelize.sync({alter:true}) on prod was failing on a pre-existing ux_remediation_outcomes index conflict, and the fallback create-only sync was hitting the same conflict, so NONE of the 215 models were syncing. Fixed with explicit ensureOpsCommandCenterSchema() running CREATE TABLE IF NOT EXISTS before sync - same pattern as ensureIngestionSchema. Commit 778144f3.

ONE ASK BEFORE MIRROR GOES LIVE: Add to /opt/colaberry-accelerator/.env:
  BASECAMP_ACCESS_TOKEN=<current BC token from CCPP.Basecamp_AuthInfo>
Then: docker compose -f docker-compose.production.yml restart backend
Within 2 min the mirror starts populating + /admin/ops shows the open queue.

LONG-TERM (Phase 1): wire bcSyncService to pull the token from CCPP each run so the 2-week rotation is auto-handled.

REACH THE PAGE: enterprise.colaberry.ai/admin/ops (log in with admin_token first).

WHAT IS NEXT: Starting Phase 1 (rule-based Priority Engine no LLM + Approval workspace + Run My Day basic + nightly metrics_daily rollup). Target 2026-06-16. Code lands in main; you greenlight the next after-hours deploy.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - AI Ops Command Center LIVE on prod (one ask: BC token into .env)',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>AI Ops Command Center Phase 0 is deployed to prod. Backend + nginx rebuilt at commit <code>778144f3</code>. All 4 <code>ops_*</code> tables created in <code>accelerator_prod</code> (verified). <code>/health</code> 200, <code>/api/admin/ops/health</code> 401 (gate working). <code>/admin/ops</code> reachable. Mid-deploy: <code>sequelize.sync</code> was blocked by a pre-existing index conflict elsewhere, so added an explicit <code>ensureOpsCommandCenterSchema</code> step mirroring the lead-ingestion pattern - tables now create reliably. One open ask: prod <code>.env</code> is missing <code>BASECAMP_ACCESS_TOKEN</code>; until Ali adds it (or Phase 1 wires CCPP rotation), the 2-min BC mirror cron fires but auth-fails. Phase 1 (Priority Engine + Approval workspace + Run My Day + metrics rollup) starts now toward 2026-06-16.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
