import { createHash, randomBytes } from 'crypto';

/**
 * Career Prep v27, CP8.2 (kit F4 step 3): the booking link's token. PURE. A random 32-byte value (base64url, 43 chars)
 * goes in the link; ONLY its SHA-256 hash is stored (placement_interviews.booking_token_hash, UNIQUE), so a database read
 * can never rebuild a live link. It lasts 14 days and is single use: confirming a time marks it used.
 */
export const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const hashBookingToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/** Only the shape we mint; anything else is "not found" without a database read. */
export const isPlausibleToken = (token: unknown): token is string => typeof token === 'string' && TOKEN_SHAPE.test(token);

export function newBookingToken(now: Date = new Date(), bytes: () => Buffer = () => randomBytes(32)): { token: string; hash: string; expiresAt: Date } {
  const token = bytes().toString('base64url');
  return { token, hash: hashBookingToken(token), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS) };
}

export type TokenStatus = 'ok' | 'used' | 'expired' | 'closed';
export interface TokenFacts { state: string; token_expires_at: Date | string | null; token_used_at: Date | string | null }

/** PURE: may this link still be used? Used before expired; an interview no longer open is closed. */
export function tokenStatus(row: TokenFacts, now: Date): TokenStatus {
  if (row.token_used_at) return 'used';
  if (!row.token_expires_at || now.getTime() > new Date(row.token_expires_at).getTime()) return 'expired';
  if (!['new', 'awaiting', 'review'].includes(row.state)) return 'closed';
  return 'ok';
}
