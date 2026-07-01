/**
 * executor — the safe "do it as Ali" primitives for the Ali Task Agent.
 *
 * Every write goes through here, every write posts AS Ali, and every comment
 * carries the ATA sign-off (so the self-loop guard can tell ATA's output from
 * Ali's own, and so readers know an assistant wrote it).
 *
 * SAFETY BY CONSTRUCTION: there is deliberately NO "send external email" / "post
 * to social" / "book meeting" primitive in this module. The only outward-facing
 * path is `queueForApproval`, which posts an internal [DRAFT - needs Ali] comment
 * for Ali to review and send himself. ATA literally cannot send an external
 * communication, because the capability does not exist in its toolset.
 *
 * Primitives:
 *   postComment      - add a comment to a todo, as Ali, with sign-off
 *   completeTodo     - mark a todo done (gated behind a flag in the entrypoint)
 *   setDueDate       - backfill / adjust a todo's due date (safe merge)
 *   queueForApproval - draft outward-facing work + hand it back to Ali
 *
 * Each primitive takes injectable Basecamp fns so it can be unit-tested without
 * the network. All are no-ops under `dryRun` (they record intent and return).
 */
const ops = require('../launchPmoOps');
const { ataSignoffHtml, stripEmDashes } = require('./signoff');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Post a comment on a todo, as Ali, with the ATA sign-off appended.
 * @param {object} a
 * @param {number} a.projectId
 * @param {number} a.todoId
 * @param {string} a.html        comment body (em-dashes stripped, sign-off added)
 * @param {string} [a.runId]
 * @param {boolean} [a.dryRun]
 * @param {Function} [a.bcPost]
 */
async function postComment(a) {
  const { projectId, todoId, html, runId, dryRun } = a;
  const bcPost = a.bcPost || ops.bcPost;
  const content = stripEmDashes(html || '') + ataSignoffHtml({ runId });
  if (dryRun) return { dryRun: true, action: 'postComment', projectId, todoId, content };
  return bcPost(`/buckets/${projectId}/recordings/${todoId}/comments.json`, { content });
}

/**
 * Mark a todo complete (optionally posting a closure note first). Completion is
 * POST .../completion.json with an empty body (Basecamp 3). Gated: the
 * entrypoint only calls this behind --allow-complete; default runs never
 * auto-complete a human's todo.
 */
async function completeTodo(a) {
  const { projectId, todoId, closureNote, runId, dryRun } = a;
  const bcPost = a.bcPost || ops.bcPost;
  if (dryRun) return { dryRun: true, action: 'completeTodo', projectId, todoId, closureNote };
  if (closureNote) await postComment({ projectId, todoId, html: closureNote, runId, bcPost });
  return bcPost(`/buckets/${projectId}/todos/${todoId}/completion.json`, {});
}

/**
 * Set / adjust a todo's due date via the safe-merge updateTodo (which preserves
 * every other field). Backs Ali's standing rule that todos should carry a due
 * date.
 */
async function setDueDate(a) {
  const { projectId, todoId, dueOn, dryRun } = a;
  const updateTodo = a.updateTodo || ops.updateTodo;
  if (dryRun) return { dryRun: true, action: 'setDueDate', projectId, todoId, dueOn };
  return updateTodo({ projectId, todoId, patch: { due_on: dueOn } });
}

/**
 * Queue outward-facing work for Ali. Posts the draft as an internal comment with
 * a clear [DRAFT - needs Ali] banner. Does NOT send anything externally - that
 * is the whole point. The caller also adds this item to the run report's "Needs
 * your approval" section.
 */
async function queueForApproval(a) {
  const { projectId, todoId, draftHtml, reason, runId, dryRun } = a;
  const bcPost = a.bcPost || ops.bcPost;
  const banner = `<div style="background:#fff7ed;border-left:4px solid #ea580c;padding:10px 14px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#9a3412;font-weight:700">[DRAFT - needs Ali]</div>
<div style="font-size:13px;color:#9a3412;margin-top:3px">This task is outward-facing${reason ? ` (${escapeHtml(reason)})` : ''}. ATA drafted it but did not send anything. Review, edit, and send it yourself.</div>
</div>
<div style="margin-top:12px">${draftHtml || ''}</div>`;
  return postComment({ projectId, todoId, html: banner, runId, dryRun, bcPost });
}

module.exports = { postComment, completeTodo, setDueDate, queueForApproval, escapeHtml };
