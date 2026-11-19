import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Short-lived, single-resource playback tokens for room recordings.
 *
 * WHY THIS EXISTS. `/resources/:id/download` is Bearer-gated, and a Bearer header
 * is exactly what a media element cannot send: `<video src=...>` and a plain tab
 * navigation both issue an unauthenticated GET. The portal worked around that by
 * fetching the whole file with axios as a Blob and handing the blob URL to a tab.
 * That works for a 2 MB PDF and is ruinous for a recording: the November 12 class
 * is 830 MB, so nothing at all played until the entire file had been pulled into
 * browser memory, and 82 students in that cohort were left watching a blank tab.
 * (Reported by a student on 2026-11-18; the freezing they also described is a
 * separate defect, a 4K source, addressed by the ingest cap in this same change.)
 *
 * A token lets the browser stream the file natively instead: Range requests, a
 * seek bar, and playback that starts on the first bytes.
 *
 * WHAT THE TOKEN IS NOT. It is not an authorization decision. Entitlement is
 * re-checked from the database on every single stream request, using the
 * enrollment id carried here. The token only answers "which enrollment is
 * asking", standing in for the Authorization header the media element cannot
 * send. So removing somebody from a room cuts off playback immediately rather
 * than at expiry, and a leaked URL is worth no more than the recipient's own
 * room access, for at most TTL_SECONDS.
 *
 * It is bound to one room AND one resource, so it cannot be replayed against a
 * different file, and it is signed with the server's JWT secret, which env.ts
 * already refuses to default in production.
 */

/**
 * Six hours. The longest recording on the platform runs 2h57m, so this covers
 * one sitting with pauses without becoming a durable credential. The player
 * re-mints on demand, so a longer window buys nothing.
 */
export const TTL_SECONDS = 6 * 60 * 60;

const VERSION = 'v1';

interface PlaybackPayload {
  /** room id */
  r: string;
  /** resource id */
  s: string;
  /** enrollment id — who is asking; NOT a grant */
  e: string;
  /** expiry, epoch seconds */
  x: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(payloadPart: string): string {
  return b64url(crypto.createHmac('sha256', env.jwtSecret).update(`${VERSION}.${payloadPart}`).digest());
}

export function mintPlaybackToken(args: {
  roomId: string;
  resourceId: string;
  enrollmentId: string;
  ttlSeconds?: number;
  now?: number;
}): { token: string; expiresAt: Date } {
  const nowMs = args.now ?? Date.now();
  const ttl = args.ttlSeconds ?? TTL_SECONDS;
  const exp = Math.floor(nowMs / 1000) + ttl;
  const payload: PlaybackPayload = { r: args.roomId, s: args.resourceId, e: args.enrollmentId, x: exp };
  const payloadPart = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return { token: `${VERSION}.${payloadPart}.${sign(payloadPart)}`, expiresAt: new Date(exp * 1000) };
}

export type PlaybackVerification =
  | { ok: true; enrollmentId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_resource' };

export function verifyPlaybackToken(
  token: string | undefined | null,
  expected: { roomId: string; resourceId: string },
  now: number = Date.now(),
): PlaybackVerification {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'malformed' };
  const [, payloadPart, sigPart] = parts;

  // Compare in constant time, and only on equal-length buffers — timingSafeEqual
  // throws on a length mismatch, which would turn a malformed token into a 500.
  const expectedSig = Buffer.from(sign(payloadPart), 'utf8');
  const givenSig = Buffer.from(sigPart, 'utf8');
  if (expectedSig.length !== givenSig.length) return { ok: false, reason: 'bad_signature' };
  if (!crypto.timingSafeEqual(expectedSig, givenSig)) return { ok: false, reason: 'bad_signature' };

  let payload: PlaybackPayload;
  try {
    payload = JSON.parse(unb64url(payloadPart).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.r !== 'string' || typeof payload.s !== 'string'
      || typeof payload.e !== 'string' || typeof payload.x !== 'number') {
    return { ok: false, reason: 'malformed' };
  }

  // Resource binding is checked BEFORE expiry so a token aimed at the wrong file
  // reports the real reason rather than whichever failure happens to come first.
  if (payload.r !== expected.roomId || payload.s !== expected.resourceId) {
    return { ok: false, reason: 'wrong_resource' };
  }
  if (payload.x * 1000 <= now) return { ok: false, reason: 'expired' };

  return { ok: true, enrollmentId: payload.e };
}
