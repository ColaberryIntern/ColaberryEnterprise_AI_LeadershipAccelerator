#!/usr/bin/env node
/**
 * Files the two Claude Code workstream tickets into Ali Personal (bucket 7463955).
 *
 * WHY THIS IS A SCRIPT AND NOT A BASECAMP CALL FROM A SESSION. There is no Basecamp token on
 * the workstation; it lives in the CCPP vault and in the prod backend container's environment.
 * Pulling it onto a laptop to make two API calls would put a live credential somewhere it does
 * not belong, and into a shell history besides. This runs where the token already is and never
 * prints it.
 *
 * IDEMPOTENT. It reads the target list first and skips any todo whose title already exists, so
 * running it twice files nothing twice. That matters more than usual here: a duplicate ticket
 * in a personal project is noise someone has to clean up by hand.
 *
 * RUN IT (inside the prod backend container, which holds BASECAMP_ACCESS_TOKEN):
 *
 *   ssh root@95.216.199.47
 *   docker cp /opt/colaberry-accelerator/scripts/createAliPersonalClaudeTickets.js \
 *     accelerator-backend:/tmp/mk.js
 *   docker exec accelerator-backend node /tmp/mk.js
 *
 * Pass --dry-run to print exactly what it would create and write nothing.
 */

const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 7463955; // Ali Personal
const ALI = 17454835; // assignee: every todo here needs one
const LIST_NAME = 'Claude Code - platform workstreams';
const DRY = process.argv.includes('--dry-run');

const H = {
  Authorization: `Bearer ${TOKEN}`,
  'User-Agent': 'Colaberry ClaudeCode (ali@colaberry.com)',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function get(p) {
  const r = await fetch(`${BASE}${p}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function post(p, body) {
  if (DRY) {
    console.log(`  [dry-run] POST ${p}`);
    return { id: 0, app_url: '(dry-run)' };
  }
  const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : {};
}

/** Two weeks out, as YYYY-MM-DD. Every todo in this project carries a due date. */
function dueDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * ASCII only, deliberately.
 *
 * These descriptions travel over scp and ssh to get here, and a PowerShell pipe into ssh
 * mangles UTF-8 on the way. An em-dash that arrives as mojibake in a Basecamp ticket is not
 * worth the typography.
 */
const TICKETS = [
  {
    title: 'Explorer messaging Phase 3b - document ingestion (merged, not yet verified in prod)',
    due: dueDate(7),
    content: `
<div>
  <strong>Asked for:</strong> Phase 3b of the Explorer messaging plan - let the composer be
  grounded in uploaded documents, not only the 217-entry /knowledge hub.
</div>
<div><br></div>
<div><strong>Delivered:</strong> merged in
  <a href="https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3504">PR #3504</a>
  (10 commits, all 11 CI checks green).</div>
<div><br></div>
<div>A file can now be uploaded, hashed, deduped, extracted, chunked, stored, retrieved and
  offered to the composer. Pieces: the first text chunker in the repo, a content-addressed
  store, an ingest path, a Postgres repository, a retrieval bridge, an upload endpoint on its
  own router, and an upload panel.</div>
<div><br></div>
<div><strong>Why it is safe:</strong> a stored document lands at confidence 'unstated', which
  the existing quote gate already refuses. Nothing uploaded can appear in a learner-facing
  message until a human marks it grounded. An ingestion bug therefore fails CLOSED - a bad
  extraction, a chunker producing nonsense, a URL fetch that grabbed an error page all land
  unquotable.</div>
<div><br></div>
<div><strong>Still open, and the reason this ticket is not closed:</strong></div>
<ol>
  <li><strong>There is no review surface.</strong> Nothing in the product can mark a document
    grounded, so every uploaded document is currently unquotable permanently - safe, and
    inert. This was a deliberate choice: building an approval path in the same PR that
    changes the gate's inputs is how a safety property gets weakened by accident.</li>
  <li><strong>Not verified in production.</strong> Merged to main is not deployed, and
    deployed is not verified. No deploy has been run for this change yet.</li>
</ol>
<div><br></div>
<div><strong>Also fixed on the way:</strong> extraction silently truncated every document at
  50,000 characters. Survivable for a resume; wrong for a knowledge base, where the discarded
  half just never answers a question and retrieval reads as unhelpful rather than incomplete.
  It now reports the cut.</div>
<div><br></div>
<div>Session log: <code>docs/sessions/CC-20260909-m4kt.md</code></div>
`.trim(),
  },
  {
    title: 'Marketing Performance - rename the Revenue tab, make the trust badge per-tab',
    due: dueDate(7),
    content: `
<div><strong>Asked for:</strong> Ali, 2026-10-30, after reviewing the Performance page -
  "rename it and fix the trust badge to report per-tab".</div>
<div><br></div>
<div><strong>Why the rename.</strong> The tab called "Revenue" contains no revenue and
  structurally cannot. There is no local payments table, so revenue.net_revenue is registered
  unavailable with PaySimple and CCPP named as identified-but-unwired sources. There is no
  ad-platform integration of any kind, so ad spend, cost-per-lead and ROAS are uncomputable
  rather than merely missing. Every money figure on the tab reads the literal word
  "Unavailable".</div>
<div><br></div>
<div>A tab named for a number it cannot hold invites the engagement and enrollment counts
  beside it to be read as money. It is now "Campaign performance". The "Unavailable" cards
  stay - they are the standing record of what is missing, and removing them would make the
  gap invisible instead of fixed.</div>
<div><br></div>
<div><strong>Label only.</strong> The key stays <code>revenue</code>, because
  needsAttentionQueue.ts writes <code>?tab=revenue</code> and renaming the key would land
  every attention link on the funnel instead, silently.</div>
<div><br></div>
<div><strong>Why the badge was wrong.</strong> One badge served four panels and exactly one
  of them fed it. So it read "Unverified" above a marketing funnel that had loaded perfectly,
  and once the other tab had been opened it reported THAT tab's state while you were reading a
  different one. A badge that certifies the wrong panel is worse than no badge.</div>
<div><br></div>
<div><strong>Two real defects found while wiring it:</strong></div>
<ol>
  <li>The campaign-links tab turned a failed fetch into an empty list, so an outage rendered
    as "No campaigns found. Create a campaign to get started" - telling someone whose
    campaigns are all still there to go and make one.</li>
  <li>A failed channel-ROI call was swallowed into an empty channel list. Since the
    metric-status list comes from that response, the badge would have claimed every metric was
    computable on the strength of a response that never arrived.</li>
</ol>
<div><br></div>
<div><strong>AI outreach reports nothing and cannot</strong> - it re-exports a container that
  owns its own fetching, and its KPIs are not in the metric registry at all. The badge now
  says so in words rather than borrowing a sibling tab's verdict.</div>
<div><br></div>
<div><strong>Not addressed here, and worth a decision:</strong> Total Visitors, High Intent %,
  Visitor-to-Lead % and Conversion Rate on that tab all rest on marketing.campaign_visitors,
  which the metric registry itself marks <code>invalid</code> - it takes GREATEST() of two
  different populations and reports the larger as one count. It is deliberately excluded from
  the tab's "cannot be computed" notice, so those four render as ordinary trustworthy figures.
  Correcting the denominator moves numbers people have been reading for months, which is a
  decision to make deliberately. See docs/marketing/ESCALATION-002-fabricated-metrics.md,
  still open.</div>
`.trim(),
  },
];

(async () => {
  if (!TOKEN) {
    console.error('No BASECAMP_ACCESS_TOKEN in this environment. Run inside the backend container.');
    process.exit(1);
  }

  const me = await get('/my/profile.json');
  console.log(`acting as: ${me.name} <${me.email_address}>`);
  // The CCPP rotation can hand back the CB System bot, which 404s on Ali's personal project.
  // Better to say so here than to fail three calls later with a bare 404.
  if (me.id !== ALI) {
    console.warn(`WARNING: token belongs to ${me.name} (${me.id}), not Ali (${ALI}).`);
  }

  const project = await get(`/projects/${BUCKET}.json`);
  const todoset = project.dock.find((d) => d.name === 'todoset');
  if (!todoset) throw new Error('no todoset on Ali Personal');
  console.log(`project: ${project.name}  todoset: ${todoset.id}`);

  let page = 1;
  const lists = [];
  for (;;) {
    const batch = await get(`/buckets/${BUCKET}/todosets/${todoset.id}/todolists.json?page=${page}`);
    if (!batch.length) break;
    lists.push(...batch);
    if (batch.length < 50) break;
    page += 1;
  }

  let list = lists.find((l) => l.name === LIST_NAME);
  if (!list) {
    console.log(`creating list "${LIST_NAME}"`);
    list = await post(`/buckets/${BUCKET}/todosets/${todoset.id}/todolists.json`, {
      name: LIST_NAME,
      description:
        '<div>Work done in this repo by Claude Code sessions. One ticket per workstream, ' +
        'not per commit. Each carries the PR link, what shipped, and what is explicitly ' +
        'NOT done.</div>',
    });
    console.log(`  list ${list.id}: ${list.app_url}`);
  } else {
    console.log(`using existing list ${list.id}: ${list.name}`);
  }

  // Existing titles, so a second run is a no-op rather than a duplicate.
  const existing = new Set();
  if (list.id) {
    for (const state of ['active', 'completed']) {
      try {
        const todos = await get(`/buckets/${BUCKET}/todolists/${list.id}/todos.json?status=${state}`);
        todos.forEach((t) => existing.add(t.title));
      } catch {
        /* a brand-new list has no todos endpoint content yet */
      }
    }
  }

  for (const t of TICKETS) {
    if (existing.has(t.title)) {
      console.log(`SKIP (already filed): ${t.title}`);
      continue;
    }
    console.log(`creating: ${t.title}`);
    const todo = await post(`/buckets/${BUCKET}/todolists/${list.id}/todos.json`, {
      content: t.title,
      description: t.content,
      due_on: t.due,
      assignee_ids: [ALI],
      notify: false,
    });
    console.log(`  -> ${todo.app_url || '(dry-run)'}`);
  }

  console.log('done.');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
