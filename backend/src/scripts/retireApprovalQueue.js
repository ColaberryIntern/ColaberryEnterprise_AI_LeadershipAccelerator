/**
 * Retire the wrongly-generated standalone "Approval Queues" list.
 *
 * Background (2026-06-10 assessment): the PMO generator emitted a parallel
 * "Approval Queues" list that DUPLICATED the oversight gates which already live
 * — correctly bound to their producing task — inside each functional area list,
 * plus orphan topics with no producer and misfiled "Draft X" producer tasks.
 * The correct model is: oversight gates are the in-area review/approve todos.
 * So this list is retired wholesale; coverage is preserved by the inline gates.
 *
 * What it does: trashes every todo in the "Approval Queues" list, then trashes
 * the (now empty) list itself, via Basecamp's recording-status endpoint. Trash
 * is RECOVERABLE (~30 days), not a hard delete.
 *
 * Safety:
 *   - DRY-RUN by default; prints exactly what it WOULD trash. Writes nothing.
 *   - --commit is required to actually trash.
 *   - Refuses to act on any list whose name is not exactly APPROVAL_LIST_NAME.
 *   - --expect <n> asserts the todo count matches before committing (guards
 *     against trashing a list that drifted from the audited state).
 *   - Idempotent: if the list is already gone, it's a no-op success.
 *
 * Run:
 *   node backend/src/scripts/retireApprovalQueue.js                 # dry-run
 *   node backend/src/scripts/retireApprovalQueue.js --expect 17 --commit
 */

const ops = require('./lib/launchPmoOps');
const { LAUNCH } = require('./lib/launchPmoTeam');
const { getBasecampToken } = require('./lib/basecampToken');
const { APPROVAL_LIST_NAME } = require('./lib/approvalArtifactLink');

const commit = process.argv.includes('--commit');
function argval(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; }
const expect = argval('--expect') != null ? Number(argval('--expect')) : null;

async function trash(id) {
  // Basecamp 3: PUT /buckets/{bucket}/recordings/{id}/status/trashed.json -> 204
  return ops.bcPut(`/buckets/${LAUNCH.projectId}/recordings/${id}/status/trashed.json`, {});
}

async function main() {
  process.env.BASECAMP_ACCESS_TOKEN = await getBasecampToken();

  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);
  const list = lists.find((l) => l.name === APPROVAL_LIST_NAME);

  if (!list) {
    console.log(JSON.stringify({ mode: commit ? 'commit' : 'dry-run', result: 'already-gone', list: APPROVAL_LIST_NAME }, null, 2));
    return;
  }
  if (list.name !== APPROVAL_LIST_NAME) throw new Error(`refusing: list name "${list.name}" != "${APPROVAL_LIST_NAME}"`);

  const todos = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todolists/${list.id}/todos.json`);
  if (expect != null && todos.length !== expect) {
    throw new Error(`refusing: expected ${expect} todos but list has ${todos.length} (state drifted — re-audit before deleting)`);
  }

  const plan = {
    mode: commit ? 'commit' : 'dry-run',
    list: { id: list.id, name: list.name, todo_count: todos.length },
    todos_to_trash: todos.map((t) => ({ id: t.id, title: t.content })),
  };

  if (!commit) {
    plan.note = 'DRY-RUN — nothing trashed. Re-run with --expect <n> --commit to trash (recoverable ~30d).';
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const trashed = [];
  for (const t of todos) {
    try { await trash(t.id); trashed.push({ id: t.id, title: t.content, ok: true }); }
    catch (e) { trashed.push({ id: t.id, title: t.content, ok: false, error: e.message }); }
  }
  let listTrashed = false;
  try { await trash(list.id); listTrashed = true; }
  catch (e) { plan.list_trash_error = e.message; }

  plan.trashed = trashed;
  plan.list_trashed = listTrashed;
  plan.summary = { todos_trashed: trashed.filter((x) => x.ok).length, todos_failed: trashed.filter((x) => !x.ok).length, list_trashed: listTrashed };
  console.log(JSON.stringify(plan, null, 2));

  const failed = trashed.filter((x) => !x.ok).length || !listTrashed;
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('retireApprovalQueue failed:', e.message); process.exit(1); });
