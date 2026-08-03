#!/usr/bin/env node
// sendFamilyDashboardDaily — weekday 5:00 AM CT Family Dashboard email.
//
// Replaces sendFamilyCommandCenterDaily.js. Compiles LIVE data from the
// Family Goals & Life Planning Basecamp project (bucket 33392153), renders
// the full interactive dashboard (Chart.js + Mermaid + dark mode + search),
// and emails it to Ali (To) / Addie (Cc) as a short summary body with the
// rich dashboard attached as an .html file (email clients strip <script> and
// block CDN loads, so the interactive version can't render inline).
//
// Idempotency: deduplicates same-day sends via a date-keyed lock file in
// the OS temp dir. Weekday guard: skips Saturday/Sunday (cadence is
// weekdays only). Failure path: any error exits non-zero and leaves no
// lock file, so the next cron tick (or a manual re-run) retries cleanly.
//
// Run: node backend/src/scripts/sendFamilyDashboardDaily.js [--dry-run] [--test]
// Session originator: CC-20260803-fdb1

const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const { getBasecampToken } = require(path.resolve(__dirname, './lib/basecampToken'));
const { compileFamilyDashboardData } = require(path.resolve(__dirname, './lib/familyDashboardData'));
const { renderFamilyDashboardHtml } = require(path.resolve(__dirname, './lib/renderFamilyDashboardHtml'));

const BUCKET_ID = 33392153;
const BC_BASE = 'https://3.basecampapi.com/3945211';
const ANCHOR_TITLE_PATTERN = /family (command center|dashboard).*anchor/i;

const DRY_RUN = process.argv.includes('--dry-run');
const TEST = process.argv.includes('--test');
const FORCE = process.argv.includes('--force'); // bypass weekday guard + lock, for manual testing

const TODAY = new Date().toISOString().slice(0, 10);
const LOCK_DIR = path.join(os.tmpdir(), 'family-dashboard');
fs.mkdirSync(LOCK_DIR, { recursive: true });
const LOCK_FILE = path.join(LOCK_DIR, `daily-${TODAY}.lock`);

async function bcFetch(url, init = {}) {
  const token = await getBasecampToken();
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Colaberry FamilyDashboard',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${url} -> ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function findAnchorTodo() {
  const proj = await bcFetch(`${BC_BASE}/projects/${BUCKET_ID}.json`);
  const todoset = (proj.dock || []).find((d) => d.name === 'todoset');
  if (!todoset) throw new Error('No todoset on project');
  const lists = await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/todosets/${todoset.id}/todolists.json`);
  for (const list of lists) {
    const todos = await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/todolists/${list.id}/todos.json`);
    for (const t of todos) {
      if (ANCHOR_TITLE_PATTERN.test(t.content)) return t;
    }
  }
  throw new Error('Anchor todo not found (expected a todo matching "family command center/dashboard ... anchor")');
}

function buildSummaryHtml(data) {
  const overdueGood = data.kpis.overdue === 0;
  const row = (label, value) => `<tr><td style="padding:6px 14px 6px 0;color:#475569;font-size:13px">${label}</td><td style="padding:6px 0;font-weight:700;color:#0f172a;font-size:13px">${value}</td></tr>`;
  return `<div style="font-family:'Segoe UI',system-ui,-apple-system,sans-serif;max-width:560px">
<div style="background:#1a365d;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
  <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#c9d8ee">Colaberry Family Ops</div>
  <div style="font-size:20px;font-weight:800;margin-top:6px">Family Dashboard — ${data.todayLabel}</div>
</div>
<div style="background:#f7fafc;border:1px solid #e2e8f0;border-top:none;padding:20px 24px;border-radius:0 0 10px 10px">
  <p style="margin:0 0 14px;font-size:14px;color:#2d3748">The full interactive dashboard (charts, search, dark mode) is attached as <strong>family-dashboard.html</strong> &mdash; open it in a browser. Quick summary below:</p>
  <table style="border-collapse:collapse">
    ${row('Due this week', data.kpis.dueThisWeek)}
    ${row('Overdue', overdueGood ? '0 ✓' : data.kpis.overdue)}
    ${row('New since yesterday', data.kpis.newSinceYesterday)}
    ${row('Money pending', `$${data.kpis.moneyPendingTotal.toFixed(2)}`)}
    ${row('Data sources live', `${data.kpis.sourcesConnected} / ${data.kpis.sourcesTotal}`)}
  </table>
  ${data.risks.length ? `<p style="margin:14px 0 0;font-size:13px;color:#9b2c2c">⚠ ${data.risks.map((r) => r.title).join('; ')}</p>` : ''}
</div>
</div>`;
}

function buildSummaryText(data) {
  return `Family Dashboard — ${data.todayLabel}

Full interactive dashboard attached (family-dashboard.html) — open in a browser for charts/search/dark mode.

Due this week: ${data.kpis.dueThisWeek}
Overdue: ${data.kpis.overdue}
New since yesterday: ${data.kpis.newSinceYesterday}
Money pending: $${data.kpis.moneyPendingTotal.toFixed(2)}
Data sources live: ${data.kpis.sourcesConnected} / ${data.kpis.sourcesTotal}
${data.risks.length ? `\nFlags: ${data.risks.map((r) => r.title).join('; ')}` : ''}

Sent from the Family Dashboard pipeline. Reply to ali@colaberry.com to adjust.`;
}

async function run() {
  const dow = new Date().getDay(); // 0 Sun .. 6 Sat
  if (!FORCE && (dow === 0 || dow === 6)) {
    console.log('[Family Dashboard] Weekend — cadence is weekdays only, skipping.');
    return;
  }
  if (!FORCE && !TEST && fs.existsSync(LOCK_FILE)) {
    console.log(`[Family Dashboard] Already sent today (${TODAY}), skipping.`);
    return;
  }

  console.log(`[Family Dashboard] Mode: ${TEST ? 'TEST (Ali only, no lock)' : 'PROD (Ali+Addie, lock)'}`);
  console.log('[Family Dashboard] Compiling live Basecamp data...');
  const data = await compileFamilyDashboardData();
  console.log(`[Family Dashboard] KPIs: ${JSON.stringify(data.kpis)}`);

  console.log('[Family Dashboard] Looking up anchor todo...');
  const anchor = await findAnchorTodo();
  console.log(`[Family Dashboard] Anchor todo: ${anchor.id}`);

  const html = renderFamilyDashboardHtml(data);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const subject = TEST ? `[TEST] Family Dashboard - ${today}` : `Family Dashboard - ${today}`;

  if (DRY_RUN) {
    console.log(`[Family Dashboard] DRY RUN - would send "${subject}" with ${html.length}-byte HTML attachment.`);
    return;
  }

  const attachmentBuf = Buffer.from(html, 'utf8');
  const sendOpts = TEST
    ? { to: 'ali@colaberry.com', bcSummary: `<p>[TEST] Family Dashboard email-safe send. Recipients: Ali only.</p>` }
    : {
        to: 'ali@colaberry.com',
        cc: ['addie.m.mack@gmail.com'],
        bcc: ['alimuwwakkil@gmail.com'],
        bcSummary: `<p>Daily Family Dashboard for ${today}. Recipients: Ali (To), Addie (Cc), alimuwwakkil@gmail.com (Bcc).</p>`,
      };

  const r = await sendWithBcAttach({
    ticketId: anchor.id,
    bucketId: BUCKET_ID,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    replyTo: 'ali@colaberry.com',
    subject,
    html: buildSummaryHtml(data),
    text: buildSummaryText(data),
    attachments: [{ filename: 'family-dashboard.html', content: attachmentBuf, contentType: 'text/html' }],
    vaultAttachments: [{
      filename: `family-dashboard-${TODAY}.html`,
      content: attachmentBuf,
      contentType: 'text/html',
      vaultDescription: `Family Dashboard snapshot, ${today}`,
    }],
    ...sendOpts,
  });
  console.log(`[Family Dashboard] Sent - Mandrill ${r.mandrillId}`);

  if (!TEST) {
    fs.writeFileSync(LOCK_FILE, `${new Date().toISOString()}\n${r.mandrillId}\n`);
  }
}

run().catch((e) => {
  console.error('[Family Dashboard] FAIL:', e.stack || e.message);
  process.exit(1);
});
