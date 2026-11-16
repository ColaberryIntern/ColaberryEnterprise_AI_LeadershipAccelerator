#!/usr/bin/env node
/**
 * kit-to-ladder publisher: one ladder spec (a .js module or .json) -> one Basecamp build list in
 * Ali Personal, in the Loop Architect format (see ../SKILL.md).
 *
 * Creates, in order, each only if it does not already exist (idempotent by name/title, so a re-run
 * after a failure finishes the job and creates nothing twice):
 *   1. a Docs & Files folder <spec.folder> with sub-folders, and the kit files uploaded into them;
 *   2. the Build Contract document in that folder;
 *   3. the to-do list, its groups, and every ticket (assignee + due date), in spec order.
 * An existing ticket is UPDATED (description, due, assignee) only with --update; otherwise skipped.
 *
 * Safety: refuses to write unless the token is Ali's (17454835). --dry prints the plan, writes nothing.
 * Every call has a 30 s timeout; 429/5xx retry 3 times with backoff (2 s, 6 s, 18 s), then fail loud.
 *
 * Usage: node publish_ladder.js <spec.js|spec.json> --token-file <path> [--dry] [--update]
 */
const fs = require('fs');
const path = require('path');
const { ticketHtml, listHtml, contractHtml } = require('./render_ladder');

const ACCOUNT = 'https://3.basecampapi.com/3945211';
const ALI = 17454835;
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const specPath = args.find((a) => !a.startsWith('--') && a !== opt('--token-file'));
if (!specPath || !opt('--token-file')) {
  console.error('usage: node publish_ladder.js <spec> --token-file <path> [--dry] [--update]');
  process.exit(2);
}
const spec = require(path.resolve(specPath));
const TOKEN = fs.readFileSync(opt('--token-file'), 'utf8').trim();
const DRY = flag('--dry');
const UPDATE = flag('--update');
const B = `${ACCOUNT}/buckets/${spec.bucket}`;
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'ColaberryOps (ops)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(DRY ? '[dry]' : '[bc]', ...a);

async function call(method, url, body, headers = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      method,
      headers: { ...H, ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if ((r.status === 429 || r.status >= 500) && attempt < 3) { await sleep(2000 * 3 ** attempt); continue; }
    if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.status === 204 ? null : r.json();
  }
}
async function all(url) {
  const out = [];
  for (let p = 1; p < 60; p++) {
    const j = await call('GET', `${url}${url.includes('?') ? '&' : '?'}page=${p}`);
    out.push(...j);
    if (j.length < 15) break;
  }
  return out;
}
const dockId = async (name) => (await call('GET', `${ACCOUNT}/projects/${spec.bucket}.json`)).dock.find((d) => d.name === name).id;

const isDry = (id) => String(id).startsWith('dry-');

async function folder(parentId, title) {
  const hit = isDry(parentId) ? null : (await all(`${B}/vaults/${parentId}/vaults.json`)).find((v) => v.title === title);
  if (hit) return hit.id;
  say('create folder', title);
  return DRY ? `dry-${title}` : (await call('POST', `${B}/vaults/${parentId}/vaults.json`, { title })).id;
}

async function upload(vaultId, file) {
  const name = path.basename(file);
  if (!String(vaultId).startsWith('dry-')) {
    const have = await all(`${B}/vaults/${vaultId}/uploads.json`);
    if (have.some((u) => u.filename === name || u.title === name)) return;
  }
  say('upload', name);
  if (DRY) return;
  const bytes = fs.readFileSync(file);
  const att = await call('POST', `${ACCOUNT}/attachments.json?name=${encodeURIComponent(name)}`, bytes, {
    'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length),
  });
  await call('POST', `${B}/vaults/${vaultId}/uploads.json`, { attachable_sgid: att.attachable_sgid, base_name: name.replace(/\.[^.]+$/, '') });
}

async function documentIn(vaultId, title, content) {
  if (!String(vaultId).startsWith('dry-')) {
    const hit = (await all(`${B}/vaults/${vaultId}/documents.json`)).find((d) => d.title === title);
    if (hit) {
      if (UPDATE && !DRY) await call('PUT', `${B}/documents/${hit.id}.json`, { title, content });
      return hit;
    }
  }
  say('create document', title);
  return DRY ? { id: 'dry-doc', app_url: '(contract url)' } : call('POST', `${B}/vaults/${vaultId}/documents.json`, { title, content, status: 'active' });
}

async function main() {
  const me = await call('GET', `${ACCOUNT}/my/profile.json`);
  if (me.id !== ALI) throw new Error(`token belongs to ${me.id} (${me.name}), not Ali ${ALI}: refusing to write`);

  // 1-2. Docs & Files: folder, sub-folders, kit uploads, Build Contract.
  const root = await folder(await dockId('vault'), spec.folder);
  const links = { folder: `https://app.basecamp.com/3945211/buckets/${spec.bucket}/vaults/${root}` };
  for (const sub of spec.subfolders || []) {
    const id = await folder(root, sub.title);
    links[sub.key] = `https://app.basecamp.com/3945211/buckets/${spec.bucket}/vaults/${id}`;
    for (const f of sub.files || []) await upload(id, f);
  }
  const contract = await documentIn(root, spec.contract.title, contractHtml(spec, links));
  links.contract = contract.app_url;

  // 3. The list, its groups and tickets.
  const todoset = await dockId('todoset');
  const lists = await all(`${B}/todosets/${todoset}/todolists.json`);
  let list = lists.find((l) => l.name === spec.list.name);
  if (!list) {
    say('create list', spec.list.name);
    list = DRY ? { id: 'dry-list' } : await call('POST', `${B}/todosets/${todoset}/todolists.json`, { name: spec.list.name, description: listHtml(spec, links) });
  } else if (UPDATE && !DRY) {
    await call('PUT', `${B}/todolists/${list.id}.json`, { name: spec.list.name, description: listHtml(spec, links) });
  }
  const groups = String(list.id).startsWith('dry-') ? [] : await all(`${B}/todolists/${list.id}/groups.json`);
  let made = 0; let updated = 0; let kept = 0;
  for (const g of spec.groups) {
    let group = groups.find((x) => x.name === g.name);
    if (!group) {
      say('create group', g.name);
      group = DRY ? { id: `dry-${g.name}` } : await call('POST', `${B}/todolists/${list.id}/groups.json`, { name: g.name });
    }
    const existing = String(group.id).startsWith('dry-') ? [] : [
      ...(await all(`${B}/todolists/${group.id}/todos.json`)),
      ...(await all(`${B}/todolists/${group.id}/todos.json?completed=true`)),
    ];
    for (const t of g.tickets) {
      const title = `${t.id} ${t.kind === 'human' ? '🧑 [Human]' : '🤖 [AI]'} ${t.title}`;
      const body = { content: title, description: ticketHtml(spec, t, links), assignee_ids: [spec.assigneeId], due_on: t.due, notify: false };
      const hit = existing.find((x) => x.title.startsWith(`${t.id} `));
      if (!hit) { say('create', title.slice(0, 90)); made++; if (!DRY) await call('POST', `${B}/todolists/${group.id}/todos.json`, body); }
      else if (UPDATE) { updated++; if (!DRY) await call('PUT', `${B}/todos/${hit.id}.json`, body); }
      else kept++;
    }
  }
  const listUrl = String(list.id).startsWith('dry-') ? '(new list)' : `https://app.basecamp.com/3945211/buckets/${spec.bucket}/todolists/${list.id}`;
  console.log(JSON.stringify({ list: listUrl, contract: links.contract, folder: links.folder, created: made, updated, unchanged: kept }, null, 1));
}

main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
