import crypto from 'crypto';

/**
 * clientMagicLink — the rules for signing a client reviewer in by emailed link.
 *
 * Ali chose this over Google SSO once the audience was clear: *"let's just keep with the
 * magic link since that's what we are using for B2C and B2B."* Google Sign-In assumes a
 * Google account, and the executives this surface is built for — transit authorities,
 * banks, agencies — are overwhelmingly Microsoft 365 shops whose IT frequently blocks
 * creating one. A magic link works for **any** email address, with no account anywhere.
 *
 * ## This changes the identity proof and NOTHING about authorization
 *
 * `decideClientSignIn` still decides whether a session may exist, and it still requires a
 * delivery membership that already exists. A magic link proves *who* someone is, exactly
 * as Google did; it does not decide *what* they may see. That separation is why the auth
 * mechanism can be swapped without reopening the security model.
 *
 * ## Everything here is pure
 *
 * No database, no mailer, no clock of its own — `now` is passed in. The rules that matter
 * (expiry, single use, rate limiting, uniform refusal) are therefore testable without
 * standing anything up, which is the difference between a test that checks the rule and
 * one that checks a fixture agreeing with itself.
 */

/**
 * One hour. Long enough to survive a mail client's delay and a reader who opens it after
 * a meeting; short enough that a forwarded thread is not a standing credential.
 *
 * The sponsor implementation uses 30 days. That is defensible for a dashboard bookmark
 * and wrong for a login link: mail archives outlive engagements, and a month-long bearer
 * token in an inbox is a credential nobody is tracking.
 */
export const MAGIC_LINK_TTL_MS = 60 * 60 * 1000;

/** At most one link per address per minute, and six per hour. */
export const MIN_SECONDS_BETWEEN_REQUESTS = 60;
export const MAX_REQUESTS_PER_HOUR = 6;

/**
 * The single response the request endpoint gives, always.
 *
 * It must be identical for an address with access, an address with none, and an address
 * that does not exist. Anything else turns "request a link" into a way to discover who
 * reviews which client's work — the same oracle the sign-in refusal already avoids, and
 * it would be pointless to close one and open the other.
 */
export const GENERIC_LINK_REQUEST_RESPONSE =
  'If that address has access to a review, a sign-in link is on its way. It expires in one hour.';

/** Shown when a link is expired, already used, or was never real. Deliberately one message. */
export const GENERIC_LINK_INVALID =
  'That sign-in link is no longer valid. Links last one hour and can only be used once. Please request a new one.';

export interface MagicLinkRecord {
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface RecentRequest {
  createdAt: Date;
}

/**
 * Hash a token for storage.
 *
 * SHA-256 with no salt is correct here and would be wrong for a password: the input is
 * 128 bits of `crypto.randomUUID()` entropy, so there is no dictionary to attack and
 * nothing for a salt to defend against. What hashing buys is that the stored column is
 * not itself a credential — a database dump, a log line, or a support screenshot yields
 * no working link.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** A fresh token. Returned raw to the caller exactly once, then only ever stored hashed. */
export function mintToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomUUID();
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  };
}

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'too_soon' | 'hourly_cap' };

/**
 * Rate-limit a link request by address.
 *
 * Keyed on the EMAIL, not on whether an identity was found, because the limit has to
 * apply equally to addresses that match nobody. A limit that only engaged for real
 * accounts would make response timing a way to tell them apart — reintroducing by the
 * side door exactly the enumeration the uniform response closes.
 *
 * It also protects a real reviewer's inbox from being used to harass them.
 */
export function checkRateLimit(recent: readonly RecentRequest[], now: Date): RateLimitVerdict {
  const withinHour = recent.filter(
    (r) => now.getTime() - r.createdAt.getTime() < 60 * 60 * 1000,
  );
  if (withinHour.length >= MAX_REQUESTS_PER_HOUR) {
    return { allowed: false, reason: 'hourly_cap' };
  }

  const newest = withinHour.reduce<Date | null>(
    (acc, r) => (acc === null || r.createdAt > acc ? r.createdAt : acc),
    null,
  );
  if (newest && now.getTime() - newest.getTime() < MIN_SECONDS_BETWEEN_REQUESTS * 1000) {
    return { allowed: false, reason: 'too_soon' };
  }

  return { allowed: true };
}

export type RedemptionVerdict =
  | { valid: true }
  | { valid: false; reason: 'not_found' | 'expired' | 'already_used' };

/**
 * Decide whether a presented link may be redeemed.
 *
 * Fails closed on every uncertainty, and the three reasons are reported separately **for
 * the log only** — the caller collapses them into one message, because "expired",
 * "already used" and "never existed" each tell an attacker something different about a
 * token they guessed.
 */
export function decideRedemption(
  record: MagicLinkRecord | null,
  now: Date,
): RedemptionVerdict {
  if (!record) return { valid: false, reason: 'not_found' };
  if (record.consumedAt) return { valid: false, reason: 'already_used' };
  if (record.expiresAt.getTime() <= now.getTime()) return { valid: false, reason: 'expired' };
  return { valid: true };
}

/**
 * Normalise an address for lookup and rate limiting.
 *
 * Lower-cased and trimmed so `Ali@Example.com ` and `ali@example.com` are one subject for
 * both the membership lookup and the rate limit — otherwise changing the capitalisation
 * would be enough to bypass the limit.
 */
export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  // Deliberately permissive: this is a lookup key, not a validity claim. A stricter
  // pattern would reject legitimate addresses, and an address that matches nobody is
  // already handled by the uniform response.
  if (!trimmed || trimmed.length > 255 || !trimmed.includes('@')) return null;
  return trimmed;
}
