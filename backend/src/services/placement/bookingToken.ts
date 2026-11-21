import { createHash, randomBytes } from 'crypto';

/**
 * Career Prep v27, CP8.2 (kit F4 step 3): the booking link's token. PURE. A random 32-byte value (base64url) goes in
 * the link; ONLY its SHA-256 hash is stored (placement_interviews.booking_token_hash), so a database read can never
 * rebuild a live link. It lasts 14 days and is single use (T17 adds the lookup, the expiry check and marking it used).
 */
export const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const hashBookingToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

export function newBookingToken(now: Date = new Date(), bytes: () => Buffer = () => randomBytes(32)): { token: string; hash: string; expiresAt: Date } {
  const token = bytes().toString('base64url');
  return { token, hash: hashBookingToken(token), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS) };
}
