#!/usr/bin/env node
// Replace each existing proposal-list todo with a rich-description
// version. Interns shouldn't need to ask CB System where to find
// things or what "done" means.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));

const BC_BASE = 'https://3.basecampapi.com/3945211';
const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};
const GOV_PROJECT = 47346103;
const OP_BASE = 'http://95.216.199.47';

const INTERNS = {
  akiwam: { id: 33056069, name: 'Akiwam' },
  obi: { id: 42266313, name: 'OBI, ANAMELECHI KINGSLEY' },
  omolola: { id: 49487826, name: 'Omolola Makinde' },
  samrawit: { id: 20684153, name: 'samrawit mekonen' },
};

// Per-project context for personalizing task descriptions
const PROJECTS = [
  {
    listId: 9967405074,
    intern: INTERNS.akiwam,
    uuid: '2f5fd926-05f6-4d02-9388-c0ae3b141aed',
    title: 'TDHCA Multifamily Management System',
    agency: 'Texas Department of Housing and Community Affairs',
    closeDate: '2026-06-29',
    bonfire: 'https://tdhca-texas-gov.bonfirehub.com/opportunities/238803',
    keyDocs: ['4-Multifamily System RFO Final w vethub 6-1-26.pdf (the main RFO)', '6-Attachment D - Multifamily System Requirements.docx (the requirements matrix)'],
    domainBrief: 'TDHCA administers Low-Income Housing Tax Credits (LIHTC 9% and 4%), HOME, NHTF, and tax-exempt bonds. Developers apply for an allocation. After award, TDHCA monitors compliance for 15-30 years.',
    keyTerms: 'LIHTC = Low-Income Housing Tax Credit. LURA = Land Use Restriction Agreement (recorded against the property for the compliance period). 8823 = IRS form filed when a property is non-compliant. 8609 = IRS form that allocates tax credits to the property owner.',
  },
  {
    listId: 9967406450,
    intern: INTERNS.obi,
    uuid: 'cf2f3de4-cb2b-4eb0-85d5-7494cc6693d0',
    title: 'TDCJ-OIG Records Management System',
    agency: 'Texas Department of Criminal Justice - Office of Inspector General',
    closeDate: '2026-11-01',
    bonfire: 'https://tdcj.bonfirehub.com/opportunities/234405',
    keyDocs: ['6-696-IG-26-O012.pdf (the main RFO, 81 pages)', '5-696-IG-26-O012 Exhibit J.2.pdf (functional requirements detail)'],
    domainBrief: 'OIG investigates crimes inside Texas state prisons (sworn peace officer agency). They need a cloud-based Records Management System with evidence handling, chain-of-custody, multi-jurisdictional search, and CJIS-grade controls.',
    keyTerms: 'CJIS = FBI Criminal Justice Information Services policy (mandatory baseline). TX-RAMP = Texas state cloud authorization. RMS = Records Management System. Chain-of-custody = log of every transfer of an evidence item with timestamp, officer, and signature.',
  },
  {
    listId: 9967407307,
    intern: INTERNS.omolola,
    uuid: '4dc18cd6-a1a3-4bdd-86f4-b4e97c6d6dd7',
    title: 'UTD Residential Life Software for Housing',
    agency: 'University of Texas at Dallas',
    closeDate: '2026-06-30',
    bonfire: 'https://utdallas.bonfirehub.com/opportunities/235517',
    keyDocs: ['1-REQUEST FOR PROPOSAL Community Development Software for Housing UTD20260428-TB.pdf (the main RFP, 51 pages)', '2-ADDENDUM NO1.pdf (date change: revised from 7/9 to 6/30)'],
    domainBrief: 'UTD Residential Life supports 26,700 students. They use a residential curriculum model and need software for daily ops: on-call logs, noise complaints, program proposals, staff scheduling, mass communication, student profiles. Must integrate with StarRez (housing) and Salesforce (CRM).',
    keyTerms: 'StarRez = the dominant student-housing assignment system. Residential Curriculum = pedagogical model where every program ties to a learning outcome. RA = Resident Assistant (student staff). HD/RD = Hall Director / Residence Director (pro staff). HECVAT = Higher-Ed Cloud Vendor Assessment Tool (mandatory).',
  },
  {
    listId: 9967409301,
    intern: INTERNS.samrawit,
    uuid: '2e287828-9040-4948-98fe-a0250a5d66a5',
    title: 'Harris County Agenda + Meeting Management System',
    agency: 'Harris County',
    closeDate: '2026-06-22',
    bonfire: 'https://harriscountytx.bonfirehub.com/opportunities/206717',
    keyDocs: ['12-Specifications.pdf (the system specifications)', '13-Special Requirements.pdf', '11-Harris County Universal Services Reference Architecture (USRA).pdf'],
    domainBrief: 'Harris County (the third largest county in the US) holds weekly public meetings of Commissioners Court and other boards. They need software to build agendas, manage supporting docs, take votes during the live meeting, generate minutes, track action items, and run a public portal. Must align to Harris County USRA architecture.',
    keyTerms: 'USRA = Universal Services Reference Architecture (county standard for integrations). Commissioners Court = the elected governing body. Texas Open Meetings Act = state law requiring advance public notice and public access. Granicus / CivicClerk / Diligent = incumbent vendors we are displacing.',
  },
];

// Standard process milestones — each with a rich description
function processTasks(p) {
  return [
    {
      content: `Read the full RFP and write a 1-paragraph scope summary`,
      description: `<div><strong>What to do</strong></div>
<ol>
<li>Open the BC list description above for the agency + close date.</li>
<li>Download the RFP zip from Bonfire: <a href="${p.bonfire}">${p.bonfire}</a> (sign in with the right Bonfire account per our gov-bid account routing). Files are also at <code>tmp/rfp-eval/</code> on Ali's laptop.</li>
<li>The most important files are: ${p.keyDocs.map(d => `<code>${d}</code>`).join(', ')}. Read these first.</li>
<li>Write a 1-paragraph scope summary in plain English (what the agency wants, who uses it, what success looks like) and post it as a comment on this todo.</li>
</ol>
<div><strong>Domain primer</strong></div>
<p>${p.domainBrief}</p>
<div><strong>Key terms</strong></div>
<p>${p.keyTerms}</p>
<div><strong>Done when</strong></div>
<p>Scope summary posted as a comment + completion of this todo.</p>`,
    },
    {
      content: `Bid / no-bid decision: confirm mandatory minimums`,
      description: `<div><strong>What to do</strong></div>
<ol>
<li>From the RFP, list every <strong>mandatory minimum</strong> the vendor must meet. Look for "shall", "must", "required" in section headers.</li>
<li>Common gates: insurance limits, certifications (TX-RAMP, HECVAT, SOC2, CJIS), references requirement (typically 3-5 similar projects), financials.</li>
<li>For each gate, mark: <strong>have / don't have / pursuing</strong>. If "don't have", flag it to @Ali Muwwakkil in the comment.</li>
<li>If 3+ gates are "don't have", we may need to no-bid. Don't assume - escalate to Ali.</li>
</ol>
<div><strong>Where to find Colaberry's existing posture</strong></div>
<p>Check Ali Personal BC project for any prior compliance posture todos. Ask in #gov-contracts Slack for the latest TX-RAMP / SOC2 status.</p>
<div><strong>Done when</strong></div>
<p>Compliance gate table posted as a comment, with Ali tagged if any gates are "don't have".</p>`,
    },
    {
      content: `Build the requirements matrix: every shall/must/required item`,
      description: `<div><strong>What to do</strong></div>
<ol>
<li>Open the main spec document for this RFP: ${p.keyDocs[0] ? `<code>${p.keyDocs[0]}</code>` : 'see BC list description'}.</li>
<li>Extract every "shall", "must", or "required" statement into a spreadsheet (Google Sheets). Columns: <code>req_id | section | text | our_response_summary | response_doc | status</code>.</li>
<li>Use the AI-tailored requirements already loaded in Opportunity Pulse as a starting point: <a href="${OP_BASE}/admin/bonfire/${p.uuid}/submission-readiness">OP submission-readiness for this RFP</a>.</li>
<li>Most RFPs have 50-200 requirements. Spend up to a day on this - it's the spine of the entire proposal.</li>
<li>Save the sheet to Google Drive, share with @Ali Muwwakkil and @Ram Katamaraja, and paste the share link as a comment on this todo.</li>
</ol>
<div><strong>Done when</strong></div>
<p>Google Sheet with every requirement extracted + share link posted as a comment.</p>`,
    },
    {
      content: `Draft the proposal narrative`,
      description: `<div><strong>What to do</strong></div>
<ol>
<li>The proposal narrative is our case for why Colaberry wins this bid. Use the proposal narrative template auto-generated by Opportunity Pulse at <a href="${OP_BASE}/admin/bonfire/${p.uuid}/submission-readiness">OP submission-readiness</a>.</li>
<li>Structure: Executive Summary, Our Understanding, Our Approach, Technical Approach, Team & Past Performance, Implementation Plan, Pricing Summary.</li>
<li><strong>Critical:</strong> reference the working demo of the actual software we're building (your build list in BC has the demo URL once it's deployed). Quote it: "Our working pilot, deployed at [demo URL], demonstrates..."</li>
<li>For "Our Understanding": one paragraph per requirement category, in your own words, showing we understand their actual workflow (not just generic capability statements).</li>
<li>Save as Google Doc, share with @Ali Muwwakkil + @Ram Katamaraja.</li>
</ol>
<div><strong>Where to find examples</strong></div>
<p>Colaberry has prior gov-bid narratives in Google Drive folder "Gov Bids / Past Proposals". Ask Ali for the link if you don't have access.</p>
<div><strong>Done when</strong></div>
<p>Narrative draft Google Doc + share link in this todo + ping Ali for review.</p>`,
    },
  ];
}

function submissionTasks(p) {
  return [
    {
      content: `Internal review: tag Ali + Ram for sign-off (24h before submission)`,
      description: `<div><strong>What to do</strong></div>
<ol>
<li>Package everything for review: the requirements matrix, the proposal narrative, the auto-generated artifacts from OP (cover letter, capability statement, references), and the demo URL of your build.</li>
<li>Create a single review document (Google Doc) with links to each artifact.</li>
<li>Post a comment on this todo tagging @Ali Muwwakkil and @Ram Katamaraja. Subject line: "Ready for internal review - ${p.title} - closes ${p.closeDate}".</li>
<li>Wait for go/no-go from Ali. If he says revise, address comments and re-submit.</li>
</ol>
<div><strong>Critical timing</strong></div>
<p>This todo's due date is set to 24 hours before the submission deadline (<strong>${p.closeDate}</strong>). Hit this date so Ali has actual time to review. If you slip, the submission slips.</p>
<div><strong>Done when</strong></div>
<p>Ali replies "approved" or "go" in the comment thread.</p>`,
    },
    {
      content: `Submit via Bonfire portal + post confirmation screenshot`,
      description: `<div><strong>What to do</strong></div>
<ol>
<li>Sign in to Bonfire at <a href="${p.bonfire}">${p.bonfire}</a> with the right account (Que joint or Colaberry-only per our gov-bid routing).</li>
<li>Upload every required document. The Opportunity Pulse readiness page at <a href="${OP_BASE}/admin/bonfire/${p.uuid}/submission-readiness">submission-readiness</a> shows the full required list - cross-check it.</li>
<li>Submit. Bonfire will email a confirmation receipt with a confirmation number.</li>
<li>Take a screenshot of the confirmation screen.</li>
<li>Post the screenshot + the Bonfire confirmation number as a comment on this todo.</li>
</ol>
<div><strong>Common mistakes</strong></div>
<ul>
<li>Wrong account - check our gov-bid-account-routing rules.</li>
<li>Missing form - Bonfire often has a separate "Vendor Schedule" or pricing form that's easy to forget. The OP submission-readiness page lists them all.</li>
<li>Late upload - Bonfire cuts off submissions at the exact deadline. Don't wait until the last hour.</li>
</ul>
<div><strong>Done when</strong></div>
<p>Confirmation screenshot posted + Bonfire confirmation number in the comment.</p>`,
    },
  ];
}

// Per checklist item descriptions (artifacts)
function artifactTasks(p, checklist) {
  return checklist.map(c => {
    const docName = c.type_label;
    const isReady = c.status === 'satisfied';
    return {
      content: isReady
        ? `Review the auto-generated ${docName}; tailor wording to this RFP`
        : `Produce ${docName} (${c.required ? 'REQUIRED' : 'optional'})`,
      description: isReady
        ? `<div><strong>What to do</strong></div>
<ol>
<li>Open <a href="${OP_BASE}/admin/bonfire/${p.uuid}/submission-readiness">Opportunity Pulse submission-readiness</a> for this RFP.</li>
<li>Find the auto-generated <strong>${docName}</strong> in the checklist (it should show "satisfied" with a download link).</li>
<li>Download and READ IT END-TO-END. AI-generated text is a starting point, not a final draft.</li>
<li>Update the document with: (a) wording that matches THIS agency's terminology (read the RFP for their language), (b) any specific projects / clients / references that fit this RFP, (c) numbers and dates that are correct for our company today.</li>
<li>Save tailored version back to Google Drive in the project folder. Post the share link as a comment on this todo.</li>
</ol>
<div><strong>Common pitfalls</strong></div>
<ul>
<li>Don't leave AI placeholders like "[insert company name]" or "[year]" - search-and-replace these.</li>
<li>Match the agency's terminology - if they say "Vendor", don't call yourself "Contractor".</li>
<li>If the document mentions a specific past project, make sure we actually did that project (ask Ali if unsure).</li>
</ul>
<div><strong>Done when</strong></div>
<p>Tailored version uploaded to the project Drive folder + share link in this todo.</p>`
        : `<div><strong>What to do</strong></div>
<ol>
<li>Open <a href="${OP_BASE}/admin/bonfire/${p.uuid}/submission-readiness">Opportunity Pulse submission-readiness</a> for this RFP.</li>
<li>The <strong>${docName}</strong> shows as a <strong>gap</strong>. We need to produce one.</li>
<li>For <strong>COI (Certificate of Insurance)</strong>: ask Ali for the latest Colaberry COI - we keep one current at all times. Verify it covers the limits in the RFP (typically $1M general liability, $1M auto, $1M workers' comp).</li>
<li>For other gap items: check Google Drive "Gov Bids / Templates" folder. If no template exists, draft one and put it back in templates for the next bid.</li>
<li>Save final to Google Drive in the project folder + post share link as a comment.</li>
</ol>
<div><strong>If you're stuck</strong></div>
<p>Ping @Ali Muwwakkil in #gov-contracts Slack. Don't burn time guessing - this is a gap-fill task where exactness matters.</p>
<div><strong>Done when</strong></div>
<p>Document uploaded to the project Drive folder + share link in this todo.</p>`,
    };
  });
}

async function bcGet(url) { return (await axios.get(url, { headers: BC_HEADERS })).data; }
async function bcPut(url, body) { return (await axios.put(url, body, { headers: BC_HEADERS })).data; }
async function bcDelete(url) { return (await axios.delete(url, { headers: BC_HEADERS })).data; }
async function bcPost(url, body) { return (await axios.post(url, body, { headers: BC_HEADERS })).data; }

(async () => {
  // For each project: pull current todos, replace with detailed versions.
  // Need the OP readiness too so we can rebuild the artifact tasks with detail.
  const OP_TOKEN = (await axios.post(`${OP_BASE}/api/v1/auth/login`, {
    email: 'ali@colaberry.com',
    password: '3yhEcVki3Vp4emDuuXWk',
  })).data.data.accessToken;

  for (const p of PROJECTS) {
    console.log(`\n=== Enriching ${p.intern.name} <- ${p.title} ===`);

    const opR = await axios.get(`${OP_BASE}/api/v1/bonfire/opportunities/${p.uuid}/readiness`, {
      headers: { Authorization: `Bearer ${OP_TOKEN}` },
    });
    const checklist = opR.data.data.checklist || [];

    const existing = await bcGet(`${BC_BASE}/buckets/${GOV_PROJECT}/todolists/${p.listId}/todos.json`);
    console.log(`  Trashing ${existing.length} thin todos...`);
    for (const t of existing) {
      try { await bcDelete(`${BC_BASE}/buckets/${GOV_PROJECT}/todos/${t.id}.json`); }
      catch (e) { console.warn(`    failed to delete ${t.id}: ${e.response?.status}`); }
    }

    const tasks = [
      ...processTasks(p).slice(0, 3),
      ...artifactTasks(p, checklist),
      ...processTasks(p).slice(3), // narrative
      ...submissionTasks(p),
    ];

    // Spread due dates: kickoff to (close - 1)
    const start = new Date('2026-06-09T00:00:00Z').getTime();
    const close = new Date(p.closeDate + 'T00:00:00Z').getTime();
    const workEnd = (close - start) / 86400000 > 28 ? start + 21 * 86400000 : close - 2 * 86400000;
    const lastDue = close - 86400000;
    const submitDue = new Date(lastDue).toISOString().slice(0, 10);
    const reviewDue = new Date(lastDue - 86400000).toISOString().slice(0, 10);
    const taskCountForWork = tasks.length - 2;
    const totalMs = workEnd - start;
    const dates = Array.from({ length: taskCountForWork }, (_, i) =>
      new Date(start + (totalMs * i) / Math.max(1, taskCountForWork - 1)).toISOString().slice(0, 10)
    );
    dates.push(reviewDue);
    dates.push(submitDue);

    console.log(`  Creating ${tasks.length} detailed todos...`);
    for (let i = 0; i < tasks.length; i++) {
      await bcPost(`${BC_BASE}/buckets/${GOV_PROJECT}/todolists/${p.listId}/todos.json`, {
        content: tasks[i].content,
        description: tasks[i].description,
        due_on: dates[i],
        assignee_ids: [p.intern.id],
      });
      process.stdout.write(`    ${i + 1}/${tasks.length}\r`);
    }
    console.log(`    ${tasks.length} detailed todos created (last 2 dates: review ${reviewDue}, submit ${submitDue})`);
  }
  console.log('\nDone.');
})().catch(e => { console.error('FAIL:', e.response?.data || e.stack || e.message); process.exit(1); });
