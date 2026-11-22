import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { ROOM_LINK_GRACE_MS } from './roomLink';

/**
 * Career Prep v27, CP9.2: the replay recording's path on OUR server, signed for ONE interview, ONE party and one hour
 * (T24 fold 1). The candidate's link signs "<id>.candidate.<expiry>"; the employer's signs "<id>.employer.<e>.<expiry>",
 * where e is their room link's end time, so it also stops when that room link does (end + 2 hours) and the route can
 * check the booking was not moved. Changing the party, the end time or the expiry breaks the signature, so a candidate
 * link cannot be used as an employer's and the reverse. HMAC-SHA256 with a key derived from the app's JWT secret for
 * this one purpose (no new secret); checked timing-safe. The path never carries Zoom's file location.
 */
export const RECORDING_LINK_MS = 60 * 60_000;

export type RecordingParty = { kind: 'candidate' } | { kind: 'employer'; e: number };
export type RecordingCheck = { status: 'ok'; party: RecordingParty } | { status: 'expired' | 'invalid' };

const key = (secret = env.jwtSecret): Buffer => createHmac('sha256', String(secret)).update('placement-replay-recording-v2').digest();
const payload = (id: string, p: RecordingParty, x: number) => (p.kind === 'candidate' ? `${id}.candidate.${x}` : `${id}.employer.${p.e}.${x}`);
const sign = (id: string, p: RecordingParty, x: number, secret?: string) => createHmac('sha256', key(secret)).update(payload(id, p, x)).digest('base64url');

export function recordingPath(interviewId: string, party: RecordingParty, now: Date, secret?: string): string {
  const x = now.getTime() + RECORDING_LINK_MS;
  const who = party.kind === 'candidate' ? 'p=c' : `p=e&e=${party.e}`;
  return `/api/public/replays/${encodeURIComponent(interviewId)}/recording?${who}&x=${x}&t=${sign(interviewId, party, x, secret)}`;
}

export function checkRecordingLink(input: { i: string; p: string; e?: string; x: string; t: string; now: Date; secret?: string }): RecordingCheck {
  if (!/^\d{1,15}$/.test(input.x) || !/^[A-Za-z0-9_-]{43}$/.test(input.t)) return { status: 'invalid' };
  let party: RecordingParty;
  if (input.p === 'c' && input.e === undefined) party = { kind: 'candidate' };
  else if (input.p === 'e' && /^\d{1,15}$/.test(input.e ?? '')) party = { kind: 'employer', e: Number(input.e) };
  else return { status: 'invalid' };
  const want = Buffer.from(sign(input.i, party, Number(input.x), input.secret));
  const got = Buffer.from(input.t);
  if (!(want.length === got.length && timingSafeEqual(want, got))) return { status: 'invalid' };
  const t = input.now.getTime();
  if (t > Number(input.x) || (party.kind === 'employer' && t > party.e + ROOM_LINK_GRACE_MS)) return { status: 'expired' };
  return { status: 'ok', party };
}
