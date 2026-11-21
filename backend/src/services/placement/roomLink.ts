import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { getCaseStudySurfaceProfile } from '../caseStudy/caseStudySurfaceProfiles';

/**
 * Career Prep v27, CP9.1 (execution contract, safety rules): the employer's link to the consent-room PAGE on the hire site,
 * `https://hire.refactored.ai/room/?i=<interview id>&e=<end ms>&t=<signature>`. It is never the meeting provider's link:
 * that is only returned by the room routes after consent (T22).
 *
 * The signature is HMAC-SHA256 over "<interview id>.<end ms>" with a key derived from the app's JWT secret for this one
 * purpose (no new secret or env var). It stops working 2 hours after the interview ends; checked timing-safe.
 */
export const ROOM_LINK_GRACE_MS = 2 * 60 * 60 * 1000;

const key = (secret = env.jwtSecret): Buffer => createHmac('sha256', String(secret)).update('placement-room-link-v1').digest();
const sign = (id: string, endMs: number, secret?: string) => createHmac('sha256', key(secret)).update(`${id}.${endMs}`).digest('base64url');
const hireBase = () => (getCaseStudySurfaceProfile('hire').publicBaseUrl || 'https://hire.refactored.ai').replace(/\/$/, '');

export function roomPageUrl(interviewId: string, endsAt: Date, secret?: string): string {
  const e = endsAt.getTime();
  return `${hireBase()}/room/?i=${encodeURIComponent(interviewId)}&e=${e}&t=${sign(interviewId, e, secret)}`;
}

/**
 * The CANDIDATE's consent-room page in the portal (the learner signs in; the page checks the interview is theirs, T23):
 * `<frontend>/portal/career/interview/<id>`. Like the employer link, never the provider's link.
 */
export function candidateRoomUrl(interviewId: string, base: string = env.frontendUrl): string {
  return `${String(base).replace(/\/$/, '')}/portal/career/interview/${encodeURIComponent(interviewId)}`;
}

export function verifyRoomLink(input: { i: string; e: string; t: string; now: Date; secret?: string }): boolean {
  if (!input.i || !/^\d{1,15}$/.test(input.e) || !/^[A-Za-z0-9_-]{43}$/.test(input.t)) return false;
  const endMs = Number(input.e);
  if (input.now.getTime() > endMs + ROOM_LINK_GRACE_MS) return false;
  const want = Buffer.from(sign(input.i, endMs, input.secret));
  const got = Buffer.from(input.t);
  return want.length === got.length && timingSafeEqual(want, got);
}
