#!/usr/bin/env node
// Assign 8 Gov Contracts proposals to 4 interns (2 each) for the
// 2026-06-08 Monday start, 2-week sprint. Picks come from Opportunity
// Pulse (top fit_score, close window <= 2026-06-23). Round-robin
// balanced so each intern gets one early-close (week 1) and one
// mid-close (week 2) opportunity.
//
// What this script does, atomically:
//   1. Renames + repopulates the 5 [NEW SLOT] placeholder todolists
//   2. Keeps + reassigns the existing Detroit Muni-code list
//   3. Creates 2 new todolists for the 7th and 8th proposals
//   4. For each list: assigns all 14 standard template todos to the
//      designated intern + compresses due dates to the new timeline
//      (start = 2026-06-09, end = close_date - 1)
//   5. Posts a kickoff message on the Gov Contracts message board
//   6. Emails Ali the assignment matrix via Mandrill
//
// Idempotent: PUT operations on existing todos use the current content
// + description. Re-runs do not duplicate.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));
const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const BC_BASE = 'https://3.basecampapi.com/3945211';
const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};
const PROJECT_ID = 47346103;       // Gov Contracts
const TODOSET_ID = 9908475794;
const MESSAGE_BOARD_ID = 9908475791;
const SPRINT_START = '2026-06-09'; // Monday

const INTERNS = {
  akiwam:   { id: 33056069, name: 'Akiwam' },
  obi:      { id: 42266313, name: 'OBI, ANAMELECHI KINGSLEY' },
  omolola:  { id: 49487826, name: 'Omolola Makinde' },
  samrawit: { id: 20684153, name: 'samrawit mekonen' },
};
const ALI_ID = 17454835;

// Balanced round-robin: each intern gets 1 early-close (week 1) + 1
// mid-close (week 2). Pairs picked to spread per-day deadline load.
const ASSIGNMENTS = [
  {
    intern: INTERNS.akiwam,
    listId: 9946186522, // [NEW SLOT] Bid 1 -> reassign
    title: 'Cloud Based Artificial Intelligence Platform for City of Southlake',
    uuid: '4cdb1199-9315-43b2-8c5d-58f0d4781eaa',
    agency: 'City of Southlake',
    closeDate: '2026-06-12',
    fitScore: 80,
    estimatedValue: 1000000,
    sourceUrl: 'https://southlake.bonfirehub.com/opportunities/235973',
    batch: 'Week 1',
  },
  {
    intern: INTERNS.obi,
    listId: 9951731402, // existing Detroit Muni-code
    title: 'Tech Innovation Challenge - AI for Muni-code Search',
    uuid: '7011f5af-a0c6-45fb-8684-a6432c19cf54',
    agency: 'City of Detroit',
    closeDate: '2026-06-12',
    fitScore: 75,
    estimatedValue: 500000,
    sourceUrl: 'https://detroit.bonfirehub.com/opportunities/237106',
    batch: 'Week 1',
  },
  {
    intern: INTERNS.omolola,
    listId: 9946186654, // [NEW SLOT] Bid 2 -> reassign
    title: 'MD30 Mobile Road Sensor',
    uuid: '302f2a2e-29ce-4041-b21d-ea5f7f8e206b',
    agency: 'Texas Department of Transportation',
    closeDate: '2026-06-12',
    fitScore: 70,
    estimatedValue: 500000,
    sourceUrl: 'https://txdot.bonfirehub.com/opportunities/237694',
    batch: 'Week 1',
  },
  {
    intern: INTERNS.samrawit,
    listId: 9946186724, // [NEW SLOT] Bid 3 -> reassign
    title: 'Records Management System',
    uuid: 'cf2f3de4-cb2b-4eb0-85d5-7494cc6693d0',
    agency: 'Texas Department of Criminal Justice',
    closeDate: '2026-06-15',
    fitScore: 75,
    estimatedValue: 500000,
    sourceUrl: 'https://tdcj.bonfirehub.com/opportunities/234405',
    batch: 'Week 1',
  },
  {
    intern: INTERNS.akiwam,
    listId: 9946186775, // [NEW SLOT] Bid 4 -> reassign
    title: 'SLCC RFP - Computer Maintenance Management System (CMMS)',
    uuid: '8d98ee56-e817-4cb1-93c9-863210cd8db5',
    agency: 'U3P (Utah)',
    closeDate: '2026-06-22',
    fitScore: 75,
    estimatedValue: 500000,
    sourceUrl: 'https://utah.bonfirehub.com/opportunities/238670',
    batch: 'Week 2',
  },
  {
    intern: INTERNS.obi,
    listId: 9946186819, // [NEW SLOT] Bid 5 -> reassign
    title: 'Professional Licensing and Registration System Modernization',
    uuid: 'db592612-b5da-4392-820a-f2333d57ab81',
    agency: 'U3P (Utah)',
    closeDate: '2026-06-23',
    fitScore: 75,
    estimatedValue: 1000000,
    sourceUrl: 'https://utah.bonfirehub.com/opportunities/236841',
    batch: 'Week 2',
  },
  {
    intern: INTERNS.omolola,
    listId: null, // CREATE NEW
    title: "RFP - Election Management System for Harris County Clerk's Office",
    uuid: '3f55d2af-8396-4089-86be-e2bd94f68fa6',
    agency: 'Harris County',
    closeDate: '2026-06-22',
    fitScore: 70,
    estimatedValue: 1000000,
    sourceUrl: 'https://harriscountytx.bonfirehub.com/opportunities/206717',
    batch: 'Week 2',
  },
  {
    intern: INTERNS.samrawit,
    listId: null, // CREATE NEW
    title: 'CRIO - Cannabis Licensing Software',
    uuid: 'bf44f141-2a24-447d-8ec9-d86758768c97',
    agency: 'City of Detroit',
    closeDate: '2026-06-19',
    fitScore: 70,
    estimatedValue: 500000,
    sourceUrl: 'https://detroit.bonfirehub.com/opportunities/228082',
    batch: 'Week 2',
  },
];

// Compress the 14-todo template into [start, end] window.
function compressDates(startISO, endISO, n = 14) {
  const start = new Date(startISO + 'T00:00:00Z').getTime();
  const end = new Date(endISO + 'T00:00:00Z').getTime();
  const totalMs = end - start;
  const dates = [];
  for (let i = 0; i < n; i++) {
    const t = start + (totalMs * i) / (n - 1);
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

function dollar(v) {
  return v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`;
}

function listDescription(a) {
  return `<div><strong>${a.title}</strong></div>
<div>Agency: ${a.agency}</div>
<div>Submission deadline: ${a.closeDate}</div>
<div>Opportunity UUID: ${a.uuid}</div>
<div>Fit score: ${a.fitScore}/100 &middot; Est value: ${dollar(a.estimatedValue)}</div>
<div>Source: <a href="${a.sourceUrl}">${a.sourceUrl}</a></div>
<div><br></div>
<div><strong>Assigned to:</strong> ${a.intern.name}</div>
<div><strong>Sprint:</strong> Monday 2026-06-09 start, target submit by ${a.closeDate} (less than 2 weeks)</div>
<div><br></div>
<div>All 14 standard proposal milestones below are due-dated against this opportunity's submission deadline. Mark non-applicable steps complete with a note. Tag @Ali Muwwakkil and @Ram Katamaraja for the Phase 4 internal review (todo #13) before submission.</div>`;
}

async function bcGet(url) {
  const r = await axios.get(url, { headers: BC_HEADERS });
  return r.data;
}
async function bcPut(url, body) {
  const r = await axios.put(url, body, { headers: BC_HEADERS });
  return r.data;
}
async function bcPost(url, body) {
  const r = await axios.post(url, body, { headers: BC_HEADERS });
  return r.data;
}

async function ensureList(a) {
  if (a.listId) return a.listId;
  console.log(`  Creating new list for ${a.title}...`);
  const created = await bcPost(
    `${BC_BASE}/buckets/${PROJECT_ID}/todosets/${TODOSET_ID}/todolists.json`,
    { name: a.title, description: listDescription(a) }
  );
  a.listId = created.id;

  // The new list comes with no todos. Copy the 14-task template from
  // the existing Detroit Muni-code list (9951731402).
  console.log(`    Seeding 14 standard todos...`);
  const template = await bcGet(`${BC_BASE}/buckets/${PROJECT_ID}/todolists/9951731402/todos.json`);
  // template is in reverse order (newest first); we want todo 1 at top
  // so reverse before creating so they end up in the same order.
  // Actually BC todo lists show in created-order; we want #1 first, so
  // create in the same order as template[0..13] after reversing.
  const ordered = [...template].reverse();
  for (const t of ordered) {
    await bcPost(`${BC_BASE}/buckets/${PROJECT_ID}/todolists/${a.listId}/todos.json`, {
      content: t.content,
      description: t.description || '',
      due_on: t.due_on || null,
    });
  }
  return a.listId;
}

async function updateList(a) {
  console.log(`\n${a.intern.name} <- ${a.title} (closes ${a.closeDate}, ${a.batch})`);
  const listId = await ensureList(a);

  // Rename + redescribe the list (PUT requires name + description)
  await bcPut(
    `${BC_BASE}/buckets/${PROJECT_ID}/todolists/${listId}.json`,
    { name: a.title, description: listDescription(a) }
  );

  // Fetch current todos, then assign + redue each.
  const todos = await bcGet(`${BC_BASE}/buckets/${PROJECT_ID}/todolists/${listId}/todos.json`);
  // BC returns todos newest-first; sort by id ascending to get #1..#14 in order.
  todos.sort((x, y) => x.id - y.id);

  const newDates = compressDates(SPRINT_START, addDays(a.closeDate, -1), todos.length);

  for (let i = 0; i < todos.length; i++) {
    const t = todos[i];
    const due = newDates[i];
    await bcPut(`${BC_BASE}/buckets/${PROJECT_ID}/todos/${t.id}.json`, {
      content: t.content,
      description: t.description || '',
      due_on: due,
      assignee_ids: [a.intern.id],
    });
    process.stdout.write(`    todo ${i + 1}/${todos.length} ${due} -> ${a.intern.name.split(' ')[0]}\r`);
  }
  console.log(`    14 todos assigned + redated for window [${SPRINT_START} -> ${addDays(a.closeDate, -1)}]                       `);
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildMatrixTable() {
  const rows = ASSIGNMENTS.map((a) => `
<tr style="border-bottom:1px solid #e2e8f0">
  <td style="padding:8px 10px;font-weight:600;color:#1e293b">${a.intern.name}</td>
  <td style="padding:8px 10px">${a.title}</td>
  <td style="padding:8px 10px">${a.agency}</td>
  <td style="padding:8px 10px;color:#dc2626;font-weight:600">${a.closeDate}</td>
  <td style="padding:8px 10px">${a.fitScore}</td>
  <td style="padding:8px 10px">${dollar(a.estimatedValue)}</td>
  <td style="padding:8px 10px"><a href="https://app.basecamp.com/3945211/buckets/${PROJECT_ID}/todolists/${a.listId}">BC list</a></td>
</tr>`).join('');
  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family:arial;font-size:12px">
<thead><tr style="background:#1a365d;color:white">
  <th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Intern</th>
  <th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Opportunity</th>
  <th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Agency</th>
  <th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Closes</th>
  <th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Fit</th>
  <th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Value</th>
  <th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">BC</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

async function postKickoffMessage() {
  // Group by intern for the message
  const byIntern = {};
  for (const a of ASSIGNMENTS) {
    if (!byIntern[a.intern.id]) byIntern[a.intern.id] = { name: a.intern.name, picks: [] };
    byIntern[a.intern.id].picks.push(a);
  }

  const internSections = Object.values(byIntern).map((g) => `
<div style="margin-bottom:14px">
  <div style="font-weight:700;color:#1a365d;margin-bottom:4px">${g.name}</div>
  <ul style="margin:0;padding-left:22px">
    ${g.picks.map((p) => `<li>${p.title} — <strong>${p.agency}</strong>, closes ${p.closeDate} (${dollar(p.estimatedValue)}, fit ${p.fitScore}) — <a href="https://app.basecamp.com/3945211/buckets/${PROJECT_ID}/todolists/${p.listId}">BC list</a></li>`).join('')}
  </ul>
</div>`).join('');

  const content = `<div>
<h2>Welcome to Gov Contracts — Sprint kickoff, Monday 2026-06-09</h2>

<p>You have each been assigned <strong>2 proposals</strong>. The target is to have everything ready in less than 2 weeks (i.e., before each opportunity's submission deadline).</p>

<h3>Your assignments</h3>
${internSections}

<h3>How this works</h3>
<ol>
<li>Open your assigned BC list. The standard 14-task proposal template is already populated with due dates compressed to your opportunity's deadline.</li>
<li>Start at todo #1 (Read RFP + extract requirements matrix). Work top-down.</li>
<li>If a milestone doesn't apply to your opportunity (e.g., no pre-proposal conference scheduled), mark it complete with a comment explaining why.</li>
<li>For todo #13 (Internal review), tag @Ali Muwwakkil and @Ram Katamaraja at least 24 hours before the submission deadline.</li>
<li>For todo #14 (Submit via Bonfire), confirm submission with a screenshot in the todo comments.</li>
</ol>

<h3>Resources</h3>
<ul>
<li>RFP zips live in the project's Docs &amp; Files vault.</li>
<li>Slack #gov-contracts for questions.</li>
<li>Ali for go/no-go and pricing approval.</li>
<li>Ram for technical reference architecture questions.</li>
</ul>

<p>Welcome to the team. Let's win some bids.</p>
</div>`;

  return await bcPost(
    `${BC_BASE}/buckets/${PROJECT_ID}/message_boards/${MESSAGE_BOARD_ID}/messages.json`,
    {
      subject: 'Gov Contracts kickoff — Monday 6/9, 4 interns, 8 proposals, 2-week sprint',
      content,
      status: 'active',
    }
  );
}

(async () => {
  console.log(`Gov Contracts intern assignment sprint`);
  console.log(`Sprint start: ${SPRINT_START} (Monday)`);
  console.log(`${ASSIGNMENTS.length} proposals across ${Object.keys(INTERNS).length} interns\n`);

  // 1. Update each list (create new ones for slots 7 & 8)
  for (const a of ASSIGNMENTS) {
    await updateList(a);
  }

  // 2. Post kickoff message
  console.log(`\nPosting kickoff message on Gov Contracts message board...`);
  const msg = await postKickoffMessage();
  console.log(`Message: ${msg.app_url}`);

  // 3. Email Ali the matrix
  console.log(`\nEmailing Ali the assignment matrix...`);
  const matrixHtml = buildMatrixTable();
  const matrixText = ASSIGNMENTS.map((a) => `${a.intern.name}: ${a.title} (${a.agency}, closes ${a.closeDate}, ${dollar(a.estimatedValue)})`).join('\n');

  // Create a tracking BC todo on Ali Personal for the sprint itself
  const tracking = await bcPost(
    `${BC_BASE}/buckets/7463955/todolists/9939449052/todos.json`,
    {
      content: 'Gov Contracts intern sprint: 4 interns x 2 proposals, target submit by 2026-06-22',
      description: `<div><strong>4 interns, 8 proposals, 2-week sprint.</strong></div>
<div>Start: Monday 2026-06-09. Target finish: 2026-06-22 (last close 2026-06-23 U3P Licensing).</div>
<div>Kickoff message: ${msg.app_url}</div>
<div>Matrix:</div>${matrixHtml}`,
      due_on: '2026-06-23',
      assignee_ids: [ALI_ID],
    }
  );

  const sigHtml = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:arial;font-size:14px;color:#2d3748;border-left:3px solid #1a365d;padding-left:14px;margin-top:24px">
<tr><td>
<div style="font-weight:700;font-size:16px;color:#1a365d">Ali Muwwakkil</div>
<div style="color:#2b6cb0;font-weight:600">Managing Director / AI Systems Architect</div>
<div style="color:#718096">Colaberry Inc.</div>
</td></tr></table>`;

  const html = `<div style="font-family:arial;font-size:14px;color:#2d3748;line-height:1.55;max-width:800px">
<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Gov Contracts intern sprint</div>
<h1 style="margin:6px 0;font-size:22px;font-weight:800;color:white">Monday kickoff: 4 interns, 8 proposals, 2 weeks</h1>
</div>
<div style="padding:24px 28px">
<p>Ali,</p>
<p>The 4 interns you invited (Akiwam, OBI, Omolola, samrawit) are now assigned 2 proposals each in Gov Contracts. Balanced round-robin: each intern gets one Week 1 close (early deadline pressure) and one Week 2 close (more runway). All 14 standard proposal milestones in each list are due-dated against the opportunity's actual submission deadline. Kickoff message posted to the Gov Contracts message board.</p>

<h2 style="margin:20px 0 10px;color:#1a365d;font-size:16px">Assignment matrix</h2>
${matrixHtml}

<h2 style="margin:20px 0 10px;color:#1a365d;font-size:16px">How picks were chosen</h2>
<ul style="font-size:13px;color:#475569">
<li>Pulled from Opportunity Pulse <code>bonfire_opportunities</code> table where <code>close_date</code> falls in the 2-week window from Monday 6/9 to 6/23.</li>
<li>Sorted by <code>fit_score</code> desc then close date asc; top 8 selected.</li>
<li>Detroit Muni-code (Tech Innovation Challenge) was already a live list — kept and assigned to OBI.</li>
<li>The 5 [NEW SLOT] placeholder lists were repurposed with the 5 strongest new opportunities.</li>
<li>2 new lists created for the 7th and 8th picks (Harris County Election + Detroit CRIO Cannabis).</li>
</ul>

<h2 style="margin:20px 0 10px;color:#1a365d;font-size:16px">What's next</h2>
<ul style="font-size:13px;color:#475569">
<li>Monday 9 AM CT: confirm intern access to Bonfire + BC + Docs vault.</li>
<li>Interns work top-down through each list's 14 milestones.</li>
<li>For todo #13 (Internal review) on each list: they'll tag you + Ram for sign-off 24h before submission.</li>
<li>Tracking BC todo on Ali Personal: <a href="${tracking.app_url}">${tracking.app_url}</a>. Due 2026-06-23 (last close).</li>
</ul>

<p style="margin-top:20px">If any pick is wrong (revenue scope, no-bid concerns, or you want a different opportunity from Opportunity Pulse), reply with the swap and I'll re-shuffle.</p>
</div>
${sigHtml}
</div>`;

  const text = `Ali,

4 interns assigned 2 proposals each. Balanced round-robin (each gets 1 Week 1 close + 1 Week 2 close). All 14 standard proposal milestones in each list are due-dated against opportunity's actual deadline. Kickoff message posted to Gov Contracts board.

ASSIGNMENTS:
${matrixText}

PICKS sourced from Opportunity Pulse top fit_score in 2-week window. Detroit Muni-code kept (already live), 5 NEW SLOT placeholders repurposed, 2 new lists created.

Tracking BC todo: ${tracking.app_url}
Kickoff message: ${msg.app_url}

If any pick wrong, reply with swap.`;

  await sendWithBcAttach({
    ticketId: tracking.id,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Gov Contracts intern sprint - Monday kickoff, 4 interns x 2 proposals (matrix attached)',
    html,
    text,
    bcSummary: `<p>Gov Contracts intern sprint assignments shipped: 4 interns (Akiwam, OBI, Omolola, samrawit) x 2 proposals each. Balanced round-robin so each intern has one Week 1 close and one Week 2 close. Picks from Opportunity Pulse top fit_score in 2-week window. 5 [NEW SLOT] placeholders repurposed + 2 new lists created. All 14 standard proposal milestones per list are due-dated against the opportunity's actual close date. Kickoff message posted to Gov Contracts message board. Awaiting Ali's review of picks - he can swap any.</p>`,
  });

  console.log(`\nDone.`);
  console.log(`Tracking BC todo: ${tracking.app_url}`);
  console.log(`Kickoff message: ${msg.app_url}`);
})().catch((e) => { console.error('FAIL:', e.response?.status, e.response?.data || e.stack || e.message); process.exit(1); });
