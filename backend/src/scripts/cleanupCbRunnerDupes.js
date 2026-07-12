#!/usr/bin/env node
/**
 * One-off: clean up the duplicate CB-runner comments produced before the
 * idempotency guard landed (lib/cbDraftIdempotency.js). The runners
 * (runCbAiTasks*.js) re-posted "CB starting" / "first-pass deliverable" / the
 * same "@ Ali I need X" ask on every re-run, piling up dupes (LandJet
 * 2026-06-15: 47/37/23 on Ali-blocked todos).
 *
 * Strategy: per todo, keep the EARLIEST CB comment of each signature and trash
 * the rest. Signature buckets a templated comment by kind (STARTING /
 * DELIVERABLE) and a free-form ask by its normalized opening text, so identical
 * re-posts collapse to their first occurrence while genuinely-distinct comments
 * are preserved. Earliest-kept means the original legit draft always survives.
 *
 * SAFETY:
 *   - Only trashes comments authored by CB System (37708014).
 *   - Only ever trashes the 2nd+ comment of a repeated signature; a todo with
 *     one of each kind loses nothing.
 *   - Restricted to the 3 runner-driven projects (TARGETS).
 *   - Trash (PUT status/trashed) is recoverable in Basecamp for 30 days.
 *   - --apply required to act; default is a dry run.
 */
const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const CB = 37708014;
const APPLY = process.argv.includes('--apply');

const TARGETS = [
  { bucket: 46699826, name: 'LandJet Growth Engine' },
  { bucket: 46697389, name: 'AI Pathway' },
  { bucket: 47126345, name: 'ShipCES' },
];

let TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
if (!TOKEN) { console.error('BASECAMP_ACCESS_TOKEN required'); process.exit(1); }
if (TOKEN.toLowerCase().startsWith('bearer ')) TOKEN = TOKEN.slice(7).trim();
const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'CB Runner Dup Cleanup', Accept: 'application/json', 'Content-Type': 'application/json' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(url, opts = {}, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: H(), ...opts });
    if (r.status === 429 || r.status === 503) { const ra = parseInt(r.headers.get('Retry-After') || '2', 10); await sleep((ra || 2) * 1000 * (i + 1)); continue; }
    return r;
  }
  throw new Error(`rate-limited: ${url}`);
}
async function getAll(p) {
  let next = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (next) {
    const r = await req(next);
    if (!r.ok) throw new Error(`GET ${next} -> ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) break;
    out.push(...j);
    const m = (r.headers.get('Link') || '').match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}
async function trash(bucket, id) {
  const r = await req(`${BASE}/buckets/${bucket}/recordings/${id}/status/trashed.json`, { method: 'PUT' });
  if (!r.ok && r.status !== 204) throw new Error(`trash ${id} -> ${r.status}`);
}

function strip(s) { return (s || '').replace(/<bc-attachment[^>]*>[\s\S]*?<\/bc-attachment>/gi, '@').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function signature(content) {
  const t = strip(content);
  if (/first-pass deliverable/i.test(t)) return 'DELIVERABLE';
  if (/is starting this task now/i.test(t)) return 'STARTING';
  if (/hit an error drafting/i.test(t)) return 'ERROR';
  // Free-form ask/followup: collapse identical re-posts by their opening text.
  return 'ASK:' + t.slice(0, 60).toLowerCase();
}

(async () => {
  console.log(`CB runner duplicate cleanup  mode=${APPLY ? 'APPLY (trashing)' : 'DRY RUN'}\n`);
  const toTrash = [];
  let grandKeep = 0, grandTrash = 0;

  for (const { bucket, name } of TARGETS) {
    let comments;
    try { comments = await getAll(`/projects/recordings.json?type=Comment&bucket=${bucket}&sort=created_at&direction=desc`); }
    catch (e) { console.error(`  ${name}: fetch fail ${e.message}`); continue; }
    const cb = comments
      .filter((c) => c.creator && c.creator.id === CB && c.parent && c.parent.id)
      .map((c) => ({ id: c.id, t: Date.parse(c.created_at), parent: c.parent.id, sig: signature(c.content) }))
      .sort((a, b) => a.t - b.t); // earliest first

    const seen = new Set(); // `${parent}|${sig}`
    let keep = 0, trash_ = 0;
    const perKind = {};
    for (const c of cb) {
      const key = `${c.parent}|${c.sig}`;
      if (!seen.has(key)) { seen.add(key); keep++; continue; } // earliest of each signature kept
      toTrash.push({ bucket, id: c.id });
      trash_++;
      const kind = c.sig.startsWith('ASK:') ? 'ASK' : c.sig;
      perKind[kind] = (perKind[kind] || 0) + 1;
    }
    grandKeep += keep; grandTrash += trash_;
    console.log(`${name} (${bucket}): ${cb.length} CB comments | keep ${keep} | trash ${trash_}  ${Object.keys(perKind).length ? JSON.stringify(perKind) : ''}`);
  }

  console.log(`\nPLAN: keep ${grandKeep}, trash ${grandTrash} duplicate CB runner comments across ${TARGETS.length} projects.`);
  if (!APPLY) { console.log('\nDRY RUN - nothing trashed. Re-run with --apply to execute.'); return; }

  let done = 0, failed = 0;
  for (const x of toTrash) {
    try { await trash(x.bucket, x.id); done++; if (done % 25 === 0) console.log(`  trashed ${done}/${toTrash.length}...`); }
    catch (e) { failed++; console.error(`  trash fail ${x.id}: ${e.message}`); }
  }
  console.log(`\nDONE: trashed ${done}, failed ${failed}, of ${toTrash.length} planned.`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
