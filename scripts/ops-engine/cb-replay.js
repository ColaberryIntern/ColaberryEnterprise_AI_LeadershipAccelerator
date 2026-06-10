#!/usr/bin/env node
/**
 * CB REPLAY - dry-run the fixed handler against a real Basecamp thread.
 *
 * Fetches the real recording + comments, resolves the correct requester
 * @-mention, runs handleOpenEnded with bcPost STUBBED so NOTHING is written to
 * Basecamp, and prints the exact HTML that WOULD have been posted. Use it to
 * verify a fix before it goes live.
 *
 * Modes:
 *   Live dry-run (needs BASECAMP_ACCESS_TOKEN + OPENAI_API_KEY):
 *     node scripts/ops-engine/cb-replay.js <bc-url>
 *     node scripts/ops-engine/cb-replay.js 47502609 9946499609
 *
 *   Offline reconstruction (no token, no OpenAI) - proves the sanitizer +
 *   mention fix against a captured leak string:
 *     node scripts/ops-engine/cb-replay.js --offline-screenshot
 *
 * NEVER posts. Read-only on Basecamp, plus at most one OpenAI completion.
 */
const path = require('path');
const { handleOpenEnded } = require('./cb-system-handler');
const { buildMention, sanitizeReplyHtml } = require('./cb-reply-sanitizer');

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const ALI_ID = 17454835;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
const CB_SGID_MARKER = '/Person/37708014';
const CB_PLAINTEXT_RE = /\b(CB System|CB Sys|CB)\b/i;
const ALLOWED = new Set([17454835, 52330127, 47335940, 48041031, 47335967, 50567410, 37184021, 33623344, 34920126, 17346350, 30193051]);

function isCBMention(content) {
  if (!content) return false;
  if (content.includes(CB_SGID_MARKER)) return true;
  return CB_PLAINTEXT_RE.test(content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
}

// ---------------------------------------------------------------------------
// Offline reconstruction: prove the fix against the exact screenshot leak.
// ---------------------------------------------------------------------------
function offlineScreenshot() {
  const LEAK = `functions.basecamp_reply({
content_html: "
Ram, the 12-week structure is designed to provide a comprehensive learning experience, but your point about leading with the 3-week milestone is valid. Highlighting the initial 3-week goal of building the first AI system could attract those looking for a shorter commitment. This can be positioned as a quick win within the broader 12-week program. I recommend discussing this adjustment with the marketing team to see how it can be incorporated into the landing page strategy.
"
});
functions.finish();`;
  const ram = { id: 17346350, name: 'Ram Katamaraja', attachable_sgid: 'SGID_RAM_EXAMPLE' };
  const mention = buildMention(ram, { fallbackSgid: ALI_SGID });
  const { html, wasLeak } = sanitizeReplyHtml(LEAK);
  let body = html;
  if (!/<[a-z][\s\S]*>/i.test(body)) body = body.replace(/\n/g, '<br>');
  body = `<div>${mention} ${body}</div>`;

  console.log('\n=== OFFLINE RECONSTRUCTION (todo 9946499609) ===\n');
  console.log('--- BEFORE (what was actually posted) ---');
  console.log('@Ali  functions.basecamp_reply({ content_html: "Ram, ..." }); functions.finish();');
  console.log('  ^ wrong person tagged (Ali) + raw tool-call scaffolding leaked\n');
  console.log('--- AFTER (with the fix) ---');
  console.log('was a tool-call leak?', wasLeak);
  console.log('mention now resolves to:', ram.name, `(sgid ${ram.attachable_sgid}, not Ali)`);
  console.log('posted body:\n' + body + '\n');
  const clean = !/functions?\.\w+\s*\(|content_html\s*:|finish\s*\(\s*\)/.test(body) && body.includes('SGID_RAM_EXAMPLE');
  console.log(clean ? '✓ PASS - no scaffolding, asker tagged correctly' : '✗ FAIL');
  process.exit(clean ? 0 : 2);
}

// ---------------------------------------------------------------------------
// Live dry-run against a real recording.
// ---------------------------------------------------------------------------
function parseTarget(args) {
  const m = String(args[0] || '').match(/\/buckets\/(\d+)\/(?:todos|messages|recordings)\/(\d+)/);
  if (m) return { bucketId: +m[1], recId: +m[2] };
  if (args.length >= 2 && /^\d+$/.test(args[0]) && /^\d+$/.test(args[1])) return { bucketId: +args[0], recId: +args[1] };
  return null;
}

async function liveDryRun({ bucketId, recId, sayText, asId }) {
  const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
  if (!TOKEN) { console.error('BASECAMP_ACCESS_TOKEN required for live dry-run'); process.exit(1); }
  if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY required for live dry-run'); process.exit(1); }
  const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry CB-Replay', Accept: 'application/json', 'Content-Type': 'application/json' };

  async function bcGet(p) {
    const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H });
    if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
    return r.json();
  }
  async function bcGetAll(p) {
    let next = p.startsWith('http') ? p : BASE + p; const out = [];
    while (next) {
      const r = await fetch(next, { headers: H }); if (!r.ok) break;
      const page = await r.json(); if (!Array.isArray(page)) break; out.push(...page);
      const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/); next = lh ? lh[1] : null;
    }
    return out;
  }
  // STUB: capture, never POST.
  const posts = [];
  async function bcPost(p, body) { posts.push({ path: p, body }); return { id: `dry-${posts.length}`, app_url: '(dry)' }; }

  // Synthetic mode: inject a hypothetical @CB comment to test routing without
  // touching any real comment. Still uses the real bucket/thread for context.
  let comment = null;
  if (sayText) {
    let creator = { id: asId || ALI_ID, name: asId ? `id:${asId}` : 'Ali Muwwakkil' };
    try { const full = await bcGet(`/people/${creator.id}.json`); if (full) creator = full; } catch (_e) {}
    comment = { id: recId, content: sayText, creator, created_at: new Date().toISOString() };
  }

  // Identify the triggering @CB comment: the most recent allowed-requester
  // comment that mentions CB. Fall back to the recording body itself.
  try {
    if (comment) throw new Error('synthetic');
    const comments = await bcGetAll(`/buckets/${bucketId}/recordings/${recId}/comments.json`);
    const hit = [...comments].reverse().find((c) => ALLOWED.has(c.creator?.id) && isCBMention(c.content));
    if (hit) comment = hit;
  } catch (_e) {}
  if (!comment) {
    const rec = await bcGet(`/buckets/${bucketId}/recordings/${recId}.json`);
    comment = { id: rec.id, content: rec.content || rec.title || '', creator: rec.creator, created_at: rec.created_at };
  }

  // Resolve requester sgid (mirrors the dispatcher).
  if (comment.creator && !comment.creator.attachable_sgid && comment.creator.id) {
    try { const full = await bcGet(`/people/${comment.creator.id}.json`); if (full?.attachable_sgid) comment.creator.attachable_sgid = full.attachable_sgid; } catch (_e) {}
  }
  const mention = () => buildMention(comment.creator, { fallbackSgid: ALI_SGID });

  console.log(`\n=== LIVE DRY-RUN  bucket ${bucketId} / rec ${recId} ===`);
  console.log(`Requester: ${comment.creator?.name || 'unknown'} (id ${comment.creator?.id})`);
  console.log(`Mention resolves to: ${comment.creator?.attachable_sgid ? comment.creator.name + ' (own sgid)' : 'FALLBACK Ali'}`);
  console.log(`Triggering comment: ${(comment.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}\n`);

  const result = await handleOpenEnded({ bcGet, bcPost, mention, bucketId, recId, comment, aliId: ALI_ID });

  console.log('--- WOULD POST (no write happened) ---');
  if (!posts.length) console.log('(handler made no posts)');
  posts.forEach((p, i) => {
    console.log(`\n[post ${i + 1}] ${p.path}`);
    console.log(p.body.content || JSON.stringify(p.body));
  });
  console.log(`\nhandler summary: ${result.summary}`);
  const leaked = posts.some((p) => /functions?\.\w+\s*\(|content_html\s*:/.test(p.body.content || ''));
  console.log(leaked ? '\n✗ scaffolding leaked into a post - investigate' : '\n✓ no tool-call scaffolding in any post');
}

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--offline-screenshot') return offlineScreenshot();
  const target = parseTarget(args);
  if (!target) {
    console.log('Usage: cb-replay.js <bc-url> | <bucketId> <recId> [--say "comment" --as <personId>] | --offline-screenshot');
    process.exit(1);
  }
  const sayIdx = args.indexOf('--say');
  const asIdx = args.indexOf('--as');
  await liveDryRun({
    ...target,
    sayText: sayIdx >= 0 ? args[sayIdx + 1] : null,
    asId: asIdx >= 0 ? parseInt(args[asIdx + 1], 10) : null,
  });
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
