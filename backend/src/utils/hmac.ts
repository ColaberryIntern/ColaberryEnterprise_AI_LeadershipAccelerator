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
