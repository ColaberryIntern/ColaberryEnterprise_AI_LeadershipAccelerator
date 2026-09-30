#!/usr/bin/env node
// Launch Readiness Dashboard - daily Message Board post.
//
// NOTE on filename: this was the weekly poster. As of 2026-06-08 it runs
// daily Mon-Fri via the reporting orchestrator (reportingRegistry.js entry
// "Launch Readiness Dashboard (visual)", cadence daily, sendHourUTC 15). The
// filename still says "weekly" to avoid breaking references; rename to
// dailyLaunchPmoDashboardPost.js is a tracked follow-up.
//
// Pattern: one persistent Message Board thread on the AI Systems Architect
// Accelerator project (47502609). Every weekday at 10 AM CT a fresh comment
// lands on that thread with the dashboard PNG, rendered from LIVE project
// state (not a hardcoded snapshot). The whole team sees the same view, same
// cadence, one durable place.
//
// v2 (2026-06-08): the PNG is now rendered from freshly-built live HTML
// (lib/launchPmoDashboardHtml + lib/launchPmoDailyUpdate.pullProjectState),
// written to tmp/launch-pmo-current-dashboard.html, replacing the old
// hardcoded tmp/launch-pmo-redesign-preview.html source.
//
// Idempotent on date: a state file records the last date a comment was
// posted; a second run on the same day is a no-op unless --force is passed.
//
// Args:
//   --no-post     : dry-run, build HTML + render PNG but skip BC writes
//   --intro-only  : create parent thread only, no comment (first-time setup)
//   --force       : post even if a comment already went out today

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { pullProjectState, buildEscalationList, buildHumanActionQueue, detectBlockedTasks } = require('./lib/launchPmoDailyUpdate');
const { buildView, renderDashboardHtml } = require('./lib/launchPmoDashboardHtml');
const { LAUNCH } = require('./lib/launchPmoTeam');
const { getBasecampToken } = require('./lib/basecampToken');

const REPO = path.resolve(__dirname, '../../..');
const CURRENT_HTML = path.join(REPO, 'tmp/launch-pmo-current-dashboard.html');
const PNG_OUT = path.join(REPO, 'tmp/launch-pmo-dashboard-daily.png');
const STATE_PATH = path.join(REPO, 'tmp/launch-pmo-weekly-mb-thread-id.json');
const RENDER_SCRIPT = path.join(__dirname, 'renderLaunchPmoDashboardPng.js');

const NO_POST = process.argv.includes('--no-post');
const INTRO_ONLY = process.argv.includes('--intro-only');
const FORCE = process.argv.includes('--force');

let BC = null; // resolved from CCPP Basecamp_AuthInfo (env fallback) at post time
const PROJECT_ID = 47502609;

function todayYMD() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function longDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

async function bcGet(url) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json' } });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPostJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcUploadAttachment(filePath, filename, contentType) {
  const buf = fs.readFileSync(filePath);
  const r = await fetch(`https://3.basecampapi.com/3945211/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': contentType, 'Content-Length': buf.length },
    body: buf,
  });
  if (!r.ok) throw new Error(`upload attachment -> ${r.status} ${await r.text()}`);
  return r.json();
}

// Build the live dashboard HTML from current Basecamp state and write it to
// CURRENT_HTML. Returns { today }.
async function generateLiveHtml() {
  console.log('Pulling live project state...');
  const state = await pullProjectState();
  const escalations = buildEscalationList(state);
  const blockerMap = detectBlockedTasks(state);
  const humanQueueAll = buildHumanActionQueue(state);
  const humanQueue = humanQueueAll.filter((h) => !blockerMap.get(h.id)?.blocked);
  const blockedHumanTasks = humanQueueAll
    .filter((h) => blockerMap.get(h.id)?.blocked)
    .map((h) => ({ ...h, blocker: blockerMap.get(h.id) }));
  const view = buildView(state, { escalations, humanQueue, blockedHumanTasks, blockerMap, targetDate: LAUNCH.targetLaunchDate });
  const html = renderDashboardHtml(view);
  fs.mkdirSync(path.dirname(CURRENT_HTML), { recursive: true });
  fs.writeFileSync(CURRENT_HTML, html);
  console.log('  live HTML:', CURRENT_HTML, `(${(html.length / 1024).toFixed(1)} KB)`);
  return { today: state.today };
}

function renderPng() {
  console.log('Rendering PNG from', CURRENT_HTML);
  const r = spawnSync('node', [RENDER_SCRIPT, CURRENT_HTML, PNG_OUT], { encoding: 'utf8', timeout: 90000 });
  if (r.status !== 0) throw new Error('render failed: ' + (r.stderr || r.stdout));
  console.log('  PNG:', PNG_OUT, '(' + (fs.statSync(PNG_OUT).size / 1024).toFixed(1) + ' KB)');
}

function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (_) {}
  }
  return null;
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

(async () => {
  const today = todayYMD();
  // Resolve the live Basecamp token (CCPP Basecamp_AuthInfo, env fallback) and
  // set it on the env so launchPmoOps (used by pullProjectState) and our own
  // posts share the same fresh token.
  process.env.BASECAMP_ACCESS_TOKEN = await getBasecampToken();
  BC = process.env.BASECAMP_ACCESS_TOKEN;

  await generateLiveHtml();
  renderPng();

  if (NO_POST) {
    console.log('--no-post: dry-run complete (state read + render only, no BC writes).');
    return;
  }

  // Idempotency: skip if a comment already posted today.
  let state = loadState();
  if (state && state.lastPostedDate === today && !FORCE && !INTRO_ONLY) {
    console.log(`Already posted dashboard for ${today} (lastPostedDate match). Skipping. Use --force to override.`);
    return;
  }

  // Resolve message board id
  const proj = await bcGet(`https://3.basecampapi.com/3945211/buckets/${PROJECT_ID}.json`);
  const mb = proj.dock.find((d) => d.name === 'message_board');
  if (!mb) throw new Error('No message_board on project ' + PROJECT_ID);

  // Read or create parent thread
  if (!state || !state.threadId) {
    console.log('\nNo dashboard MB thread on file. Creating parent thread...');
    const introHtml = `<div>
<p><strong>What this thread is</strong> - every weekday (Mon-Fri) at 10 AM CT, a fresh snapshot of the Launch Readiness Dashboard lands here as a comment, rendered from live Basecamp state. One thread, daily comments, durable history.</p>
<p>The dashboard tracks the AI Systems Architect Accelerator launch (target ${LAUNCH.targetLaunchDate}). Sections: hero KPIs (days to launch / overall readiness / open task counts / overdue), YOUR TURN ALI next-decision banner, per-area next-human-step grid, feasibility-per-area scoring, escalations, and blocked downstream tasks.</p>
<p>This is an automated, read-only snapshot feed for the team. No action is needed on this thread. For AI help on a specific task, ask CB on that task's own ticket, not here.</p>
</div>`;
    const subject = 'Launch Readiness Dashboard - daily snapshots (one thread)';
    const parent = await bcPostJson(`https://3.basecampapi.com/3945211/buckets/${PROJECT_ID}/message_boards/${mb.id}/messages.json`, {
      subject, content: introHtml, status: 'active',
    });
    state = { ...(state || {}), threadId: parent.id, threadUrl: parent.app_url, createdAt: new Date().toISOString() };
    saveState(state);
    console.log('  parent thread:', parent.id, parent.app_url);
  }

  if (INTRO_ONLY) {
    console.log('--intro-only: parent thread is set up, skipping comment.');
    return;
  }

  // Upload PNG + post comment
  console.log('\nUploading PNG attachment...');
  const filename = `launch-pmo-dashboard-${today}.png`;
  const att = await bcUploadAttachment(PNG_OUT, filename, 'image/png');
  console.log('  attachable_sgid:', att.attachable_sgid);

  // NOTE: this comment is intentionally informational only. Do NOT include an
  // "@CB System" call-to-action or task-style language here. This is a
  // one-way, read-only display thread that several Basecamp-connected agents
  // watch; phrasing it as an actionable task (or literally mentioning CB) made
  // them treat each daily snapshot as work to do and post duplicate suggestion
  // cards, which the inbound-dispatcher then answered (runaway loop 2026-06-17).
  // Keep this thread inert. For AI help on real work, tag CB on that task's own
  // ticket, not here.
  const commentHtml = `<div>
<div><strong>${longDate()}</strong> - daily dashboard snapshot</div>
<bc-attachment sgid="${att.attachable_sgid}" caption="Launch Readiness Dashboard"></bc-attachment>
<div><em>Live state pulled at post time. Automated read-only snapshot for the team - no action needed on this thread.</em></div>
</div>`;
  const cmt = await bcPostJson(`https://3.basecampapi.com/3945211/buckets/${PROJECT_ID}/recordings/${state.threadId}/comments.json`, {
    content: commentHtml,
  });
  console.log('  daily comment:', cmt.id, cmt.app_url);

  state.lastPostedDate = today;
  saveState(state);

  console.log('\n=== DONE ===');
  console.log('Parent thread:', state.threadUrl);
  console.log('Latest comment:', cmt.app_url);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
