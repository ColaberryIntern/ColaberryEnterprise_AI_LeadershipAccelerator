#!/usr/bin/env node
// Backfill due_on dates for the 4 open todos I created this session
// (CC-20260603-v7da) without setting due dates. Ali: "Make sure all task
// you create has due dates. Don't create any tasks without due date.
// Backfill."
//
// Session inventory:
//   Closed (no backfill needed):
//     9959857596 - Voice tier follow-up (closed - deferred to v2)
//     9959857610 - P4 retrospective follow-up (closed - went live)
//
//   Open (NEED backfill):
//     9960380028 - [Tracking] Daily 24h retrospective (meta tracker)
//     9961144502 - Inbox Manager Phase 2 P2 aggregator
//     9961144512 - Inbox Manager Phase 3 action extraction
//     9961144526 - Inbox Manager Phase 5 weekly stats dashboard
//
// 24 Anthropic cohort onboarding todos (4 per person x 6 people) ALREADY
// have due_on set (6/9 - 6/12). Skip.
//
// Per memory feedback_bc_todos_must_have_due_dates.md timing rules:
//   - Fast (1 hr) -> 3 days out
//   - Medium (2-5 hr) -> 1 week
//   - Larger -> 2 weeks
//   - Meta-tracking -> ~30 days
//   - Decisions Ali owes -> ~3 days

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const BUCKET = 7463955; // Ali Personal
const BASE = `https://3.basecampapi.com/3945211/buckets/${BUCKET}`;

// Per-todo timing rationale based on memory rule:
const BACKFILL = [
  {
    id: 9960380028,
    due_on: '2026-06-30',
    title: '[Tracking] Daily 24h retrospective',
    rationale: 'Meta tracker - 30-day review-by date. Re-evaluate end of month: is the daily P4 retrospective hitting useful signal vs noise? If yes, extend; if no, deprecate.',
  },
  {
    id: 9961144502,
    due_on: '2026-06-10',
    title: 'Inbox Manager Phase 2: P2 aggregator + 8 AM / 5 PM digest',
    rationale: 'Medium build (3-4 hr per spec). 1-week target keeps momentum from Phase 1 ship today.',
  },
  {
    id: 9961144512,
    due_on: '2026-06-17',
    title: 'Inbox Manager Phase 3: action extraction (email to BC todo / Calendar event)',
    rationale: 'Larger build (5 hr + LLM wiring + tests). 2 weeks accounts for the decision Ali owes before build (Pattern E review-todo target list).',
  },
  {
    id: 9961144526,
    due_on: '2026-06-10',
    title: 'Inbox Manager Phase 5: weekly stats dashboard (volume + P-mix + mistakes)',
    rationale: 'Medium build (4 hr). 1-week target alongside Phase 2 so observability lands with the digest cadence.',
  },
];

async function bcPut(url, body) {
  const r = await fetch(url, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function bcGet(url) {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

(async () => {
  for (const t of BACKFILL) {
    console.log(`\nBackfilling ${t.id} (${t.title})...`);
    // BC 3 API requires content + description in PUT body even for partial updates.
    const current = await bcGet(`${BASE}/todos/${t.id}.json`);
    if (current.due_on) {
      console.log(`  ALREADY HAS due_on: ${current.due_on}. Skipping.`);
      continue;
    }
    console.log(`  Setting due_on: ${t.due_on}`);
    const updated = await bcPut(`${BASE}/todos/${t.id}.json`, {
      content: current.content,
      description: current.description,
      due_on: t.due_on,
    });
    console.log(`  Server confirmed due_on: ${updated.due_on}`);

    const comment = `<div><p><strong>Due date backfilled to ${t.due_on}.</strong> Originally created without due_on in session CC-20260603-v7da. Rationale: ${t.rationale}</p></div>`;
    const c = await bcPost(`${BASE}/recordings/${t.id}/comments.json`, { content: comment });
    console.log(`  Audit comment: ${c.id}`);
  }
  console.log('\n=== DONE ===');
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
