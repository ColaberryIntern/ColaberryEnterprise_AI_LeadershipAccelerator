/**
 * ATA sign-off + self-loop marker. The SPINE of the Ali Task Agent's safety
 * model.
 *
 * ATA acts AS Ali (person 17454835). CB System's worst incident (2026-06-22,
 * 1,245-comment flood) happened because its token degraded to Ali's identity
 * and every author-based guard collapsed — CB answered its own comments. ATA
 * posts as Ali ON PURPOSE, so it cannot lean on "skip my own author id" the way
 * CB does. Instead, every comment ATA writes carries a stable, visible marker
 * (`ATA_MARKER`). The queue builder skips any thread item that is itself an ATA
 * post, and `isAtaPost` is the predicate that makes that possible.
 *
 * The marker is a plain visible string (not an HTML comment) so it survives
 * Basecamp's HTML sanitizer, and it is honest: the reader sees that Ali's AI
 * assistant wrote it, not Ali personally.
 *
 * Pure + null-safe so it can be unit-tested without a DB/API.
 */

// Stable token embedded in every ATA-authored comment footer. Detection keys on
// this literal, so it must never change without a migration of the guard.
const ATA_MARKER = 'ata:auto';
const ATA_SIGNOFF_LABEL = "Posted by Ali's AI assistant (ATA)";

function stripEmDashes(s) {
  return (s || '').replace(/—/g, '-').replace(/–/g, '-');
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The footer appended to every ATA comment. Carries the human-readable label,
 * the machine marker, the date, and (optionally) the run id for traceability.
 * @param {{ runId?: string, date?: string }} [opts]
 */
function ataSignoffHtml(opts = {}) {
  const date = opts.date || new Date().toISOString().slice(0, 10);
  const run = opts.runId ? ` &middot; run ${opts.runId}` : '';
  return `<div style="margin-top:12px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:6px">${ATA_SIGNOFF_LABEL} &middot; <code>${ATA_MARKER}</code> &middot; ${date}${run}<br>Reply here to revise. ATA never sends external communications, it only drafts them for Ali to send.</div>`;
}

/**
 * True when a comment was authored by ATA (i.e. by Ali's identity AND carries
 * the ATA marker). Used by the queue builder to never treat ATA's own output
 * as a fresh task, and by the idempotency guard. Requiring BOTH the author id
 * and the marker means a genuine human Ali comment (no marker) is never
 * mistaken for an ATA post.
 * @param {{ creator?: { id?: number }, content?: string }} comment
 * @param {number} aliId
 */
function isAtaPost(comment, aliId) {
  if (!comment || !comment.creator) return false;
  if (Number(comment.creator.id) !== Number(aliId)) return false;
  return stripHtml(comment.content).toLowerCase().includes(ATA_MARKER);
}

module.exports = {
  ATA_MARKER,
  ATA_SIGNOFF_LABEL,
  ataSignoffHtml,
  isAtaPost,
  stripEmDashes,
  stripHtml,
};
