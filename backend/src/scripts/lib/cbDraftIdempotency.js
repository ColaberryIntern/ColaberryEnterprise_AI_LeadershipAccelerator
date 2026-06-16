/**
 * Idempotency guard for the CB AI auto-runners (runCbAiTasks.js,
 * runCbAiTasksGeneric.js).
 *
 * The runners' only dedup was a per-project state file gated by
 * `FORCE || !state.tasks[id]` — which `--force` bypasses entirely and which
 * resets across machines / fresh working trees / repeated dev re-runs. That
 * non-idempotency let repeated runs re-post the same "first-pass deliverable"
 * on the same todo. On 2026-06-15 the LandJet runner was re-run many times and
 * piled up 47 / 37 / 23 duplicate CB comments on the todos blocked waiting on Ali.
 *
 * The authoritative dedup signal is the actual Basecamp thread, not a local
 * file: if CB System has already posted a first-pass deliverable on a todo,
 * never post another. Both runners fetch the thread anyway, so this is a check
 * over data they already have.
 */
const CB_SYSTEM_ID = 37708014;
const DELIVERABLE_MARKER = /first-pass deliverable/i;

function strip(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

/**
 * True when CB System has already posted a first-pass deliverable in this
 * comment thread. Pure + null-safe so it can be unit-tested without a DB/API.
 * @param {Array<{creator?:{id?:number}, content?:string}>} comments
 * @param {number} [cbId]
 */
function alreadyDrafted(comments, cbId = CB_SYSTEM_ID) {
  return (Array.isArray(comments) ? comments : []).some(
    (c) => c && c.creator && c.creator.id === cbId && DELIVERABLE_MARKER.test(strip(c.content)),
  );
}

module.exports = { alreadyDrafted, CB_SYSTEM_ID, DELIVERABLE_MARKER };
