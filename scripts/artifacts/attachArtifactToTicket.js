/**
 * Attach artifact PDFs to a Basecamp ticket AND file them in the ticket's canonical folder.
 *
 * Runs ON THE PROD BACKEND, because that is where a live Basecamp token can be minted. Copy the
 * PDFs across first, then `docker exec ... node /tmp/attachArtifactToTicket.js`.
 *
 * ## Why both places
 *
 * A PDF attached only to a comment is buried the moment three more comments land on the ticket. A
 * PDF filed only in Docs & Files is never seen, because nobody browses folders. Ali's rule is both:
 * the artifact goes in the numbered folder AND on the ticket itself.
 *
 * ## Order
 *
 * The visual is posted BEFORE the document. A reader who opens one page understands the shape of
 * the problem; a reader who opens fourteen pages understands only that there is a document.
 *
 * Content is kept ASCII-only. Basecamp comments survive it and the route here has mangled UTF-8
 * before.
 *
 * Usage:
 *   SPEC=/tmp/af23-attach.json node /tmp/attachArtifactToTicket.js
 *
 * The spec is { ticketId, folderTitle, posts: [{ file, filename, caption, comment }] }.
 */
const fs = require('fs');

const ACCOUNT = '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT}`;
const UA = 'Colaberry Accelerator (ali@colaberry.com)';
const BUCKET = Number(process.env.BUCKET || 7463955);
const LIST = Number(process.env.LIST || 10406233777);
const PARENT_VAULT = Number(process.env.PARENT_VAULT || 10406233371);
const DRY = process.env.DRY === '1';

let TOKEN = null;
async function tok() {
  if (!TOKEN) {
    TOKEN = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
  }
  return TOKEN;
}

async function api(method, p, body) {
  if (DRY && method !== 'GET') { console.log(`  [DRY] ${method} ${p.split('?')[0]}`); return { id: 'DRY' }; }
  const r = await fetch(API + p, {
    method,
    headers: {
      Authorization: `Bearer ${await tok()}`, 'User-Agent': UA, 'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? {} : r.json();
}

async function listAll(p) {
  const out = [];
  for (let i = 1; i <= 30; i++) {
    const j = await api('GET', `${p}${p.includes('?') ? '&' : '?'}page=${i}`);
    if (!Array.isArray(j) || !j.length) break;
    out.push(...j);
  }
  return out;
}

/** Register the bytes with Basecamp and get the sgid everything else refers to. */
async function uploadBlob(filePath, filename) {
  if (DRY) { console.log(`  [DRY] upload ${filename}`); return 'DRY-SGID'; }
  const buf = fs.readFileSync(filePath);
  const r = await fetch(`${API.replace(`/${ACCOUNT}`, `/${ACCOUNT}`)}/attachments.json`
    + `?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await tok()}`, 'User-Agent': UA, 'Content-Type': 'application/pdf',
    },
    body: buf,
  });
  if (!r.ok) throw new Error(`UPLOAD ${filename} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (!j.attachable_sgid) throw new Error(`no attachable_sgid returned for ${filename}`);
  return j.attachable_sgid;
}

/**
 * Resolve the ticket by its AF code and REFUSE if it disagrees with the id in the spec.
 *
 * This exists because the first backfill run carried six ticket ids written from memory and ALL
 * SIX were wrong — every artifact would have been attached to somebody else's ticket, and the
 * upload would have succeeded, because an id is an id. A code like "AF3.2" is checkable against
 * the list; a nine-digit number is not checkable against anything.
 *
 * Exactly one match is required. Zero means the code is wrong; two means the titles are ambiguous
 * and a human should say which.
 */
async function resolveTicket(spec) {
  if (!spec.ticketCode) return spec.ticketId;
  const groups = await listAll(`/buckets/${BUCKET}/todolists/${LIST}/groups.json`);
  const todos = [];
  for (const g of (groups.length ? groups : [{ id: LIST }])) {
    todos.push(...await listAll(`/buckets/${BUCKET}/todolists/${g.id}/todos.json`));
  }
  const hits = todos.filter((t) => String(t.title).startsWith(`${spec.ticketCode} `));
  if (hits.length !== 1) {
    throw new Error(`${spec.ticketCode} matched ${hits.length} tickets, expected exactly 1`);
  }
  if (spec.ticketId && spec.ticketId !== hits[0].id) {
    throw new Error(
      `${spec.ticketCode} resolves to ${hits[0].id} but the spec says ${spec.ticketId}. `
      + 'Refusing to attach: one of the two is pointing at the wrong ticket.',
    );
  }
  return hits[0].id;
}

async function main() {
  const spec = JSON.parse(fs.readFileSync(process.env.SPEC, 'utf8'));
  const me = await api('GET', '/my/profile.json');
  if (!/ali@colaberry\.com/i.test(me.email_address || '')) throw new Error('not acting as Ali');
  spec.ticketId = await resolveTicket(spec);

  const folders = await listAll(`/buckets/${BUCKET}/vaults/${PARENT_VAULT}/vaults.json`);
  const folder = folders.find((f) => f.title === spec.folderTitle);
  if (!folder) throw new Error(`folder not found: ${spec.folderTitle}`);

  const existingComments = await listAll(
    `/buckets/${BUCKET}/recordings/${spec.ticketId}/comments.json`,
  );
  const alreadyFiled = await listAll(`/buckets/${BUCKET}/vaults/${folder.id}/uploads.json`);

  for (const post of spec.posts) {
    if (!fs.existsSync(post.file)) throw new Error(`missing file: ${post.file}`);
    const bytes = fs.statSync(post.file).size;

    if (existingComments.some((c) => (c.content || '').includes(post.filename))) {
      console.log(`${post.filename}: already on the ticket, skipped`);
      continue;
    }

    const sgid = await uploadBlob(post.file, post.filename);

    // File it in the numbered folder, unless an upload of that name is already there.
    let vaultUrl = null;
    const dupe = alreadyFiled.find((u) => u.filename === post.filename
      || u.title === post.filename);
    if (dupe) {
      vaultUrl = dupe.app_url;
      console.log(`  (already in ${spec.folderTitle}, reusing link)`);
    } else {
      const up = await api('POST', `/buckets/${BUCKET}/vaults/${folder.id}/uploads.json`, {
        attachable_sgid: sgid, base_name: post.filename.replace(/\.pdf$/i, ''),
        description: post.caption,
      });
      vaultUrl = up.app_url || null;
    }

    const filedLine = vaultUrl
      ? `<div style="font-size:12px;color:#475569"><strong>Filed in ${spec.folderTitle}:</strong> `
        + `<a href="${vaultUrl}">${post.filename}</a></div>`
      : '';
    const content = `${post.comment}<div><br></div>`
      + `<bc-attachment sgid="${sgid}" caption="${post.caption.replace(/"/g, '&quot;')}">`
      + '</bc-attachment>'
      + `<div><br></div>${filedLine}`;

    const posted = await api('POST', `/buckets/${BUCKET}/recordings/${spec.ticketId}/comments.json`,
      { content });
    console.log(`${post.filename}: attached (${(bytes / 1024).toFixed(0)} KB) `
      + `-> ${posted.app_url || '(dry)'}`);
  }

  console.log(`\nhttps://app.basecamp.com/${ACCOUNT}/buckets/${BUCKET}/todos/${spec.ticketId}`);
}

main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
