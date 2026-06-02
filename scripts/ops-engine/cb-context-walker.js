// CB context walker - the 4-layer Basecamp graph walk per Ali 2026-06-01:
//   Layer 1 LIST       - parent todolist (name, description, sibling task summaries)
//   Layer 2 TASK       - current todo (title + full description, no truncation)
//   Layer 3 COMMENTS   - all comments paginated, no per-comment truncation up to a generous cap
//   Layer 4 DOCUMENTS  - URLs in description/comments auto-followed:
//                         - BC todo/message/recording links: fetch body + recent comments
//                         - BC upload links: download + text extract (PDF via pdf-parse, docx via mammoth)
//                         - External https:// URLs: gated by CB_FOLLOW_EXTERNAL_URLS=1, http-fetch + html-to-text
//
// Recurses at depth 2 max. Per-document size cap. Per-invocation visited set
// so we never refetch the same URL twice.
//
// Returns a single context object the handler formats for the LLM.

const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const ACCOUNT_ID = '3945211';
const BC_API_BASE = `https://3.basecampapi.com/${ACCOUNT_ID}`;
const BC_APP_BASE = `https://app.basecamp.com/${ACCOUNT_ID}`;

const MAX_DEPTH = parseInt(process.env.CB_WALK_MAX_DEPTH || '2', 10);
const MAX_DOC_BYTES = parseInt(process.env.CB_WALK_MAX_DOC_BYTES || '60000', 10);
const MAX_EXTERNAL_HTML_BYTES = parseInt(process.env.CB_WALK_MAX_EXT_BYTES || '40000', 10);
const FETCH_TIMEOUT_MS = parseInt(process.env.CB_WALK_FETCH_TIMEOUT || '15000', 10);
const FOLLOW_EXTERNAL = (process.env.CB_FOLLOW_EXTERNAL_URLS || '0') === '1';

// Optional deps loaded lazily; gracefully degrade if missing.
function tryRequire(name) {
  try { return require(path.resolve(REPO, 'node_modules', name)); }
  catch { return null; }
}

function bcAuthHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
  return { Authorization: `Bearer ${t}`, 'User-Agent': 'Colaberry CB Walker', Accept: 'application/json' };
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally { clearTimeout(id); }
}

// =============================================================================
// URL DETECTION + CLASSIFICATION
// =============================================================================

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

function extractUrls(html) {
  if (!html) return [];
  // Match URLs anywhere - both in href="..." attributes and in visible text.
  // Earlier we stripped HTML first, which lost any URL that lived only inside
  // an href attribute (common in BC index comments where the link text is a
  // human label, not the URL itself).
  const matches = String(html).match(URL_RE) || [];
  return [...new Set(matches.map((u) => u.replace(/[.,;:!?)\]]+$/g, '')))];
}

function classifyUrl(url) {
  // Returns { kind, bucketId, recordingId, uploadId } or { kind: 'external' }
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('basecamp.com') || u.hostname.endsWith('basecampapi.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      // /3945211/buckets/{bid}/{kind}/{id}
      // /<account>/buckets/{bid}/{kind}/{id}
      const bIdx = parts.indexOf('buckets');
      if (bIdx >= 0 && parts.length >= bIdx + 4) {
        const bucketId = parseInt(parts[bIdx + 1], 10);
        const kind = parts[bIdx + 2]; // 'todos' | 'messages' | 'recordings' | 'uploads' | 'todolists' | 'vaults'
        const id = parseInt(parts[bIdx + 3], 10);
        if (bucketId && id) {
          if (kind === 'uploads') return { kind: 'bc-upload', bucketId, recordingId: id };
          if (kind === 'todos' || kind === 'messages' || kind === 'recordings') return { kind: 'bc-recording', bucketId, recordingId: id };
          if (kind === 'todolists') return { kind: 'bc-todolist', bucketId, recordingId: id };
          if (kind === 'vaults') return { kind: 'bc-vault', bucketId, vaultId: id };
        }
      }
      return { kind: 'bc-other' };
    }
    return { kind: 'external' };
  } catch { return { kind: 'invalid' }; }
}

// =============================================================================
// DOCUMENT EXTRACTORS
// =============================================================================

async function extractPdf(buffer) {
  const pdfMod = tryRequire('pdf-parse');
  if (!pdfMod) return '[pdf-parse not installed - PDF text extraction skipped]';
  try {
    // pdf-parse v2 API (class-based): new PDFParse({ data: buffer }).getText()
    if (pdfMod.PDFParse) {
      const parser = new pdfMod.PDFParse({ data: buffer });
      const r = await parser.getText();
      return (r.text || '').slice(0, MAX_DOC_BYTES);
    }
    // pdf-parse v1 API (function): pdf(buffer).then(r => r.text)
    const fn = pdfMod.default || pdfMod;
    if (typeof fn === 'function') {
      const r = await fn(buffer, { max: 30 });
      return (r.text || '').slice(0, MAX_DOC_BYTES);
    }
    return '[pdf-parse module shape unrecognized]';
  } catch (e) { return `[pdf parse failed: ${e.message}]`; }
}

async function extractDocx(buffer) {
  const mammoth = tryRequire('mammoth');
  if (!mammoth) return '[mammoth not installed - docx text extraction skipped]';
  try {
    const r = await mammoth.extractRawText({ buffer });
    return (r.value || '').slice(0, MAX_DOC_BYTES);
  } catch (e) { return `[docx parse failed: ${e.message}]`; }
}

function extractText(buffer) {
  try { return Buffer.from(buffer).toString('utf8').slice(0, MAX_DOC_BYTES); }
  catch { return '[text decode failed]'; }
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EXTERNAL_HTML_BYTES);
}

// =============================================================================
// PER-URL FETCHERS
// =============================================================================

async function fetchBcRecording({ bcGet, bucketId, recordingId }) {
  try {
    const rec = await bcGet(`/buckets/${bucketId}/recordings/${recordingId}.json`);
    let comments = [];
    try {
      // paginated
      let next = `${BC_API_BASE}/buckets/${bucketId}/recordings/${recordingId}/comments.json`;
      while (next) {
        const r = await fetchWithTimeout(next, { headers: bcAuthHeaders() });
        if (!r.ok) break;
        const page = await r.json();
        if (!Array.isArray(page)) break;
        comments.push(...page);
        const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
        next = lh ? lh[1] : null;
      }
    } catch {}
    return {
      title: rec.title || rec.subject || rec.name || '(untitled)',
      type: rec.type || 'Recording',
      description: rec.description || rec.content || '',
      comments: comments.slice(-8), // recent 8 are usually enough for context
      app_url: rec.app_url || `${BC_APP_BASE}/buckets/${bucketId}/${rec.type === 'Todo' ? 'todos' : 'messages'}/${recordingId}`,
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function fetchBcUpload({ bucketId, uploadId }) {
  try {
    const meta = await fetchWithTimeout(`${BC_API_BASE}/buckets/${bucketId}/uploads/${uploadId}.json`, { headers: bcAuthHeaders() });
    if (!meta.ok) return { error: `upload meta ${meta.status}` };
    const m = await meta.json();
    const downloadUrl = m.download_url || m.url;
    const filename = m.filename || m.title || 'attachment';
    const contentType = (m.content_type || '').toLowerCase();
    const size = m.byte_size || m.size || 0;
    // Pull the binary
    const dl = await fetchWithTimeout(downloadUrl, { headers: bcAuthHeaders() });
    if (!dl.ok) return { filename, contentType, size, error: `download ${dl.status}`, app_url: m.app_url };
    const buf = Buffer.from(await dl.arrayBuffer());
    let extracted = '';
    if (contentType.includes('pdf') || filename.toLowerCase().endsWith('.pdf')) extracted = await extractPdf(buf);
    else if (contentType.includes('word') || filename.toLowerCase().endsWith('.docx')) extracted = await extractDocx(buf);
    else if (contentType.startsWith('text/') || filename.match(/\.(txt|md|csv)$/i)) extracted = extractText(buf);
    else extracted = `[binary ${contentType || 'unknown'}, ${size} bytes - text extraction skipped]`;
    return { filename, contentType, size, extracted, app_url: m.app_url };
  } catch (e) {
    return { error: e.message };
  }
}

async function fetchBcVault({ bucketId, vaultId }) {
  // List both uploads + subfolders in this vault folder. Returns a synthetic
  // record the walker can pivot off of (kind=bc-vault). Walker then walks each
  // upload child as a normal bc-upload and recurses into each subfolder.
  try {
    const meta = await fetchWithTimeout(`${BC_API_BASE}/buckets/${bucketId}/vaults/${vaultId}.json`, { headers: bcAuthHeaders() });
    const m = meta.ok ? await meta.json() : {};
    let uploads = [];
    let subfolders = [];
    // Paginated listing - BC returns ~15 per page with a Link: rel="next" header.
    try {
      let next = `${BC_API_BASE}/buckets/${bucketId}/vaults/${vaultId}/uploads.json`;
      while (next) {
        const u = await fetchWithTimeout(next, { headers: bcAuthHeaders() });
        if (!u.ok) break;
        const page = await u.json();
        if (!Array.isArray(page)) break;
        uploads.push(...page);
        const lh = (u.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
        next = lh ? lh[1] : null;
      }
    } catch {}
    try {
      let next = `${BC_API_BASE}/buckets/${bucketId}/vaults/${vaultId}/vaults.json`;
      while (next) {
        const s = await fetchWithTimeout(next, { headers: bcAuthHeaders() });
        if (!s.ok) break;
        const page = await s.json();
        if (!Array.isArray(page)) break;
        subfolders.push(...page);
        const lh = (s.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
        next = lh ? lh[1] : null;
      }
    } catch {}
    return {
      title: m.title || m.name || '(vault)',
      app_url: m.app_url,
      uploadCount: Array.isArray(uploads) ? uploads.length : 0,
      subfolderCount: Array.isArray(subfolders) ? subfolders.length : 0,
      childUploadUrls: (Array.isArray(uploads) ? uploads : []).map((u) => u.app_url).filter(Boolean),
      childSubfolderUrls: (Array.isArray(subfolders) ? subfolders : []).map((s) => s.app_url).filter(Boolean),
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function fetchExternal(url) {
  if (!FOLLOW_EXTERNAL) return { skipped: 'CB_FOLLOW_EXTERNAL_URLS not enabled' };
  try {
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Colaberry CB Walker' } });
    if (!r.ok) return { error: `${r.status}` };
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html') || ct.includes('text/plain')) {
      const text = await r.text();
      return { text: ct.includes('html') ? htmlToText(text) : text.slice(0, MAX_EXTERNAL_HTML_BYTES), contentType: ct };
    }
    return { skipped: `content-type ${ct || 'unknown'} not text-fetchable` };
  } catch (e) { return { error: e.message }; }
}

// =============================================================================
// LAYER 1 - LIST
// =============================================================================

async function fetchListContext({ bcGet, bucketId, todo }) {
  if (!todo || !todo.parent || !todo.parent.id) return null;
  const listId = todo.parent.id;
  try {
    const list = await bcGet(`/buckets/${bucketId}/todolists/${listId}.json`);
    let siblings = [];
    try {
      siblings = await bcGet(`/buckets/${bucketId}/todolists/${listId}/todos.json`);
    } catch {}
    const summary = (Array.isArray(siblings) ? siblings : [])
      .filter((t) => t.id !== todo.id)
      .slice(0, 20)
      .map((t) => `  - ${(t.content || '').slice(0, 90)} (${t.completed ? 'done' : 'open'}${t.due_on ? `, due ${t.due_on}` : ''})`)
      .join('\n');
    return {
      name: list.name,
      description: (list.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500),
      app_url: list.app_url,
      siblingSummary: summary || '(no siblings)',
    };
  } catch { return null; }
}

// =============================================================================
// LAYER 4 - DOCUMENTS (recursive)
// =============================================================================

async function walkDocuments({ bcGet, seedUrls, visited, depth }) {
  if (depth > MAX_DEPTH) return [];
  const docs = [];
  for (const url of seedUrls) {
    if (visited.has(url)) continue;
    visited.add(url);
    const cls = classifyUrl(url);
    if (cls.kind === 'bc-upload') {
      const r = await fetchBcUpload({ bucketId: cls.bucketId, uploadId: cls.recordingId });
      docs.push({ url, kind: 'bc-upload', ...r });
    } else if (cls.kind === 'bc-vault') {
      const r = await fetchBcVault({ bucketId: cls.bucketId, vaultId: cls.vaultId });
      docs.push({ url, kind: 'bc-vault', ...r });
      // Walk every upload + every subfolder in the same depth budget. Subfolders
      // get their own recursive call (depth+1) so a deep folder tree degrades
      // gracefully against the depth cap.
      if (!r.error) {
        const folderSeeds = [...(r.childUploadUrls || []), ...(r.childSubfolderUrls || [])];
        const deeper = await walkDocuments({ bcGet, seedUrls: folderSeeds, visited, depth: depth + 1 });
        docs.push(...deeper);
      }
    } else if (cls.kind === 'bc-recording' || cls.kind === 'bc-todolist') {
      const r = await fetchBcRecording({ bcGet, bucketId: cls.bucketId, recordingId: cls.recordingId });
      docs.push({ url, kind: cls.kind, ...r });
      // Recurse: collect URLs from this fetched recording
      if (!r.error && depth + 1 <= MAX_DEPTH) {
        const recUrls = [
          ...extractUrls(r.description || ''),
          ...(r.comments || []).flatMap((c) => extractUrls(c.content || '')),
        ];
        const deeper = await walkDocuments({ bcGet, seedUrls: recUrls, visited, depth: depth + 1 });
        docs.push(...deeper);
      }
    } else if (cls.kind === 'external') {
      const r = await fetchExternal(url);
      docs.push({ url, kind: 'external', ...r });
    }
    // bc-other / invalid: skip silently
  }
  return docs;
}

// =============================================================================
// MAIN
// =============================================================================

async function walkContext({ bcGet, bucketId, recId, debug = false }) {
  // Get the current task/recording. Try /recordings first (canonical for any
  // recording type), then fall back to /todos for todo-specific endpoint
  // (some BC accounts gate /recordings differently).
  let task = null;
  const taskErrors = [];
  try { task = await bcGet(`/buckets/${bucketId}/recordings/${recId}.json`); }
  catch (e) { taskErrors.push(`recordings: ${e.message}`); }
  if (!task) {
    try { task = await bcGet(`/buckets/${bucketId}/todos/${recId}.json`); }
    catch (e) { taskErrors.push(`todos: ${e.message}`); }
  }
  if (!task && debug) console.warn('[cb-walker] task fetch failed:', taskErrors.join(' | '));

  // Layer 1 LIST (only when current is a Todo with a parent list)
  let list = null;
  if (task && (task.type === 'Todo' || task.parent)) {
    list = await fetchListContext({ bcGet, bucketId, todo: task });
  }

  // Layer 3 COMMENTS (paginated)
  let comments = [];
  try {
    let next = `${BC_API_BASE}/buckets/${bucketId}/recordings/${recId}/comments.json`;
    while (next) {
      const r = await fetchWithTimeout(next, { headers: bcAuthHeaders() });
      if (!r.ok) break;
      const page = await r.json();
      if (!Array.isArray(page)) break;
      comments.push(...page);
      const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
      next = lh ? lh[1] : null;
    }
  } catch {}

  // Layer 4 DOCUMENTS - extract URLs from task description + all comments, fetch them
  const seedUrls = [
    ...extractUrls(task?.description || task?.content || ''),
    ...comments.flatMap((c) => extractUrls(c.content || '')),
  ];
  const visited = new Set();
  const documents = await walkDocuments({ bcGet, seedUrls, visited, depth: 1 });

  return {
    list,
    task: task ? {
      title: task.title || task.subject || task.name || task.content,
      type: task.type,
      description: task.description || task.content || '',
      app_url: task.app_url,
    } : null,
    comments,
    documents,
    stats: {
      seedUrls: seedUrls.length,
      documentsFetched: documents.length,
      externalEnabled: FOLLOW_EXTERNAL,
      maxDepth: MAX_DEPTH,
    },
  };
}

// =============================================================================
// FORMATTERS for the LLM prompt
// =============================================================================

function formatComment(c, aliId) {
  const who = c.creator?.id === aliId ? 'Ali' : (c.creator?.name || 'Other');
  const when = c.created_at;
  const text = (c.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
  return `- [${when}] ${who}: ${text}`;
}

function formatContextForLlm(ctx, aliId) {
  const lines = [];
  if (ctx.list) {
    lines.push('## LAYER 1 - LIST (parent todolist)');
    lines.push(`Name: ${ctx.list.name}`);
    if (ctx.list.description) lines.push(`Description: ${ctx.list.description}`);
    lines.push(`URL: ${ctx.list.app_url}`);
    lines.push('Sibling tasks:');
    lines.push(ctx.list.siblingSummary || '(none)');
    lines.push('');
  }
  if (ctx.task) {
    lines.push('## LAYER 2 - TASK (the recording you were tagged on)');
    lines.push(`Type: ${ctx.task.type}`);
    lines.push(`Title: ${ctx.task.title}`);
    if (ctx.task.description) {
      const desc = String(ctx.task.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
      lines.push(`Description: ${desc}`);
    }
    lines.push(`URL: ${ctx.task.app_url}`);
    lines.push('');
  }
  if (ctx.comments && ctx.comments.length) {
    lines.push(`## LAYER 3 - COMMENTS (${ctx.comments.length} on this thread, oldest -> newest, no truncation up to 4000 chars per comment)`);
    for (const c of ctx.comments) lines.push(formatComment(c, aliId));
    lines.push('');
  }
  if (ctx.documents && ctx.documents.length) {
    lines.push(`## LAYER 4 - DOCUMENTS (${ctx.documents.length} URLs followed from description+comments, depth <= ${ctx.stats.maxDepth})`);
    for (const d of ctx.documents) {
      lines.push('');
      lines.push(`### [${d.kind}] ${d.url}`);
      if (d.error) { lines.push(`(fetch error: ${d.error})`); continue; }
      if (d.skipped) { lines.push(`(skipped: ${d.skipped})`); continue; }
      if (d.kind === 'bc-upload') {
        lines.push(`Filename: ${d.filename} (${d.contentType || '?'}, ${d.size || 0} bytes)`);
        if (d.extracted) lines.push(`Extracted text:\n${d.extracted}`);
      } else if (d.kind === 'bc-vault') {
        lines.push(`Vault folder: ${d.title} (${d.uploadCount || 0} files, ${d.subfolderCount || 0} subfolders)`);
        lines.push(`(uploads + subfolders walked separately below)`);
      } else if (d.kind === 'bc-recording' || d.kind === 'bc-todolist') {
        lines.push(`Title: ${d.title} (${d.type || '?'})`);
        if (d.description) {
          const desc = String(d.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
          lines.push(`Description: ${desc}`);
        }
        if (d.comments && d.comments.length) {
          lines.push(`Recent ${d.comments.length} comments:`);
          for (const c of d.comments) lines.push(formatComment(c, aliId));
        }
      } else if (d.kind === 'external') {
        if (d.text) lines.push(`Text (${d.contentType || 'unknown'}):\n${d.text}`);
      }
    }
    lines.push('');
  }
  if (ctx.stats) {
    lines.push(`(Context walker stats: ${ctx.stats.seedUrls} seed URLs, ${ctx.stats.documentsFetched} fetched, external=${ctx.stats.externalEnabled ? 'on' : 'off'}, maxDepth=${ctx.stats.maxDepth})`);
  }
  return lines.join('\n');
}

module.exports = {
  walkContext,
  formatContextForLlm,
  // exported for tests
  extractUrls,
  classifyUrl,
};
