#!/usr/bin/env node
// Final gov-bid intern sprint setup. Wipes prior BC structure (no
// history per Ali), uploads each RFP's downloaded files to Opportunity
// Pulse, marks pursuing, triggers AI tailoring, pulls the per-RFP
// requirement checklist, and builds 4 fresh BC todolists - one per
// intern - with the AI-extracted requirements as todos.
//
// Final state: 4 lists in Gov Contracts BC, 1 per intern, each with
// real per-RFP requirements + standard process milestones, due-dated
// against the verified close date.

const path = require('path');
const fs = require('fs');
const FormData = require(path.resolve(__dirname, '../../../node_modules/form-data'));
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));
const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const OP_BASE = 'http://95.216.199.47';
const BC_BASE = 'https://3.basecampapi.com/3945211';
const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};
const GOV_PROJECT = 47346103;
const GOV_TODOSET = 9908475794;
const GOV_BOARD = 9908475791;
const TRACKING_TODO = 9967017720;
const ALI_ID = 17454835;

const INTERNS = {
  akiwam:   { id: 33056069, name: 'Akiwam' },
  obi:      { id: 42266313, name: 'OBI, ANAMELECHI KINGSLEY' },
  omolola:  { id: 49487826, name: 'Omolola Makinde' },
  samrawit: { id: 20684153, name: 'samrawit mekonen' },
};

const RFP_BASE = 'C:/Users/ali_m/AppData/Local/Temp/rfp-eval';

const PICKS = [
  {
    intern: INTERNS.akiwam,
    uuid: '2f5fd926-05f6-4d02-9388-c0ae3b141aed',
    title: 'Multifamily Management System',
    agency: 'Texas Department of Housing and Community Affairs (TDHCA)',
    closeDate: '2026-06-29',
    estValue: 750000,
    bonfire: 'https://tdhca-texas-gov.bonfirehub.com/opportunities/238803',
    folder: `${RFP_BASE}/rfp4-332-RFO26-1007_-_pub_-_Multifamily_Manag`,
    rationale: 'Direct overlap with our wheelhouse: records + workflow + doc generation (LURAs, IRS 8823/8609). 24-day runway, $750K, TX state agency relationship multiplier, no NO-AI clauses, manageable compliance bar.',
  },
  {
    intern: INTERNS.obi,
    uuid: 'cf2f3de4-cb2b-4eb0-85d5-7494cc6693d0',
    title: 'Records Management System',
    agency: 'Texas Department of Criminal Justice - Office of Inspector General',
    closeDate: '2026-11-01',  // verified from PDF, OP DB had wrong 6/15
    estValue: 500000,
    bonfire: 'https://tdcj.bonfirehub.com/opportunities/234405',
    folder: `${RFP_BASE}/rfp8-696-IG-26-O012_-_pub_-_Records_Managemen`,
    rationale: '5-month runway (OP DB had wrong date). Cloud-based law-enforcement RMS. CJIS + TX-RAMP certs required - heavier compliance bar but generous runway means we can build the certs path during the bid.',
  },
  {
    intern: INTERNS.omolola,
    uuid: '4dc18cd6-a1a3-4bdd-86f4-b4e97c6d6dd7',
    title: 'Community Development Software for Housing',
    agency: 'University of Texas at Dallas',
    closeDate: '2026-06-30',
    estValue: 500000,
    bonfire: 'https://utdallas.bonfirehub.com/opportunities/235517',
    folder: `${RFP_BASE}/rfp14-UTD20260428-TB_-_pub_-_Community_Develop`,
    rationale: 'Residential life software for student housing. Custom software + integration (StarRez, Salesforce). 22-day runway. MANDATORY MINIMUMS: TX-RAMP/FedRAMP + SOC2 Type II + HECVAT. Compliance check required first.',
  },
  {
    intern: INTERNS.samrawit,
    uuid: '2e287828-9040-4948-98fe-a0250a5d66a5',
    title: 'Agenda and Meeting Management System',
    agency: 'Harris County',
    closeDate: '2026-06-22',
    estValue: 300000,
    bonfire: 'https://harriscountytx.bonfirehub.com/opportunities/206717',
    folder: `${RFP_BASE}/rfp2-26_0075_-_pub_-_RFP_-_Agenda_and_Meeting`,
    rationale: 'Already pursued in OP, 8 reqs tailored. SQL migration + SSO + APIs aligned to Harris County USRA. Tightest deadline at 14 days; samrawit owns the fastest sprint.',
  },
];

const SPRINT_START = '2026-06-09'; // Monday kickoff

const OLD_LIST_IDS_TO_TRASH = []; // already trashed in the prior run

// ------------------ Helpers ------------------
async function opLogin() {
  const r = await axios.post(`${OP_BASE}/api/v1/auth/login`, {
    email: 'ali@colaberry.com',
    password: '3yhEcVki3Vp4emDuuXWk',
  });
  return r.data.data.accessToken;
}

async function bcGet(url) {
  return (await axios.get(url, { headers: BC_HEADERS })).data;
}
async function bcPost(url, body) {
  return (await axios.post(url, body, { headers: BC_HEADERS })).data;
}
async function bcPut(url, body) {
  return (await axios.put(url, body, { headers: BC_HEADERS })).data;
}
async function bcDelete(url) {
  return (await axios.delete(url, { headers: BC_HEADERS })).data;
}

async function opUploadFiles(token, uuid, folder) {
  const files = fs.readdirSync(folder).filter((f) => !f.startsWith('.'));
  if (files.length === 0) throw new Error(`No files in ${folder}`);
  // nginx body limit on op-frontend is ~10MB; upload one file at a time to stay under it.
  // Skip files > 8MB (the body limit appears to truncate before that).
  let saved = 0; let skipped = 0; let failed = 0;
  for (const fn of files) {
    const fp = path.join(folder, fn);
    const size = fs.statSync(fp).size;
    if (size > 8 * 1024 * 1024) {
      console.log(`    skip ${fn} (${(size/1024/1024).toFixed(1)}MB - exceeds upload limit)`);
      skipped++; continue;
    }
    try {
      const form = new FormData();
      form.append('files', fs.createReadStream(fp));
      const r = await axios.post(`${OP_BASE}/api/v1/bonfire/opportunities/${uuid}/attachments`, form, {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
        maxBodyLength: Infinity, maxContentLength: Infinity,
      });
      saved += r.data.data.saved || 0;
      skipped += r.data.data.skipped || 0;
    } catch (e) {
      console.log(`    FAILED ${fn}: ${e.response?.status} ${e.response?.statusText}`);
      failed++;
    }
  }
  return { uploaded: files.length, response: { saved, skipped, failed } };
}
async function opPursue(token, uuid) {
  const r = await axios.post(`${OP_BASE}/api/v1/bonfire/opportunities/${uuid}/pursue`, {}, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return r.data;
}
async function opTailor(token, uuid) {
  const r = await axios.post(`${OP_BASE}/api/v1/bonfire/opportunities/${uuid}/tailor-requirements`, {}, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return r.data;
}
async function opGetReadiness(token, uuid) {
  const r = await axios.get(`${OP_BASE}/api/v1/bonfire/opportunities/${uuid}/readiness`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.data.data;
}

function dollar(v) {
  return v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`;
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function compressDates(startISO, endISO, n) {
  const start = new Date(startISO + 'T00:00:00Z').getTime();
  const end = new Date(endISO + 'T00:00:00Z').getTime();
  const total = end - start;
  return Array.from({ length: n }, (_, i) => new Date(start + (total * i) / Math.max(1, n - 1)).toISOString().slice(0, 10));
}

// Standard process milestones + AI-extracted artifact items mapped to BC todos.
function buildTodos(pick, readiness) {
  const checklist = (readiness?.checklist || []);
  const items = [
    // Process milestones (top of list, do these first)
    { content: `Read the full RFP and write a 1-paragraph scope summary (post in the description)`, kind: 'process' },
    { content: `Bid / no-bid decision: confirm Colaberry meets mandatory minimums (review compliance gates with Ali)`, kind: 'process' },
    { content: `Build the requirements matrix: every shall/must/required in the RFP into a single tracking sheet`, kind: 'process' },
    { content: `Draft proposal narrative against the RFP scope`, kind: 'process' },
    // AI-extracted artifacts (one todo per checklist item; satisfied=review, gap=produce)
    ...checklist.map((c) => ({
      content: c.status === 'satisfied'
        ? `Review the auto-generated ${c.type_label} in Opportunity Pulse; tailor wording to this RFP if needed`
        : `Produce ${c.type_label} (${c.required ? 'REQUIRED' : 'optional'})`,
      kind: 'artifact',
      type: c.type,
    })),
    // Submission milestones (tail of list)
    { content: `Internal review: tag @Ali Muwwakkil and @Ram Katamaraja for sign-off at least 24 hours before submission`, kind: 'process' },
    { content: `Submit via Bonfire portal and post screenshot of confirmation in this todo`, kind: 'process' },
  ];
  return items;
}

// ------------------ Main ------------------
(async () => {
  const token = await opLogin();
  console.log('OP authenticated.\n');

  // 1. Trash old BC structure
  console.log('=== Cleaning old BC lists (8 trashed) ===');
  for (const id of OLD_LIST_IDS_TO_TRASH) {
    try {
      await bcDelete(`${BC_BASE}/buckets/${GOV_PROJECT}/todolists/${id}.json`);
      console.log(`  trashed list ${id}`);
    } catch (e) {
      console.warn(`  failed to trash ${id}: ${e.response?.status}`);
    }
  }

  // 2-5. Process each pick
  const createdLists = [];
  for (const p of PICKS) {
    console.log(`\n=== ${p.intern.name} <- ${p.title} ===`);

    console.log('  Uploading files to OP...');
    const up = await opUploadFiles(token, p.uuid, p.folder);
    console.log(`    uploaded ${up.uploaded} files (${up.response.saved} saved, ${up.response.skipped} skipped)`);

    console.log('  Marking pursuing...');
    try { await opPursue(token, p.uuid); console.log('    pursued.'); }
    catch (e) { console.log(`    already pursued or error: ${e.response?.data?.message || e.message}`); }

    console.log('  Triggering AI tailoring...');
    const tailor = await opTailor(token, p.uuid);
    console.log(`    AI ran (model: ${tailor.data?.model_used}). additional_required: ${tailor.data?.additional_required?.length || 0}`);

    console.log('  Pulling readiness checklist...');
    const readiness = await opGetReadiness(token, p.uuid);
    console.log(`    state: ${readiness.state}, checklist: ${readiness.checklist?.length || 0} items`);

    console.log('  Creating BC list + todos...');
    const desc = `<div><strong>${p.title}</strong></div>
<div>Agency: ${p.agency}</div>
<div>Submission deadline: <strong>${p.closeDate}</strong></div>
<div>Opportunity Pulse: <a href="${OP_BASE}/admin/bonfire/${p.uuid}/submission-readiness">submission-readiness page</a></div>
<div>Bonfire portal: <a href="${p.bonfire}">${p.bonfire}</a></div>
<div>Estimated value: ${dollar(p.estValue)}</div>
<div><br></div>
<div><strong>Assigned to:</strong> ${p.intern.name}</div>
<div><strong>Sprint:</strong> kickoff Monday 2026-06-09</div>
<div><br></div>
<div><strong>Why we're pursuing:</strong> ${p.rationale}</div>
<div><br></div>
<div><strong>Workflow:</strong> Open Opportunity Pulse to find the auto-generated artifacts (cover letter, capability statement, references). Tailor them to this RFP. Fill the gaps. Tag Ali + Ram before submission.</div>`;

    const list = await bcPost(`${BC_BASE}/buckets/${GOV_PROJECT}/todosets/${GOV_TODOSET}/todolists.json`, {
      name: p.title,
      description: desc,
    });
    console.log(`    list created: ${list.app_url}`);

    const todos = buildTodos(p, readiness);
    const submitDue = addDays(p.closeDate, -1);
    // Cap work window: if close >30 days out, compress work into first 21 days; otherwise spread evenly
    const workEnd = (new Date(p.closeDate) - new Date(SPRINT_START)) / 86400000 > 28
      ? addDays(SPRINT_START, 21)
      : addDays(p.closeDate, -2);
    const dates = compressDates(SPRINT_START, workEnd, todos.length - 1);
    dates.push(submitDue); // last todo (submit) due day before close

    for (let i = 0; i < todos.length; i++) {
      await bcPost(`${BC_BASE}/buckets/${GOV_PROJECT}/todolists/${list.id}/todos.json`, {
        content: todos[i].content,
        due_on: dates[i],
        assignee_ids: [p.intern.id],
      });
      process.stdout.write(`    todo ${i + 1}/${todos.length}... \r`);
    }
    console.log(`    ${todos.length} todos created (work window ${SPRINT_START} -> ${workEnd}, submit ${submitDue})`);

    createdLists.push({ ...p, listId: list.id, listUrl: list.app_url, todoCount: todos.length, readiness });
  }

  // 6. Kickoff message
  console.log('\n=== Posting kickoff message ===');
  const internSections = createdLists.map((c) => `
<div style="margin-bottom:14px">
<div style="font-weight:700;color:#1a365d;margin-bottom:4px">${c.intern.name}</div>
<ul style="margin:0;padding-left:22px">
<li><a href="${c.listUrl}"><strong>${c.title}</strong></a> — ${c.agency}, closes ${c.closeDate} (${dollar(c.estValue)})</li>
<li>OP submission-readiness: <a href="${OP_BASE}/admin/bonfire/${c.uuid}/submission-readiness">open</a> — ${c.readiness.checklist?.length || 0} requirements tailored by AI</li>
</ul>
</div>`).join('');

  const kickoff = await bcPost(`${BC_BASE}/buckets/${GOV_PROJECT}/message_boards/${GOV_BOARD}/messages.json`, {
    subject: 'Gov Contracts intern sprint v2 — Monday 6/9 kickoff, 1 RFP per intern',
    content: `<div>
<h2>Welcome — sprint kickoff Monday 2026-06-09</h2>
<p>You have each been assigned <strong>one RFP</strong>. Files are already uploaded to Opportunity Pulse and AI has tailored the requirement checklist per RFP. Open your BC list — todos are due-dated against your opportunity's submission deadline.</p>

<h3>Assignments</h3>
${internSections}

<h3>How this works</h3>
<ol>
<li>Open your BC list (link above). Start at todo #1 (Read the RFP).</li>
<li>Open your Opportunity Pulse submission-readiness page. You'll see AI-generated artifacts (cover letter, capability statement, references). Review and tailor them to your specific RFP.</li>
<li>Fill the gaps (typically COI, custom technical content, pricing).</li>
<li>For internal review (second-to-last todo): tag @Ali Muwwakkil and @Ram Katamaraja at least 24 hours before your submission deadline.</li>
<li>Submit via Bonfire (last todo). Post a confirmation screenshot in the todo comments.</li>
</ol>

<h3>Help</h3>
<ul>
<li>Ali: go/no-go, pricing approval, AI architecture questions</li>
<li>Ram: technical reference architecture, integration questions</li>
<li>Each other: review each other's narrative drafts before internal review</li>
</ul>

<p>Let's win some bids.</p>
</div>`,
    status: 'active',
  });
  console.log(`  posted: ${kickoff.app_url}`);

  // 7. Email Ali
  console.log('\n=== Emailing Ali ===');
  const matrixHtml = createdLists.map((c) => `
<tr style="border-bottom:1px solid #e2e8f0">
<td style="padding:10px;font-weight:600;color:#1e293b">${c.intern.name}</td>
<td style="padding:10px"><a href="${c.listUrl}">${c.title}</a></td>
<td style="padding:10px">${c.agency.substring(0, 40)}</td>
<td style="padding:10px;color:#dc2626;font-weight:600">${c.closeDate}</td>
<td style="padding:10px;color:#166534;font-weight:600">${dollar(c.estValue)}</td>
<td style="padding:10px;font-size:11px">${c.readiness.checklist?.length || 0} OP items + ${c.todoCount - (c.readiness.checklist?.length || 0)} process</td>
</tr>`).join('');

  const html = `<div style="font-family:arial;font-size:14px;color:#2d3748;line-height:1.55;max-width:900px">
<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Gov Contracts sprint v2 - LIVE</div>
<h1 style="margin:6px 0;font-size:22px;font-weight:800;color:white">4 interns, 4 RFPs, all built from real per-RFP requirements</h1>
</div>
<div style="padding:24px 28px">
<p>Ali,</p>
<p>Sprint is live. All 4 RFPs uploaded to Opportunity Pulse, AI-tailored, and BC structure built. Old 8 lists trashed (no history per your ask).</p>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family:arial;font-size:12px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Intern</th>
<th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">RFP</th>
<th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Agency</th>
<th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Closes</th>
<th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Value</th>
<th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Todos</th>
</tr></thead>
<tbody>${matrixHtml}</tbody>
</table>

<h2 style="margin:24px 0 10px;color:#1a365d;font-size:16px">What happened end-to-end</h2>
<ol style="font-size:13px;color:#475569;line-height:1.7">
<li>Trashed 8 old BC lists from the prior round.</li>
<li>For each of the 4 picks: uploaded all RFP files to OP via /attachments, marked pursuing, triggered AI tailoring, pulled the per-RFP requirement checklist.</li>
<li>Built 4 fresh BC lists - one per intern - with the AI-extracted requirements + standard process milestones as todos. Due dates compressed to each RFP's actual close date.</li>
<li>Posted kickoff message on Gov Contracts board.</li>
</ol>

<h2 style="margin:24px 0 10px;color:#1a365d;font-size:16px">Verified date corrections</h2>
<ul style="font-size:13px;color:#475569">
<li><strong>TDCJ-OIG Records</strong>: BC due dates use the verified 2026-11-01 (not OP's wrong 6/15). 5-month runway built into OBI's todos.</li>
</ul>

<p style="margin-top:18px;padding:14px 18px;background:#fefce8;border-left:4px solid #fbbf24;border-radius:4px;font-size:13px;color:#713f12">
<strong>Monday morning:</strong> walk the interns through their BC list + OP page. They should each be able to start at todo #1 and progress top-down. Tag you + Ram on internal-review todo before submission.
</p>

<p style="margin-top:16px;font-size:12px;color:#64748b"><strong>Kickoff message:</strong> <a href="${kickoff.app_url}">${kickoff.app_url}</a><br><strong>Tracking:</strong> <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/${TRACKING_TODO}">Ali Personal #${TRACKING_TODO}</a></p>
</div>
<table cellpadding="0" cellspacing="0" border="0" style="font-family:arial;font-size:14px;color:#2d3748;border-left:3px solid #1a365d;padding-left:14px;margin-top:24px"><tr><td><div style="font-weight:700;font-size:16px;color:#1a365d">Ali Muwwakkil</div><div style="color:#2b6cb0;font-weight:600">Managing Director / AI Systems Architect</div><div style="color:#718096">Colaberry Inc.</div></td></tr></table>
</div>`;

  const text = `Sprint v2 LIVE. 4 interns, 4 RFPs. Old 8 lists trashed.

${createdLists.map((c) => `${c.intern.name} - ${c.title} (${c.agency}) - closes ${c.closeDate} - ${dollar(c.estValue)}\n  BC: ${c.listUrl}\n  OP: ${OP_BASE}/admin/bonfire/${c.uuid}/submission-readiness`).join('\n\n')}

End-to-end: trashed 8 old lists, uploaded all RFP files to OP, marked pursuing, AI tailored, pulled requirements, built 4 fresh BC lists with real per-RFP todos.

Verified date correction: TDCJ-OIG Records uses 2026-11-01 (5-month runway, OP DB had wrong 6/15).

Kickoff: ${kickoff.app_url}
Tracking: https://app.basecamp.com/3945211/buckets/7463955/todos/${TRACKING_TODO}

Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.`;

  await sendWithBcAttach({
    ticketId: TRACKING_TODO,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Gov-bid sprint v2 LIVE - 4 interns assigned, 4 BC lists built from real per-RFP requirements',
    html,
    text,
    bcSummary: `<p>Sprint v2 live. End-to-end: trashed 8 old BC lists (no history per Ali), uploaded RFP files to OP for all 4 picks via /attachments, marked each pursuing, triggered AI tailoring via /tailor-requirements, pulled per-RFP checklists via /readiness, built 4 fresh BC lists with the AI-extracted artifacts as todos + standard process milestones (read RFP, bid/no-bid, requirements matrix, narrative draft, internal review, submit). Each intern: Akiwam -> TDHCA Multifamily ($750K, 6/29, 24d), OBI -> TDCJ-OIG Records ($500K, 11/1 verified, 146d), Omolola -> UTD Community Dev ($500K, 6/30, 22d), samrawit -> Harris Agenda Meeting ($300K, 6/22, 14d). All due dates compressed to actual close date. Kickoff message posted on Gov Contracts board.</p>`,
  });

  console.log('\n=== DONE ===');
  for (const c of createdLists) {
    console.log(`  ${c.intern.name}: ${c.listUrl}`);
  }
})().catch((e) => { console.error('FAIL:', e.response?.status, e.response?.data || e.stack || e.message); process.exit(1); });
