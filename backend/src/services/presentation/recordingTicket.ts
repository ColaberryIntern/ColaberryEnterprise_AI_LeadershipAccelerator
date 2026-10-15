import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * A short-lived signed ticket that lets a `<video>` element fetch one recording.
 *
 * WHY THIS IS NECESSARY, AND WHY I DID NOT SEE IT COMING. The playback route was
 * written behind `requireParticipant`, and the panel pointed a `<video src>` at it.
 * A video element issues a PLAIN browser GET — it carries no `Authorization` header,
 * and this portal authenticates with a bearer token held in localStorage and attached
 * by an axios interceptor. So every request was 401 by construction, on production,
 * with both players rendering and neither able to play a frame (2026-10-14).
 *
 * The obvious alternative — fetch the file through axios and hand the element a blob
 * URL — would authenticate correctly and destroy the thing the route exists for: it
 * buffers the whole file in memory and gives up Range requests, so seeking stops
 * working and a long rehearsal becomes a download-then-watch.
 *
 * So the URL itself carries the authority. The ticket is:
 *   - bound to ONE recording and ONE enrollment, so it cannot be replayed against
 *     another take or handed to another learner;
 *   - short-lived, so a URL that leaks into a log, a referrer or a shared screenshot
 *     stops working in minutes rather than forever;
 *   - signed with the server's existing JWT secret, so no new production
 *     configuration is required and nothing fails closed on a missing env var.
 *
 * IT IS NOT A SUBSTITUTE FOR THE OWNERSHIP CHECK. The route still resolves the
 * recording through project -> task -> attempt and compares the enrollment. A valid
 * ticket says "this link was issued to you"; the query still says "and it is yours".
 * Losing either one would be enough to serve somebody else's rehearsal.
 */

const CONTEXT = 'presentation-recording-v1';

/** Ten minutes: long enough to start a long video, short enough that a leak expires. */
export const DEFAULT_TICKET_TTL_SECONDS = 600;

export interface TicketClaims {
  recordingId: string;
  enrollmentId: string;
  /** Unix seconds. */
  exp: number;
}

function sign(body: string): string {
  return crypto.createHmac('sha256', env.jwtSecret).update(`${CONTEXT}:${body}`).digest('hex');
}

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64url = (s: string): string | null => {
  try {
    return Buffer.from(s, 'base64url').toString('utf8');
  } catch {
    return null;
  }
};

export function createRecordingTicket(
  recordingId: string,
  enrollmentId: string,
  ttlSeconds: number = DEFAULT_TICKET_TTL_SECONDS,
  now: Date = new Date(),
): string {
  const claims: TicketClaims = {
    recordingId,
    enrollmentId,
    exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(claims));
  return `${body}.${sign(body)}`;
}

/**
 * Verify and decode. Null for anything this server did not mint and is not still
 * valid: malformed, tampered, or expired.
 */
export function verifyRecordingTicket(
  ticket: string | null | undefined,
  now: Date = new Date(),
): TicketClaims | null {
  if (!ticket || typeof ticket !== 'string') return null;

  const parts = ticket.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = sign(body);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  // Length first: timingSafeEqual throws on a mismatch, and a different length is
  // itself proof of invalidity, so returning early leaks nothing.
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  const json = unb64url(body);
  if (!json) return null;

  let claims: TicketClaims;
  try {
    claims = JSON.parse(json) as TicketClaims;
  } catch {
    return null;
  }

  if (!claims || typeof claims.recordingId !== 'string' || typeof claims.enrollmentId !== 'string') return null;
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) return null;
  if (Math.floor(now.getTime() / 1000) >= claims.exp) return null;

  return claims;
}
