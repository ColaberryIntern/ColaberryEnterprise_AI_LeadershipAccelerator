// Gov bid full-pipeline processor.
//
// Given a downloaded RFP zip + a bid config, this module:
//   1. Extracts the zip into a working folder
//   2. Optionally fetches the opportunity from Opportunity Pulse
//   3. Creates a Docs & Files (Vault) sub-folder, uploads each file ONCE
//   4. Creates a To-Do list whose description contains the full bid brief
//      (agency, deadline, fit thesis, 4-phase game plan, file links)
//   5. Creates tasks (one per deliverable; uses config.tasks if supplied)
//   6. Posts a kickoff message to the Message Board
//   7. Writes a summary JSON for audit
//
// Extracted from backend/src/scripts/processGovBid.js to fix the 621-line
// hard-ceiling violation (CLAUDE.md modular composition rule) and to make
// the pipeline callable from the CB dispatcher's finalizeBidsFromReply flow.
//
// Inputs:
//   bidConfig: {
//     opportunity_uuid?, zip_path, display_title, bid_account?, phases?,
//     fit_thesis?, value_override?, term_override?, tasks?
//   }
//   basecampIds: { accountId, projectId, vaultId, todosetId, messageBoardId }
//   basecampToken: string (no "Bearer " prefix)
//   opts: { dryRun?, workDirRoot?, opportunityPulseBase?, opportunityPulseCreds? }
//
// Returns: { workDir, folder, list, kickoff, uploaded, tasks, summaryPath }

const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

function safeDirName(s) {
  return s.replace(/[^a-zA-Z0-9 _.-]/g, '_').replace(/\s+/g, '_').slice(0, 80);
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

function makeBcClient({ accountId, basecampToken, dryRun }) {
  const BASE = `https://3.basecampapi.com/${accountId}`;
  const HEADERS = (extra = {}) => ({
    Authorization: `Bearer ${basecampToken}`,
    'User-Agent': 'Colaberry GovBidPipeline (ali@colaberry.com)',
    Accept: 'application/json',
    ...extra,
  });

  async function bcGet(p) {
    const url = p.startsWith('http') ? p : `${BASE}${p}`;
    const r = await fetch(url, { headers: HEADERS() });
    if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${await r.text()}`);
    return r.json();
  }
  async function bcPost(p, body) {
    if (dryRun) { console.log('[bc-dry] POST', p, JSON.stringify(body).slice(0, 200)); return { id: 'DRY' }; }
    const url = p.startsWith('http') ? p : `${BASE}${p}`;
    const r = await fetch(url, { method: 'POST', headers: HEADERS({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
    return r.json();
  }
  async function bcPut(p, body) {
    if (dryRun) { console.log('[bc-dry] PUT', p); return { id: 'DRY' }; }
    const url = p.startsWith('http') ? p : `${BASE}${p}`;
    const r = await fetch(url, { method: 'PUT', headers: HEADERS({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`PUT ${url} -> ${r.status} ${await r.text()}`);
    return r.json();
  }
  async function bcUploadFile(buffer, filename) {
    if (dryRun) { console.log(`[bc-dry] UPLOAD ${filename}`); return { attachable_sgid: 'DRY' }; }
    const url = `${BASE}/attachments.json?name=${encodeURIComponent(filename)}`;
    const r = await fetch(url, { method: 'POST', headers: HEADERS({ 'Content-Type': mimeForExt(filename) }), body: buffer });
    if (!r.ok) throw new Error(`UPLOAD ${url} -> ${r.status} ${await r.text()}`);
    return r.json();
  }
  async function bcDownloadFile(downloadUrl) {
    // Used to fetch zips Ali uploaded to the Vault. download_url comes from
    // the upload object's metadata.
    const r = await fetch(downloadUrl, { headers: HEADERS() });
    if (!r.ok) throw new Error(`DOWNLOAD ${downloadUrl} -> ${r.status} ${await r.text()}`);
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
  }

  return { bcGet, bcPost, bcPut, bcUploadFile, bcDownloadFile };
}

// =============================================================================
// Pipeline phases
// =============================================================================

async function extractZip(zipPath, filesDir) {
  if (!fs.existsSync(zipPath)) throw new Error(`Zip not found: ${zipPath}`);
  fs.rmSync(filesDir, { recursive: true, force: true });
  fs.mkdirSync(filesDir, { recursive: true });
  new AdmZip(zipPath).extractAllTo(filesDir, true);
  return fs.readdirSync(filesDir).filter((f) => fs.statSync(path.join(filesDir, f)).isFile());
}

async function fetchOpportunity({ opportunityPulseBase, opportunityPulseCreds, opportunityUuid }) {
  if (!opportunityPulseBase || !opportunityPulseCreds || !opportunityUuid) return null;
  try {
    const loginR = await fetch(`${opportunityPulseBase}/api/v1/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opportunityPulseCreds),
    });
    const loginData = await loginR.json();
    const opToken = loginData.data?.accessToken;
    if (!opToken) return null;
    const oppR = await fetch(`${opportunityPulseBase}/api/v1/bonfire/opportunities/${opportunityUuid}`, {
      headers: { Authorization: `Bearer ${opToken}` },
    });
    const oppData = await oppR.json();
    return oppData.data || null;
  } catch (_e) { return null; }
}

async function findOrCreateVaultFolder({ bcClient, projectId, vaultId, title, dryRun }) {
  const subs = await bcClient.bcGet(`/buckets/${projectId}/vaults/${vaultId}/vaults.json`).catch(() => []);
  const existing = Array.isArray(subs) ? subs.find((v) => v.title === title) : null;
  if (existing) return existing;
  if (dryRun) return { id: 'DRY', title, app_url: '(dry)' };
  return bcClient.bcPost(`/buckets/${projectId}/vaults/${vaultId}/vaults.json`, { title });
}

async function uploadFilesToFolder({ bcClient, projectId, folder, filesDir, dryRun }) {
  const files = fs.readdirSync(filesDir).filter((f) => fs.statSync(path.join(filesDir, f)).isFile()).sort();
  const uploaded = [];
  let existingNames = new Set();
  let existingList = [];
  if (folder.id !== 'DRY') {
    existingList = await bcClient.bcGet(`/buckets/${projectId}/vaults/${folder.id}/uploads.json`).catch(() => []);
    existingNames = new Set(existingList.map((u) => (u.filename || u.title || '').toLowerCase()));
  }
  for (const f of files) {
    if (existingNames.has(f.toLowerCase())) {
      const existing = existingList.find((u) => (u.filename || u.title || '').toLowerCase() === f.toLowerCase());
      uploaded.push({ filename: f, id: existing?.id, app_url: existing?.app_url });
      continue;
    }
    if (dryRun) { uploaded.push({ filename: f, id: 'DRY', app_url: '(dry)' }); continue; }
    const buf = fs.readFileSync(path.join(filesDir, f));
    const attach = await bcClient.bcUploadFile(buf, f);
    const u = await bcClient.bcPost(`/buckets/${projectId}/vaults/${folder.id}/uploads.json`, {
      attachable_sgid: attach.attachable_sgid, base_name: f, description: '',
    });
    uploaded.push({ filename: f, id: u.id, app_url: u.app_url });
    await new Promise((r) => setTimeout(r, 200));
  }
  return uploaded;
}

function buildListDescription({ bidConfig, opp, folder, uploaded, opportunityPulseBase }) {
  const rawValue = bidConfig.value_override || opp?.estimatedValue;
  const value = rawValue ? `$${Number(rawValue).toLocaleString()}` : 'unknown';
  const closeDate = opp?.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : (bidConfig.deadline || 'unknown');
  const agency = opp?.agency || bidConfig.agency_name || 'unknown';
  const sourceUrl = opp?.sourceUrl || '';
  const opPulseUrl = bidConfig.opportunity_uuid ? `${opportunityPulseBase}/admin/bonfire/${bidConfig.opportunity_uuid}/submission-readiness` : '';
  const termNote = bidConfig.term_override ? `<li><strong>Contract term:</strong> ${bidConfig.term_override}</li>` : '';
  const filesList = uploaded.map((u) => `<li><a href="${u.app_url}">${u.filename}</a></li>`).join('');
  const phasesList = (bidConfig.phases || []).map((p) =>
    `<li><strong>${p.name}</strong> (${p.days}) - ${p.output}</li>`
  ).join('');
  return `<div>
<h2>${bidConfig.display_title}</h2>
<h3>Key facts</h3>
<ul>
  <li><strong>Agency:</strong> ${agency}</li>
  <li><strong>Contract value:</strong> ${value}</li>
  ${termNote}
  <li><strong>Submission deadline:</strong> ${closeDate}</li>
  ${sourceUrl ? `<li><strong>Bonfire source:</strong> <a href="${sourceUrl}">${sourceUrl}</a></li>` : ''}
  ${opPulseUrl ? `<li><strong>Opportunity Pulse:</strong> <a href="${opPulseUrl}">submission readiness</a></li>` : ''}
  <li><strong>Docs &amp; Files folder:</strong> <a href="${folder.app_url}">${folder.title}</a></li>
</ul>
${bidConfig.fit_thesis ? `<h3>Why we're bidding</h3><p>${bidConfig.fit_thesis}</p>` : ''}
${phasesList ? `<h3>Game plan</h3><ol>${phasesList}</ol>` : ''}
<h3>RFP files (uploaded once)</h3>
<ul>${filesList}</ul>
</div>`;
}

async function findOrCreateTodolist({ bcClient, projectId, todosetId, name, description, dryRun }) {
  const todoset = await bcClient.bcGet(`/buckets/${projectId}/todosets/${todosetId}.json`);
  const lists = await bcClient.bcGet(todoset.todolists_url);
  const existing = Array.isArray(lists) ? lists.find((l) => l.name === name) : null;
  if (existing) {
    if (dryRun) return existing;
    return bcClient.bcPut(`/buckets/${projectId}/todolists/${existing.id}.json`, { name, description });
  }
  if (dryRun) return { id: 'DRY', name, todos_url: null, app_url: '(dry)' };
  return bcClient.bcPost(`/buckets/${projectId}/todosets/${todosetId}/todolists.json`, { name, description });
}

function buildTaskDescription({ filename, folder, uploaded, extraNote }) {
  const match = filename ? uploaded.find((u) => u.filename === filename) : null;
  const fileLink = match ? `<p><strong>File:</strong> <a href="${match.app_url}">${match.filename}</a></p>` : '';
  const folderLink = `<p><strong>Folder:</strong> <a href="${folder.app_url}">${folder.title}</a></p>`;
  const note = extraNote ? `<p>${extraNote}</p>` : '';
  return `<div>${note}${fileLink}${folderLink}</div>`;
}

function buildTaskList({ bidConfig, uploaded, folder }) {
  // If bidConfig.tasks is supplied, use it. Otherwise fall back to a minimal
  // generic 5-task template (the old Detroit-specific fallback isn't reusable
  // - new bids should always supply their own task list).
  if (Array.isArray(bidConfig.tasks) && bidConfig.tasks.length > 0) {
    return bidConfig.tasks.map((t) => {
      const match = uploaded.find((u) => t.content.includes(u.filename));
      return {
        content: t.content,
        description: buildTaskDescription({
          filename: match?.filename || null, folder, uploaded, extraNote: t.note || '',
        }),
      };
    });
  }
  return [
    { content: 'Read RFP in full + extract requirements matrix',
      description: buildTaskDescription({ filename: null, folder, uploaded,
        extraNote: 'Read every doc. Build a requirements matrix tagged by section, owner, acceptance evidence.' }) },
    { content: 'Bid / no-bid decision (qualification gate)',
      description: buildTaskDescription({ filename: null, folder, uploaded,
        extraNote: 'Confirm: US-only delivery if required, tech-stack fit, security controls, competitive landscape. Document GO/NO-GO.' }) },
    { content: 'Draft proposal narrative + capability statement',
      description: buildTaskDescription({ filename: null, folder, uploaded,
        extraNote: 'Main response per RFP outline + Colaberry capability statement (past performance, team bios).' }) },
    { content: 'Complete compliance + pricing forms',
      description: buildTaskDescription({ filename: null, folder, uploaded,
        extraNote: 'All compliance/affidavit forms + pricing schedule. Sign as needed.' }) },
    { content: 'Internal review + Bonfire submission',
      description: buildTaskDescription({ filename: null, folder, uploaded,
        extraNote: 'Ali sign-off, submit via the Bonfire portal, capture confirmation.' }) },
  ];
}

async function createTask({ bcClient, projectId, list, task, dryRun }) {
  if (dryRun) return { id: 'DRY', content: task.content };
  const todo = await bcClient.bcPost(`/buckets/${projectId}/todolists/${list.id}/todos.json`, task);
  await new Promise((r) => setTimeout(r, 150));
  return todo;
}

function buildKickoffMessage({ bidConfig, opp, folder, list, uploaded, opportunityPulseBase }) {
  const rawValue = bidConfig.value_override || opp?.estimatedValue;
  const value = rawValue ? `$${Number(rawValue).toLocaleString()}` : 'unknown';
  const closeDate = opp?.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : (bidConfig.deadline || 'unknown');
  const termLine = bidConfig.term_override ? `<li><strong>Term:</strong> ${bidConfig.term_override}</li>` : '';
  const opPulseUrl = bidConfig.opportunity_uuid ? `${opportunityPulseBase}/admin/bonfire/${bidConfig.opportunity_uuid}/submission-readiness` : '';
  return `<div>
<p><strong>Bid kickoff:</strong> ${bidConfig.display_title}</p>
<ul>
  <li><strong>Value:</strong> ${value}</li>
  ${termLine}
  <li><strong>Deadline:</strong> ${closeDate}</li>
  <li><strong>To-Do List:</strong> <a href="${list.app_url}">${list.name}</a></li>
  <li><strong>Docs &amp; Files folder (${uploaded.length} files):</strong> <a href="${folder.app_url}">${folder.title}</a></li>
  ${opPulseUrl ? `<li><strong>Opportunity Pulse:</strong> <a href="${opPulseUrl}">submission readiness</a></li>` : ''}
</ul>
${bidConfig.fit_thesis ? `<p><strong>Why we're bidding:</strong> ${bidConfig.fit_thesis}</p>` : ''}
<p>Status updates posted here as phases complete. Detailed task progress on the List.</p>
</div>`;
}

// =============================================================================
// Top-level entry
// =============================================================================
async function processBid({ bidConfig, basecampIds, basecampToken, opts = {} }) {
  const {
    dryRun = false,
    workDirRoot = path.resolve(__dirname, '../../../../tmp/gov-bids'),
    opportunityPulseBase = 'http://95.216.199.47',
    opportunityPulseCreds = null,
  } = opts;

  const { accountId, projectId, vaultId, todosetId, messageBoardId } = basecampIds;
  const bcClient = makeBcClient({ accountId, basecampToken, dryRun });

  // Phase 1: extract zip + fetch opportunity
  const workDir = path.join(workDirRoot, safeDirName(bidConfig.display_title));
  const filesDir = path.join(workDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });
  const files = await extractZip(bidConfig.zip_path, filesDir);
  const opp = await fetchOpportunity({ opportunityPulseBase, opportunityPulseCreds, opportunityUuid: bidConfig.opportunity_uuid });

  // Phase 2: Vault folder + uploads
  const folder = await findOrCreateVaultFolder({ bcClient, projectId, vaultId, title: bidConfig.display_title, dryRun });
  const uploaded = await uploadFilesToFolder({ bcClient, projectId, folder, filesDir, dryRun });

  // Phase 3: To-Do list
  const listDescription = buildListDescription({ bidConfig, opp, folder, uploaded, opportunityPulseBase });
  const list = await findOrCreateTodolist({ bcClient, projectId, todosetId, name: bidConfig.display_title, description: listDescription, dryRun });

  // Phase 4: tasks
  const tasks = buildTaskList({ bidConfig, uploaded, folder });
  let existingTodos = new Set();
  if (list.todos_url && list.id !== 'DRY') {
    const todos = await bcClient.bcGet(list.todos_url).catch(() => []);
    existingTodos = new Set((todos || []).map((t) => t.content));
  }
  const createdTasks = [];
  for (const t of tasks) {
    if (existingTodos.has(t.content)) continue;
    createdTasks.push(await createTask({ bcClient, projectId, list, task: t, dryRun }));
  }

  // Phase 5: kickoff message
  const kickoffContent = buildKickoffMessage({ bidConfig, opp, folder, list, uploaded, opportunityPulseBase });
  const kickoffSubject = `Bid kickoff: ${bidConfig.display_title}`;
  const existingMsgs = await bcClient.bcGet(`/buckets/${projectId}/message_boards/${messageBoardId}/messages.json`).catch(() => []);
  let kickoff = (existingMsgs || []).find((m) => m.subject === kickoffSubject);
  if (!kickoff) {
    kickoff = await bcClient.bcPost(`/buckets/${projectId}/message_boards/${messageBoardId}/messages.json`,
      { subject: kickoffSubject, content: kickoffContent, status: 'active' });
  }

  // Phase 6: audit summary
  const summaryPath = path.join(workDir, 'basecamp-summary.json');
  const summary = {
    bid: bidConfig.display_title,
    opportunity_uuid: bidConfig.opportunity_uuid,
    processed_at: new Date().toISOString(),
    basecamp: {
      project_id: projectId,
      folder_id: folder.id, folder_url: folder.app_url,
      list_id: list.id, list_url: list.app_url,
      message_id: kickoff?.id, message_url: kickoff?.app_url,
      file_count: uploaded.length, task_count: createdTasks.length,
    },
    uploaded,
  };
  if (!dryRun) fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  return { workDir, filesDir, files, folder, list, kickoff, uploaded, tasks: createdTasks, summary, summaryPath };
}

// =============================================================================
// Download a zip from a Basecamp Vault upload URL.
// Used by the CB finalize flow when Ali drops a zip in the Gov Contracts Vault
// and references its app_url in the reply.
//
// Input: vaultUploadUrl - the app_url-ish URL Ali pasted. May be either:
//   - the direct /buckets/<bucket>/uploads/<id>.json metadata URL
//   - the /buckets/<bucket>/uploads/<id> app URL (we'll add .json)
// Returns: { localZipPath, filename }
// =============================================================================
async function downloadVaultZip({ vaultUploadUrl, basecampIds, basecampToken, workDirRoot }) {
  const { accountId } = basecampIds;
  const bcClient = makeBcClient({ accountId, basecampToken, dryRun: false });

  // Parse the URL to an API path. Accept any of:
  //   https://3.basecamp.com/3945211/buckets/47346103/uploads/12345
  //   https://3.basecampapi.com/3945211/buckets/47346103/uploads/12345.json
  //   /buckets/47346103/uploads/12345
  const m = vaultUploadUrl.match(/buckets\/(\d+)\/uploads\/(\d+)/);
  if (!m) throw new Error(`Could not parse Basecamp upload URL: ${vaultUploadUrl}`);
  const bucketId = m[1];
  const uploadId = m[2];
  const meta = await bcClient.bcGet(`/buckets/${bucketId}/uploads/${uploadId}.json`);
  const downloadUrl = meta.download_url;
  if (!downloadUrl) throw new Error(`Upload ${uploadId} has no download_url`);
  const filename = meta.filename || `upload-${uploadId}.zip`;

  const dir = path.join(workDirRoot || path.resolve(__dirname, '../../../../tmp/gov-bids'), 'downloads');
  fs.mkdirSync(dir, { recursive: true });
  const localZipPath = path.join(dir, filename);
  const buf = await bcClient.bcDownloadFile(downloadUrl);
  fs.writeFileSync(localZipPath, buf);
  return { localZipPath, filename, byteSize: buf.length, uploadMeta: meta };
}

module.exports = { processBid, downloadVaultZip, makeBcClient, extractZip };
