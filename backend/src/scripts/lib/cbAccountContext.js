// CB account-context lib. Shared helpers for the "one ticket = full account
// memory" pattern: every artifact for a sales-rep account lives under that
// account's BC ticket via a Vault subfolder + index comment.
//
// Public API:
//   loadAccountMap()                         -> the cbAccountMap.json structure
//   resolveAccount(slugOrName)               -> account record
//   ensureAccountFolder(account)             -> { folderId, folderUrl } - idempotent
//   listFolderUploads(folderId)              -> existing uploads (for dedup)
//   uploadToAccount(account, { filePath, contentType, description, kind })
//                                            -> { sgid, vaultUrl, uploadId, filename }
//   appendIndexComment(account, entry)       -> posts/updates the index comment
//
// Idempotency: uploads dedup by filename within the folder. If a file with the
// same name already exists, returns the existing one and does NOT re-upload.
// The index comment is a single append-friendly comment that lists every
// artifact - new entries get appended to the latest comment if it's the index,
// otherwise a fresh index comment is posted.

const path = require('path');
const fs = require('fs');

const ACCOUNT_ID = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT_ID}`;

function tokenFromEnv() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN not set');
  return t;
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${tokenFromEnv()}`, 'User-Agent': 'Colaberry CB Account Context', Accept: 'application/json', ...extra };
}

async function bcGet(path) {
  const r = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

async function bcPost(path, body, extraHeaders = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json', ...extraHeaders }),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

async function bcPut(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PUT ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

function loadAccountMap() {
  const p = path.resolve(__dirname, 'cbAccountMap.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function resolveAccount(slugOrName) {
  const map = loadAccountMap();
  const slug = String(slugOrName || '').trim();
  if (map.accounts[slug]) return { slug, bucketId: map.bucketId, parentVaultFolderName: map.parentVaultFolderName, ...map.accounts[slug] };
  // Try by displayName match (case-insensitive contains)
  const lc = slug.toLowerCase();
  for (const [k, v] of Object.entries(map.accounts)) {
    if (v.displayName.toLowerCase() === lc || v.displayName.toLowerCase().includes(lc) || k.toLowerCase().includes(lc)) {
      return { slug: k, bucketId: map.bucketId, parentVaultFolderName: map.parentVaultFolderName, ...v };
    }
  }
  throw new Error(`account "${slugOrName}" not in cbAccountMap.json (slugs: ${Object.keys(map.accounts).join(', ')})`);
}

// Returns the project's root vault id ("Docs & Files" dock item).
async function getProjectRootVault(bucketId) {
  const proj = await bcGet(`/projects/${bucketId}.json`);
  const v = (proj.dock || []).find((d) => d.name === 'vault');
  if (!v) throw new Error(`project ${bucketId} has no vault dock`);
  return v.id;
}

async function findOrCreateVaultSubfolder({ bucketId, parentVaultId, title }) {
  // List subfolders. The Basecamp endpoint returns immediate children of both
  // kinds; we sift for type='Vault' as the folder records.
  let folder = null;
  try {
    const children = await bcGet(`/buckets/${bucketId}/vaults/${parentVaultId}/vaults.json`);
    if (Array.isArray(children)) folder = children.find((c) => (c.title || c.name) === title);
  } catch {}
  if (folder) return folder;
  folder = await bcPost(`/buckets/${bucketId}/vaults/${parentVaultId}/vaults.json`, { title });
  return folder;
}

async function ensureAccountFolder(account) {
  const rootId = await getProjectRootVault(account.bucketId);
  const parent = await findOrCreateVaultSubfolder({
    bucketId: account.bucketId, parentVaultId: rootId, title: account.parentVaultFolderName,
  });
  const accountFolder = await findOrCreateVaultSubfolder({
    bucketId: account.bucketId, parentVaultId: parent.id, title: account.folderName,
  });
  return { parentFolderId: parent.id, folderId: accountFolder.id, folderUrl: accountFolder.app_url };
}

async function listFolderUploads({ bucketId, folderId }) {
  // Paginated - the BC API returns ~15 per page with a Link: rel="next" header.
  const all = [];
  let url = `${BASE}/buckets/${bucketId}/vaults/${folderId}/uploads.json`;
  while (url) {
    let r;
    try { r = await fetch(url, { headers: authHeaders() }); }
    catch { break; }
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    all.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    url = lh ? lh[1] : null;
  }
  return all;
}

function inferContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.txt' || ext === '.md') return 'text/plain';
  if (ext === '.html' || ext === '.htm') return 'text/html';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.json') return 'application/json';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

async function uploadToAccount(account, { filePath, contentType, description, kind, allowReplace = false }) {
  const buf = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const ct = contentType || inferContentType(filePath);
  const { folderId, folderUrl } = await ensureAccountFolder(account);

  // Dedup: if filename already exists in folder, skip unless allowReplace
  const existing = await listFolderUploads({ bucketId: account.bucketId, folderId });
  const dup = existing.find((u) => (u.filename || u.title) === filename);
  if (dup && !allowReplace) {
    return {
      sgid: dup.attachable_sgid || null, vaultUrl: dup.app_url, uploadId: dup.id,
      filename, kind, deduped: true, folderUrl,
    };
  }

  // Step 1: upload to BC attachments endpoint
  const att = await bcPost(`/attachments.json?name=${encodeURIComponent(filename)}`, buf, { 'Content-Type': ct });
  const sgid = att.attachable_sgid;

  // Step 2: create vault upload in the account folder
  const up = await bcPost(`/buckets/${account.bucketId}/vaults/${folderId}/uploads.json`, {
    attachable_sgid: sgid,
    base_name: filename.replace(/\.[^.]+$/, ''),
    description: description || `${kind || 'document'} for ${account.displayName}`,
  });
  return { sgid, vaultUrl: up.app_url, uploadId: up.id, filename, kind, deduped: false, folderUrl };
}

// Index comment management. We keep one canonical "[CB Index]" comment on the
// ticket. If it exists we update; if not we create. This avoids comment-spam.
const INDEX_MARKER = '[CB Account Context Index]';

async function getOrCreateIndexComment(account) {
  const { folderUrl } = await ensureAccountFolder(account);
  // List comments and find the one starting with INDEX_MARKER
  const comments = await bcGet(`/buckets/${account.bucketId}/recordings/${account.ticketId}/comments.json`);
  const idx = (comments || []).find((c) => (c.content || '').includes(INDEX_MARKER));
  return { idx, folderUrl, comments };
}

function buildIndexHtml({ account, folderUrl, entries }) {
  // Group by kind so similar artifacts cluster (emails, transcripts, attachments).
  const byKind = {};
  for (const e of entries) {
    const k = e.kind || 'doc';
    (byKind[k] = byKind[k] || []).push(e);
  }
  const KIND_ORDER = ['email', 'transcript', 'attachment', 'doc'];
  const KIND_LABEL = { email: 'Email threads', transcript: 'Meeting transcripts', attachment: 'Email attachments', doc: 'Documents' };

  const sections = [];
  const kindKeys = Object.keys(byKind).sort((a, b) => {
    const ai = KIND_ORDER.indexOf(a); const bi = KIND_ORDER.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  for (const k of kindKeys) {
    const items = byKind[k].slice().sort((a, b) => (a.label > b.label ? 1 : -1));
    const rows = items.map((e) => `<li><a href="${e.vaultUrl}">${escapeHtml(e.label)}</a></li>`).join('');
    sections.push(`<div style="margin-top:14px"><strong>${escapeHtml(KIND_LABEL[k] || k)} (${items.length})</strong></div>
<ul style="margin-top:4px;margin-bottom:0">${rows}</ul>`);
  }

  return `<div><strong>${INDEX_MARKER}</strong></div>
<div style="margin-top:6px;font-size:13px">Account: <strong>${escapeHtml(account.displayName)}</strong>. Every artifact ever exchanged on this account is uploaded here and read by CB on every @CB invocation.</div>
<div style="margin-top:8px"><strong>Vault folder:</strong> <a href="${folderUrl}">Open Vault folder &rarr;</a></div>
<div style="margin-top:10px;font-size:13px"><strong>${entries.length} artifact${entries.length === 1 ? '' : 's'}</strong> indexed below:</div>
${sections.join('\n')}
<div style="margin-top:14px;font-size:11px;color:#94a3b8">Last updated ${new Date().toISOString()}. Maintained by cbAttachToAccount.js - do not edit by hand.</div>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Rebuild the index comment from scratch by listing every upload in the
// account's Vault folder. This is more robust than parsing the previous
// comment HTML and keeps a single source of truth (the Vault).
// labelForUpload is an optional callback that gets ({filename, vaultUrl, uploadId})
// and returns a clean label - the caller (CLI) supplies this so it can read
// email-thread .txt files for their "Thread:" subject line.
async function rebuildIndexFromVault(account, labelForUpload) {
  const { folderId, folderUrl } = await ensureAccountFolder(account);
  const uploads = await listFolderUploads({ bucketId: account.bucketId, folderId });
  const entries = uploads.map((u) => {
    const filename = u.title || u.filename || `upload-${u.id}`;
    const vaultUrl = u.app_url;
    const kind = guessKindFromFilename(filename);
    const label = labelForUpload ? labelForUpload({ filename, vaultUrl, uploadId: u.id, kind }) : prettifyFilename(filename);
    return { kind, label, vaultUrl, filename };
  });
  const { idx } = await getOrCreateIndexComment(account);
  const html = buildIndexHtml({ account, folderUrl, entries });
  if (idx) {
    await bcPut(`/buckets/${account.bucketId}/comments/${idx.id}.json`, { content: html });
    return { commentId: idx.id, commentUrl: idx.app_url, totalEntries: entries.length, action: 'updated' };
  }
  const c = await bcPost(`/buckets/${account.bucketId}/recordings/${account.ticketId}/comments.json`, { content: html });
  return { commentId: c.id, commentUrl: c.app_url, totalEntries: entries.length, action: 'created' };
}

function guessKindFromFilename(filename) {
  const stem = filename.replace(/\.[^.]+$/, '');
  if (stem.includes('__')) return 'attachment';
  if (/transcript|recording|call/i.test(filename)) return 'transcript';
  if (/\.txt$/i.test(filename) && /^\d{4}-\d{2}-\d{2}-/.test(filename)) return 'email';
  return 'doc';
}

function prettifyFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const stem = filename.replace(/\.[^.]+$/, '');
  const dateMatch = stem.match(/^(\d{4}-\d{2}-\d{2})-/);
  const date = dateMatch ? dateMatch[1] : null;
  const rest = stem.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  if (rest.includes('__')) {
    const after = rest.split('__').slice(1).join(' ');
    const pretty = after.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `${pretty}${date ? ` - from ${date} email` : ''} (${ext.toUpperCase()})`;
  }
  const pretty = rest.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `${pretty}${date ? ` (${date})` : ''}`;
}

module.exports = {
  loadAccountMap, resolveAccount,
  ensureAccountFolder, listFolderUploads,
  uploadToAccount, rebuildIndexFromVault,
  prettifyFilename, guessKindFromFilename,
  // primitives, for unusual flows
  bcGet, bcPost, bcPut,
};
