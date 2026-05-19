#!/usr/bin/env node
/**
 * Process a government contract bid end-to-end into Basecamp.
 *
 * Pipeline (per bid):
 *   1. Extract the downloaded RFP zip into a working folder
 *   2. Fetch the opportunity detail from Opportunity Pulse
 *   3. Create a Docs & Files sub-folder in the Basecamp project, upload all
 *      RFP files ONCE
 *   4. Create a To-Do List whose description contains the full bid brief
 *      (agency, value, deadline, fit thesis, 4-phase game plan, links to the
 *      folder + every file)
 *   5. Create tasks under that list for every deliverable (one per required
 *      attachment + the cross-cutting prep work). Each task description links
 *      back to the same Docs & Files folder, never re-uploaded.
 *   6. Post a kickoff message to the Message Board with the bid name,
 *      deadline, links, and a one-line "why we're bidding."
 *
 * Reusable template: edit BID_CONFIG at the top for the next gov bid.
 *
 * Run: `BASECAMP_ACCESS_TOKEN=... node backend/src/scripts/processGovBid.js`
 *      Add `--dry-run` to preview without creating Basecamp resources.
 */
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

// ────────────────────────────────────────────────────────────────────────────
// BID CONFIG — edit per bid
// ────────────────────────────────────────────────────────────────────────────
const BID_CONFIG = {
  // Opportunity Pulse opportunity UUID
  opportunity_uuid: '7011f5af-a0c6-45fb-8684-a6432c19cf54',

  // Local zip downloaded from Bonfire (contains the full RFP package)
  zip_path: 'c:/Users/ali_m/Downloads/544695 - pub - Tech Innovation Challenge - AI for Muni-code .zip',

  // Display title for the folder + list (keep short, scannable)
  display_title: 'Detroit - AI for Muni-Code Search (RFP 544695)',

  // Phases for the game plan in the list description
  phases: [
    { name: 'Phase 1 - Requirements + qualification gate', days: 'Days 1-3', output: 'Bid / no-bid decision. Requirements matrix extracted from RFP.' },
    { name: 'Phase 2 - Solution + demo', days: 'Days 4-14', output: 'Working POC: AI search over a sample municipal-code corpus. Solution approach written.' },
    { name: 'Phase 3 - Proposal writing + forms', days: 'Days 15-22', output: 'All 7 attachments complete. Pricing locked. Capability statement finalized.' },
    { name: 'Phase 4 - Review + submission', days: 'Days 23-24', output: 'Internal review, sign-off, submit via Detroit Bonfire portal.' },
  ],

  // Why we are bidding — the strategic-fit thesis
  fit_thesis: 'This is verbatim a RAG / document-intelligence build over a regulated corpus. Colaberry skills (Document Intelligence, AI/ML, Conversational AI, Cloud Architecture, Predictive Analytics) map 1:1. Detroit framed it as a "Tech Innovation Challenge," signaling openness to new vendors over entrenched incumbents.',
};

// ────────────────────────────────────────────────────────────────────────────
// CONFIG — Basecamp + Opportunity Pulse + paths
// ────────────────────────────────────────────────────────────────────────────
const ACCOUNT_ID = '3945211';
const PROJECT_ID = '47346103'; // Gov Contracts project
const VAULT_ID = '9908475797';
const TODOSET_ID = '9908475794';
const MESSAGE_BOARD_ID = '9908475791';
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;
const OP_BASE = 'http://95.216.199.47';

const DRY_RUN = process.argv.includes('--dry-run');
const TMP_ROOT = path.resolve(__dirname, '../../../tmp/gov-bids');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function safeDirName(s) {
  return s.replace(/[^a-zA-Z0-9 _.-]/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

function getBasecampToken() {
  let t = process.env.BASECAMP_ACCESS_TOKEN;
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN env var required (pull from CCPP via VPS)');
  if (t.startsWith('Bearer ')) t = t.slice(7);
  return t;
}

const HEADERS = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  'User-Agent': 'Colaberry Internal Tools (ali@colaberry.com)',
  Accept: 'application/json',
  ...extra,
});

async function bcGet(token, urlOrPath) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${API}${urlOrPath}`;
  const r = await fetch(url, { headers: HEADERS(token) });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function bcPost(token, urlOrPath, body) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${API}${urlOrPath}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: HEADERS(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function bcPostFile(token, fileBuffer, filename, contentType) {
  const url = `${API}/attachments.json?name=${encodeURIComponent(filename)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: HEADERS(token, { 'Content-Type': contentType }),
    body: fileBuffer,
  });
  if (!r.ok) throw new Error(`UPLOAD ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function mimeForExt(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return ({
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    zip: 'application/zip',
  }[ext] || 'application/octet-stream');
}

// ────────────────────────────────────────────────────────────────────────────
// Step 1: extract zip + fetch opportunity detail
// ────────────────────────────────────────────────────────────────────────────
async function prepareBid() {
  const workDir = path.join(TMP_ROOT, safeDirName(BID_CONFIG.display_title));
  const filesDir = path.join(workDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });

  // Extract zip
  if (!fs.existsSync(BID_CONFIG.zip_path)) {
    throw new Error(`Zip not found: ${BID_CONFIG.zip_path}`);
  }
  fs.rmSync(filesDir, { recursive: true, force: true });
  fs.mkdirSync(filesDir, { recursive: true });
  new AdmZip(BID_CONFIG.zip_path).extractAllTo(filesDir, true);
  const files = fs.readdirSync(filesDir).filter((f) => fs.statSync(path.join(filesDir, f)).isFile());
  console.log(`[prep] Extracted ${files.length} files into ${filesDir}`);
  files.forEach((f) => console.log(`  - ${f}`));

  // Fetch Opportunity Pulse detail (best effort - if it fails we still proceed)
  let opp = null;
  try {
    const loginR = await fetch(`${OP_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@opportunitypulse.com', password: '3yhEcVki3Vp4emDuuXWk' }),
    });
    const loginData = await loginR.json();
    const opToken = loginData.data?.accessToken;
    if (opToken) {
      const oppR = await fetch(`${OP_BASE}/api/v1/bonfire/opportunities/${BID_CONFIG.opportunity_uuid}`, {
        headers: { Authorization: `Bearer ${opToken}` },
      });
      const oppData = await oppR.json();
      opp = oppData.data || null;
      console.log(`[prep] Pulled opportunity: "${opp?.title}" from Opportunity Pulse`);
    }
  } catch (e) {
    console.warn('[prep] Could not fetch from Opportunity Pulse (will use BID_CONFIG fallbacks):', e.message);
  }

  return { workDir, filesDir, files, opp };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2: Basecamp - create folder, upload files
// ────────────────────────────────────────────────────────────────────────────
async function findOrCreateVaultFolder(token, title) {
  const subs = await bcGet(token, `/buckets/${PROJECT_ID}/vaults/${VAULT_ID}/vaults.json`).catch(() => []);
  const existing = subs.find((v) => v.title === title);
  if (existing) {
    console.log(`[bc] Vault folder "${title}" exists (id=${existing.id})`);
    return existing;
  }
  if (DRY_RUN) {
    console.log(`[bc] (dry) create vault folder "${title}"`);
    return { id: 'DRY', title, app_url: '(dry)' };
  }
  const created = await bcPost(token, `/buckets/${PROJECT_ID}/vaults/${VAULT_ID}/vaults.json`, { title });
  console.log(`[bc] +folder "${title}" (id=${created.id}) -> ${created.app_url}`);
  return created;
}

async function uploadFilesToFolder(token, folder, filesDir) {
  const files = fs.readdirSync(filesDir).filter((f) => fs.statSync(path.join(filesDir, f)).isFile()).sort();
  const uploaded = [];
  let existingNames = new Set();
  if (folder.id !== 'DRY') {
    const existing = await bcGet(token, `/buckets/${PROJECT_ID}/vaults/${folder.id}/uploads.json`).catch(() => []);
    existingNames = new Set(existing.map((u) => (u.filename || u.title || '').toLowerCase()));
  }
  for (const f of files) {
    if (existingNames.has(f.toLowerCase())) {
      const existing = (await bcGet(token, `/buckets/${PROJECT_ID}/vaults/${folder.id}/uploads.json`).catch(() => []))
        .find((u) => (u.filename || u.title || '').toLowerCase() === f.toLowerCase());
      console.log(`[bc] Skip (exists): ${f}`);
      uploaded.push({ filename: f, id: existing?.id, app_url: existing?.app_url });
      continue;
    }
    if (DRY_RUN) {
      console.log(`[bc] (dry) upload ${f}`);
      uploaded.push({ filename: f, id: 'DRY', app_url: '(dry)' });
      continue;
    }
    const buf = fs.readFileSync(path.join(filesDir, f));
    const attach = await bcPostFile(token, buf, f, mimeForExt(f));
    const u = await bcPost(token, `/buckets/${PROJECT_ID}/vaults/${folder.id}/uploads.json`, {
      attachable_sgid: attach.attachable_sgid,
      base_name: f,
      description: '',
    });
    console.log(`[bc] +upload ${f} (id=${u.id}) -> ${u.app_url}`);
    uploaded.push({ filename: f, id: u.id, app_url: u.app_url });
    await new Promise((r) => setTimeout(r, 200));
  }
  return uploaded;
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3: build descriptions (Trix HTML, what Basecamp accepts)
// ────────────────────────────────────────────────────────────────────────────
function buildListDescription({ opp, folder, uploaded }) {
  const value = opp?.estimatedValue ? `$${Number(opp.estimatedValue).toLocaleString()}` : 'unknown';
  const closeDate = opp?.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : 'unknown';
  const agency = opp?.agency || 'unknown';
  const sourceUrl = opp?.sourceUrl || '';
  const opPulseUrl = `http://95.216.199.47/admin/bonfire/${BID_CONFIG.opportunity_uuid}/submission-readiness`;
  const aiCategory = opp?.aiCategory || 'unknown';
  const recommendedProduct = opp?.recommendedProduct || 'unknown';

  const filesList = uploaded.map((u) => `<li><a href="${u.app_url}">${u.filename}</a></li>`).join('');
  const phasesList = BID_CONFIG.phases.map((p) =>
    `<li><strong>${p.name}</strong> (${p.days}) - ${p.output}</li>`
  ).join('');

  return `<div>
<h2>${BID_CONFIG.display_title}</h2>

<h3>Key facts</h3>
<ul>
  <li><strong>Agency:</strong> ${agency}</li>
  <li><strong>AI category:</strong> ${aiCategory} | <strong>Recommended product:</strong> ${recommendedProduct}</li>
  <li><strong>Estimated value:</strong> ${value}</li>
  <li><strong>Submission deadline:</strong> ${closeDate}</li>
  <li><strong>Bonfire source:</strong> <a href="${sourceUrl}">${sourceUrl}</a></li>
  <li><strong>Opportunity Pulse submission readiness:</strong> <a href="${opPulseUrl}">view in OP</a></li>
  <li><strong>Docs &amp; Files folder (all RFP attachments):</strong> <a href="${folder.app_url}">${folder.title}</a></li>
</ul>

<h3>Why we're bidding</h3>
<p>${BID_CONFIG.fit_thesis}</p>

<h3>Game plan</h3>
<ol>${phasesList}</ol>

<h3>RFP files (uploaded once in the folder above)</h3>
<ul>${filesList}</ul>

<p><em>Every task under this list references the same folder above. Files are uploaded ONCE; tasks and messages link to them.</em></p>
</div>`;
}

function buildTaskDescription({ filename, folder, uploaded, extraNote }) {
  const match = filename ? uploaded.find((u) => u.filename === filename) : null;
  const fileLink = match ? `<p><strong>File:</strong> <a href="${match.app_url}">${match.filename}</a></p>` : '';
  const folderLink = `<p><strong>Folder:</strong> <a href="${folder.app_url}">${folder.title}</a></p>`;
  const note = extraNote ? `<p>${extraNote}</p>` : '';
  return `<div>${note}${fileLink}${folderLink}</div>`;
}

function buildKickoffMessage({ opp, folder, list, uploaded }) {
  const value = opp?.estimatedValue ? `$${Number(opp.estimatedValue).toLocaleString()}` : 'unknown';
  const closeDate = opp?.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : 'unknown';
  const opPulseUrl = `http://95.216.199.47/admin/bonfire/${BID_CONFIG.opportunity_uuid}/submission-readiness`;
  return `<div>
<p><strong>Bid kickoff:</strong> ${BID_CONFIG.display_title}</p>

<ul>
  <li><strong>Value:</strong> ${value}</li>
  <li><strong>Deadline:</strong> ${closeDate}</li>
  <li><strong>To-Do List (game plan + tasks):</strong> <a href="${list.app_url}">${list.title}</a></li>
  <li><strong>Docs &amp; Files folder (${uploaded.length} RFP files):</strong> <a href="${folder.app_url}">${folder.title}</a></li>
  <li><strong>Opportunity Pulse:</strong> <a href="${opPulseUrl}">submission readiness view</a></li>
</ul>

<p><strong>Why we're bidding:</strong> ${BID_CONFIG.fit_thesis}</p>

<p>Status updates posted here as phases complete. Detailed task progress lives on the List.</p>
</div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4: create list + tasks + kickoff message
// ────────────────────────────────────────────────────────────────────────────
async function findOrCreateTodolist(token, name, description) {
  const todoset = await bcGet(token, `/buckets/${PROJECT_ID}/todosets/${TODOSET_ID}.json`);
  const lists = await bcGet(token, todoset.todolists_url);
  const existing = lists.find((l) => l.name === name);
  if (existing) {
    console.log(`[bc] To-do list "${name}" exists (id=${existing.id}) - updating description`);
    if (DRY_RUN) return existing;
    const updated = await fetch(`${API}/buckets/${PROJECT_ID}/todolists/${existing.id}.json`, {
      method: 'PUT',
      headers: HEADERS(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, description }),
    });
    if (!updated.ok) throw new Error(`PUT todolist -> ${updated.status} ${await updated.text()}`);
    return updated.json();
  }
  if (DRY_RUN) {
    console.log(`[bc] (dry) create list "${name}"`);
    return { id: 'DRY', name, todos_url: null, app_url: '(dry)' };
  }
  const created = await bcPost(token, `/buckets/${PROJECT_ID}/todosets/${TODOSET_ID}/todolists.json`, { name, description });
  console.log(`[bc] +list "${name}" (id=${created.id}) -> ${created.app_url}`);
  return created;
}

async function createTask(token, list, { content, description }) {
  if (DRY_RUN) {
    console.log(`[bc] (dry) todo: ${content}`);
    return { id: 'DRY', content };
  }
  const todo = await bcPost(token, `/buckets/${PROJECT_ID}/todolists/${list.id}/todos.json`, {
    content,
    description,
  });
  console.log(`[bc] +todo: ${content.slice(0, 70)}`);
  await new Promise((r) => setTimeout(r, 150));
  return todo;
}

async function postKickoffMessage(token, subject, content) {
  if (DRY_RUN) {
    console.log(`[bc] (dry) message: ${subject}`);
    return { id: 'DRY', app_url: '(dry)' };
  }
  const msg = await bcPost(token, `/buckets/${PROJECT_ID}/message_boards/${MESSAGE_BOARD_ID}/messages.json`, {
    subject,
    content,
    status: 'active',
  });
  console.log(`[bc] +message "${subject}" (id=${msg.id}) -> ${msg.app_url}`);
  return msg;
}

// ────────────────────────────────────────────────────────────────────────────
// Build the task list — one task per RFP attachment + cross-cutting prep
// ────────────────────────────────────────────────────────────────────────────
function buildTaskList(uploaded, folder) {
  // Match files by their leading "N-" number or by keyword
  function find(re) { return uploaded.find((u) => re.test(u.filename))?.filename; }
  const rfp = find(/RFP.*544695|^8-/i);
  const attachA = find(/Attachment A|Questionnaire/i);
  const attachB = find(/Attachment B|Solution Approach/i);
  const attachC = find(/Attachment C|Pricing/i);
  const attachD = find(/Attachment D|Forms Affidavits/i);
  const attachF = find(/Attachment F|Tech and Security/i);
  const contract = find(/CONTRACT TEMPLATE|^3-/i);
  const equalization = find(/Equalization/i);

  const tasks = [
    {
      content: 'Read RFP 544695 in full + extract requirements matrix',
      description: buildTaskDescription({
        filename: rfp, folder, uploaded,
        extraNote: 'Read the main RFP front to back. Build a requirements matrix (one row per "shall" or "must" statement) tagged by section, owner, and acceptance evidence.',
      }),
    },
    {
      content: 'Bid / no-bid decision (Phase 1 gate)',
      description: buildTaskDescription({
        filename: rfp, folder, uploaded,
        extraNote: 'Confirm: technical feasibility, certification requirements we meet, conflict-of-interest checks, capacity to deliver. Document the GO/NO-GO call.',
      }),
    },
    {
      content: 'Build demo POC: AI-powered search over sample municipal-code corpus',
      description: buildTaskDescription({
        filename: rfp, folder, uploaded,
        extraNote: 'Pick a publicly-available muni-code (or scraped sample). Stand up DataLens RAG pipeline. Demo answering 5-7 representative questions ("What\'s the noise ordinance on weekends?", etc.). Record a 90s walkthrough for the proposal.',
      }),
    },
    {
      content: 'Capability statement + past-performance narrative',
      description: buildTaskDescription({
        filename: null, folder, uploaded,
        extraNote: 'One-pager: Colaberry credentials, document intelligence + government data track record, team bios. Pull from existing capability deck where possible.',
      }),
    },
    {
      content: 'Complete Attachment A - Respondent Questionnaire',
      description: buildTaskDescription({ filename: attachA, folder, uploaded }),
    },
    {
      content: 'Complete Attachment B - Proposal Introduction + Solution Approach',
      description: buildTaskDescription({ filename: attachB, folder, uploaded,
        extraNote: 'Core narrative: how our AI search architecture meets each requirement. Reference the demo POC.',
      }),
    },
    {
      content: 'Complete Attachment C - Pricing',
      description: buildTaskDescription({ filename: attachC, folder, uploaded,
        extraNote: 'Build the price model. Confirm anything excluded (cloud infra pass-through, optional support tiers).',
      }),
    },
    {
      content: 'Complete Attachment D-1 - Required Forms & Affidavits',
      description: buildTaskDescription({ filename: attachD, folder, uploaded,
        extraNote: 'Includes equal-opportunity certifications, debarment affidavits, vendor disclosures. Ali signs.',
      }),
    },
    {
      content: 'Complete Attachment F - Tech & Security Requirements (xlsx)',
      description: buildTaskDescription({ filename: attachF, folder, uploaded,
        extraNote: 'Line-by-line response in the xlsx. Map every requirement to our SOC2 / AWS / Azure compliance posture.',
      }),
    },
    {
      content: 'Review + redline Tech Contract Template',
      description: buildTaskDescription({ filename: contract, folder, uploaded,
        extraNote: 'Note: filename says "NO AI UPDATED TECH CONTRACT TEMPLATE." Read carefully for AI-specific restrictions Detroit may have written in.',
      }),
    },
    {
      content: 'Verify Equalization Credit Statement applicability',
      description: buildTaskDescription({ filename: equalization, folder, uploaded,
        extraNote: 'This is a Detroit-specific business tax credit form. Determine whether Colaberry qualifies/needs to file.',
      }),
    },
    {
      content: 'Executive summary (Phase 3 capstone)',
      description: buildTaskDescription({ filename: null, folder, uploaded,
        extraNote: '2 pages max. Problem statement, our approach, why us, pricing range, key milestones. This is what the evaluation committee reads first.',
      }),
    },
    {
      content: 'Internal review + sign-off (Phase 4)',
      description: buildTaskDescription({ filename: null, folder, uploaded,
        extraNote: 'Ali + Ram review the full pack. Fix any gaps. Final sign-off in writing.',
      }),
    },
    {
      content: 'Submit via Detroit Bonfire portal by 2026-06-12',
      description: buildTaskDescription({ filename: null, folder, uploaded,
        extraNote: 'Submission portal: https://detroit.bonfirehub.com/opportunities/222743. Upload all required attachments in the order Detroit specifies. Capture submission confirmation.',
      }),
    },
  ];

  return tasks;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
(async () => {
  const token = getBasecampToken();
  console.log(`[bc] Token loaded. Project ${PROJECT_ID} (Gov Contracts).`);
  if (DRY_RUN) console.log('[bc] DRY RUN');

  // Step 1: prep
  const { workDir, filesDir, files, opp } = await prepareBid();

  // Step 2: folder + uploads
  const folder = await findOrCreateVaultFolder(token, BID_CONFIG.display_title);
  const uploaded = await uploadFilesToFolder(token, folder, filesDir);

  // Step 3: list with description
  const listDescription = buildListDescription({ opp, folder, uploaded });
  const list = await findOrCreateTodolist(token, BID_CONFIG.display_title, listDescription);

  // Step 4: tasks
  const tasks = buildTaskList(uploaded, folder);
  console.log(`[bc] Creating ${tasks.length} tasks under list "${list.name}"...`);
  // Skip task creation if list already had todos to avoid dupes
  let existingTodos = new Set();
  if (list.todos_url && list.id !== 'DRY') {
    const todos = await bcGet(token, list.todos_url).catch(() => []);
    existingTodos = new Set(todos.map((t) => t.content));
  }
  for (const t of tasks) {
    if (existingTodos.has(t.content)) {
      console.log(`[bc] Skip todo (exists): ${t.content.slice(0, 70)}`);
      continue;
    }
    await createTask(token, list, t);
  }

  // Step 5: kickoff message
  const kickoffContent = buildKickoffMessage({ opp, folder, list, uploaded });
  const kickoffSubject = `Bid kickoff: ${BID_CONFIG.display_title}`;
  // Check for existing identical-subject message to avoid duplicates
  const existingMsgs = await bcGet(token, `/buckets/${PROJECT_ID}/message_boards/${MESSAGE_BOARD_ID}/messages.json`).catch(() => []);
  let kickoff;
  if (existingMsgs.find((m) => m.subject === kickoffSubject)) {
    kickoff = existingMsgs.find((m) => m.subject === kickoffSubject);
    console.log(`[bc] Kickoff message already posted (id=${kickoff.id})`);
  } else {
    kickoff = await postKickoffMessage(token, kickoffSubject, kickoffContent);
  }

  // Final report
  console.log('\n[bc] === DONE ===');
  console.log(`Project URL:  https://3.basecamp.com/${ACCOUNT_ID}/projects/${PROJECT_ID}`);
  console.log(`Folder URL:   ${folder.app_url}`);
  console.log(`List URL:     ${list.app_url}`);
  console.log(`Message URL:  ${kickoff.app_url}`);
  console.log(`Files uploaded: ${uploaded.length}`);
  console.log(`Tasks created:  ${tasks.length} (skipped any duplicates)`);

  // Write a summary JSON for downstream tools / audit
  const summary = {
    bid: BID_CONFIG.display_title,
    opportunity_uuid: BID_CONFIG.opportunity_uuid,
    processed_at: new Date().toISOString(),
    basecamp: {
      project_id: PROJECT_ID,
      folder_id: folder.id,
      folder_url: folder.app_url,
      list_id: list.id,
      list_url: list.app_url,
      message_id: kickoff?.id,
      message_url: kickoff?.app_url,
      file_count: uploaded.length,
      task_count: tasks.length,
    },
    uploaded,
  };
  fs.writeFileSync(path.join(workDir, 'basecamp-summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nSummary written: ${path.join(workDir, 'basecamp-summary.json')}`);
})().catch((e) => {
  console.error('FAIL:', e.stack || e.message);
  process.exit(1);
});
