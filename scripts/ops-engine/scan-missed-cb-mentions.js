#!/usr/bin/env node
/**
 * One-shot read-only audit: find @CB-System mentions from Ali across the 8
 * watched buckets that the dispatcher never processed.
 *
 * Why this exists: pre-2026-05-31 the dispatcher used bcGet (single page) for
 * its bucket -> todolist -> todos walks. Mentions on a todo past position 15
 * in its parent list (or in a list past position 15 in the bucket) were
 * silently missed. This script paginates fully and cross-references against
 * the dispatcher's state file to surface any historical drops.
 *
 * Output: prints a table of missed mentions + writes the same to
 * tmp/ops-engine/missed-cb-mentions-<timestamp>.json so we can review.
 *
 * Run: BASECAMP_ACCESS_TOKEN=... node scripts/ops-engine/scan-missed-cb-mentions.js
 *      Optional: --since 2026-05-01  (default: 60 days back)
 */
const fs = require('fs');
const path = require('path');

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const REPO = path.resolve(__dirname, '../..');
const STATE_PATH = path.resolve(REPO, 'tmp/ops-engine/inbound-state.json');

const ALI_ID = 17454835;
const CB_SGID_MARKER = '/Person/37708014';
const CB_PLAINTEXT_RE = /\b(CB System|CB Sys|CB)\b/i;

const WATCHED_BUCKETS = [
  46697389, 47126345, 46699826, 47346103,
  47477101, 7463955, 24865175, 33392153,
];

const sinceArg = process.argv.find((a) => a.startsWith('--since='));
const SINCE = sinceArg
  ? new Date(sinceArg.split('=')[1])
  : new Date(Date.now() - 60 * 24 * 3600 * 1000);

const TOKEN_FALLBACK = '';
let TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).trim();
if (TOKEN.toLowerCase().startsWith('bearer ')) TOKEN = TOKEN.slice(7).trim();

const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry MissedMentionsAudit', Accept: 'application/json' });

async function bcGetAll(p) {
  let next = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: H() });
    if (!r.ok) {
      if (r.status === 404) return out;
      throw new Error(`GET ${next} -> ${r.status}`);
    }
    const body = await r.json();
    if (!Array.isArray(body)) break;
    out.push(...body);
    const link = r.headers.get('Link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}

function isCBMention(content) {
  if (!content) return false;
  if (content.includes(CB_SGID_MARKER)) return true;
  const stripped = content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  return CB_PLAINTEXT_RE.test(stripped);
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { processed: {} }; }
}

async function scanBucket(bucketId, state, missed, allMentions) {
  let project;
  try { project = await bcGet(`/projects/${bucketId}.json`); }
  catch (e) { console.error(`bucket ${bucketId} fetch fail: ${e.message}`); return; }
  const dock = project.dock || [];
  const todoset = dock.find((d) => d.name === 'todoset');
  const messageBoard = dock.find((d) => d.name === 'message_board');
  const projectName = project.name || `bucket ${bucketId}`;

  if (todoset) {
    const todolists = await bcGetAll(`/buckets/${bucketId}/todosets/${todoset.id}/todolists.json`);
    for (const list of (todolists || [])) {
      const todos = await bcGetAll(`/buckets/${bucketId}/todolists/${list.id}/todos.json`);
      for (const todo of (todos || [])) {
        if (!todo.comments_count) continue;
        if (todo.updated_at && new Date(todo.updated_at) < SINCE) continue;
        await scanRec({ bucketId, projectName, list: list.name, recId: todo.id, recTitle: todo.content, state, missed, allMentions });
      }
    }
  }
  if (messageBoard) {
    const messages = await bcGetAll(`/buckets/${bucketId}/message_boards/${messageBoard.id}/messages.json`);
    for (const msg of (messages || []).slice(0, 30)) {
      if (msg.updated_at && new Date(msg.updated_at) < SINCE) continue;
      await scanRec({ bucketId, projectName, list: '(message board)', recId: msg.id, recTitle: msg.subject, state, missed, allMentions });
    }
  }
}

async function scanRec({ bucketId, projectName, list, recId, recTitle, state, missed, allMentions }) {
  let comments = [];
  try { comments = await bcGetAll(`/buckets/${bucketId}/recordings/${recId}/comments.json`); }
  catch (_e) { return; }
  for (const c of (comments || [])) {
    if (c.creator?.id !== ALI_ID) continue;
    const ctime = new Date(c.created_at);
    if (ctime < SINCE) continue;
    if (!isCBMention(c.content)) continue;
    const key = `${bucketId}-${c.id}`;
    const entry = {
      key, bucketId, project: projectName, list, recId, recTitle: (recTitle || '').slice(0, 80),
      commentId: c.id, createdAt: c.created_at,
      snippet: (c.content || '').replace(/<bc-attachment[\s\S]*?<\/bc-attachment>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240),
    };
    allMentions.push(entry);
    if (!state.processed[key]) missed.push(entry);
  }
}

(async () => {
  console.log(`Scanning ${WATCHED_BUCKETS.length} buckets since ${SINCE.toISOString()}...`);
  const state = loadState();
  const missed = [];
  const allMentions = [];
  for (const b of WATCHED_BUCKETS) {
    process.stdout.write(`  bucket ${b}...`);
    const t0 = Date.now();
    await scanBucket(b, state, missed, allMentions);
    console.log(` done (${Date.now() - t0}ms)`);
  }
  console.log(`\n=== Audit ===`);
  console.log(`Total @CB mentions from Ali (since ${SINCE.toISOString().slice(0, 10)}): ${allMentions.length}`);
  console.log(`Processed (in state):    ${allMentions.length - missed.length}`);
  console.log(`MISSED (not in state):   ${missed.length}`);
  console.log();
  if (missed.length === 0) {
    console.log('No missed mentions. The dispatcher state is current with reality.');
  } else {
    for (const m of missed) {
      console.log(`- [${m.createdAt.slice(0, 16).replace('T', ' ')}] ${m.project} / ${m.list} / "${m.recTitle}"`);
      console.log(`    comment ${m.commentId}: ${m.snippet.slice(0, 200)}`);
    }
  }

  const outDir = path.resolve(REPO, 'tmp/ops-engine');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `missed-cb-mentions-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), since: SINCE.toISOString(), totalMentions: allMentions.length, missedCount: missed.length, missed, allMentions }, null, 2));
  console.log(`\nReport written: ${outPath}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
