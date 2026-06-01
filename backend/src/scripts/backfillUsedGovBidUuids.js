#!/usr/bin/env node
// Scan the Gov Contracts BC project's todolists for any "Opportunity UUID: <uuid>"
// already recorded in the description and seed tmp/op-pulse/used-uuids.json
// so those bids are excluded from future "find me N gov bids" recommendations.
// Idempotent.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { _readUsedUuids, _markUuidUsed } = require(path.resolve(__dirname, './lib/govBidOps'));

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry GovBidUuidBackfill', Accept: 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';
const PROJECT_ID = 47346103;

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

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// Title-similarity helpers for matching legacy BC todolists (no UUID in
// description) against Opp Pulse opportunities.
function normalizeTitle(s) {
  return (s || '').toLowerCase()
    .replace(/\bRFP\b/gi, '').replace(/\bRequest for proposal\b/gi, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(s) { return new Set(normalizeTitle(s).split(' ').filter((w) => w.length >= 4)); }
function jaccard(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / new Set([...ta, ...tb]).size;
}

(async () => {
  const fs = require('fs');
  const beforeCount = Object.keys(_readUsedUuids()).length;
  console.log(`[backfill] starting. used-uuids.json has ${beforeCount} entries before run.`);

  // Load Opp Pulse opportunities for title-matching fallback.
  let oppPulseOpps = [];
  try {
    const allOpps = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/op-pulse/all-opps.json'), 'utf8'));
    oppPulseOpps = allOpps.data || [];
  } catch (e) {
    console.warn(`  could not read Opp Pulse cache (${e.message}). Title-match fallback disabled.`);
  }
  console.log(`[backfill] loaded ${oppPulseOpps.length} Opp Pulse opportunities for title-match fallback`);

  const proj = await bcGet(`/projects/${PROJECT_ID}.json`);
  const tset = proj.dock.find((d) => d.name === 'todoset');
  const lists = await bcGetAll(`/buckets/${PROJECT_ID}/todosets/${tset.id}/todolists.json`);
  console.log(`[backfill] scanning ${lists.length} todolists in Gov Contracts...\n`);

  let directHits = 0;
  let titleMatches = 0;
  let skippedCount = 0;
  for (const list of lists) {
    let full;
    try { full = await bcGet(`/buckets/${PROJECT_ID}/todolists/${list.id}.json`); }
    catch { continue; }
    const desc = full.description || '';
    const title = full.name || '';

    // Pass 1: UUID directly in description.
    const m = desc.match(UUID_RE);
    if (m) {
      const uuid = m[1].toLowerCase();
      _markUuidUsed(uuid, { title, bcListId: list.id, bcListUrl: list.app_url, source: 'backfill-direct-uuid' });
      directHits++;
      console.log(`  [uuid] ${uuid} | ${title.slice(0, 60)}`);
      continue;
    }

    // Pass 2: fuzzy title match against Opp Pulse cache. Threshold 0.45 of token Jaccard.
    let best = null;
    let bestScore = 0;
    for (const opp of oppPulseOpps) {
      const score = jaccard(title, opp.title);
      if (score > bestScore) { bestScore = score; best = opp; }
    }
    if (best && bestScore >= 0.45) {
      _markUuidUsed(best.id, { title, bcListId: list.id, bcListUrl: list.app_url, source: `backfill-title-match score=${bestScore.toFixed(2)}`, oppPulseTitle: best.title });
      titleMatches++;
      console.log(`  [title ${bestScore.toFixed(2)}] ${best.id} | "${title.slice(0, 40)}" -> "${best.title.slice(0, 40)}"`);
      continue;
    }

    skippedCount++;
    console.log(`  [skip] no match | "${title.slice(0, 60)}"`);
  }

  const afterCount = Object.keys(_readUsedUuids()).length;
  console.log(`\n[backfill] direct UUID hits: ${directHits}, fuzzy title matches: ${titleMatches}, unmatched: ${skippedCount}`);
  console.log(`[backfill] used-uuids.json: ${beforeCount} -> ${afterCount} (+${afterCount - beforeCount})`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
