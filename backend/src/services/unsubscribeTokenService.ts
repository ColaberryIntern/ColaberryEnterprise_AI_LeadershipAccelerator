/**
 * Unsubscribe Token Service
 *
 * Stateless, signed one-click unsubscribe tokens for the RFC 8058
 * `List-Unsubscribe` / `List-Unsubscribe-Post` flow and the public
 * `/api/unsubscribe` endpoint.
 *
 * A token is an HMAC-SHA256 signature over `<context>:<leadId>:<email>` using
 * `env.unsubscribeSecret`. The email is folded into the signed payload so a
 * token is only valid for the lead it was minted for AND only while that lead's
 * email is unchanged — an attacker who guesses a sequential lead id still cannot
 * forge a valid signature without the server secret. The URL therefore carries
 * only `lid` + `sig` (no PII); the endpoint loads the lead, reads its email, and
 * re-computes the signature to verify.
 *
 * Domain separation: the `CONTEXT` prefix means this HMAC can never collide with
 * any other use of the same secret (e.g. JWTs), which is what lets us safely fall
 * back to the JWT secret in env when UNSUBSCRIBE_SECRET is unset.
 *
 * Failure model: verification is pure and cannot throw on attacker input — a
 * malformed / mismatched signature returns false (fail-closed). There is no
 * network or DB call here, so no timeout / retry policy applies.
 */
import crypto from 'crypto';
import { env } from '../config/env';

const CONTEXT = 'colaberry:unsubscribe:v1';

/** Normalize an email for signing so casing/whitespace never changes the token. */
function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

/** Compute the HMAC-SHA256 signature (hex) binding a lead id to its email. */
export function signUnsubscribe(leadId: number, email: string): string {
  const message = `${CONTEXT}:${leadId}:${normalizeEmail(email)}`;
  return crypto.createHmac('sha256', env.unsubscribeSecret).update(message).digest('hex');
}

/**
 * Constant-time verify that `sig` matches the token for (leadId, email).
 * Returns false for any malformed, empty, or mismatched signature.
 */
export function verifyUnsubscribe(leadId: number, email: string, sig: string): boolean {
  if (!sig || typeof sig !== 'string') return false;
  const expected = signUnsubscribe(leadId, email);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(sig, 'utf8');
  // timingSafeEqual throws if lengths differ, so length-check first (a mismatched
  // length is itself proof the token is invalid).
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Build the absolute public one-click unsubscribe URL for a lead.
 * Shape: `https://<publicAppUrl>/api/unsubscribe?lid=<id>&sig=<hmac>`
 */
export function buildUnsubscribeUrl(leadId: number, email: string): string {
  const sig = signUnsubscribe(leadId, email);
  const url = new URL('/api/unsubscribe', env.publicAppUrl);
  url.searchParams.set('lid', String(leadId));
  url.searchParams.set('sig', sig);
  return url.toString();
}
