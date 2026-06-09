#!/usr/bin/env node
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
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Phase 1.3 LIVE</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">Run My Day + Today's Pulse + nightly metrics rollup shipped.</h1>
<div style="font-size:13px;color:#cbd5e0">Three surfaces. The green "Run My Day" button at the top of /admin/ops opens a focused walk through your top-5 unresolved tasks with all workspaces pre-loaded. Today's Pulse tile lights up in the System Health drawer.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">Run My Day</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li>Click the green <strong>Run My Day</strong> button (header, left of Re-score).</li>
<li>You get a focused panel above your project tabs with the top-5 highest-urgency tasks you have NOT already decided today. All 5 workspaces auto-expand with their suggestions + tools/skills/agents/workflows + BC comments + decision form pre-loaded.</li>
<li><strong>Approve + next</strong> on each task auto-advances + scrolls to the next. Sweep the 5 in one focused session.</li>
<li><strong>Reload top 5</strong> refetches the queue (in case priorities shifted while you were deciding).</li>
<li><strong>Exit Run My Day</strong> returns to the normal queue view.</li>
<li>Tasks you have already decided today are excluded automatically (no re-deciding the same thing).</li>
</ul>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Today's Pulse tile</h2>
<p style="font-size:14px">In the System Health drawer (bottom toggle), Today's Pulse now reads from a live <code>ops_metrics_daily</code> rollup:</p>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Decisions completed</strong> today</li>
<li><strong>Avg time per decision</strong> (decided_at - enqueued_at)</li>
<li><strong>Hours saved (est)</strong> — conservative 0.25h per decision for v0; Phase 2 will tune from real durations + artifact class</li>
<li><strong>Approvals still open</strong></li>
</ul>
<p style="font-size:14px">A 5-minute cron in the backend refreshes the rollup automatically; <code>POST /api/admin/ops/metrics/rollup</code> is available if you want a manual recompute.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What I deferred (and why)</h2>
<p style="font-size:14px"><strong>CB-managed auto-detection</strong> (the planned third Phase 1.3 item) is on hold. The double-click-to-dim tab toggle already covers the use case, and auto-detection via "@CB activity in last 30 days" without a clean signal source would just guess. Once we lean on the existing <code>inbound-dispatcher.js</code> event feed in Phase 1.4 / 2, the signal becomes deterministic.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Open the page</h2>
<p style="font-size:14px"><a href="https://enterprise.colaberry.ai/admin/ops" style="color:#1a365d;font-weight:700">enterprise.colaberry.ai/admin/ops</a> · click <strong>Run My Day</strong> and sweep the first 5. If anything in the flow feels off (top-5 selection wrong, Approve+next scrolling odd, Today's Pulse numbers wrong) tell me before I move on.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Ali - Phase 1.3 live on prod.

RUN MY DAY:
- Green "Run My Day" button in the header opens a focused panel with your top-5 highest-urgency tasks (you haven't already decided today)
- All 5 workspaces pre-loaded: suggestion + tools/skills/agents/workflows + BC comments + decision form
- Approve+next auto-advances + scrolls to next
- "Reload top 5" / "Exit Run My Day" controls
- Tasks you decided today are excluded automatically

TODAY'S PULSE TILE (in System Health drawer):
- Decisions completed
- Avg time per decision
- Hours saved (est) — conservative 0.25h per decision for v0
- Approvals still open
- 5-min auto-refresh cron + manual POST /metrics/rollup

DEFERRED: CB-managed auto-detection. The double-click tab toggle works; auto-detect via @CB activity needs a clean signal source we'll have in Phase 1.4 via inbound-dispatcher.

enterprise.colaberry.ai/admin/ops · click Run My Day. If anything looks off (top-5 selection wrong, Approve+next scrolling odd, Today's Pulse numbers wrong) tell me before I move on.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - Run My Day live + Today\'s Pulse tile + nightly metrics rollup (Phase 1.3)',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Phase 1.3 deployed (commit <code>260acf05</code>). Three surfaces: (1) Green "Run My Day" header button opens a focused panel with Ali\'s top-5 highest-urgency unresolved-today tasks, all workspaces pre-loaded, Approve+next auto-advances. (2) Today\'s Pulse tile in the System Health drawer now reads from <code>ops_metrics_daily</code>: decisions completed, avg time, hours saved (est 0.25h/decision conservative), open approvals. (3) New <code>ops_metrics_daily</code> rollup service runs on a 5-min cron + has a manual POST trigger. CB-managed auto-detection deferred until Phase 1.4 (needs a clean @CB activity signal source). All endpoints 401 on auth gate, 0 restarts since deploy.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
