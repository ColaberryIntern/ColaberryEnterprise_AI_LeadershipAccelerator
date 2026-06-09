#!/usr/bin/env node
// Phase 0 progress report to Ali — AI Ops Command Center foundation shipped.
// Sent through sendWithBcAttach so it auto-attaches to ticket 9953889114
// (AI_ProjectArchitect Overview).
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#0b1220 0%,#1d3a8a 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">AI Ops Command Center · Phase 0 landed</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">Foundation shipped. Basecamp mirror will start the moment the next backend deploy lands.</h1>
<div style="font-size:13px;color:#cbd5e0">After your "go" on the architecture brief, Phase 0 is now in main and pushed to origin. tsc clean on backend AND frontend. Phase 1 (Priority Engine, Approval workspace, Run My Day) starts next. MVP target unchanged: 2026-06-16.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What landed (commit d2615239)</h2>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px;margin-top:8px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px">Layer</th>
<th style="padding:10px 14px;text-align:left;font-size:11px">What it is</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong>Data</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">4 Sequelize models: <code>OpsBcTodo</code> (BC todo mirror with urgency/AI-opportunity/brand scores + 7-state category), <code>OpsAiAssessment</code> (scoring audit trail + LLM cost), <code>OpsApprovalQueueItem</code> (the Waiting-on-Human queue), <code>OpsMetricsDaily</code> (pre-aggregated dashboard rollup). All 4 auto-create on next backend boot via <code>sequelize.sync</code>.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong>Sync</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><code>backend/src/services/ops/bcSyncService.ts</code> pulls every BC project to todoset to todolists to todos, upserts by bc_id. Idempotent (multiple concurrent passes converge to the same end state). Cron every 2 min in <code>server.ts</code>, matching the Phase 0 exit criterion: all BC activity visible in our DB within 2 minutes.</td></tr>
<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong>API</strong></td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><code>backend/src/routes/admin/opsRoutes.ts</code> mounted under <code>/api/admin/ops/*</code>:<br/>&nbsp;&nbsp;<code>GET /health</code> - readiness + last sync stats<br/>&nbsp;&nbsp;<code>GET /todos</code> - open queue (sorted by urgency, due, updated)<br/>&nbsp;&nbsp;<code>GET /metrics/today</code> - today's KPI tile<br/>&nbsp;&nbsp;<code>POST /sync</code> - manual re-sync trigger (409 if in-flight)<br/>All gated by <code>requireAdmin</code>.</td></tr>
<tr><td style="padding:10px 14px;vertical-align:top"><strong>UI</strong></td><td style="padding:10px 14px"><code>/admin/ops</code> route. Three-column dark UI (Bloomberg-meets-Salesforce per the brief): KPI tile row at top, Waiting on Human queue (left), Today's Pulse placeholder (center), System Health sync stats (right). Refresh every 30s. Manual "Re-sync from Basecamp" button.</td></tr>
</tbody>
</table>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Verification</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li><code>npx tsc --noEmit</code> passes clean for backend AND frontend. No warnings.</li>
<li>12 files changed, 1089 insertions. Commit <code>d2615239</code> pushed to <code>origin/main</code>.</li>
<li>Models registered in <code>backend/src/models/index.ts</code> so tables auto-create on next backend boot — no manual migration needed.</li>
<li>BC sync cron added to <code>server.ts</code> next to the existing intelligence + Architect polling crons.</li>
</ul>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What's next (Phase 1, target 2026-06-16)</h2>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Priority Engine v0</strong> - rule-based scorer. No LLM yet. Inputs: due date, downstream blocked count, last_human_action_at, assignee load. Output: <code>urgency_score</code> 0-100 written to <code>ops_bc_todos</code> after each sync.</li>
<li><strong>Waiting on Human</strong> sorted by urgency_score (the queue panel becomes useful, not just a list).</li>
<li><strong>Approval workspace</strong> - per-item panel: artifact preview, recommended decision, confidence, 4-branch decision tree (Approve / Approve+Continue / Revise / Reject). Writes back to BC as a comment.</li>
<li><strong>Run My Day</strong> mode (basic) - sequenced list of "next 5 decisions you should make in the next 60 minutes."</li>
<li><strong>metrics_daily</strong> nightly rollup cron so the Today's Pulse tile lights up with real numbers.</li>
</ol>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Deploy posture</h2>
<p style="font-size:14px">Code is in main. Per your deploy-timing rule, no production deploy mid-day. When you greenlight the next after-hours deploy of the backend + nginx, the BC mirror starts populating within 2 minutes and <code>/admin/ops</code> goes live. Until then, this is all dormant on prod.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Honest scope note</h2>
<p style="font-size:14px">The brief's enterprise schema has 12 tables. Phase 0 lit up 4 (the MVP-critical ones). The remaining 8 (artifacts, meetings, skills, skill_runs, communications, automation_rules, audit_log, sync_state) ship across Phases 1-3 as the surfaces that need them come online. Also, BC sync is full-poll-every-2-min for now; switches to <code>/events.json</code> incremental polling with a per-project cursor in Phase 2 once we feel the load.</p>

<p style="font-size:14px;margin:18px 0 0">If any of the Phase 0 choices need adjustment before I keep building, tell me now and I tighten it before Phase 1 lands on top.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Ali - AI Ops Command Center Phase 0 landed.

COMMIT d2615239 on origin/main. tsc clean for backend AND frontend.

WHAT LANDED:
- Data: 4 Sequelize models (ops_bc_todos mirror + scores, ops_ai_assessments audit trail, ops_approval_queue, ops_metrics_daily). Auto-create on next backend boot.
- Sync: backend/src/services/ops/bcSyncService.ts pulls every BC project -> todoset -> todolists -> todos, upserts by bc_id (idempotent). Cron every 2 min in server.ts. Matches the Phase 0 exit criterion.
- API: /api/admin/ops/health, /todos, /metrics/today, POST /sync. All requireAdmin.
- UI: /admin/ops three-column dark shell - KPI tiles row, Waiting on Human queue (left), Today's Pulse placeholder (center), System Health (right). 30s polling + manual Re-sync.

WHAT'S NEXT (Phase 1, target 2026-06-16):
1. Priority Engine v0 - rule-based scorer, no LLM yet. Writes urgency_score per todo each sync.
2. Waiting on Human sorted by urgency_score.
3. Approval workspace - per-item panel with 4-branch decision tree, writes back to BC.
4. Run My Day mode (basic) - "next 5 decisions" sequenced.
5. metrics_daily nightly rollup cron so Today's Pulse lights up.

DEPLOY POSTURE: Code is in main. Per your deploy-timing rule, no mid-day prod deploy. When you greenlight the next after-hours backend + nginx deploy, the BC mirror starts within 2 min and /admin/ops goes live.

HONEST SCOPE NOTE: Brief has 12 enterprise tables. Phase 0 lit up 4 (MVP-critical). Remaining 8 ship across Phases 1-3 as their surfaces come online. BC sync is full-poll for now; switches to /events.json incremental polling in Phase 2.

If any Phase 0 choices need adjustment before Phase 1 lands on top, tell me now.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114, // AI_ProjectArchitect Overview todo
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - AI Ops Command Center Phase 0 landed (commit d2615239, tsc clean, ready for next after-hours deploy)',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Phase 0 of the AI Ops Command Center is in <code>main</code> at commit <code>d2615239</code>. Foundation: 4 Sequelize models (ops_bc_todos / ops_ai_assessments / ops_approval_queue / ops_metrics_daily), BC sync worker that pulls every project to todoset to todolists to todos every 2 min (idempotent upsert by bc_id), <code>/api/admin/ops/*</code> admin route module, and <code>/admin/ops</code> 3-column frontend shell. <code>tsc --noEmit</code> passes clean both sides. Tables auto-create on next backend boot via <code>sequelize.sync({ alter: true })</code>. Mirror starts populating within 2 min of the next deploy. Phase 1 (rule-based Priority Engine, Approval workspace, Run My Day, metrics_daily rollup) starts next, MVP target 2026-06-16.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
