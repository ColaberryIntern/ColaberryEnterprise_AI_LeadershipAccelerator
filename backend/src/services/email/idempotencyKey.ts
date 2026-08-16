import crypto from 'crypto';

/**
 * The one definition of a transactional-send idempotency key.
 *
 * Kept in its own module, with NO database import, for two reasons. First, the
 * file-backed ledger has to run on a laptop with no DATABASE_URL, and pulling
 * in config/database would make it require one. Second, and more importantly,
 * the file ledger and the Postgres ledger must agree on the key byte for byte —
 * if each computed its own, a send recorded under one would not be found by the
 * other, and the handover from tonight's file to next week's table would
 * silently re-send everybody.
 *
 * The formula is fixed by the 25 drafts already written to disk and by
 * `verify-drafts.js`, which recomputes and rejects a mismatch:
 *
 *   sha256([recipient.toLowerCase(), subject, business_event_id].join('|'))[0:32]
 *
 * The separator is a literal `|`, the recipient is lower-cased, the subject is
 * used exactly as it appears in the message, and the digest is truncated to 32
 * hex characters. None of that is adjustable without invalidating every key in
 * every draft's front matter.
 */
export function computeIdempotencyKey(
  recipient: string,
  subject: string,
  businessEventId: string,
): string {
  const material = [recipient.trim().toLowerCase(), subject, businessEventId].join('|');
  return crypto.createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 32);
}
