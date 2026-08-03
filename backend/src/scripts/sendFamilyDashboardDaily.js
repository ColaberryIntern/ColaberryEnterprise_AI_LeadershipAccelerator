#!/usr/bin/env node
// sendFamilyDashboardDaily — weekday 5:00 AM CT Family Dashboard email.
//
// Replaces sendFamilyCommandCenterDaily.js. Compiles LIVE data from the
// Family Goals & Life Planning Basecamp project (bucket 33392153) and emails
// it to Ali (To) / Addie (Cc) as an email-safe, table-based HTML body (same
// construction pattern as the retired renderFamilyBriefingEmail.js, so it
// renders inline in Outlook/Gmail/Apple Mail instead of needing an
// attachment). The richer interactive version (Chart.js + Mermaid + dark
// mode + search) is still attached as a bonus .html file for anyone who
// wants to open it in a browser, since email clients strip <script> tags.
//
// Idempotency: deduplicates same-day sends via a date-keyed lock file in
// the OS temp dir. Weekday guard: skips Saturday/Sunday (cadence is
// weekdays only). Failure path: any error exits non-zero and leaves no
// lock file, so the next cron tick (or a manual re-run) retries cleanly.
//
// Run: node backend/src/scripts/sendFamilyDashboardDaily.js [--dry-run] [--test] [--render-only[=path]]
// Session originator: CC-20260803-p9r4 (reformat pass after Ali's review)

const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const { getBasecampToken } = require(path.resolve(__dirname, './lib/basecampToken'));
const { compileFamilyDashboardData } = require(path.resolve(__dirname, './lib/familyDashboardData'));
const { renderFamilyDashboardHtml } = require(path.resolve(__dirname, './lib/renderFamilyDashboardHtml'));
const { renderFamilyDashboardEmail, renderFamilyDashboardEmailText } = require(path.resolve(__dirname, './lib/renderFamilyDashboardEmail'));

const BUCKET_ID = 33392153;
const BC_BASE = 'https://3.basecampapi.com/3945211';
const ANCHOR_TITLE_PATTERN = /family (command center|dashboard).*anchor/i;

const DRY_RUN = process.argv.includes('--dry-run');
const TEST = process.argv.includes('--test');
const FORCE = process.argv.includes('--force'); // bypass weekday guard + lock, for manual testing
const RENDER_ONLY_ARG = process.argv.find((a) => a.startsWith('--render-only'));
const RENDER_ONLY_PATH = RENDER_ONLY_ARG && RENDER_ONLY_ARG.includes('=') ? RENDER_ONLY_ARG.split('=')[1] : RENDER_ONLY_ARG ? path.join(os.tmpdir(), 'family-dashboard-preview.html') : null;

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

  const emailHtml = renderFamilyDashboardEmail(data);

  if (RENDER_ONLY_PATH) {
    fs.writeFileSync(RENDER_ONLY_PATH, emailHtml);
    console.log(`[Family Dashboard] RENDER ONLY - wrote email-safe HTML to ${RENDER_ONLY_PATH} (no send, no Basecamp lookup).`);
    return;
  }

  console.log('[Family Dashboard] Looking up anchor todo...');
  const anchor = await findAnchorTodo();
  console.log(`[Family Dashboard] Anchor todo: ${anchor.id}`);

  const interactiveHtml = renderFamilyDashboardHtml(data);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const subject = TEST ? `[TEST] Family Dashboard - ${today}` : `Family Dashboard - ${today}`;

  if (DRY_RUN) {
    console.log(`[Family Dashboard] DRY RUN - would send "${subject}" (${emailHtml.length}-byte inline email + ${interactiveHtml.length}-byte interactive attachment).`);
    return;
  }

  const attachmentBuf = Buffer.from(interactiveHtml, 'utf8');
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
    html: emailHtml,
    text: renderFamilyDashboardEmailText(data),
    attachments: [{ filename: 'family-dashboard-interactive.html', content: attachmentBuf, contentType: 'text/html' }],
    vaultAttachments: [{
      filename: `family-dashboard-${TODAY}.html`,
      content: attachmentBuf,
      contentType: 'text/html',
      vaultDescription: `Family Dashboard interactive snapshot, ${today}`,
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
