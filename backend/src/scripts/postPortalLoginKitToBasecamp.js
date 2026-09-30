#!/usr/bin/env node
/**
 * postPortalLoginKitToBasecamp.js
 *
 * Publishes the Portal Login Embed Reference Kit to the "Reference Kits" list
 * (9982030818) in bucket 7463955, following the kit-vault convention (same as
 * postSynthflowKitToBasecamp.js):
 *   - one to-do, marked COMPLETE (documentation, not actionable)
 *   - byline "via Ali Muwwakkil's Claude Code" at the top of the description
 *   - the copy/paste embed snippet inline in the description so the ticket is
 *     useful without opening any attachment
 *   - every kit file (reference-kits/portal-login/*) uploaded to the bucket and
 *     embedded in a single comment so any project can download them from the
 *     ticket with only a BC token.
 *
 * Idempotent: if a to-do with the same title already exists in the list, it
 * reuses it (updates the description, re-posts the files comment) instead of
 * creating a duplicate. Re-run it whenever the embed loader changes to refresh
 * the ticket.
 *
 * Token: uses BASECAMP_ACCESS_TOKEN, and self-heals on a 401 by pulling the live
 * token from CCPP `Basecamp_AuthInfo` (same source of truth as basecampToken.ts)
 * when MSSQL_* env vars are present.
 *
 * Run (one-off) inside the prod backend container so `mssql` + MSSQL_* resolve:
 *   docker cp backend/src/scripts/postPortalLoginKitToBasecamp.js accelerator-backend:/app/
 *   docker cp backend/src/scripts/reference-kits accelerator-backend:/app/reference-kits
 *   docker exec -w /app accelerator-backend node /app/postPortalLoginKitToBasecamp.js
 * Or locally with a live token:  BASECAMP_ACCESS_TOKEN=... node backend/src/scripts/postPortalLoginKitToBasecamp.js [--dry-run]
 * Global fetch (Node >=18); no extra deps beyond the app's own node_modules.
 */
const path = require('path');
const fs = require('fs');

const ACCOUNT_ID = '3945211';
const BUCKET = 7463955;
const LIST = 9982030818; // "Reference Kits"
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;
const UA = 'Colaberry Accelerator (ali@colaberry.com)';
const TITLE = 'Portal login embed kit (drop-in magic-link sign-in for any site)';
const DRY_RUN = process.argv.includes('--dry-run');

const KIT_DIR = path.resolve(__dirname, 'reference-kits/portal-login');
const KIT_FILES = [
  { name: 'portal-login-embed.md', contentType: 'text/markdown', desc: 'Full self-contained guide: minimal embed, options, flow, behavior, limits, self-host.' },
  { name: 'portal-login.js', contentType: 'application/javascript', desc: 'The loader source (also served live at /embeds/portal-login.js). Repo: frontend/public/embeds/portal-login.js' },
  { name: 'embed-snippet.html', contentType: 'text/html', desc: 'Copy/paste snippets: minimal, customized (data-*), and no-script link fallback.' },
];

const clean = (t) => String(t || '').trim().replace(/^bearer\s+/i, '').trim();
let CURRENT_TOKEN = clean(process.env.BASECAMP_ACCESS_TOKEN);
let TRIED_REFRESH = false;

/** Pull the live BC token from CCPP (rotation source of truth). */
async function refreshFromCcpp() {
  if (!process.env.MSSQL_HOST) throw new Error('401 and no MSSQL_* env to refresh from CCPP');
  const sql = require('mssql');
  const pool = await new sql.ConnectionPool({
    server: process.env.MSSQL_HOST,
    port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
  }).connect();
  try {
    const r = await pool.request().query(
      'SELECT TOP 1 AccessToken FROM Basecamp_AuthInfo WHERE IsActive = 1 ORDER BY BasecampAuthInfoID DESC',
    );
    const t = clean(r.recordset?.[0]?.AccessToken);
    if (!t) throw new Error('Basecamp_AuthInfo returned no active token');
    CURRENT_TOKEN = t;
    console.warn('[token] refreshed from CCPP after 401');
  } finally {
    await pool.close();
  }
}

/** fetch with Bearer auth; on a single 401, refresh from CCPP and retry once. */
async function authFetch(url, { method = 'GET', body, contentType } = {}) {
  const build = () => {
    const headers = { Authorization: `Bearer ${CURRENT_TOKEN}`, 'User-Agent': UA };
    let payload = body;
    if (contentType) {
      headers['Content-Type'] = contentType; // raw upload
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers.Accept = 'application/json';
      payload = JSON.stringify(body);
    } else {
      headers.Accept = 'application/json';
    }
    return fetch(url, { method, headers, body: payload });
  };
  let r = await build();
  if (r.status === 401 && !TRIED_REFRESH) {
    TRIED_REFRESH = true;
    await refreshFromCcpp();
    r = await build();
  }
  return r;
}

async function bcJson(method, apiPath, body) {
  const r = await authFetch(API + apiPath, { method, body });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`BC ${method} ${apiPath} -> ${r.status} ${t.slice(0, 300)}`);
  }
  return r.status === 204 ? null : r.json();
}
const bcPost = (p, b) => bcJson('POST', p, b);
const bcPut = (p, b) => bcJson('PUT', p, b);

/** Upload raw file bytes -> attachable_sgid (for embedding via bc-attachment). */
async function uploadAttachment(filename, contentType, buffer) {
  const r = await authFetch(`${API}/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    body: new Uint8Array(buffer),
    contentType,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`BC upload ${filename} -> ${r.status} ${t.slice(0, 300)}`);
  }
  return (await r.json()).attachable_sgid;
}

/** Find an existing to-do in the list by exact title (paginates via Link header). */
async function findExistingTodo() {
  let url = `${API}/buckets/${BUCKET}/todolists/${LIST}/todos.json?status=all`;
  while (url) {
    const r = await authFetch(url);
    if (!r.ok) throw new Error(`BC list todos -> ${r.status}`);
    const rows = await r.json();
    const hit = (rows || []).find((t) => t.content === TITLE);
    if (hit) return hit;
    const link = r.headers.get('link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return null;
}

const DESCRIPTION = `<div>
<p><em>via Ali Muwwakkil's Claude Code</em></p>

<p><strong>Drop-in, passwordless (magic-link) participant sign-in</strong> you can add to ANY website with one script tag. An enrolled participant types their email, gets a secure sign-in link, clicks it, and lands in the Accelerator portal already logged in. LIVE at <code>enterprise.colaberry.ai/embeds/portal-login.js</code>.</p>

<p><strong>Paste this</strong> anywhere in the page:</p>
<pre>&lt;div id="colaberry-portal-login"&gt;&lt;/div&gt;
&lt;script src="https://enterprise.colaberry.ai/embeds/portal-login.js" defer&gt;&lt;/script&gt;</pre>

<p>That is the whole install. Live file: <a href="https://enterprise.colaberry.ai/embeds/portal-login.js">https://enterprise.colaberry.ai/embeds/portal-login.js</a></p>

<p><strong>Customize</strong> with optional <code>data-*</code> on the script tag:</p>
<ul>
<li><code>data-heading</code> - card title</li>
<li><code>data-subtext</code> - helper line under the title</li>
<li><code>data-mount</code> - id of the container to render into</li>
<li><code>data-portal</code> - API origin (default https://enterprise.colaberry.ai)</li>
</ul>

<p><strong>Behavior</strong> (mirrors the API): a generic "link sent" message (anti-enumeration), a "pending admin approval" message when access is not yet enabled, and a friendly error with a 15s timeout. Renders into the host page's own DOM (NOT an iframe), so nginx's <code>X-Frame-Options: SAMEORIGIN</code> never blocks it; the only network call is a CORS-allowed POST to <code>/api/portal/request-link</code>.</p>

<p><strong>Limits:</strong> authenticates EXISTING portal-enabled enrollments only (a login, not a signup). Cross-origin works because API CORS is open to all origins; if that is ever locked to an allowlist, partner domains must be added. No-script fallback: link to <code>https://enterprise.colaberry.ai/portal/login</code>.</p>

<p><strong>Attached files</strong> (in the comment below): <code>portal-login-embed.md</code> (full guide), <code>portal-login.js</code> (loader source), <code>embed-snippet.html</code> (copy/paste snippets). Repo source of truth: <code>frontend/public/embeds/portal-login.js</code>.</p>
</div>`;

(async () => {
  if (!DRY_RUN && !CURRENT_TOKEN && !process.env.MSSQL_HOST) {
    throw new Error('BASECAMP_ACCESS_TOKEN required (or MSSQL_* to pull from CCPP)');
  }

  // Load files up front so a missing file fails before any BC write.
  const files = KIT_FILES.map((meta) => {
    const full = path.join(KIT_DIR, meta.name);
    if (!fs.existsSync(full)) throw new Error(`Missing kit file: ${full}`);
    return { ...meta, buffer: fs.readFileSync(full) };
  });
  const totalBytes = files.reduce((s, f) => s + f.buffer.length, 0);
  console.log(`Loaded ${files.length} kit files (${totalBytes} bytes) from ${KIT_DIR}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] Would ensure to-do in Reference Kits list:');
    console.log(`  Title: ${TITLE}`);
    console.log(`  List:  ${LIST}  Bucket: ${BUCKET}`);
    files.forEach((f) => console.log(`  attach: ${f.name} (${f.contentType})`));
    return;
  }

  // 1. Idempotent create-or-reuse the to-do.
  let todo = await findExistingTodo();
  if (todo) {
    console.log(`Reusing existing to-do ${todo.id}: ${todo.app_url}`);
    await bcPut(`/buckets/${BUCKET}/todos/${todo.id}.json`, { content: TITLE, description: DESCRIPTION });
    console.log('  + description updated');
  } else {
    todo = await bcPost(`/buckets/${BUCKET}/todolists/${LIST}/todos.json`, {
      content: TITLE,
      description: DESCRIPTION,
      due_on: '2026-12-31', // far-future; documentation, not actionable
    });
    console.log(`Created to-do ${todo.id}: ${todo.app_url}`);
    try {
      await bcPost(`/buckets/${BUCKET}/todos/${todo.id}/completion.json`, {});
      console.log('  + marked complete');
    } catch (e) {
      console.log(`  ! completion failed: ${e.message}`);
    }
  }

  // 2. Upload each file -> sgid.
  const embeds = [];
  for (const f of files) {
    const sgid = await uploadAttachment(f.name, f.contentType, f.buffer);
    embeds.push(`<bc-attachment sgid="${sgid}" caption="${f.name} - ${f.desc}"></bc-attachment>`);
    console.log(`  + uploaded ${f.name}`);
  }

  // 3. Post one comment embedding all files.
  const comment = `<div>
<p><strong>Portal login embed kit files</strong> - download and read <code>portal-login-embed.md</code>; the live loader is at <code>https://enterprise.colaberry.ai/embeds/portal-login.js</code>.</p>
${embeds.join('\n')}
</div>`;
  const posted = await bcPost(`/buckets/${BUCKET}/recordings/${todo.id}/comments.json`, { content: comment });
  console.log(`  + posted files comment ${posted.id}`);

  console.log('\n=== Done ===');
  console.log(`Reference Kit: ${todo.app_url}`);
  console.log(`Reference Kits list: https://app.basecamp.com/3945211/buckets/${BUCKET}/todolists/${LIST}`);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
