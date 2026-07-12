#!/usr/bin/env node
/**
 * One-off: clean up the duplicate CB-System replies produced by the
 * 2026-06-15 inbound-dispatcher loop (root cause + fix in inbound-dispatcher.js).
 *
 * Two protection signals decide what survives on each affected recording; a CB
 * reply is TRASHED only if it is protected by NEITHER:
 *
 *   (a) Earliest-per-addressee: the first in-window CB reply to each Person is
 *       kept (the legitimate first answer, even if the tick that posted it never
 *       logged - timed-out ticks posted but skipped their log line).
 *   (b) Log first-invocation match: cb-handler-log.jsonl records, per parent
 *       mention (comment_id), the timestamp of every handler invocation. The
 *       FIRST invocation per comment_id is the legitimate answer; we protect the
 *       CB comment posted within MATCH_TOL_MS of it. This preserves a person's
 *       MULTIPLE distinct mentions (e.g. Ali's two LandJet questions) and every
 *       legit post-fix reply (distinct new mentions answered once after the fix).
 *
 * Everything else in the loop window on these 3 recordings is a re-answer to an
 * already-answered mention = a loop duplicate, and is trashed.
 *
 * SAFETY:
 *   - Restricted to the 3 affected recordings (TARGETS). Nothing else is read.
 *   - Hard DATE_FLOOR: never touches a comment created before the loop window
 *     (daily 15:00 updates and all historical replies are excluded outright).
 *   - Only trashes CB-System-authored comments (creator id 37708014).
 *   - Never trashes a non-mention ("none") comment.
 *   - Trash (PUT status/trashed) is recoverable in Basecamp for 30 days.
 *   - --dry (default) prints the plan and deletes nothing. Pass --apply to act.
 */
const fs = require('fs');
const path = require('path');

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const CB_SYSTEM_ID = 37708014;
const APPLY = process.argv.includes('--apply');
const LOG_PATH = path.resolve(__dirname, '../../tmp/ops-engine/cb-handler-log.jsonl');
const MATCH_TOL_MS = 90 * 1000;
const DATE_FLOOR = Date.parse('2026-06-14T23:00:00Z');

const TARGETS = [
  { bucket: 47502609, rec: 9946499000, name: 'Launch PMO' },
  { bucket: 47502609, rec: 9946499054, name: 'Launch PMO' },
  { bucket: 46699826, rec: 9946698771, name: 'LandJet' },
];

let TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
if (!TOKEN) { console.error('BASECAMP_ACCESS_TOKEN required'); process.exit(1); }
if (TOKEN.toLowerCase().startsWith('bearer ')) TOKEN = TOKEN.slice(7).trim();
const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry CB Dup Cleanup', Accept: 'application/json', 'Content-Type': 'application/json' });

async function bcGetAll(p) {
  let next = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: H() });
    if (!r.ok) throw new Error(`GET ${next} -> ${r.status}`);
    out.push(...(await r.json()));
    const m = (r.headers.get('Link') || '').match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}
async function trash(bucket, recId) {
  const r = await fetch(`${BASE}/buckets/${bucket}/recordings/${recId}/status/trashed.json`, { method: 'PUT', headers: H() });
  if (!r.ok && r.status !== 204) throw new Error(`trash ${recId} -> ${r.status} ${await r.text()}`);
  return true;
}
function addresseeId(html) {
  const m = (html || '').match(/<bc-attachment\s+sgid="([^"]+)"[^>]*content-type="application\/vnd\.basecamp\.mention"/i);
  if (!m) return 'none';
  try {
    const decoded = Buffer.from(m[1].split('--')[0], 'base64').toString('utf8');
    const pm = decoded.match(/\/Person\/(\d+)/);
    return pm ? pm[1] : 'none';
  } catch { return 'none'; }
}
// First-invocation timestamp per comment_id, grouped by recording.
function logKeeperTimestampsByRec() {
  const byComment = {};
  for (const line of fs.readFileSync(LOG_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!o.comment_id || !o.rec_id || !o.ts) continue;
    (byComment[o.comment_id] = byComment[o.comment_id] || []).push({ ts: new Date(o.ts).getTime(), rec: o.rec_id });
  }
  const byRec = {};
  for (const arr of Object.values(byComment)) {
    arr.sort((a, b) => a.ts - b.ts);
    const first = arr[0];
    (byRec[first.rec] = byRec[first.rec] || []).push(first.ts);
  }
  return byRec;
}

(async () => {
  console.log(`CB duplicate-reply cleanup  mode=${APPLY ? 'APPLY (trashing)' : 'DRY RUN'}`);
  console.log(`Floor: ${new Date(DATE_FLOOR).toISOString()}  match tol: ${MATCH_TOL_MS / 1000}s\n`);
  const keeperTsByRec = logKeeperTimestampsByRec();
  const toTrash = [];

  for (const { bucket, rec, name } of TARGETS) {
    let comments;
    try { comments = await bcGetAll(`/buckets/${bucket}/recordings/${rec}/comments.json`); }
    catch (e) { console.error(`  fetch fail rec ${rec}: ${e.message}`); continue; }
    const cb = comments
      .filter((c) => c.creator && c.creator.id === CB_SYSTEM_ID && Date.parse(c.created_at) >= DATE_FLOOR)
      .map((c) => ({ id: c.id, t: Date.parse(c.created_at), created_at: c.created_at, who: addresseeId(c.content), claimed: false }))
      .sort((a, b) => a.t - b.t);

    const protectedIds = new Set();
    // (a) earliest per addressee (skip 'none' entirely - never trashed)
    const seenWho = new Set();
    for (const c of cb) {
      if (c.who === 'none') { protectedIds.add(c.id); continue; }
      if (!seenWho.has(c.who)) { seenWho.add(c.who); protectedIds.add(c.id); }
    }
    // (b) match each log first-invocation ts to the nearest in-window CB comment
    const keeperTs = (keeperTsByRec[rec] || []).slice().sort((a, b) => a - b);
    for (const ts of keeperTs) {
      let best = null, bestD = Infinity;
      for (const c of cb) { const d = Math.abs(c.t - ts); if (d < bestD) { bestD = d; best = c; } }
      if (best && bestD <= MATCH_TOL_MS) protectedIds.add(best.id);
    }

    const trashHere = cb.filter((c) => c.who !== 'none' && !protectedIds.has(c.id));
    for (const c of trashHere) toTrash.push({ bucket, id: c.id });
    console.log(`Recording ${rec} (${name}): ${cb.length} CB in window | protected ${protectedIds.size} (keep) | trash ${trashHere.length}`);
  }

  console.log(`\nPLAN: trash ${toTrash.length} duplicate CB replies across ${TARGETS.length} recordings.`);
  if (!APPLY) { console.log('\nDRY RUN - nothing trashed. Re-run with --apply to execute.'); return; }

  let done = 0, failed = 0;
  for (const t of toTrash) {
    try { await trash(t.bucket, t.id); done++; if (done % 25 === 0) console.log(`  trashed ${done}/${toTrash.length}...`); }
    catch (e) { failed++; console.error(`  trash fail ${t.id}: ${e.message}`); }
  }
  console.log(`\nDONE: trashed ${done}, failed ${failed}, of ${toTrash.length} planned.`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
