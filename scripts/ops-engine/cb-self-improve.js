#!/usr/bin/env node
/**
 * CB SELF-IMPROVE - re-answer past @CB mentions with the fixed engine, but only
 * repost when the new answer is materially BETTER/DIFFERENT than what was
 * already posted. Same answer -> leave it alone (no duplicate noise).
 *
 * Rules (per Ali, 2026-06-10):
 *  - Look back N days (default 5) over the handler audit log.
 *  - Regenerate each reply with the deployed (fixed) handler.
 *  - If the originally-posted reply was DEFECTIVE (leaked tool-call scaffolding)
 *    OR the new answer differs materially from the old (word-similarity below
 *    threshold), repost the new answer with a short "self-improving" preamble
 *    that tags the original asker. For leaked replies, also trash the garbage.
 *  - If the new answer is essentially the same, skip.
 *
 * SAFETY: regeneration runs the handler with bcPost STUBBED and Mandrill
 * DISABLED, so reprocessing never re-fires the original side effects (no
 * re-sent emails, no re-queued todos). Only the reply comment is (re)posted,
 * by THIS script, and only when the gate says so.
 *
 * Usage:
 *   node scripts/ops-engine/cb-self-improve.js --days 5            # DRY (default): preview decisions
 *   node scripts/ops-engine/cb-self-improve.js --days 5 --live     # actually post
 *   node scripts/ops-engine/cb-self-improve.js --days 5 --min-sim 0.6
 *
 * Needs BASECAMP_ACCESS_TOKEN + OPENAI_API_KEY (via cron-env-wrapper on the VPS).
 */
const fs = require('fs');
const path = require('path');
const { handleOpenEnded } = require('./cb-system-handler');
const { buildMention, looksLikeToolCallLeak } = require('./cb-reply-sanitizer');

const REPO = path.resolve(__dirname, '../..');
const LOG_PATH = path.resolve(REPO, 'tmp/ops-engine/cb-handler-log.jsonl');
const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const ALI_ID = 17454835;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';

const argv = process.argv.slice(2);
const DAYS = (() => { const i = argv.indexOf('--days'); return i >= 0 ? parseFloat(argv[i + 1]) || 5 : 5; })();
const MIN_SIM = (() => { const i = argv.indexOf('--min-sim'); return i >= 0 ? parseFloat(argv[i + 1]) : 0.3; })();
const LIVE = argv.includes('--live');
// By default we ONLY correct replies that were genuinely broken (leaked
// scaffolding or empty). Free-text regeneration almost always re-words the
// answer, so "low word-similarity" alone is NOT a good signal that the new
// answer is BETTER - it usually just means different wording, and reposting
// paraphrases spams live threads. --include-different opts into the broader
// "repost anything substantially reworded" behavior (sim < MIN_SIM).
const INCLUDE_DIFF = argv.includes('--include-different');

function strip(html) { return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
// Jaccard word similarity on the human-readable text (ignores HTML + the mention tag).
function similarity(a, b) {
  const wa = new Set(strip(a).toLowerCase().split(/\W+/).filter(Boolean));
  const wb = new Set(strip(b).toLowerCase().split(/\W+/).filter(Boolean));
  if (wa.size === 0 && wb.size === 0) return 1;
  let inter = 0; for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / (wa.size + wb.size - inter);
}

function token() { const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim(); if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required'); return t; }
const H = () => ({ Authorization: `Bearer ${token()}`, 'User-Agent': 'Colaberry CB-SelfImprove', Accept: 'application/json', 'Content-Type': 'application/json' });
async function bcGet(p) { const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H() }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
async function bcGetAll(p) { let next = p.startsWith('http') ? p : BASE + p; const out = []; while (next) { const r = await fetch(next, { headers: H() }); if (!r.ok) break; const pg = await r.json(); if (!Array.isArray(pg)) break; out.push(...pg); const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/); next = lh ? lh[1] : null; } return out; }
async function bcPostReal(p, body) { const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(body) }); if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`); return r.json(); }
async function bcTrash(recId, bucketId) { const r = await fetch(`${BASE}/buckets/${bucketId}/recordings/${recId}/status/trashed.json`, { method: 'PUT', headers: H() }); return r.status; }

function readLog() {
  let raw; try { raw = fs.readFileSync(LOG_PATH, 'utf8'); } catch (e) { console.error(`log unreadable: ${e.message}`); process.exit(1); }
  return raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// Regenerate a reply for one historical mention WITHOUT firing real side effects.
async function regenerate({ bucketId, recId, comment }) {
  const posts = [];
  const dryPost = async (p, body) => { posts.push({ p, body }); return { id: `dry-${posts.length}`, app_url: '(dry)' }; };
  // Mandrill disabled during regeneration so email_ali is a no-op; handler
  // log suppressed so dry re-runs don't pollute the audit trail.
  const savedMandrill = process.env.MANDRILL_API_KEY; delete process.env.MANDRILL_API_KEY;
  process.env.CB_SUPPRESS_HANDLER_LOG = '1';
  try {
    if (comment.creator && !comment.creator.attachable_sgid && comment.creator.id) {
      try { const f = await bcGet(`/people/${comment.creator.id}.json`); if (f?.attachable_sgid) comment.creator.attachable_sgid = f.attachable_sgid; } catch (_e) {}
    }
    const mention = () => buildMention(comment.creator, { fallbackSgid: ALI_SGID });
    await handleOpenEnded({ bcGet, bcPost: dryPost, mention, bucketId, recId, comment, aliId: ALI_ID });
  } finally { if (savedMandrill !== undefined) process.env.MANDRILL_API_KEY = savedMandrill; }
  // The reply is the comment post that is NOT the queue_followup note.
  const replyPost = [...posts].reverse().find((x) => /\/comments\.json$/.test(x.p) && !/FOLLOWUP for next Claude Code session/.test(x.body.content || ''));
  return replyPost ? replyPost.body.content : null;
}

(async () => {
  const cutoff = Date.now() - DAYS * 24 * 3600 * 1000;
  const entries = readLog().filter((e) => e.ts && new Date(e.ts).getTime() >= cutoff && e.rec_id && e.bucket_id && e.comment_id);
  console.log(`\nCB SELF-IMPROVE  (last ${DAYS}d, ${LIVE ? 'LIVE' : 'DRY preview'}, min-sim ${MIN_SIM})`);
  console.log(`${entries.length} logged invocations in window\n${'='.repeat(60)}`);

  const actedRecs = new Set();
  let reposted = 0, skipped = 0, failed = 0;

  for (const e of entries) {
    const oldReply = (e.side_effects && e.side_effects.repliedHtml) || '';
    const tag = `rec ${e.rec_id} @ ${(e.ts || '').slice(0, 19)}`;
    if (actedRecs.has(e.rec_id)) { console.log(`- ${tag}: skip (already acted on this thread this run)`); skipped += 1; continue; }

    // Gate on DEFECT first, before spending a regeneration. A defective old
    // reply (leaked scaffolding or empty) is the unambiguous "much worse"
    // case worth fixing. Reworded-but-fine replies are left alone unless the
    // operator explicitly opts into --include-different.
    const wasDefect = looksLikeToolCallLeak(oldReply) || !oldReply;
    if (!wasDefect && !INCLUDE_DIFF) { console.log(`- ${tag}: SKIP - old reply was substantively fine (left alone)`); skipped += 1; continue; }

    let comment;
    try {
      if (e.comment_id === e.rec_id) {
        // The @CB mention was on the recording body itself (a message), not a comment.
        const rec = await bcGet(`/buckets/${e.bucket_id}/recordings/${e.rec_id}.json`);
        comment = { id: rec.id, content: rec.content || rec.title || '', creator: rec.creator, created_at: rec.created_at };
      } else {
        // Find the specific triggering comment within the thread's comment list.
        const comments = await bcGetAll(`/buckets/${e.bucket_id}/recordings/${e.rec_id}/comments.json`);
        const c = comments.find((x) => x.id === e.comment_id);
        if (!c) throw new Error(`comment ${e.comment_id} not found among ${comments.length} comments`);
        comment = { id: c.id, content: c.content || '', creator: c.creator, created_at: c.created_at };
      }
    } catch (err) { console.log(`- ${tag}: SKIP (cannot fetch triggering comment: ${err.message})`); failed += 1; continue; }

    let newReply;
    try { newReply = await regenerate({ bucketId: e.bucket_id, recId: e.rec_id, comment }); }
    catch (err) { console.log(`- ${tag}: SKIP (regen failed: ${err.message})`); failed += 1; continue; }
    if (!newReply) { console.log(`- ${tag}: SKIP (no reply generated)`); failed += 1; continue; }

    const sim = similarity(oldReply, newReply);
    const materiallyDifferent = INCLUDE_DIFF && sim < MIN_SIM;
    const shouldRepost = wasDefect || materiallyDifferent;
    const reason = wasDefect ? (oldReply ? 'old reply had leaked scaffolding' : 'old reply was empty') : (materiallyDifferent ? `materially different (sim ${sim.toFixed(2)})` : `same answer (sim ${sim.toFixed(2)})`);

    if (!shouldRepost) { console.log(`- ${tag}: SKIP - ${reason}`); skipped += 1; continue; }

    console.log(`- ${tag}: REPOST - ${reason}`);
    console.log(`    requester: ${comment.creator?.name || 'unknown'}`);
    console.log(`    new: ${strip(newReply).slice(0, 140)}`);
    if (!LIVE) { actedRecs.add(e.rec_id); reposted += 1; continue; }

    // LIVE: trash the leaked garbage (if any), then post the better answer.
    try {
      if (looksLikeToolCallLeak(oldReply)) {
        const comments = await bcGetAll(`/buckets/${e.bucket_id}/recordings/${e.rec_id}/comments.json`);
        const garbage = comments.find((c) => looksLikeToolCallLeak(c.content || ''));
        if (garbage) { const code = await bcTrash(garbage.id, e.bucket_id); console.log(`    trashed leaked comment ${garbage.id} -> ${code}`); }
      }
      const preamble = `<div><em>CB System, self-improving: I revisited this and have a clearer answer than my earlier reply.</em></div><div><br></div>`;
      await bcPostReal(`/buckets/${e.bucket_id}/recordings/${e.rec_id}/comments.json`, { content: preamble + newReply });
      console.log('    posted corrected reply');
      actedRecs.add(e.rec_id); reposted += 1;
    } catch (err) { console.log(`    POST FAILED: ${err.message}`); failed += 1; }
  }

  console.log(`\n${'='.repeat(60)}\n${LIVE ? 'Posted' : 'Would post'}: ${reposted}   Skipped: ${skipped}   Failed: ${failed}\n`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
