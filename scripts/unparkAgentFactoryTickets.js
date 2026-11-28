/**
 * Un-park the five Agent Factory tickets that were held behind the Monday 19 Oct 2026 intern
 * rollout, and give each one a real due date.
 *
 * ## Why they need un-parking rather than closing
 *
 * Each carries the same banner: "PARKED - NOT PART OF THE MONDAY 19 OCT INTERN ROLLOUT ... Do not
 * start it while a rollout ticket is open." All five also say "Rollout blocker: no". The rollout
 * they were parked behind happened five weeks ago and its gate cleared on 22 Nov, so the banner is
 * now an instruction not to start work for a reason that has expired. The work itself is real:
 * AF6.6 alone covers 126 enabled agents with 3.2 million runs and no accountable human.
 *
 * Leaving the banner in place is worse than it looks. It does not read as stale, it reads as
 * current, so each of these tickets tells the next person who opens it to put it down again.
 *
 * ## What it changes, and what it deliberately does not
 *
 * Changes: the PARKED paragraph is replaced with a dated UNPARKED note saying why, and the due
 * date moves from October to a real one. Nothing else in the description is touched, so the
 * objective, the context questions and the acceptance survive byte for byte.
 *
 * Does NOT change: title, assignee, completion state, comments, or the ticket's own priority. It
 * also refuses a ticket whose description does not contain the banner, rather than guessing, so
 * re-running it is a no-op instead of a second edit.
 *
 *   DRY (default)  docker exec -w /app accelerator-backend node /tmp/unparkAgentFactoryTickets.js
 *   APPLY          ... node /tmp/unparkAgentFactoryTickets.js --apply
 *
 * Runs INSIDE the production backend container, the only place with a live Basecamp token.
 */
'use strict';

const ACCOUNT = '3945211';
const BUCKET = Number(process.env.BUCKET || 7463955);
const API = `https://3.basecampapi.com/${ACCOUNT}/buckets/${BUCKET}`;
// Generic client name: never a personal address in a request to an outside service.
const UA = 'Colaberry AI Ops';
const TIMEOUT_MS = Number(process.env.BC_TIMEOUT_MS || 30000);
const APPLY = process.argv.includes('--apply');

/** The banner, as it appears in every one of the five. Matched, never assumed. */
const PARKED_RE = /PARKED - NOT PART OF THE MONDAY 19 OCT INTERN ROLLOUT\.[\s\S]*?while a rollout ticket is open\./;

const NOTE = 'UNPARKED 27 Nov 2026. This was parked behind the Monday 19 Oct 2026 intern rollout, '
  + 'which shipped five weeks ago and whose gate cleared on 22 Nov. The ticket says "Rollout '
  + 'blocker: no" and always did, so the hold has expired rather than been lifted early. Due date '
  + 'moved off October to a real one.';

/** todoId -> the due date it gets, ordered by how much is waiting on it. */
const TICKETS = [
  { id: 10410048165, code: 'AF6.6', due: '2026-12-05', why: 'P1, 126 enabled agents with no accountable human' },
  { id: 10406234605, code: 'AF4.4', due: '2026-12-10', why: 'P1, agents raise their own Basecamp tickets' },
  { id: 10406234590, code: 'AF6.5', due: '2026-12-12', why: 'P2, the role named admissions that grants internship' },
  { id: 10406234655, code: 'AF8.2', due: '2026-12-12', why: 'P2, browser coverage for the agent domain surface' },
  { id: 10406234635, code: 'AF3.4', due: '2026-12-19', why: 'P2, self-healing spec, waits on AF7.1' },
];

let TOKEN = null;
async function tok() {
  if (!TOKEN) TOKEN = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
  return TOKEN;
}

async function api(method, p, body) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${await tok()}`,
      'User-Agent': UA,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function main() {
  console.log(APPLY ? '[unpark] APPLYING' : '[unpark] DRY RUN - nothing will be written');
  let changed = 0;
  let skipped = 0;

  for (const t of TICKETS) {
    const todo = await api('GET', `/todos/${t.id}.json`);
    const desc = String(todo.description || '');

    if (!PARKED_RE.test(desc)) {
      console.log(`\n${t.code}: no PARKED banner found, skipped (already un-parked?)`);
      skipped += 1;
      continue;
    }

    const next = desc.replace(PARKED_RE, NOTE);
    console.log(`\n${t.code} (${todo.title || todo.content})`);
    console.log(`  due ${todo.due_on || 'none'} -> ${t.due}   (${t.why})`);
    console.log(`  description ${desc.length} -> ${next.length} chars`);

    if (!APPLY) { changed += 1; continue; }

    // Send back the fields Basecamp would otherwise reset. `content` is the title and is
    // mandatory on a PUT; omitting assignee_ids drops the assignee, which would silently
    // un-assign a ticket this script has no business touching.
    await api('PUT', `/todos/${t.id}.json`, {
      content: todo.content,
      description: next,
      due_on: t.due,
      assignee_ids: (todo.assignees || []).map((a) => a.id),
    });
    console.log('  updated');
    changed += 1;
  }

  console.log(`\n[unpark] ${APPLY ? 'updated' : 'would update'} ${changed}, skipped ${skipped}`);
}

main().catch((e) => { console.error('[unpark] FAILED: ' + e.message); process.exitCode = 1; });
