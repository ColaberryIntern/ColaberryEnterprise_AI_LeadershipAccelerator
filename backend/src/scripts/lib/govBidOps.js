// Gov bid operations: scrap (trash a todolist) + add (create new bid with
// standard task template).
//
// Used by:
//   - One-off CLI runs (this session: scrap 5 + add 5)
//   - @CB tools: scrap_gov_bid + add_gov_bid (next session)
//   - Future v1.1 auto-runner

const PROJECT_ID = 47346103; // Gov Contracts
const BASE = `https://3.basecampapi.com/3945211`;

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da').replace(/^bearer\s+/i, '');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry GovBidOps', Accept: 'application/json', 'Content-Type': 'application/json' };
}

async function bcGet(p) { const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { headers: bcHeaders() }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
async function bcGetAll(p) {
  let n = p.startsWith('http') ? p : `${BASE}${p}`;
  const out = [];
  while (n) {
    const r = await fetch(n, { headers: bcHeaders() });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    n = lh ? lh[1] : null;
  }
  return out;
}
async function bcPost(p, body) {
  const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { method: 'POST', headers: bcHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPut(p, body) {
  const r = await fetch(p.startsWith('http') ? p : `${BASE}${p}`, { method: 'PUT', headers: bcHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

// =============================================================================
// SCRAP a gov bid (trash the todolist)
// =============================================================================
async function scrapBid(matchName) {
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const tset = proj.dock.find((d) => d.name === 'todoset');
  const lists = await bcGetAll(`/buckets/${PROJECT_ID}/todosets/${tset.id}/todolists.json`);
  const matchLower = matchName.toLowerCase();
  const matches = lists.filter((l) => (l.name || '').toLowerCase().includes(matchLower));
  if (matches.length === 0) throw new Error(`No bid matched "${matchName}". Available: ${lists.slice(0, 10).map((l) => l.name).join(' | ')}`);
  if (matches.length > 1) throw new Error(`Multiple bids matched "${matchName}": ${matches.map((l) => l.name).join(' | ')}. Be more specific.`);
  const list = matches[0];
  // Trash the recording (Basecamp keeps it recoverable for 30 days)
  await bcPut(`/buckets/${PROJECT_ID}/recordings/${list.id}/status/trashed.json`, {});
  return { trashed: list.id, name: list.name, app_url: list.app_url };
}

// =============================================================================
// ADD a new gov bid with the standard 14-task template
// =============================================================================
const STANDARD_TEMPLATE = [
  { content: 'Read RFP in full + extract requirements matrix', note: 'Read every document in the RFP package. Build a requirements matrix tagged by source doc, owner, and acceptance evidence.', tier: 'AI' },
  { content: 'Bid / no-bid decision (qualification gate)', note: 'Confirm: (a) US-only delivery if required, (b) tech-stack fit, (c) ability to meet security controls, (d) competitive landscape. Document GO/NO-GO.', tier: 'HUMAN' },
  { content: 'Attend pre-proposal conference', note: 'Date/time from RFP. Take notes on what the buyer emphasizes - that informs proposal positioning.', tier: 'HUMAN' },
  { content: 'Submit written questions via Bonfire', note: 'Questions go ONLY through Bonfire Q&A tab. Likely topics: integration scope, data migration, SLA, security controls, evaluation criteria.', tier: 'HUMAN' },
  { content: 'Respond to Functional Requirements (per-row marking)', note: 'For each requirement: Out of the Box / Configuration Required / Customization Required / Cannot Be Met.', tier: 'AI' },
  { content: 'Respond to Technical Requirements + reference architecture questionnaire', note: 'Technical capability responses + any supplied xlsx questionnaire.', tier: 'AI' },
  { content: 'Complete IT Vendor Controls + Cybersecurity Acknowledgement Form', note: 'Sign-required compliance form.', tier: 'HUMAN' },
  { content: 'Complete compliance forms (MWBE + HUB + Insurance + Vendor Disclosure + Tax + Wage)', note: 'Bundle of buyer-specific forms. Typically requires signatures.', tier: 'HUMAN' },
  { content: 'Draft executive summary', note: 'One-page why-us narrative. Lead with the differentiator + 3 bullet proof points.', tier: 'AI' },
  { content: 'Draft capability statement', note: 'Past performance + team bios + relevant case studies. Standard Colaberry capability deck.', tier: 'AI' },
  { content: 'Draft proposal narrative (main response)', note: 'Detailed proposal per RFP outline. Pull from requirements matrix + functional + technical responses.', tier: 'AI' },
  { content: 'Pricing schedule', note: 'Per pricing template in RFP. Reference comparable comps. Negotiate margin internally.', tier: 'HUMAN' },
  { content: 'Internal review + sign-off (Phase 4)', note: 'Ali + delivery lead + finance review. Final sign-off before submission.', tier: 'HUMAN' },
  { content: 'Submit via Bonfire portal', note: 'Final action. Bonfire upload of all required documents. Confirm receipt.', tier: 'HUMAN' },
];

async function addBid({ displayTitle, deadline, opportunityUuid, fitThesis, agencyName }) {
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const tset = proj.dock.find((d) => d.name === 'todoset');

  // Create the todolist
  const description = [
    `<div><strong>${displayTitle}</strong></div>`,
    deadline ? `<div>Submission deadline: ${deadline}</div>` : '',
    opportunityUuid ? `<div>Opportunity UUID: ${opportunityUuid}</div>` : '',
    agencyName ? `<div>Agency: ${agencyName}</div>` : '',
    fitThesis ? `<div><br></div><div><strong>Fit thesis:</strong> ${fitThesis}</div>` : '',
    `<div><br></div>`,
    `<div>Standard 14-task template applied. Edit individual tasks in Basecamp as the RFP requirements solidify.</div>`,
  ].filter(Boolean).join('');

  const newList = await bcPost(`/buckets/${PROJECT_ID}/todosets/${tset.id}/todolists.json`, {
    name: displayTitle,
    description,
  });

  // Distribute task due dates evenly working backward from (deadline - 1 day)
  let datesPerTask = null;
  if (deadline) {
    const submissionTarget = new Date(deadline);
    submissionTarget.setUTCDate(submissionTarget.getUTCDate() - 1);
    const today = new Date();
    const daysAvailable = Math.max(STANDARD_TEMPLATE.length, Math.round((submissionTarget.getTime() - today.getTime()) / 86400000));
    const step = Math.max(1, Math.floor(daysAvailable / STANDARD_TEMPLATE.length));
    datesPerTask = STANDARD_TEMPLATE.map((_, i) => {
      const reverseIndex = STANDARD_TEMPLATE.length - 1 - i;
      const d = new Date(submissionTarget);
      d.setUTCDate(d.getUTCDate() - reverseIndex * step);
      const iso = d.toISOString().slice(0, 10);
      const todayIso = today.toISOString().slice(0, 10);
      return iso < todayIso ? todayIso : iso;
    });
  }

  // Create tasks in order
  const createdTasks = [];
  for (let i = 0; i < STANDARD_TEMPLATE.length; i++) {
    const t = STANDARD_TEMPLATE[i];
    const body = {
      content: t.content,
      description: `<div>${t.note}</div><div><br></div><div><em>Standard template task ${i + 1}/${STANDARD_TEMPLATE.length}. Tier: ${t.tier}</em></div>`,
    };
    if (datesPerTask) body.due_on = datesPerTask[i];
    const todo = await bcPost(`/buckets/${PROJECT_ID}/todolists/${newList.id}/todos.json`, body);
    createdTasks.push({ id: todo.id, content: t.content, tier: t.tier, due_on: datesPerTask?.[i] });
  }

  return {
    listId: newList.id,
    listName: newList.name,
    appUrl: newList.app_url,
    tasksCreated: createdTasks.length,
    tasks: createdTasks,
  };
}

// =============================================================================
// POST a Gov-Contracts Message Board UPDATE with download instructions.
// This is step 1 of the two-step "add bids" flow:
//   1. propose_gov_bids_download_instructions(count) -> posts MB update with
//      Opportunity Pulse + Bonfire links, step-by-step instructions
//   2. Ali downloads the RFP zips manually
//   3. Ali comments back with the bid list (title + deadline + agency per bid)
//   4. CB calls addBid() per item to create the real todolist
// =============================================================================

const OPPORTUNITY_PULSE_URL = process.env.OPPORTUNITY_PULSE_URL || 'https://opportunitypulse.colaberry.ai/';
const BONFIRE_LOGIN_URL = process.env.BONFIRE_LOGIN_URL || 'https://bidopps.colaberry.com/login';

async function postGovBidDownloadInstructions({ count, criteriaSummary }) {
  // Fetch the message board id from the project dock
  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const mb = proj.dock.find((d) => d.name === 'message_board');
  if (!mb) throw new Error('Message board not found on Gov Contracts project');

  const subject = `Action: Download ${count} RFP package${count === 1 ? '' : 's'} from Opportunity Pulse`;

  const content = `<div><strong>What CB needs from you next:</strong></div>
<div>I cannot pull RFP packages on my own (Opportunity Pulse + Bonfire require a logged-in browser session). Once you have the documents, I will build out the full project with the 14-task template, due dates back-distributed from the submission deadline, and feasibility scoring.</div>
<div><br></div>
<div><strong>Step-by-step:</strong></div>
<ol>
<li>Open <a href="${OPPORTUNITY_PULSE_URL}">Opportunity Pulse</a>${criteriaSummary ? ` and pick ${count} ${criteriaSummary}` : ` and pick the ${count} opportunit${count === 1 ? 'y' : 'ies'} you want to pursue`}.</li>
<li>For each opportunity, login to <a href="${BONFIRE_LOGIN_URL}">Bonfire</a> (use the routing rule per opportunity: Colaberry-only vs joint with Que).</li>
<li>Download the full RFP zip from Bonfire for each opportunity.</li>
<li>Once you have all ${count} zip${count === 1 ? '' : 's'} downloaded, reply on this message board post with the following for each bid:
<ul>
<li><strong>Title</strong> (e.g., "Harris County - Agenda &amp; Meeting Management System (RFP 26_0075)")</li>
<li><strong>Submission deadline</strong> (YYYY-MM-DD)</li>
<li><strong>Agency</strong></li>
<li><em>Optional:</em> short fit thesis (1-2 sentences on why we're bidding)</li>
</ul>
</li>
<li>Tag <strong>@CB System</strong> in your reply so I see it. I will create the ${count} full project${count === 1 ? '' : 's'} with the 14-task template + due dates immediately.</li>
</ol>
<div><br></div>
<div><strong>Format example for your reply:</strong></div>
<div style="background:#f1f5f9;border-left:3px solid #1a365d;padding:10px 14px;font-family:monospace;font-size:12px">
&#64;CB System ready - here are the ${count} bid${count === 1 ? '' : 's'}:<br>
1. Harris County - Agenda &amp; Meeting Management (RFP 26_0075), deadline 2026-06-22, agency Harris County TX<br>
2. SLCC - Enterprise Analytics Platform (SLCC2026-M6006), deadline 2026-07-15, agency SLCC<br>
3. ...
</div>
<div><br></div>
<div style="font-size:12px;color:#64748b">For a single bid where you already know the title and deadline, you can skip this entire step and just tag <code>&#64;CB System add gov bid &lt;title&gt; deadline &lt;YYYY-MM-DD&gt;</code> directly.</div>`;

  const r = await bcPost(`/buckets/${PROJECT_ID}/message_boards/${mb.id}/messages.json`, {
    subject,
    content,
    status: 'active',
  });
  return {
    messageId: r.id,
    appUrl: r.app_url,
    subject,
  };
}

module.exports = { scrapBid, addBid, postGovBidDownloadInstructions, STANDARD_TEMPLATE };
