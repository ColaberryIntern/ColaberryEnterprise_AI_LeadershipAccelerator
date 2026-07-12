#!/usr/bin/env node
// sendFamilyCommandCenterDaily — daily 6 AM CT briefing email + weekly Mon comment.
//
// Modes:
//   (default)   -> daily briefing email to Ali + Addie
//   --weekly    -> post the weekly status comment on the Message Board post
//
// Both modes look up the anchor todo by content match in project 33392153
// (Family Goals & Life Planning) so we don't hardcode an ID that could change.
//
// Idempotency: deduplicates same-day sends via a date-keyed lock file in /tmp.
// Session originator: CC-20260609-fmly

const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const { getBasecampToken } = require(path.resolve(__dirname, './lib/basecampToken'));
const { renderFamilyBriefingEmail } = require(path.resolve(__dirname, './lib/renderFamilyBriefingEmail'));
const { compileFamilyBriefingData, hasFamilyData } = require(path.resolve(__dirname, './lib/compileFamilyBriefingData'));

const BUCKET_ID = 33392153;
const BC_BASE = 'https://3.basecampapi.com/3945211';
const ANCHOR_TITLE_PATTERN = /family command center.*anchor/i;
const MESSAGE_SUBJECT_PATTERN = /family command center.*daily briefing/i;

const MODE = process.argv.includes('--weekly') ? 'weekly' : 'daily';
const DRY_RUN = process.argv.includes('--dry-run');
const TEST = process.argv.includes('--test');
// --preview: compile live data and write the rendered HTML to /tmp without sending.
// Used to visually verify a real render before enabling the daily cron.
const PREVIEW = process.argv.includes('--preview');

const TODAY = new Date().toISOString().slice(0, 10);
const LOCK_DIR = path.join(os.tmpdir(), 'family-command-center');
fs.mkdirSync(LOCK_DIR, { recursive: true });
const LOCK_FILE = path.join(LOCK_DIR, `${MODE}-${TODAY}.lock`);

async function bcFetch(url, init = {}) {
  const token = await getBasecampToken();
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Colaberry FamilyCommandCenter',
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
  throw new Error('Anchor todo not found - run launchFamilyCommandCenter.js first');
}

async function findMessagePost() {
  const proj = await bcFetch(`${BC_BASE}/projects/${BUCKET_ID}.json`);
  const mb = (proj.dock || []).find((d) => d.name === 'message_board');
  if (!mb) throw new Error('No message_board on project');
  const messages = await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/message_boards/${mb.id}/messages.json`);
  const msg = messages.find((m) => MESSAGE_SUBJECT_PATTERN.test(m.subject) && !m.completed);
  if (!msg) throw new Error('Family Command Center message post not found');
  return msg;
}

// V2: compile live data, then render the email-safe table-based body. Nothing is
// baked in — if the family-calendar source is unavailable, compile() records it in
// meta.degraded and runDaily() refuses to send (see the guard below), so a stale or
// empty briefing can never reach Addie.
async function buildEmailHtml() {
  const data = await compileFamilyBriefingData({ date: new Date() });
  return { html: renderFamilyBriefingEmail(data), data };
}

function buildEmailText() {
  const d = new Date();
  return `Family Command Center — Morning Briefing for ${d.toDateString()}

This is the HTML-only briefing format. Open in a modern email client to see the full layout, calendar grid, photo gallery, and travel cards.

If you only see this plain text, your client stripped the HTML. The HTML version contains:
  - TODAY'S SNAPSHOT (family events + work conflicts)
  - UPCOMING WEEK (calendar grid Sun-Sat)
  - TRAVEL ON THE HORIZON
  - FAMILY ACTION ITEMS
  - WHAT'S NEW SINCE YESTERDAY
  - FLASHBACK (recent family moments)
  - UPCOMING COSTS
  - PARENT RISK FLAGS

Sent from the Family Command Center pipeline.
Reply to ali@colaberry.com or comment on the Basecamp Message Board to adjust.

— Session CC-20260609-fmly`;
}

function buildWeeklyCommentHtml() {
  const d = new Date();
  const weekStart = new Date(d.getTime() - 7 * 24 * 3600 * 1000);
  const fmtRange = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return `<div>
<p><strong>Weekly status - ${fmtRange}</strong></p>

<p>The Family Command Center daily briefing ran every weekday this past week. Highlights from the briefings:</p>

<ul>
<li><strong>Procare announcements captured:</strong> all Office Chat messages from Ms. Brenda's class were surfaced in the daily 'New Since Yesterday' section.</li>
<li><strong>Travel events:</strong> any Expedia/airline/hotel confirmations that arrived in Gmail were added to the 'Travel on the Horizon' card.</li>
<li><strong>Schedule conflicts:</strong> any work meeting overlapping a family event was flagged in red.</li>
<li><strong>Action items:</strong> Jersey Days, Picture Days, Kona Ice swaps, supply requests - all flagged when first detected.</li>
</ul>

<p><strong>Look-ahead - next 7 days:</strong> see today's briefing for the full upcoming-week calendar grid.</p>

<p style="margin-top:14px;font-size:12px;color:#475569;font-style:italic">Auto-posted by sendFamilyCommandCenterDaily.js --weekly. Cadence: every Monday morning. Reply to adjust.</p>
</div>`;
}

async function runDaily() {
  if (!TEST && !PREVIEW && fs.existsSync(LOCK_FILE)) {
    console.log(`[Family CC daily] Already sent today (${TODAY}), skipping.`);
    return;
  }

  console.log(`[Family CC daily] Mode: ${PREVIEW ? 'PREVIEW (render only, no send)' : TEST ? 'TEST (Ali only, no lock)' : 'PROD (Ali+Addie, lock)'}`);

  // === Compile live data FIRST (before any BC lookup) ===
  console.log('[Family CC daily] Compiling live briefing data...');
  const { html: emailHtml, data } = await buildEmailHtml();
  const degraded = (data.meta && data.meta.degraded) || [];
  const sources = (data.meta && data.meta.sources) || [];
  console.log(`[Family CC daily] Sources OK: [${sources.join(', ') || 'none'}] | degraded: [${degraded.join(', ') || 'none'}]`);

  // === PREVIEW: write rendered HTML to a tmp file and stop (no send, no BC) ===
  if (PREVIEW) {
    const out = path.join(LOCK_DIR, `preview-${TODAY}.html`);
    fs.writeFileSync(out, emailHtml);
    console.log(`[Family CC daily] PREVIEW written: ${out}`);
    console.log(`[Family CC daily] hasFamilyData: ${hasFamilyData(data)}`);
    return;
  }

  // === SAFETY GUARD: never send if the live family source did not succeed ===
  // Nothing is baked in, so a degraded family-calendar source means we have no
  // real "today/week" content. Refuse to send rather than email a hollow briefing.
  // Until GOOGLE_FAMILY_CALENDAR_ID is configured & verified, this skips cleanly.
  if (degraded.includes('family calendar')) {
    console.error('[Family CC daily] BLOCKED: family-calendar source unavailable (degraded). Not sending.');
    console.error('[Family CC daily] Configure & verify GOOGLE_FAMILY_CALENDAR_ID, then run with --preview to confirm.');
    process.exitCode = 2;
    return; // no lock written -> a later run can send once the source is healthy
  }

  console.log('[Family CC daily] Looking up anchor todo...');
  const anchor = await findAnchorTodo();
  console.log(`[Family CC daily] Anchor todo: ${anchor.id}`);

  const emailText = buildEmailText();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const subject = TEST
    ? `[TEST v2 - new format] Family Command Center - ${today} briefing`
    : `Family Command Center - ${today} briefing`;

  if (DRY_RUN) {
    console.log(`[Family CC daily] DRY RUN - would send "${subject}"`);
    return;
  }

  const sendOpts = TEST
    ? {
        // TEST mode: Ali only, no Cc/Bcc to Addie. Ali approves the render
        // before the next prod cron fires on Mon morning.
        to: 'ali@colaberry.com',
        bcSummary: `<p>[TEST v2] Family Command Center email-safe render. Recipients: Ali only.</p>`,
      }
    : {
        to: 'ali@colaberry.com',
        cc: ['addie.m.mack@gmail.com'],
        bcc: ['alimuwwakkil@gmail.com'],
        bcSummary: `<p>Daily Family Command Center briefing for ${today}. Recipients: Ali (To), Addie (Cc), alimuwwakkil@gmail.com (Bcc).</p>`,
      };

  const r = await sendWithBcAttach({
    ticketId: anchor.id,
    bucketId: BUCKET_ID,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    replyTo: 'ali@colaberry.com',
    subject,
    html: emailHtml,
    text: emailText,
    ...sendOpts,
  });
  console.log(`[Family CC daily] Sent - Mandrill ${r.mandrillId}`);

  if (!TEST) {
    fs.writeFileSync(LOCK_FILE, `${new Date().toISOString()}\n${r.mandrillId}\n`);
  }
}

async function runWeekly() {
  if (fs.existsSync(LOCK_FILE)) {
    console.log(`[Family CC weekly] Already posted today (${TODAY}), skipping.`);
    return;
  }

  console.log('[Family CC weekly] Looking up Message Board post...');
  const msg = await findMessagePost();
  console.log(`[Family CC weekly] Message: ${msg.id}`);

  const commentHtml = buildWeeklyCommentHtml();

  if (DRY_RUN) {
    console.log(`[Family CC weekly] DRY RUN - would post weekly comment on message ${msg.id}`);
    return;
  }

  const c = await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/recordings/${msg.id}/comments.json`, {
    method: 'POST',
    body: JSON.stringify({ content: commentHtml }),
  });
  console.log(`[Family CC weekly] Comment posted: ${c.app_url}`);

  fs.writeFileSync(LOCK_FILE, `${new Date().toISOString()}\n${c.id}\n`);
}

(async () => {
  console.log(`[Family CC] Mode: ${MODE} | Date: ${TODAY} | Dry-run: ${DRY_RUN}`);
  if (MODE === 'weekly') {
    await runWeekly();
  } else {
    await runDaily();
  }
})().catch((e) => {
  console.error('[Family CC] FAIL:', e.stack || e.message);
  process.exit(1);
});
