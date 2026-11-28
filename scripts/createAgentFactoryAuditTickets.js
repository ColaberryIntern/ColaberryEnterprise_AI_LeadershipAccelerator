/**
 * File the two tickets the 28 Nov ungrouped-ticket audit produced.
 *
 * Both are defects found by measuring production, not by reading a ticket. They go directly
 * on the todolist rather than into a group, which is where every other AF12.x defect sits.
 *
 * Assignees are copied from an existing AF12.x ticket rather than guessed, because a wrong
 * person id creates a ticket nobody is accountable for, which is worse than no ticket. The
 * run also refuses to create a second copy if a previous run already made them, so it is
 * safe to re-run.
 *
 *   DRY (default)  docker exec -w /app accelerator-backend node /tmp/createAf14Tickets.js
 *   APPLY          ... node /tmp/createAf14Tickets.js --apply
 *
 * Runs INSIDE the production backend container, the only place with a live Basecamp token.
 */
'use strict';

const ACCOUNT = '3945211';
const BUCKET = 7463955;
const LIST = 10406233777;
const PATTERN_TODO = 10537952853; // AF12.20, an existing ungrouped AF12.x ticket
const API = `https://3.basecampapi.com/${ACCOUNT}/buckets/${BUCKET}`;
// Generic client name: never a personal address in a request to an outside service.
const UA = 'Colaberry AI Ops';
const APPLY = process.argv.includes('--apply');

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
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  return { body: await r.json(), link: r.headers.get('link') || '' };
}

/**
 * Every page, not the first one.
 *
 * This list's todos.json pages at FIFTEEN rows, not the 50 you might assume. The first
 * version of this script read one page to check for duplicates, and with 16 active todos
 * the sixteenth was invisible: AF12.22 existed and the guard said it did not, so a second
 * --apply would have filed it twice. A guard that reads part of a list is not a guard.
 */
async function allPages(path) {
  const out = [];
  for (let page = 1; page <= 30; page += 1) {
    const sep = path.includes('?') ? '&' : '?';
    const { body, link } = await api('GET', `${path}${sep}page=${page}`);
    if (!Array.isArray(body) || !body.length) break;
    out.push(...body);
    if (!link.includes('rel="next"')) break;
  }
  return out;
}

const P = (s) => `<div>${s}</div>`;
const BR = '<div><br></div>';

const AF1221 = [
  P('Initiative: Agent Factory &middot; Task ID: AF12.21 &middot; Priority: P1 &middot; Due: 2026-12-02 &middot; Human approver: Ali &middot; Execution mode: Code'),
  BR,
  P('<strong>FOUND 28 Nov 2026</strong> while auditing the 14 open ungrouped tickets on this list against production.'),
  BR,
  P('<strong>MEASURED.</strong> At 04:49:04 UTC on 28 Nov all seven of product_experience&rsquo;s ladder rungs moved to in_progress, ten hours after the AF10.9 lift had set exactly one of them open. Each row&rsquo;s own verification_json says why it should not have: &ldquo;None of the 3 acceptance criteria are marked as passing yet&rdquo; and &ldquo;No commit in the repo names product_experience.CAP.design_token_drift_audit.L0-CHOOSE and changes a file.&rdquo; All seven read the same way. So a rung is being marked started on zero evidence, by the verifier&rsquo;s own account.'),
  BR,
  P('<strong>ACROSS THE TEN BOARDS.</strong> Ten of ten have L0-CHOOSE in_progress. product_experience has all seven in_progress. platform and admissions each carry genuinely complete, pipeline-verified rungs alongside one open one, which is the shape the ladder intends.'),
  BR,
  P('<strong>THE DEFECT: TWO SHIPPED FIXES WRITE ONE COLUMN WITH OPPOSITE MEANINGS.</strong> AF10.9&rsquo;s lift writes the ladder as a PLAN, exactly one rung open and it is the first unfinished one, so the board can answer &ldquo;which step am I on&rdquo;. AF12.13&rsquo;s writer (PR 3829) writes it as a LOG: anything the verifier has looked at and not completed becomes in_progress. The log wins, because it runs on every sync and every push while the lift ran once. On Mihret&rsquo;s board the answer to &ldquo;which step am I on&rdquo; is now &ldquo;all seven&rdquo;, which is the exact confusion the lift was built to remove.'),
  BR,
  P('<strong>NEITHER FIX IS A REGRESSION.</strong> Each is right about its own job, and AF12.13 solved something real: a working builder used to read as a zero. The gap is that nobody owns what in_progress MEANS on a ladder rung, where the rungs are ordered and only one of them can be current.'),
  BR,
  P('<strong>WORTH ESTABLISHING FIRST, before building anything:</strong> whether the verifier should leave story_kind = capability_ladder rows alone, or whether the ladder should stop using status to carry &ldquo;current&rdquo; and carry it somewhere of its own. Those are different fixes with different blast radii, and this ticket should not assume which.'),
  BR,
  P('<strong>ACCEPTANCE.</strong> On every board, exactly one ladder rung reads as current, and that answer survives a verification run rather than being undone by the next one. A rung with zero passing criteria and no naming commit does not read as started.'),
].join('');

const AF1222 = [
  P('Initiative: Agent Factory &middot; Task ID: AF12.22 &middot; Priority: P1 &middot; Due: 2026-12-04 &middot; Human approver: Ali &middot; Execution mode: Decision then code'),
  BR,
  P('<strong>FOUND 28 Nov 2026</strong>, from two builders in the same week, while auditing this list.'),
  BR,
  P('<strong>MEASURED.</strong> markTaskVerifiedComplete is the only statement in the repository that writes student_tasks.verified_at, and it has two callers: the repo verifier and the unrelated demo-prep path. So crediting a builder is one pipeline, and its entire evidence universe is three facts read from THE BUILDER&rsquo;S OWN connected GitHub repo: ticks in .colaberry/progress.json, a commit whose subject or Story: trailer names the full story id and changes at least one file, and the repo tree as negative evidence only. Nothing else counts. Not a pull request, not CI, not a run log, not a manager&rsquo;s word.'),
  BR,
  P('<strong>CASE ONE.</strong> Sarbjit Kaur answered step 0.1 by email on 28 Nov, in full and correctly, including the second half about whether the product can already do it. Her L0-CHOOSE is in_progress and will stay there however good the answer is, because email is not in that universe.'),
  BR,
  P('<strong>CASE TWO.</strong> Quincy Ninying&rsquo;s step 1 run log is cited three times in backend/src/services/agentDomain/capabilities/platform.json, in THIS repository. The verifier reads his repo, not ours, and never opens a capability record at all, so those citations were invisible to it. His rung was credited in the end, at 23 Nov 16:22 UTC, but by a commit in his own repo rather than by any of the evidence he had been told to produce.'),
  BR,
  P('<strong>THE SHARP EDGE.</strong> The L1 acceptance text this platform generates asks for &ldquo;a run log recording the date, the elapsed time, each step actually performed&rdquo;. A run log is not a repo path, so the path check never looks for one, and the only way to satisfy the criterion is a tick the builder writes themselves plus a commit naming the rung. We ask for one deliverable and grade a different artifact. A builder who does exactly as instructed is not credited.'),
  BR,
  P('<strong>THE DECISION INSIDE THIS.</strong> Either every rung&rsquo;s deliverable lands in the builder&rsquo;s own repo and the instructions say so in those words, or a second evidence channel exists and is actually graded. Those are different products and the second is the larger one. Related: the one mechanism that already reads a builder&rsquo;s repo tree and records what was handed over is wired to the push webhook and left off by an unset STORY_ARTIFACT_VERIFICATION flag. See AF12.9.'),
  BR,
  P('<strong>ACCEPTANCE.</strong> For each of the seven rungs, the instruction a builder reads names the exact artifact, in the exact place, that the grader will look for. A builder who does what the instruction says is credited without anybody intervening by hand.'),
].join('');

const TICKETS = [
  {
    code: 'AF12.21',
    content: 'AF12.21 - A ladder rung is marked started on no evidence, so a board cannot say which step a builder is on',
    description: AF1221,
    due_on: '2026-12-02',
  },
  {
    code: 'AF12.22',
    content: 'AF12.22 - A builder evidence channel the grader never reads, so doing as instructed does not get credited',
    description: AF1222,
    due_on: '2026-12-04',
  },
];

async function main() {
  console.log(APPLY ? '[create] APPLYING' : '[create] DRY RUN - nothing will be written');

  const { body: pattern } = await api('GET', `/todos/${PATTERN_TODO}.json`);
  const assignees = pattern.assignees || [];
  const assignee_ids = assignees.map((a) => a.id);
  console.log(`assignees copied from "${(pattern.title || pattern.content || '').slice(0, 50)}": `
    + `${assignees.map((a) => `${a.name} (${a.id})`).join(', ') || 'NONE'}`);
  if (!assignee_ids.length) {
    throw new Error('pattern ticket has no assignee; refusing to create unassigned tickets');
  }

  // Refuse to create a second copy if an earlier run already made these. Reads BOTH the
  // active and the completed sets across every page, because a ticket somebody has already
  // ticked is still a duplicate.
  const existing = (await allPages(`/todolists/${LIST}/todos.json`))
    .concat(await allPages(`/todolists/${LIST}/todos.json?completed=true`));
  console.log(`checked ${existing.length} existing todos on this list for duplicates`);
  for (const t of TICKETS) {
    const dup = existing.find((e) => String(e.title || e.content || '').startsWith(`${t.code} -`));
    if (dup) {
      console.log(`\n${t.code}: ALREADY EXISTS as ${dup.id}, skipping`);
      t.skip = true;
    }
  }

  for (const t of TICKETS) {
    if (t.skip) continue;
    console.log(`\n${t.code}`);
    console.log(`  title: ${t.content}`);
    console.log(`  due:   ${t.due_on}`);
    console.log(`  body:  ${t.description.length} chars`);
    if (!APPLY) continue;
    const { body: made } = await api('POST', `/todolists/${LIST}/todos.json`, {
      content: t.content,
      description: t.description,
      due_on: t.due_on,
      assignee_ids,
      notify: false,
    });
    console.log(`  created ${made.id}`);
    console.log(`  ${made.app_url}`);
  }
}
main().catch((e) => { console.error('[create] FAILED: ' + e.message); process.exitCode = 1; });
