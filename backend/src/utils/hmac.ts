import crypto from 'crypto';

/**
 * Verify an HMAC-SHA256 signature in the format `sha256=<hex>`.
 *
 * - Missing/empty secret → accept (caller decides when HMAC is required).
 * - Missing/malformed signature when secret is present → reject.
 * - Accepts an optional rotating `previousSecret` to allow a grace window
 *   during key rotation (24h is typical).
 */
export function verifyHmacSignature(
  payload: string,
  signature: string | undefined | null,
  secret: string | undefined | null,
  previousSecret?: string | null
): boolean {
  if (!secret) return true;
  if (!signature) return false;

  const candidates = [secret, previousSecret].filter((s): s is string => typeof s === 'string' && s.length > 0);

  for (const s of candidates) {
    const expected = 'sha256=' + crypto.createHmac('sha256', s).update(payload).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * A stable, non-reversible stand-in for an identifier, for surfaces that must
 * group a person's rows together without learning who the person is.
 *
 * Keyed on purpose. `sha256Hex` is unkeyed, so hashing a visitor UUID with it
 * is reversible by anyone who can enumerate UUIDs — the hash is then a
 * pseudonym in name only. This takes the same shape the rest of the repo
 * already uses for signed values (`unsubscribeTokenService`,
 * `journeyLinkService`, `recordingTicket`): a secret from env, plus a literal
 * `context` prefix so an id minted for one surface can never collide with, or
 * be cross-used as, an id minted for another.
 *
 * The output is truncated to 16 hex characters (64 bits). That is far beyond
 * collision range for the row counts these surfaces return, and short enough
 * to read in a response.
 *
 * Stable for a given (context, value, secret). Rotating the secret rotates
 * every id, which is the intended behaviour: these are not durable keys and
 * nothing should join on them across a rotation.
 */
export function pseudonymousId(context: string, value: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${context}:${value}`)
    .digest('hex')
    .slice(0, 16);
}
