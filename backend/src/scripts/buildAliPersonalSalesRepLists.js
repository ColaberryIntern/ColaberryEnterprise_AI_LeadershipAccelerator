#!/usr/bin/env node
// Create per-sales-rep todolists in Ali Personal (bucket 7463955) for David
// Lahme + JJ (John McBride). Populate with one task per account/opportunity,
// historical + active. Each task gets a rich description; completed accounts
// get marked complete. Per Ali 2026-06-01: "The Sales Rep / Client is how
// you should create Lists in Ali Personal... These are not quite clients yet
// so they don't have an entire BC Project to themselves so I will work with
// them in my Ali Personal until they become clients."
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = '';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry SalesRepLists', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 7463955; // Ali Personal
const ALI = 17454835;

async function bcGet(p) { const r = await fetch(`${BASE}${p}`, { headers: H }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
async function bcPost(p, body) {
  const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : {};
}
async function bcComplete(id) {
  const r = await fetch(`${BASE}/buckets/${BUCKET}/todos/${id}/completion.json`, { method: 'POST', headers: H });
  return r.status;
}

// ---------------------------------------------------------------------------
// Account/opportunity definitions
// ---------------------------------------------------------------------------

const DAVID_TASKS = [
  // -- ACTIVE ----------------------------------------------------------------
  {
    title: '[ACTIVE] Coca-Cola Consolidated - June 4 lunch w/ Darrell + VP D+A',
    completed: false,
    description: `<div><strong>Status:</strong> Active. Meeting confirmed for June 4, 2026.</div>
<h3>Account summary</h3>
<div>Coca-Cola Consolidated. Initial intro via David's network (Darrell). Mandate: transform operations cost-center to growth-center; legacy apps 1800 -> 700; embedded AI via "CokeGPT"; cloud-only stack (AWS/Azure/GCP); ~200 bottling partners.</div>
<h3>What David has done</h3>
<ul>
<li>Initial outreach + Darrell conversation (2026-05-04).</li>
<li>Confirmed June 4 visit with Snyder Production Center tour (9am) + Automated Warehouse stop (10:15) + lunch.</li>
<li>Iterated About-Colaberry overview HTML through v5 with feedback rounds (2026-05-22 -> 2026-05-26). Final PDF (v5) ready to forward to two Coke leaders ahead of lunch.</li>
</ul>
<h3>What I've done</h3>
<ul>
<li>Use case taxonomy: 12 use cases drafted on 2026-05-14 (3 parallel research subagents synthesized into validated taxonomy). Narrowed to top 10 high-confidence on 2026-06-01.</li>
<li>Email to Karun + David with the 10 use cases + reasoning + security posture: <a href="#">Mandrill &lt;2d425692-813b-d983-3a78-d406b32528ae@colaberry.com&gt;</a>.</li>
<li>Pre-read review HTML (tmp/coca-cola-pre-read-review.html).</li>
</ul>
<h3>Next steps</h3>
<ol>
<li>Karun delivery-vantage review of the 10 use cases.</li>
<li>David confirms list matches what he's heard from Darrell + second leader's office.</li>
<li>Forward final pre-read PDF to two Coke leaders before lunch.</li>
<li>June 4: lead with use case 6 (AI Governance Workflow), demo use case 4 (Warehouse Slotting) live at 10:15, tee up use case 9 (Self-Service Analytics) for VP D+A.</li>
</ol>
<h3>Reference</h3>
<ul>
<li>Gmail thread: "Coca-Cola - deep dive for meeting" (May 13-14)</li>
<li>Gmail thread: "Coca-Cola meeting" (May 21-22)</li>
<li>Gmail thread: "About Colaberry overview" (v1 -> v5, May 22-26)</li>
<li>Gmail thread: "Coke notes" (v3/v4/v5 PDF, May 26)</li>
</ul>`,
  },
  {
    title: '[ACTIVE] Beckway (Mark) - use case taxonomy for internal efficiencies',
    completed: false,
    description: `<div><strong>Status:</strong> Active. Karun was asked for use case taxonomy framework; not yet delivered.</div>
<h3>What David has done</h3>
<ul>
<li>Hello Mark / Beckway intro (early May 2026).</li>
<li>Asked Ali for a Beckway-specific demo session (2026-05-01).</li>
<li>Asked Karun for proposed use cases Colaberry can solve for Beckway (2026-05-04).</li>
</ul>
<h3>What I've done</h3>
<ul>
<li>Ram shared two documents David can use with Beckway (2026-05-05).</li>
</ul>
<h3>Next steps</h3>
<ol>
<li>Karun delivers the use case taxonomy.</li>
<li>Schedule the Beckway-specific demo session.</li>
<li>Decide whether to convert to paid pilot.</li>
</ol>
<h3>Reference</h3>
<ul><li>Gmail thread: "Fwd: [EXTERNAL] Hello Mark - Beckway" (May 1-5)</li></ul>`,
  },
  {
    title: '[ACTIVE] Weisiger Group (Charlotte) - June 2 meeting',
    completed: false,
    description: `<div><strong>Status:</strong> Active. June 2 (Tuesday) meeting confirmed alongside Coca-Cola visit.</div>
<h3>What David has done</h3>
<ul>
<li>Initial outreach to Weisiger Group, tentatively scheduled for June 2 or June 3 while in Charlotte (2026-05-13).</li>
<li>Confirmed for Tuesday June 2 (2026-05-26).</li>
<li>Asked Karun whether the use case taxonomy format can be applied for Weisiger.</li>
</ul>
<h3>Next steps</h3>
<ol>
<li>Karun produces Weisiger-specific taxonomy (or reuses Beckway/Coca pattern).</li>
<li>David runs the meeting and reports back.</li>
</ol>
<h3>Reference</h3>
<ul><li>Gmail thread: "Weisiger Group" (May 13 + May 26)</li></ul>`,
  },
  {
    title: '[ACTIVE] NRECA / Co-Ops - sponsorship $3K + free advertorial',
    completed: false,
    description: `<div><strong>Status:</strong> Active. $3K sponsorship decision pending Ram's evaluation; free advertorial in queue.</div>
<h3>What David has done</h3>
<ul>
<li>Filled out NRECA contract retrieval form (April 2026).</li>
<li>Confirmed Colaberry membership grants a "free" 1/2 page advertorial in RE Magazine.</li>
<li>Identified ad sponsorship opportunity in NRECA podcast ($3K commitment) - waiting on Ram for ROI evaluation.</li>
<li>Pursued NRECA member communication list - requires marketing branded messaging.</li>
<li>Identified 837 co-op CEOs / 465 CFOs / 161 CIOs / 290 VP Ops with verified emails in NRECA data.</li>
</ul>
<h3>What I've done</h3>
<ul>
<li>Built dedicated Co-Op landing page on the platform.</li>
<li>Identified primary target titles (CEOs, VPs, Directors in Engineering + Operations).</li>
</ul>
<h3>Next steps</h3>
<ol>
<li>Ram decides on the $3K podcast sponsorship.</li>
<li>Submit the free 1/2 page advertorial for next issue.</li>
<li>Once member list is approved, build the outbound campaign.</li>
</ol>
<h3>Reference</h3>
<ul>
<li>Gmail thread: "Bunch of stuff re: NRECA" (April 13-14)</li>
<li>Gmail thread: "Fwd: Re: NRECA Member Communication List" (April 27 - May 1)</li>
<li>Gmail thread: "Follow-up from Coops" (April 8-10)</li>
<li>Gmail thread: "Transmission for Tomorrow: Co-op Projects Take On Rising Demand" (April 10)</li>
</ul>`,
  },
  // -- DORMANT ---------------------------------------------------------------
  {
    title: '[DORMANT] PRECO Utility / Max Baker - PowerBI User Group demo',
    completed: false,
    description: `<div><strong>Status:</strong> Dormant. Initial demo done April 2026; no recent activity.</div>
<h3>What happened</h3>
<ul>
<li>David joined PRECO's PowerBI User Group (April 2 inaugural meeting).</li>
<li>Pitched Max Baker for a demo after a personal call + separate PBI call (2026-04-14).</li>
<li>Built dedicated co-op landing page based on Max's pain points (April 2).</li>
<li>Demo ran with manual control mode + pre-step narration.</li>
</ul>
<h3>Why dormant</h3>
<div>Max has not engaged for next steps. Reviewing whether to re-pitch or move on. Co-Op program more generally being driven via NRECA channel instead.</div>
<h3>Reference</h3>
<ul>
<li>Gmail thread: "PBI call April 9, 2026"</li>
<li>Gmail thread: "Demo, etc..." (April 22)</li>
<li>Gmail thread: "Demo for traditional utilities" (May 4)</li>
</ul>`,
  },
  {
    title: '[DORMANT] Phoenix Park Gas Processors (PPGPL) - Trinidad pilot exploration',
    completed: false,
    description: `<div><strong>Status:</strong> Dormant. Demo run June 2025; no follow-through.</div>
<h3>What happened</h3>
<ul>
<li>Call with Reshma, Michelle, Rehea on 2025-06-24 about using Colaberry Data Science School as part of their L&amp;D program.</li>
<li>System architecture diagram + custom GPT demo shared.</li>
</ul>
<h3>Why dormant</h3>
<div>Last touchpoint was July 24 2025. No further engagement.</div>
<h3>Reference</h3>
<ul><li>Gmail thread: "Phoenix Park &amp; Colaberry" (June-July 2025)</li></ul>`,
  },
  {
    title: '[DORMANT] Apparo dashboard meeting (Kristen Reed)',
    completed: false,
    description: `<div><strong>Status:</strong> Dormant. June 2025 dashboard meeting; no follow-up.</div>
<h3>What happened</h3>
<ul>
<li>David attended Apparo event (June 2025).</li>
<li>Kristen Reed and team thanked David for his contribution.</li>
<li>Dashboard meeting setup discussed but never re-scheduled.</li>
</ul>
<h3>Reference</h3>
<ul><li>Gmail thread: "Apparo &amp; Colaberry - Dashboard meeting" (June 2025)</li></ul>`,
  },
  {
    title: '[DORMANT] Compass UOL (Brazil) - Market Research Assistant POC',
    completed: false,
    description: `<div><strong>Status:</strong> Dormant. POC kicked off Sept 2025; no recent visibility.</div>
<h3>What happened</h3>
<ul>
<li>Kickoff with Lidia Silva (Delivery Manager) and the Compass team (2025-09-29).</li>
<li>Earlier kickoff for "Generative AI Assessment" with the Compass + Colaberry team (2025-07-22).</li>
</ul>
<h3>Reference</h3>
<ul>
<li>Gmail thread: "[Colaberry - Market Research Assistant POC] Kick-off Meeting" (Sept 2025)</li>
<li>Gmail thread: "Colaberry - Generative AI Assessment - Kick-off" (July 2025)</li>
</ul>`,
  },
  {
    title: '[DORMANT] Jeld-Wen Procurement AI - prep call use case discussion',
    completed: false,
    description: `<div><strong>Status:</strong> Dormant. Use cases drafted Aug 2025; no further engagement visible.</div>
<h3>What happened</h3>
<ul><li>Ali drafted Jeld-Wen Procurement AI use cases for the prep call (2025-08-13).</li></ul>
<h3>Reference</h3>
<ul><li>Gmail thread: "Prep call for Jeld-Wen - Use Case discussion"</li></ul>`,
  },
  // -- DONE / WRAPPED --------------------------------------------------------
  {
    title: '[DONE] About Colaberry overview + Coke notes PDFs (v5 final)',
    completed: true,
    description: `<div><strong>Status:</strong> Done. v5 PDF generated, address corrected, formatting cleaned, ready to forward.</div>
<h3>Iterations</h3>
<ul>
<li>v1 review draft sent 2026-05-22.</li>
<li>v2 with sector additions (BioPharma + Utility/Oil&amp;Gas/Engineering) on 2026-05-26.</li>
<li>v3 with full feedback addressed.</li>
<li>v4 final with five-platform tile naming polish.</li>
<li>v5 final PDF with address fix, footer cleanup, ready for David to forward.</li>
</ul>
<h3>Artifact</h3>
<div>v5 final PDF at <code>docs/About_Colaberry_v5_FINAL.pdf</code> (also tmp/About_Colaberry_v6_FINAL.pdf if v6 was the final).</div>
<h3>Reference</h3>
<ul>
<li>Gmail thread: "About Colaberry overview" + "Coke notes" series (May 22-26)</li>
</ul>`,
  },
  {
    title: '[DONE] 2026 AI in Life Sciences Summit Boston - two proposals submitted',
    completed: true,
    description: `<div><strong>Status:</strong> Done. Two proposals submitted Nov 2025 (Stellix recommendation route).</div>
<h3>What happened</h3>
<ul>
<li>Stellix recommended attending "ISPE" / AI in Life Sciences Summit Boston.</li>
<li>Ram submitted two proposals (the more relevant ones) since organizers required client-rep attendance for presentations.</li>
</ul>
<h3>Reference</h3>
<ul><li>Gmail thread: "2026 AI in Life Sciences Summit - Boston" (Oct-Nov 2025)</li></ul>`,
  },
  {
    title: '[DONE] BAA Technical Areas (Essnova) - NDA signed + capability deck shared',
    completed: true,
    description: `<div><strong>Status:</strong> Done. NDAs exchanged April 2026.</div>
<h3>What happened</h3>
<ul>
<li>Connected with David Garcia (Essnova) on BAA Technical areas (2026-04-10).</li>
<li>Ram shared capabilities decks + AI resources URL.</li>
<li>Mutual NDAs signed (Colaberry side April 13, Essnova FE NDA April 13).</li>
</ul>
<h3>Reference</h3>
<ul><li>Gmail thread: "BAA Technical areas" (April 10-13)</li></ul>`,
  },
  {
    title: '[DONE] Nashville Electric Service RFP Z0668 - reviewed, decided no-bid',
    completed: true,
    description: `<div><strong>Status:</strong> Done. Reviewed Nov 2024; concluded too large for current resourcing.</div>
<h3>What happened</h3>
<div>Ram forwarded the Nashville Electric Service RFP Z0668 (Comprehensive Data Strategy) for review. Ali responded that the project is doable but very large; would require significant planning + resources.</div>
<h3>Reference</h3>
<ul><li>Gmail thread: "Fwd: Nashville Electric Service RFP Z0668" (Nov 2024)</li></ul>`,
  },
  {
    title: '[DONE] Ameren New Supplier Quality Qualification - QMS submitted',
    completed: true,
    description: `<div><strong>Status:</strong> Done. QMS submitted Jan 2026; qualification pending Ameren-side review.</div>
<h3>What happened</h3>
<ul>
<li>Lindsey Shaw (Ameren Supply Chain) requested Quality Qualification (2026-01-26).</li>
<li>David submitted the QMS for the questionnaire (2026-01-29).</li>
</ul>
<h3>Reference</h3>
<ul><li>Gmail thread: "[Colaberry Inc] Ameren New Supplier Quality Qualification" (Jan 2026)</li></ul>`,
  },
  {
    title: '[DONE] IOU Utilities (Duke / Oncor) - demo page built + presenter mode',
    completed: true,
    description: `<div><strong>Status:</strong> Done. enterprise.colaberry.ai/utility-ai IOU variant live + presenter mode added.</div>
<h3>What happened</h3>
<ul>
<li>David asked for an IOU-specific reword of the co-op landing page (2026-05-04).</li>
<li>Ali built the IOU demo page same day.</li>
<li>Added <code>?presenter</code> URL param for manual mode (pauses at 5 narration points).</li>
<li>4-bullet summary generated for David's use.</li>
</ul>
<h3>Reference</h3>
<ul><li>Gmail thread: "Demo for traditional utilities" (May 4)</li></ul>`,
  },
  {
    title: '[DONE] David - Apollo seats + Hubspot access provisioned',
    completed: true,
    description: `<div><strong>Status:</strong> Done. Apollo admin access granted April 2025.</div>
<h3>What happened</h3>
<div>Ali provisioned David with admin seat on Apollo.io (April 2025). Hubspot access also discussed.</div>
<h3>Reference</h3>
<ul><li>Gmail thread: "Apollo Seats"</li></ul>`,
  },
];

const JJ_TASKS = [
  // -- ACTIVE ----------------------------------------------------------------
  {
    title: '[ACTIVE] Patriot Insurance - Andrew Drayer (REMARKETING is the priority, proposal next)',
    completed: false,
    description: `<div><strong>Status:</strong> Active. May 27 call wrapped; proposal next.</div>
<h3>Account summary</h3>
<div>Patriot Growth Insurance Services, LLC. Top-20 US insurance broker, PE-backed, ~$500M revenue, 100+ acquisitions. Multi-agency, multi-regional. Andrew Drayer is President of Northeast (exec sponsor). Their team on the call: Jacob (Patriot Texas ops), Martin Mullen (AMS data), plus Andrew. Our side: Ali, Ram, JJ, Karun.</div>
<h3>What JJ has done</h3>
<ul>
<li>Forwarded the Patriot SBU SOP (2026-05-26) for our team to review before the call.</li>
<li>Coordinated the call timing + accepted the prep meeting invites.</li>
<li>Joined the May 27 prep call (8am CT) + the Andrew Drayer call (10:30am CT, 56 min).</li>
</ul>
<h3>What I've done</h3>
<ul>
<li>Set up the Basecamp project (Patriot Insurance bucket).</li>
<li>Built v2 prep worksheet (2026-05-27).</li>
<li>Loaded AI deliverables + all 8 todos assigned and due-dated post-call.</li>
<li>Internal recap email sent (subject "Patriot project - comprehensive recap, AI deliverables loaded...").</li>
</ul>
<h3>Next steps</h3>
<ol>
<li>Assemble the pilot proposal (REMARKETING priority per Andrew's pick).</li>
<li>Andrew's 2 regional counterparts to be looped in (he runs Northeast; 2 other guys run the rest of US).</li>
<li>Their existing SBU is in place but not working as they want it to - that's the opening for the pilot.</li>
</ol>
<h3>Reference</h3>
<ul>
<li>Basecamp: <a href="https://app.basecamp.com/3945211/projects/47447274">Patriot Insurance project</a></li>
<li>Gmail thread: "SBU SOP" (May 26-27)</li>
<li>Gmail thread: "Patriot Insurance Group prep call" (May 26-27)</li>
<li>Gmail thread: "Patriot project - Basecamp setup..." (May 27)</li>
<li>Gmail thread: "Patriot project - comprehensive recap..." (May 27)</li>
<li>Otter recordings: "Patriot Insurance Group prep - internal (Ali / Ram / JJ / Karun)"</li>
</ul>`,
  },
  {
    title: '[DONE] Patriot SBU SOP review - JJ shared, team reviewed before May 27 call',
    completed: true,
    description: `<div><strong>Status:</strong> Done. SOP shared 2026-05-26 evening; reviewed in 8am prep call 2026-05-27.</div>
<h3>What happened</h3>
<ul>
<li>JJ forwarded the SBU SOP (confidential Patriot info) to Ram + Karun + Ali on May 26 8:29pm.</li>
<li>Ram requested an internal prep call to review before the Andrew call - set for 9am CDT next day.</li>
<li>Prep call held 2026-05-27 8am CDT (60 min, all 4 of Ali/Ram/JJ/Karun present).</li>
<li>Andrew pushed the main call from earlier slot to 10:30am same day.</li>
</ul>
<h3>Reference</h3>
<ul><li>Gmail thread: "Fwd: SBU SOP" (May 26-27)</li></ul>`,
  },
];

// ---------------------------------------------------------------------------
// EXECUTE
// ---------------------------------------------------------------------------

(async () => {
  console.log('[sales-rep-lists] starting');
  const proj = await bcGet(`/projects/${BUCKET}.json`);
  const tset = proj.dock.find((d) => d.name === 'todoset');

  const results = { lists: [], totalCreated: 0, totalCompleted: 0 };

  for (const [repName, tasks] of [['David Lahme', DAVID_TASKS], ['JJ McBride', JJ_TASKS]]) {
    console.log(`\n[${repName}] creating list (${tasks.length} tasks)`);
    const list = await bcPost(`/buckets/${BUCKET}/todosets/${tset.id}/todolists.json`, {
      name: repName,
      description: `<div>Sales Rep / Client tracking list for <strong>${repName}</strong>. One task per account / opportunity. Active = in flight. Dormant = was active, no recent movement. Done = wrapped.</div>
<div style="margin-top:8px;font-size:12px;color:#64748b">Auto-generated 2026-06-01 from Gmail correspondence + Basecamp activity. Add new accounts as tasks. Update existing tasks rather than create duplicates.</div>`,
    });
    console.log(`  list id: ${list.id} url: ${list.app_url}`);
    const listRes = { name: repName, listId: list.id, url: list.app_url, tasks: [], active: 0, dormant: 0, done: 0 };

    for (const t of tasks) {
      const todo = await bcPost(`/buckets/${BUCKET}/todolists/${list.id}/todos.json`, {
        content: t.title,
        description: t.description,
        assignee_ids: [ALI],
        notify: false,
      });
      let bucket = 'active';
      if (t.title.startsWith('[DONE]')) bucket = 'done';
      else if (t.title.startsWith('[DORMANT]')) bucket = 'dormant';
      listRes.tasks.push({ id: todo.id, title: t.title, url: todo.app_url, completed: t.completed, bucket });
      listRes[bucket]++;
      if (t.completed) {
        await bcComplete(todo.id);
        console.log(`  + ${t.title.slice(0, 60)} (complete)`);
        results.totalCompleted++;
      } else {
        console.log(`  + ${t.title.slice(0, 60)}`);
      }
      results.totalCreated++;
    }
    results.lists.push(listRes);
  }

  console.log('\n=== SUMMARY ===');
  for (const l of results.lists) {
    console.log(`${l.name}: ${l.tasks.length} tasks (${l.active} active / ${l.dormant} dormant / ${l.done} done) -> ${l.url}`);
  }

  // Save for the follow-up email script
  const outPath = path.resolve(__dirname, '../../../tmp/sales-rep-lists-result.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSummary saved to ${outPath}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
