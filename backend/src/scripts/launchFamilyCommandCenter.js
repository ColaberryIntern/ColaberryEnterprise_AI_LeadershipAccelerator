#!/usr/bin/env node
// launchFamilyCommandCenter — one-shot launch script for the Family Command Center.
//
// What this does (in order):
//   1. Creates a Message Board post in Family Goals & Life Planning (33392153)
//      announcing the Family Command Center daily briefing
//   2. Creates an anchor todo in the same project to hold operational
//      attachments (per Ali Personal operating doctrine — every outbound email
//      gets attached to its originating ticket; this is that ticket)
//   3. Sends the TEST briefing email to ali@colaberry.com, CC addie.m.mack@gmail.com,
//      anchored to the anchor todo
//   4. Prints all URLs / IDs for follow-up
//
// Session: CC-20260609-fmly
// Run from VPS (has BC token + Mandrill key): node backend/src/scripts/launchFamilyCommandCenter.js

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const { getBasecampToken } = require(path.resolve(__dirname, './lib/basecampToken'));

const BUCKET_ID = 33392153; // Family Goals & Life Planning
const BC_BASE = 'https://3.basecampapi.com/3945211';
const ALI_USER_ID = 17454835;

const HTML_PATH = path.resolve(__dirname, '../../../docs/FAMILY_COMMAND_CENTER_PREVIEW.html');

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

// 1. Render an email-safe version of the briefing HTML
//    - strips <script> blocks (no JS in email clients)
//    - strips the Mermaid <pre> block (renders as raw text otherwise)
//    - adds a one-line "View in browser" link at the top
function buildEmailHtml(staticHtml) {
  let html = staticHtml
    // remove the mermaid CDN script
    .replace(/<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid[^"]+"[^>]*><\/script>/g, '')
    // remove the inline mermaid init script at bottom
    .replace(/<script>\s*mermaid\.initialize[\s\S]*?<\/script>/g, '')
    // remove the mermaid diagram block entirely (it would render as raw text in email)
    .replace(/<pre class="mermaid">[\s\S]*?<\/pre>/g, '<div style="font-size:12px;color:#94a3b8;text-align:center;padding:14px">(Pipeline diagram available in the browser version)</div>');

  // Inject a "view in browser" banner just after <body>
  const banner = `<div style="background:#1a365d;color:#fff;text-align:center;font-size:11px;padding:8px 12px;letter-spacing:.06em">
    📬 Family Command Center · daily briefing · <a href="#" style="color:#c9a55c;text-decoration:underline">view in browser</a> · sent to Ali & Addie
  </div>`;
  html = html.replace(/<body[^>]*>/, (m) => m + banner);

  return html;
}

// 2. Build the Message Board post HTML
function buildMessagePostHtml(testEmailUrl, anchorTodoUrl) {
  return `<div>
<p><strong>The Family Command Center is live.</strong></p>

<p>Starting tomorrow, you and Addie will receive a daily briefing at <strong>6:00 AM CT Mon-Fri</strong>. The briefing answers six questions in under 2 minutes:</p>

<ul>
<li>What family events are happening today?</li>
<li>What needs your attention (forms, payments, packing)?</li>
<li>What changed in the last 24 hours?</li>
<li>What's coming up this week?</li>
<li>What trips are on the horizon?</li>
<li>What might fall through the cracks?</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">Data sources</h3>
<ul>
<li><strong>Procare</strong> (Liberty + legacy Primrose) via the Hotmail to Gmail forward rule that's been live since 2026-06-03</li>
<li><strong>Gmail</strong> on ali@colaberry.com for school, travel confirmations, family threads</li>
<li><strong>Google Calendar</strong> on ali@colaberry.com and the Family calendar</li>
<li><strong>Basecamp Family Goals project</strong> for archive + photos + cost history</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">Cadence</h3>
<ul>
<li><strong>Daily briefing:</strong> 6:00 AM CT, Mon-Fri</li>
<li><strong>Weekly status comment</strong> on this thread: <strong>Mondays</strong> with last-week summary + next-week preview</li>
<li><strong>Sunday evening</strong> weekly archive report saved to BC Vault</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">Test email just sent</h3>
<p>A test of today's briefing was sent to you and Addie a moment ago so you can experience the format in your inbox before tomorrow's first scheduled run.</p>

<h3 style="margin:18px 0 6px;font-size:14px">Operational anchor</h3>
<p>All outbound briefing emails attach to the anchor todo <a href="${anchorTodoUrl}">Family Command Center - operational anchor</a> per the operating doctrine.</p>

<h3 style="margin:18px 0 6px;font-size:14px">Known gaps (v1)</h3>
<ul>
<li>Photo gallery is text-based — Procare doesn't email photos. Google Photos integration is the next step.</li>
<li>Older Primrose history is gated on a real Hotmail PST export (current export came up empty at 271 KB).</li>
<li>Dynamic Family-calendar data depends on Google OAuth on the production VPS — wired in this build using available creds; gap noted for fuller breadth.</li>
</ul>

<p style="margin-top:18px;font-size:12.5px;color:#475569;font-style:italic">Built 2026-06-09 in session CC-20260609-fmly. Reply on this thread to adjust cadence, recipients, or content.</p>
</div>`;
}

// 3. Build the anchor todo description
function buildAnchorTodoDescription(messageUrl) {
  return `<div>
<p>This todo is the operational anchor for the <strong>Family Command Center</strong> daily briefing.</p>

<p>All outbound briefing emails (daily Mon-Fri to Ali + Addie) get attached here per the <code>sendWithBcAttach</code> doctrine.</p>

<p><strong>Source of truth:</strong> <a href="${messageUrl}">Family Command Center - Message Board announcement</a> on this project's Message Board.</p>

<p><strong>Cron entries</strong> (production VPS, in <code>backend/src/services/schedulerService.ts</code>):</p>
<ul>
<li><code>0 11 * * 1-5</code> UTC = 6:00 AM CT Mon-Fri - daily briefing</li>
<li><code>0 13 * * 1</code> UTC = 8:00 AM CT Mondays - weekly status comment</li>
</ul>

<p><strong>Do NOT close this todo</strong> - leaving it open is what keeps the doctrine-enforced attachment alive.</p>
</div>`;
}

async function main() {
  console.log('=== Family Command Center launch ===');
  console.log('Session: CC-20260609-fmly');
  console.log('');

  // ===== 0. Sanity checks =====
  if (!fs.existsSync(HTML_PATH)) {
    throw new Error(`HTML briefing not found at ${HTML_PATH}`);
  }
  if (!process.env.MANDRILL_API_KEY) {
    throw new Error('MANDRILL_API_KEY not set in env');
  }
  const staticHtml = fs.readFileSync(HTML_PATH, 'utf-8');
  console.log(`Loaded briefing HTML (${staticHtml.length} bytes)`);

  // ===== 1. Find the Message Board ID on project 33392153 =====
  console.log('Discovering Message Board on project Family Goals & Life Planning (33392153)...');
  const proj = await bcFetch(`${BC_BASE}/projects/${BUCKET_ID}.json`);
  const mb = (proj.dock || []).find((d) => d.name === 'message_board');
  if (!mb) throw new Error('No message_board found on project 33392153');
  console.log(`  Message Board id: ${mb.id}`);

  // ===== 2. Create the anchor todo FIRST (we'll link the message to it) =====
  console.log('Discovering / creating todo list to hold the anchor...');
  const todoset = (proj.dock || []).find((d) => d.name === 'todoset');
  if (!todoset) throw new Error('No todoset on project');
  const todoLists = await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/todosets/${todoset.id}/todolists.json`);
  // Pick the first active list, or create "Family Command Center"
  let targetList = todoLists.find((l) => /family command center/i.test(l.name)) ||
                   todoLists.find((l) => !l.completed) ||
                   todoLists[0];
  if (!targetList) {
    targetList = await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/todosets/${todoset.id}/todolists.json`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Family Command Center', description: 'Anchor for daily briefing operations' }),
    });
  }
  console.log(`  Target todo list: "${targetList.name}" (${targetList.id})`);

  console.log('Creating anchor todo...');
  const anchorTodo = await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/todolists/${targetList.id}/todos.json`, {
    method: 'POST',
    body: JSON.stringify({
      content: 'Family Command Center - operational anchor (do not close)',
      description: '<p>Placeholder - will be updated after Message Board post is created.</p>',
      assignee_ids: [ALI_USER_ID],
    }),
  });
  console.log(`  Anchor todo: ${anchorTodo.id} -> ${anchorTodo.app_url}`);

  // ===== 3. Create the Message Board post (referencing the anchor todo) =====
  console.log('Creating Message Board post...');
  // Optional: look up message categories (some projects have them, some don't)
  let categoryId = null;
  try {
    const categories = await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/categories/messages.json`);
    if (Array.isArray(categories) && categories.length) {
      const announce = categories.find((c) => /announce|update|fyi/i.test(c.name)) || categories[0];
      categoryId = announce.id;
    }
  } catch (e) {
    console.log(`  (no message categories: ${e.message.slice(0, 80)}; posting without)`);
  }

  const messageBody = buildMessagePostHtml('', anchorTodo.app_url);
  const messagePayload = {
    subject: 'Family Command Center - Daily briefing live (Mon-Fri 6 AM CT)',
    content: messageBody,
    status: 'active',
  };
  if (categoryId) messagePayload.category_id = categoryId;
  const message = await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/message_boards/${mb.id}/messages.json`, {
    method: 'POST',
    body: JSON.stringify(messagePayload),
  });
  console.log(`  Message: ${message.id} -> ${message.app_url}`);

  // ===== 4. Update the anchor todo description with the real message URL =====
  console.log('Updating anchor todo description with Message URL...');
  await bcFetch(`${BC_BASE}/buckets/${BUCKET_ID}/todos/${anchorTodo.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({
      content: anchorTodo.title || 'Family Command Center - operational anchor (do not close)',
      description: buildAnchorTodoDescription(message.app_url),
    }),
  });

  // ===== 5. Send the TEST email (anchored to the new todo) =====
  console.log('Sending TEST briefing email...');
  const emailHtml = buildEmailHtml(staticHtml);
  const emailText = `Family Command Center — Morning Briefing for Tue Jun 9, 2026
(HTML version for full layout — open in a modern email client)

TODAY
  - 6:00 AM  Get kids to school
  - 3:00 PM  Addison orthodontist (Dr. Robertson) — CONFLICT with AegisFX call

THIS WEEK
  - Wed Jun 10  DFW → BNA (Nashville)
  - Thu Jun 11  Nashville · Creed Jersey Day (FIFA Opening) + Kona Ice
  - Fri Jun 12  Nashville
  - Sat Jun 13  BNA → DFW (American 1515, 8:01 AM → 10:20 AM, seat 19D)
  - Mon Jun 15  Ms. Brenda back at Creed's class

ACTION ITEMS
  - Resolve 3 PM ortho/AegisFX conflict before noon
  - Nashville prep tonight - pack, brief Addie on Thursday Jersey Day
  - Tell Creed about Thursday's Kona Ice (replaces ice cream party)

TRAVEL
  - Nashville Jun 10-13 (Sat return) - just added to calendar
  - Corpus Christi Jul 26-29 - Fairfield Inn (TGKQN2NM9)

Open the HTML briefing for the full layout, Creed's graduation photos, costs, and risks.

— Family Command Center (CC-20260609-fmly)`;

  const sendResult = await sendWithBcAttach({
    ticketId: anchorTodo.id,
    bucketId: BUCKET_ID,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['addie.m.mack@gmail.com'],
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: '[TEST] Family Command Center — Tue Jun 9 briefing',
    html: emailHtml,
    text: emailText,
    bcSummary: `<p><strong>TEST briefing email</strong> for the Family Command Center daily run. Recipients: Ali (To), Addie (Cc), alimuwwakkil@gmail.com (Bcc). Subject prefix "[TEST]" so it's distinct from tomorrow's first real 6 AM run. <a href="${message.app_url}">Message Board post</a></p>`,
  });
  console.log(`  Mandrill: ${sendResult.mandrillId}`);
  console.log(`  BC anchor comment: ${sendResult.commentUrl}`);

  // ===== 6. Done =====
  console.log('');
  console.log('=== DONE ===');
  console.log(`Message Board post : ${message.app_url}`);
  console.log(`Anchor todo        : ${anchorTodo.app_url}`);
  console.log(`Test email sent    : ${sendResult.mandrillId}`);
  console.log('');
  console.log('Next: daily briefing cron is registered in schedulerService.ts');
  console.log('      First scheduled run: tomorrow Wed Jun 10 @ 6:00 AM CT');
}

main().catch((e) => {
  console.error('FAIL:', e.stack || e.message);
  process.exit(1);
});
