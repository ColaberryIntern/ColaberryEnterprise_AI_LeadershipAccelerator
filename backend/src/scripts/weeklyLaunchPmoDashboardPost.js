#!/usr/bin/env node
// Weekly Launch Readiness Dashboard post.
//
// Pattern: one persistent Message Board thread on the AI Systems Architect
// Accelerator project (47502609). Every Monday at 10 AM CT (15 UTC, matches
// the daily Launch PMO report time per Ali) a fresh comment lands on that
// thread with the redesigned dashboard PNG so the whole team sees the same
// view, on the same cadence, in one durable place.
//
// First run creates the parent thread. State file
// tmp/launch-pmo-weekly-mb-thread-id.json holds the parent id.
//
// Args:
//   --no-post : dry-run, render PNG but skip BC writes
//   --intro-only : create parent thread only, no comment (for first-time setup)
//
// V1 limitation: the PNG is rendered from tmp/launch-pmo-redesign-preview.html
// which has hardcoded 2026-06-03 data. v2 will refactor lib/launchPmoDailyUpdate
// to ALSO emit the new template's HTML to tmp/launch-pmo-current-dashboard.html
// on its daily run; this weekly script will then render the freshest copy.

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const REPO = path.resolve(__dirname, '../../..');
const PREVIEW_HTML = path.join(REPO, 'tmp/launch-pmo-redesign-preview.html');
const PNG_OUT = path.join(REPO, 'tmp/launch-pmo-dashboard-weekly.png');
const STATE_PATH = path.join(REPO, 'tmp/launch-pmo-weekly-mb-thread-id.json');
const RENDER_SCRIPT = path.join(__dirname, 'renderLaunchPmoDashboardPng.js');

const NO_POST = process.argv.includes('--no-post');
const INTRO_ONLY = process.argv.includes('--intro-only');

const BC = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const PROJECT_ID = 47502609;

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
  // BC attachment upload: POST /attachments.json?name=<filename> with raw binary body
  const buf = fs.readFileSync(filePath);
  const r = await fetch(`https://3.basecampapi.com/3945211/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + BC,
      'User-Agent': 'Colaberry',
      Accept: 'application/json',
      'Content-Type': contentType,
      'Content-Length': buf.length,
    },
    body: buf,
  });
  if (!r.ok) throw new Error(`upload attachment -> ${r.status} ${await r.text()}`);
  return r.json(); // { attachable_sgid }
}

function renderPng() {
  console.log('Rendering PNG from', PREVIEW_HTML);
  const r = spawnSync('node', [RENDER_SCRIPT, PREVIEW_HTML, PNG_OUT], { encoding: 'utf8', timeout: 90000 });
  if (r.status !== 0) throw new Error('render failed: ' + (r.stderr || r.stdout));
  console.log('  PNG:', PNG_OUT, '(' + (fs.statSync(PNG_OUT).size / 1024).toFixed(1) + ' KB)');
}

function weekLabel() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

(async () => {
  renderPng();

  if (NO_POST) {
    console.log('--no-post: dry-run complete. No BC writes.');
    return;
  }

  // Resolve message board id
  const proj = await bcGet(`https://3.basecampapi.com/3945211/buckets/${PROJECT_ID}.json`);
  const mb = proj.dock.find((d) => d.name === 'message_board');
  if (!mb) throw new Error('No message_board on project ' + PROJECT_ID);

  // Read or create parent thread
  let state = null;
  if (fs.existsSync(STATE_PATH)) {
    try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (_) {}
  }
  if (!state || !state.threadId) {
    console.log('\nNo weekly MB thread on file. Creating parent thread...');
    const introHtml = `<div>
<p><strong>What this thread is</strong> — every Monday at 10 AM CT, a fresh snapshot of the Launch Readiness Dashboard lands here as a comment. One thread, weekly comments, durable history.</p>
<p>The dashboard tracks the AI Systems Architect Accelerator launch (target Friday, July 11, 2026). Sections: hero KPIs (days to launch / overall readiness / open task counts / overdue), YOUR TURN ALI next-decision banner, per-area next-human-step grid, feasibility-per-area scoring, escalations, and blocked downstream tasks.</p>
<p>Daily snapshots still post on this same Message Board Mon–Fri at 10 AM CT. The weekly thread is the curated team view for cross-area coordination.</p>
</div>`;
    const subject = '📊 Launch Readiness Dashboard — Weekly (one thread, Monday snapshots)';
    const parent = await bcPostJson(`https://3.basecampapi.com/3945211/buckets/${PROJECT_ID}/message_boards/${mb.id}/messages.json`, {
      subject, content: introHtml, status: 'active',
    });
    state = { threadId: parent.id, threadUrl: parent.app_url, createdAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log('  parent thread:', parent.id, parent.app_url);
  }

  if (INTRO_ONLY) {
    console.log('--intro-only: parent thread is set up, skipping weekly comment.');
    return;
  }

  // Upload PNG + post comment
  console.log('\nUploading PNG attachment...');
  const filename = `launch-pmo-dashboard-${new Date().toISOString().slice(0, 10)}.png`;
  const att = await bcUploadAttachment(PNG_OUT, filename, 'image/png');
  console.log('  attachable_sgid:', att.attachable_sgid);

  const commentHtml = `<div>
<div><strong>${weekLabel()}</strong> — weekly dashboard snapshot</div>
<bc-attachment sgid="${att.attachable_sgid}" caption="Launch Readiness Dashboard"></bc-attachment>
<div><em>Daily details + live state on the regular Message Board posts. Tag <code>@CB System</code> on any task for AI execution, drafting, or scheduling help.</em></div>
</div>`;
  const cmt = await bcPostJson(`https://3.basecampapi.com/3945211/buckets/${PROJECT_ID}/recordings/${state.threadId}/comments.json`, {
    content: commentHtml,
  });
  console.log('  weekly comment:', cmt.id, cmt.app_url);

  console.log('\n=== DONE ===');
  console.log('Parent thread:', state.threadUrl);
  console.log('Latest comment:', cmt.app_url);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
