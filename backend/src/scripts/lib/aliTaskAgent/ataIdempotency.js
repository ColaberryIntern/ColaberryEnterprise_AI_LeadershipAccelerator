/**
 * Idempotency guard for the Ali Task Agent.
 *
 * Same lesson as cbDraftIdempotency.js: the authoritative dedup signal is the
 * actual Basecamp thread, not a local state file. A local file gets bypassed by
 * --force and resets across machines / fresh trees, which is exactly how the
 * CB runners piled 47/37/23 duplicate comments on the same todos on 2026-06-15.
 *
 * Rule: if ATA has already posted on a todo thread (its marker is present), do
 * not act on that todo again in a later run. Combined with the per-task state
 * file in the entrypoint (content-hash for the "task changed since" case), this
 * makes re-running a batch a no-op — same input, same end state, no duplicate
 * side effects.
 *
 * Pure + null-safe so it can be unit-tested without a DB/API.
 */
const { isAtaPost } = require('./signoff');

/**
 * True when ATA has already acted on this todo's comment thread.
 * @param {Array<{creator?:{id?:number}, content?:string}>} comments
 * @param {number} aliId Ali's Basecamp person id (ATA posts as Ali)
 */
function alreadyHandled(comments, aliId) {
  return (Array.isArray(comments) ? comments : []).some((c) => isAtaPost(c, aliId));
}

module.exports = { alreadyHandled };
