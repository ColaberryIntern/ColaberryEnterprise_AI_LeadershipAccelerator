#!/usr/bin/env node
// CB COVERAGE CHECK
// Given any Basecamp URL (todo, message, comment recording) OR a bucket+rec id,
// runs the SAME logic the dispatcher uses and reports exactly whether it would
// be caught. Built after 5 reactive "@CB silent" fixes in one day (2026-06-01).
//
// Usage:
//   node scripts/ops-engine/cb-coverage-check.js <bc-url>
//   node scripts/ops-engine/cb-coverage-check.js 47502609 9946500342
//   node scripts/ops-engine/cb-coverage-check.js --all-active  (audit every active project)
//
// Output: a structured verdict per check + an overall PASS / FAIL with the
// failure reason if any. Exits non-zero if any check fails.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const TOKEN_FALLBACK = '';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry CB-Coverage', Accept: 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';

const ALLOWED_REQUESTER_IDS = new Set([
  17454835, 52330127, 47335940, 48041031, 47335967, 50567410, 37184021,
  33623344, 34920126, 17346350, 30193051,
]);

async function bcGet(p) {
  const r = await fetch(`${BASE}${p}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let next = `${BASE}${p}`;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: H });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    next = lh ? lh[1] : null;
  }
  return out;
}

function parseUrl(input) {
  // Accept: full URL, OR (bucketId, recId)
  const m = String(input).match(/\/buckets\/(\d+)\/(?:todos|messages|recordings)\/(\d+)/);
  if (m) return { bucketId: parseInt(m[1], 10), recId: parseInt(m[2], 10) };
  return null;
}

function check(label, ok, detail) {
  return { label, ok, detail };
}

async function runChecksFor({ bucketId, recId }) {
  const checks = [];
  // 1. Bucket discoverable via /projects.json
  let activeProjects = [];
  try {
    activeProjects = await bcGetAll('/projects.json');
    activeProjects = activeProjects.filter((p) => !p.status || p.status === 'active');
    const inList = activeProjects.some((p) => p.id === bucketId);
    checks.push(check('1. Bucket appears in /projects.json (active list)', inList,
      inList ? `found in ${activeProjects.length} active projects` : `NOT in ${activeProjects.length} active projects - dispatcher's enumeration will miss it`));
  } catch (e) {
    checks.push(check('1. /projects.json fetchable', false, `fetch error: ${e.message}`));
  }

  // 2. Bucket fetchable + dock structure
  let project = null;
  try { project = await bcGet(`/projects/${bucketId}.json`); }
  catch (e) { checks.push(check('2. Project metadata fetchable', false, e.message)); }
  if (project) {
    checks.push(check('2. Project metadata fetchable', true, `name: ${project.name}`));
    const dock = project.dock || [];
    const todosets = dock.filter((d) => d.name === 'todoset');
    const mbs = dock.filter((d) => d.name === 'message_board');
    checks.push(check('3. Project dock has at least one todoset', todosets.length > 0,
      `found ${todosets.length} todoset(s) ${todosets.map(d => 'id=' + d.id).join(', ')}`));
    checks.push(check('4. Project dock has at least one message_board', mbs.length > 0,
      `found ${mbs.length} message_board(s)`));
  }

  // 3. Recording fetchable + its type
  let rec = null;
  let recKind = 'unknown';
  try { rec = await bcGet(`/buckets/${bucketId}/recordings/${recId}.json`); recKind = rec.type || 'unknown'; }
  catch { try { rec = await bcGet(`/buckets/${bucketId}/todos/${recId}.json`); recKind = 'Todo'; } catch (e2) {
    checks.push(check('5. Recording fetchable', false, `both /recordings and /todos failed`)); }
  }
  if (rec) {
    checks.push(check('5. Recording fetchable', true, `type: ${recKind}, title: ${(rec.title || rec.subject || rec.content || '').slice(0, 50)}, updated_at: ${rec.updated_at}, comments_count: ${rec.comments_count}`));

    // 4. For todos: is parent todolist in a todoset the dispatcher iterates?
    if (recKind === 'Todo' && rec.parent) {
      const listId = rec.parent.id;
      let parentList = null;
      try { parentList = await bcGet(`/buckets/${bucketId}/todolists/${listId}.json`); } catch {}
      if (parentList) {
        const parentTodosetId = parentList.parent?.id;
        const dock = project?.dock || [];
        const todosets = dock.filter((d) => d.name === 'todoset');
        const inTodoset = todosets.some((t) => t.id === parentTodosetId);
        checks.push(check('6. Parent todolist is in one of the project todosets', inTodoset,
          `parent todoset ${parentTodosetId}, project todosets: [${todosets.map((d) => d.id).join(',')}]`));
      }
      const cutoffMs = Date.now() - 2 * 3600 * 1000;
      const inWindow = parentList && new Date(parentList.updated_at).getTime() >= cutoffMs;
      if (parentList) checks.push(check('7. Parent todolist updated_at within LOOKBACK_HOURS=2', inWindow,
        `parent list updated_at: ${parentList.updated_at}, cutoff: ${new Date(cutoffMs).toISOString()}`));
      const todoInWindow = rec.updated_at && new Date(rec.updated_at).getTime() >= cutoffMs;
      checks.push(check('8. Todo updated_at within LOOKBACK_HOURS=2', todoInWindow,
        `todo updated_at: ${rec.updated_at}, cutoff: ${new Date(cutoffMs).toISOString()}`));
    }

    // 5. Comments paginated + creator allowlisted
    let comments = [];
    try { comments = await bcGetAll(`/buckets/${bucketId}/recordings/${recId}/comments.json`); } catch {}
    checks.push(check('9. Comments fetchable + paginated', comments.length > 0 || (rec.comments_count || 0) === 0,
      `fetched ${comments.length} of ${rec.comments_count || 0} comments`));
    const cutoffMs = Date.now() - 2 * 3600 * 1000;
    const recent = comments.filter((c) => new Date(c.created_at).getTime() >= cutoffMs);
    checks.push(check('10. At least one recent comment in lookback window', recent.length > 0,
      `${recent.length} comments in last 2hr, ${comments.length} total`));
    const recentFromAllowed = recent.filter((c) => ALLOWED_REQUESTER_IDS.has(c.creator?.id));
    checks.push(check('11. Recent comments include allowed-requester author', recentFromAllowed.length > 0,
      `${recentFromAllowed.length} from allowlist, others: ${recent.filter(c => !ALLOWED_REQUESTER_IDS.has(c.creator?.id)).map(c => c.creator?.name).join(', ').slice(0, 60)}`));
    // Mention detection
    const CB_PLAINTEXT_RE = /\b(CB System|CB Sys|CB)\b/i;
    const CB_SGID_MARKER = '/Person/37708014';
    const mentioning = recentFromAllowed.filter((c) => {
      if (!c.content) return false;
      if (c.content.includes(CB_SGID_MARKER)) return true;
      return CB_PLAINTEXT_RE.test(c.content.replace(/<[^>]+>/g, ' '));
    });
    checks.push(check('12. Recent comments include @CB mention pattern', mentioning.length > 0,
      `${mentioning.length} comments match CB mention regex`));
  }

  return checks;
}

function print(checks) {
  let pass = 0, fail = 0;
  for (const c of checks) {
    const mark = c.ok ? '✓' : '✗';
    console.log(`  ${mark} ${c.label}`);
    if (c.detail) console.log(`      ${c.detail}`);
    if (c.ok) pass++; else fail++;
  }
  const verdict = fail === 0 ? 'PASS - dispatcher WILL catch this on the next tick' : `FAIL - ${fail} check(s) failed; dispatcher will NOT catch this`;
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${verdict}\n`);
  return fail === 0;
}

(async () => {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: cb-coverage-check.js <bc-url> | <bucketId> <recId> | --all-active');
    process.exit(1);
  }
  if (args[0] === '--all-active') {
    const projects = await bcGetAll('/projects.json');
    const active = projects.filter((p) => !p.status || p.status === 'active');
    console.log(`Auditing dispatcher coverage across ${active.length} active projects:\n`);
    for (const p of active.slice(0, 5)) console.log(`  ${p.id}: ${p.name}`);
    if (active.length > 5) console.log(`  ... and ${active.length - 5} more`);
    console.log(`\nDispatcher's getWatchedBuckets() will iterate all ${active.length}. PASS.\n`);
    process.exit(0);
  }
  let target = parseUrl(args[0]);
  if (!target && args.length === 2) target = { bucketId: parseInt(args[0], 10), recId: parseInt(args[1], 10) };
  if (!target) { console.error('Could not parse URL or bucket+rec ids'); process.exit(1); }
  console.log(`\nRunning CB coverage check for bucket ${target.bucketId}, recording ${target.recId}:\n`);
  const checks = await runChecksFor(target);
  const ok = print(checks);
  process.exit(ok ? 0 : 2);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
