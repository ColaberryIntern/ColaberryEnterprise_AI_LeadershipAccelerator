/**
 * Pure decision helpers for the AI Pilot cold sender (sendAiPilotOutreach.js).
 *
 * Extracted so the safety-critical gates — opt-out/suppression union, CAN-SPAM
 * postal-address validity, and the per-lead eligibility decision — are unit-testable
 * without sending any email. CLAUDE.md marks opt-out enforcement and idempotency
 * NON-NEGOTIABLE, so these gates must have direct test coverage.
 */

/**
 * Build the lowercased opt-out set: everyone who replied/opted-out plus everyone
 * bounced/complained. Re-running with the same inputs yields the same set (idempotent).
 */
function buildOptOutSet(repliedList, suppressionList) {
  return new Set(
    [...(repliedList || []), ...(suppressionList || [])].map((e) => String(e).trim().toLowerCase())
  );
}

/**
 * CAN-SPAM: a valid physical mailing address must be non-empty and contain a digit
 * (a street or PO number). Mirrors the live-send gate; the sender refuses to send if false.
 */
function isValidCanSpamAddress(address) {
  return !!address && /\d/.test(String(address));
}

/**
 * Per-lead send decision for a given touch. Returns { send, reason }.
 * Skips: opted-out/bounced addresses; a touch already sent (idempotent re-run);
 * and any follow-up (touch > 1) to someone who never received touch 1.
 */
function shouldSend(email, touch, optOutSet, sentLog) {
  const e = String(email || '').trim().toLowerCase();
  const t = String(touch);
  if (!e || !e.includes('@')) return { send: false, reason: 'invalid-email' };
  if (optOutSet.has(e)) return { send: false, reason: 'opted-out' };
  const rec = (sentLog && (sentLog[e] || sentLog[email])) || null;
  if (rec && rec[t]) return { send: false, reason: 'already-sent-touch' };
  if (t !== '1' && !(rec && rec['1'])) return { send: false, reason: 'no-touch-1' };
  return { send: true, reason: 'eligible' };
}

module.exports = { buildOptOutSet, isValidCanSpamAddress, shouldSend };
