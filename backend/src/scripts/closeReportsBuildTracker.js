#!/usr/bin/env node
// Close reports-system build-tracker BC todo 9945676526 per Ali "1"
// greenlight. Send summary email + open 5 follow-up todos with due
// dates + mark tracker complete.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const BC = process.env.BASECAMP_ACCESS_TOKEN;
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211/buckets/7463955';
const TRACKER_TODO = 9945676526;
const AI_PRODUCTS_LIST = 9939449052;
const ALI_ID = 17454835;

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
    <div style="margin-top: 14px;">
      <a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
    </div>
  </td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory`;

const HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.55; max-width: 760px;">

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">Ali,</p>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">The unified reports system foundation is live and verified in production. The remaining build items split into 5 focused execution todos with due dates so each lands cleanly rather than as one multi-hour push.</p>

<h2 style="font-family: arial, sans-serif; font-size: 16px; color: #1a365d; margin: 22px 0 10px;">What is live today (verified in prod)</h2>

<p style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 6px;"><strong>Data layer</strong></p>
<ul style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 12px;">
<li><code>automated_reports</code> table: 10 reports seeded with name, cron_schedule, recipients, prompt, owner, last_run_at, last_status, last_message_id</li>
<li><code>automated_report_runs</code> table: per-run history (started_at, ended_at, status, message_ids, recipients_sent, error, triggered_by)</li>
</ul>

<p style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 6px;"><strong>Admin observability</strong></p>
<ul style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 12px;">
<li><code>/api/admin/automated-reports</code> (GET list + GET :id + GET :id/runs) behind requireAdmin</li>
<li><a href="https://enterprise.colaberry.ai/admin/reports" style="color:#2b6cb0">/admin/reports</a> page (<code>AdminReportsPage.tsx</code>) renders the report list with last-run status, recent runs, and a prompt editor</li>
</ul>

<p style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 6px;"><strong>Run recording</strong></p>
<ul style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 12px;">
<li><code>backend/src/scripts/lib/reportRunRecorder.js</code> wraps 5 reports (dailyClientProjectsReport, dailyGovContractsAnalysis, dailyInternNudges, weeklyCohortReport, weeklyInternReport)</li>
<li>All 5 show <code>success</code> in <code>automated_report_runs</code> for today 2026-06-03 (latest run timestamps 13:00-22:00 UTC)</li>
</ul>

<p style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 6px;"><strong>Inbox COS bypass</strong></p>
<ul style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 12px;">
<li>Hard rules in <code>backend/src/services/inbox/hardRuleEngine.ts</code> route <code>[Daily Report]</code> / <code>[Decisions Report]</code> / <code>[Weekly Report]</code> / <code>[Monthly Report]</code> subject-prefix mail to state INBOX priority 1 (no auto-archive)</li>
</ul>

<p style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 6px;"><strong>Phone-accessible delivery</strong></p>
<ul style="font-family: arial, sans-serif; font-size: 13px; color: #2d3748; margin: 0 0 12px;">
<li>alimuwwakkil@gmail.com on CC for the 4 daily project reports + Ali Personal Decisions + Anthropic + Gov Contracts via reportingRegistry STANDARD_RECIPIENTS</li>
</ul>

<h2 style="font-family: arial, sans-serif; font-size: 16px; color: #1a365d; margin: 22px 0 10px;">What is not yet shipped (split to 5 follow-up todos)</h2>
<table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-family: arial, sans-serif; font-size: 12.5px;">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:6px 10px;width:54%">Component</th><th align="left" style="padding:6px 10px">Due</th></tr></thead>
<tbody>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748">1. CRUD POST/PUT/DELETE on <code>/api/admin/automated-reports</code></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748">2026-06-10</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748">2. <code>POST /api/admin/automated-reports/:id/run-now</code></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748">2026-06-10</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748">3. AdminReportsPage create + delete buttons + wire prompt-edit save</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748">2026-06-12</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748">4. Wrap remaining 5 unrecorded reports with reportRunRecorder</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#2d3748">2026-06-10</td></tr>
<tr><td style="padding:6px 10px;color:#2d3748">5. Unified DB-driven runner replacing static REPORTS array</td><td style="padding:6px 10px;color:#2d3748">2026-06-17</td></tr>
</tbody>
</table>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; margin: 18px 0 0;">Closing the build-tracker todo (BC <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/9945676526">9945676526</a>) since the core deliverable (reports reaching inbox + phone gmail + verified) is in production and observable via /admin/reports.</p>

${SIG_HTML}

</div>`;

const TEXT = `Ali,

The unified reports system foundation is live and verified in production. The remaining build items split into 5 focused execution todos with due dates so each lands cleanly rather than as one multi-hour push.

WHAT IS LIVE TODAY (verified in prod):

Data layer
- automated_reports table: 10 reports seeded with name, cron_schedule, recipients, prompt, owner, last_run_at, last_status, last_message_id
- automated_report_runs table: per-run history (started_at, ended_at, status, message_ids, recipients_sent, error, triggered_by)

Admin observability
- /api/admin/automated-reports (GET list + GET :id + GET :id/runs) behind requireAdmin
- /admin/reports page (AdminReportsPage.tsx) renders the report list with last-run status, recent runs, and a prompt editor

Run recording
- backend/src/scripts/lib/reportRunRecorder.js wraps 5 reports (dailyClientProjectsReport, dailyGovContractsAnalysis, dailyInternNudges, weeklyCohortReport, weeklyInternReport)
- All 5 show success in automated_report_runs for today 2026-06-03 (latest run timestamps 13:00-22:00 UTC)

Inbox COS bypass
- Hard rules in backend/src/services/inbox/hardRuleEngine.ts route [Daily Report] / [Decisions Report] / [Weekly Report] / [Monthly Report] subject-prefix mail to state INBOX priority 1 (no auto-archive)

Phone-accessible delivery
- alimuwwakkil@gmail.com on CC for the 4 daily project reports + Ali Personal Decisions + Anthropic + Gov Contracts via reportingRegistry STANDARD_RECIPIENTS

WHAT IS NOT YET SHIPPED (split to follow-up todos with due dates):

1. CRUD POST/PUT/DELETE on /api/admin/automated-reports - due 2026-06-10
2. POST /api/admin/automated-reports/:id/run-now - due 2026-06-10
3. AdminReportsPage create + delete buttons + wire prompt-edit save - due 2026-06-12
4. Wrap remaining 5 unrecorded reports with reportRunRecorder - due 2026-06-10
5. Unified DB-driven runner replacing static REPORTS array - due 2026-06-17

Closing the build-tracker todo (BC 9945676526) since the core deliverable (reports reaching inbox + phone gmail + verified) is in production and observable via /admin/reports.

${SIG_TEXT}`;

// Follow-up todo specs (due dates per memory rule)
const FOLLOWUPS = [
  {
    content: 'Reports: CRUD POST/PUT/DELETE on /api/admin/automated-reports',
    due_on: '2026-06-10',
    description: `<div>
<p><strong>Origin:</strong> spun out of reports-system build tracker 9945676526 (closed 2026-06-03). Phase 1 (data layer + read-only admin API + admin UI list/detail) is live. This is the create/update/delete gap.</p>
<p><strong>Files:</strong> backend/src/routes/admin/automatedReportsRoutes.ts (add 3 handlers).</p>
<p><strong>Done criteria:</strong> POST /api/admin/automated-reports creates a row; PUT /api/admin/automated-reports/:id updates name/cron_schedule/recipients/prompt/enabled; DELETE /api/admin/automated-reports/:id soft-deletes (set enabled=false + add deleted_at column if not present). All behind requireAdmin. Manual test: round-trip create -> edit -> disable -> via curl with admin JWT.</p>
<p><strong>Estimated:</strong> ~2 hr.</p>
</div>`,
  },
  {
    content: 'Reports: POST /api/admin/automated-reports/:id/run-now (force-run from UI)',
    due_on: '2026-06-10',
    description: `<div>
<p><strong>Origin:</strong> spun out of reports-system build tracker 9945676526. Admin UI shows the list of reports but cannot trigger a one-off run.</p>
<p><strong>Files:</strong> backend/src/routes/admin/automatedReportsRoutes.ts (add POST handler) + frontend/src/pages/admin/AdminReportsPage.tsx (add "Run now" button per row).</p>
<p><strong>Done criteria:</strong> POST /api/admin/automated-reports/:id/run-now spawns the script referenced by script_path with triggered_by=req.user.email; logs to automated_report_runs; returns the new run id. UI shows running state then updates the row's last-run badge when complete. Manual test: click Run now on Cory Daily, see message_id appear in run record within 30s.</p>
<p><strong>Estimated:</strong> ~1 hr.</p>
</div>`,
  },
  {
    content: 'Reports: AdminReportsPage create + delete + wire prompt-edit save endpoint',
    due_on: '2026-06-12',
    description: `<div>
<p><strong>Origin:</strong> spun out of reports-system build tracker 9945676526. AdminReportsPage has a "Save prompt" button but no save endpoint wired; also no create or delete UI.</p>
<p><strong>Files:</strong> frontend/src/pages/admin/AdminReportsPage.tsx.</p>
<p><strong>Dependencies:</strong> requires CRUD endpoints from todo "Reports: CRUD POST/PUT/DELETE" landing first.</p>
<p><strong>Done criteria:</strong> "Save prompt" button calls PUT /api/admin/automated-reports/:id; toast confirms success; "New report" button opens a create modal with name/cron/recipients/prompt/enabled fields; per-row delete button with confirm-dialog. Manual test: create a test report, edit its prompt, run it, delete it.</p>
<p><strong>Estimated:</strong> ~2 hr.</p>
</div>`,
  },
  {
    content: 'Reports: wrap 5 remaining reports with reportRunRecorder (Cory daily/weekly, Decisions Owed Digest, Gov Contracts Daily original, Weekly Report)',
    due_on: '2026-06-10',
    description: `<div>
<p><strong>Origin:</strong> spun out of reports-system build tracker 9945676526. 5 of 10 reports in automated_reports table show NULL last_status because their scripts do not yet call reportRunRecorder.</p>
<p><strong>Files:</strong> the 5 script files corresponding to those DB rows. Add reportRunRecorder.start() at script top + reportRunRecorder.complete(msg_ids) on send + reportRunRecorder.fail(err) on catch.</p>
<p><strong>Done criteria:</strong> next scheduled fire of each report writes a row to automated_report_runs; admin UI for that report shows non-NULL last_status after first run.</p>
<p><strong>Estimated:</strong> ~1 hr (12 min per script).</p>
</div>`,
  },
  {
    content: 'Reports: unified DB-driven runner replacing static reportingRegistry REPORTS array',
    due_on: '2026-06-17',
    description: `<div>
<p><strong>Origin:</strong> spun out of reports-system build tracker 9945676526. Today reports fire via two parallel systems: (a) static REPORTS array in backend/src/scripts/lib/reportingRegistry.js dispatched by runReportingAuditAndSend.js, (b) ad-hoc crontab entries per script. The DB has all this data already in automated_reports.</p>
<p><strong>Files:</strong> new backend/src/scripts/runAutomatedReportsDispatcher.js. Eventually deprecate reportingRegistry.js + per-script crontab entries.</p>
<p><strong>Done criteria:</strong> single cron <code>*/5 * * * *</code> on prod runs runAutomatedReportsDispatcher.js, queries automated_reports WHERE enabled=true AND cron-due in current 5-min window, dispatches each via the same lib used by Run-now (todo "POST run-now"), records runs to automated_report_runs. Old crontab entries removed after 1-week parity verification. Manual test: disable a report in DB, confirm it stops firing on next due window.</p>
<p><strong>Estimated:</strong> ~3 hr (build + parity verification window).</p>
</div>`,
  },
];

async function bcPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPostNoBody(url) {
  const r = await fetch(url, { method: 'POST', headers: H });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.status;
}

(async () => {
  // 1. Send summary email
  console.log('1. Sending summary email to Ali...');
  const r = await sendWithBcAttach({
    ticketId: TRACKER_TODO,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com'],
    bcc: ['ali@colaberry.com'],
    replyTo: 'ali@colaberry.com',
    subject: '[Build Summary] Automated reports system - Phase 1 verified live, Phase 2 scope-split',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Summary email to Ali on the automated reports system build tracker. Phase 1 foundation verified live in production (10 reports seeded, admin API GET routes mounted at /api/admin/automated-reports, /admin/reports UI with prompt editor, reportRunRecorder wrapping 5 reports with success runs today, Inbox COS bypass hard rules live, alimuwwakkil@gmail.com phone-accessible delivery on CC). Remaining 5 build items split to focused follow-up todos with due dates per memory rule.</p>',
  });
  console.log('   Mandrill:', r.mandrillId);
  console.log('   BC attach comment:', r.commentUrl);

  // 2. Open 5 follow-up todos with due dates
  console.log('\n2. Opening 5 follow-up todos...');
  const created = [];
  for (const ft of FOLLOWUPS) {
    const t = await bcPost(`${BASE}/todolists/${AI_PRODUCTS_LIST}/todos.json`, {
      content: ft.content,
      description: ft.description,
      assignee_ids: [ALI_ID],
      due_on: ft.due_on,
    });
    console.log(`   ${t.id} | due ${t.due_on} | ${ft.content.slice(0, 70)}`);
    created.push({ id: t.id, url: t.app_url, content: ft.content, due_on: ft.due_on });
  }

  // 3. Post follow-up links comment on tracker
  console.log('\n3. Posting follow-up links comment on tracker...');
  const linkHtml = `<div>
<p><strong>5 follow-up execution todos opened with due dates:</strong></p>
<ol>
${created.map(c => `<li><a href="${c.url}">${c.content}</a> - due ${c.due_on}</li>`).join('')}
</ol>
<p>Summary email sent to ali@colaberry.com + alimuwwakkil@gmail.com (Mandrill ${r.mandrillId}). Closing this tracker.</p>
</div>`;
  const c2 = await bcPost(`${BASE}/recordings/${TRACKER_TODO}/comments.json`, { content: linkHtml });
  console.log('   links comment:', c2.id);

  // 4. Mark tracker complete
  console.log('\n4. Marking build tracker complete...');
  const m = await bcPostNoBody(`${BASE}/todos/${TRACKER_TODO}/completion.json`);
  console.log('   status:', m);

  console.log('\n=== DONE ===');
  console.log('Summary email Mandrill:', r.mandrillId);
  console.log('Follow-ups created:', created.length);
  console.log('Tracker:', TRACKER_TODO, 'marked complete');
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
