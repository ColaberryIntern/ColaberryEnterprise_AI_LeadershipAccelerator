#!/usr/bin/env node
// Phase 1 v0 deployed + populated. Honest summary including the OOM detour.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:780px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Phase 1 v0 LIVE · with one honest detour</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">5,657 active todos scored. 298 in your "human required" queue right now. Triage page is real.</h1>
<div style="font-size:13px;color:#cbd5e0">Priority Engine v0 (rule-based, no LLM) deployed on top of the BC mirror. Each /admin/ops queue item now shows a color-coded urgency badge + category chip. Center column is a live Triage Breakdown.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What is live now</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px">Metric</th>
<th style="padding:10px 14px;text-align:left;font-size:11px">Value</th>
</tr></thead>
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Active todos scored</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">5,657</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Total mirror size (incl. completed/trashed)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">28,822</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">human_required (score >=60 + assigned)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">298</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">waiting_dependency (no due + >7d stale)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#78350f;font-weight:700">85</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Red badges (urgency >=70)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">2,384</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Amber badges (urgency >=40)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#78350f;font-weight:700">3,188</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Audit rows in ops_ai_assessments</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">5,656</td></tr>
<tr><td style="padding:8px 12px">Container restarts since fix</td><td style="padding:8px 12px;color:#14532d;font-weight:700">0</td></tr>
</tbody>
</table>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">The honest detour</h2>
<p style="font-size:14px">First Phase 1 deploy OOM'd the backend within 90 seconds of the first cron tick. The container has a 512 MB heap cap and my v0 was loading 374 todos as full Sequelize model instances, calling <code>Model.update()</code> + <code>Model.create()</code> per row for the audit trail. The framework overhead alone (association graphs, change tracking, validation) was holding multiple-hundred MB resident.</p>
<p style="font-size:14px"><strong>Fix in <code>c584e4a2</code>:</strong> refactored the engine to raw <code>SELECT</code> only the 7 columns the scorer needs (no model hydration), pagination at 200 rows per page, per-row <code>UPDATE</code> via raw SQL, and audit inserts via <code>OpsAiAssessment.bulkCreate(chunk, { validate: false })</code> in sub-batches of 100. Working set stays bounded regardless of how many todos exist.</p>
<p style="font-size:14px"><strong>Lesson saved:</strong> on the prod 512 MB heap, never use <code>Model.findAll() + per-row Model.update()</code> over more than ~50 rows. Always raw SELECT + raw UPDATE + bulkCreate. This is now in PROGRESS.md as a rule.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">One quirk in the top scores</h2>
<p style="font-size:14px">The top 10 urgency scores all hit 95, but six of them are duplicated curriculum template tasks ("Visualize Key Insights/Key Takeaways", "Project Intro and Problem Statement") repeating across cohorts. The v0 scorer has no project-level weight yet, so high-velocity / low-stakes projects get the same per-row signal as your strategic projects.</p>
<p style="font-size:14px"><strong>Phase 1.1 ask:</strong> add an <code>ops_project_config</code> table with a <code>weight</code> column (0.0 to 2.0). I will surface a per-project setting on <code>/admin/ops</code> so you can dial high-velocity admin projects down without losing them from the queue.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What is next in Phase 1</h2>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Approval workspace UI</strong> - per-todo decision panel with 4-branch decision tree (Approve / Approve+Continue / Revise / Reject), BC write-back as a comment, queue item closes on decision.</li>
<li><strong>Run My Day</strong> mode - sequenced top-5 actions ordered by urgency_score + estimated_review_seconds. The "what do I do next" surface.</li>
<li><strong>metrics_daily nightly rollup</strong> so the Today's Pulse tile (currently empty) lights up with approvals_completed / hours_saved / etc.</li>
<li><strong>Per-project weight</strong> (the quirk fix above).</li>
</ol>

<p style="font-size:14px;margin:18px 0 0">Go to <a href="https://enterprise.colaberry.ai/admin/ops" style="color:#1a365d;font-weight:700">enterprise.colaberry.ai/admin/ops</a> and look at the queue. If the chips look wrong, the score thresholds feel off, or the top items aren't actually the top items in your head - tell me and I tune the rules before Phase 1.1 lands on top.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Ali - Phase 1 v0 (Priority Engine + UI chips) is live on prod. 5,657 active todos scored.

NUMBERS:
- 5,657 active todos scored
- 28,822 total mirror size (incl. completed/trashed BC todos, correctly skipped from scoring)
- 298 in your "human_required" queue (score >=60 + assigned)
- 85 in "waiting_dependency" (no due + >7d stale)
- 2,384 red badges (urgency >=70), 3,188 amber (>=40)
- 5,656 audit rows in ops_ai_assessments
- 0 container restarts since the fix

THE HONEST DETOUR: First deploy OOM'd in 90s. The backend has a 512MB heap; my v0 was loading 374 todos as full Sequelize model instances + per-row Model.update/create. Framework overhead alone held multi-hundred MB.

FIX in c584e4a2: raw SELECT only the 7 columns needed (no model hydration), pagination at 200/page, raw UPDATE per row, bulkCreate(chunks of 100, validate:false) for the audit trail. Working set bounded regardless of todo count.

LESSON SAVED: on the 512MB prod heap, never Model.findAll() + per-row Model.update() over more than ~50 rows. Now in PROGRESS.md as a rule.

ONE QUIRK: Top 10 scores all hit 95, but 6 are duplicated curriculum template tasks ("Visualize Key Insights/Key Takeaways", "Project Intro and Problem Statement") repeating across cohorts. v0 has no project-level weight. Phase 1.1: add ops_project_config.weight (0.0-2.0) so high-velocity admin projects can be down-weighted without losing them.

WHAT IS NEXT IN PHASE 1:
1. Approval workspace UI (4-branch decision tree + BC write-back)
2. Run My Day mode (sequenced top-5 actions)
3. metrics_daily nightly rollup (lights up Today's Pulse tile)
4. Per-project weight (the quirk fix above)

Page: enterprise.colaberry.ai/admin/ops. Tell me if anything in the chips / score thresholds / top items looks wrong before Phase 1.1 lands.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114,
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - Phase 1 v0 live (5,657 todos scored, 298 in your human_required queue, 1 OOM detour fixed)',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Phase 1 v0 (rule-based Priority Engine + category chips UI) is deployed to prod. First deploy OOM\'d under the 512MB heap because the engine hydrated 374 Sequelize model instances + did per-row Model.update/create. Fixed in commit <code>c584e4a2</code> by refactoring to raw SELECT (no hydration) + paginated UPDATE + bulkCreate audit inserts. After redeploy: 5,657 active todos scored, 298 in <code>human_required</code>, 85 in <code>waiting_dependency</code>, 0 restarts. Top scores all hit 95 - duplicated curriculum templates across cohorts; Phase 1.1 adds per-project weights to fix. Next surfaces: Approval workspace UI, Run My Day, nightly metrics_daily rollup.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
