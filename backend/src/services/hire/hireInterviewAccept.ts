/**
 * hireInterviewAccept - the employer takes a time the candidate suggested (studio "Suggest a
 * time" -> status `rescheduled` -> this -> `confirmed`).
 *
 * The employer has no account, so the email carries a capability: an HMAC over the interview
 * id AND its current start time, keyed with the platform's signing secret under a purpose
 * prefix. Consequences, each deliberate:
 *   - The link is useless for any other interview, and forging one needs the secret.
 *   - If the candidate moves the time again, every older link stops working (the start time
 *     it signed is gone), so nobody can confirm a time that is no longer on offer.
 *   - Opening the link changes nothing. It lands on the schedule page, which shows the time
 *     and a button; only the POST confirms. Mail scanners that pre-fetch links cannot accept.
 *
 * Idempotent: accepting an already-confirmed interview at the signed time is a no-op success,
 * so a double-click or a retried POST is harmless. A time already in the past is refused.
 */
import crypto from 'crypto';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';

const PURPOSE = 'hire-interview-accept';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function acceptToken(id: string, startIso: string, secret: string = env.jwtSecret): string {
  return crypto.createHmac('sha256', secret).update(`${PURPOSE}|${id.toLowerCase()}|${startIso}`).digest('hex');
}

export function acceptUrl(base: string, f: { id: string; talentSlug: string; start: Date }): string {
  const q = new URLSearchParams({ accept: f.id, t: acceptToken(f.id, f.start.toISOString()) });
  return `${base}/talent/${f.talentSlug}/schedule/?${q.toString()}`;
}

function tokenMatches(given: string, expected: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  return crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
}

export type AcceptOutcome =
  | { status: 'open' | 'confirmed' | 'already'; http: 200; talentSlug: string; startsAt: string; minutes: number; format: string }
  | { status: 'invalid'; http: 404 }
  | { status: 'gone'; http: 409 };

/** What the schedule page shows before the button (`open`): only for a valid link, and no addresses. */
export async function readProposal(id: string, token: string, now: Date = new Date()): Promise<AcceptOutcome> {
  return check(id, token, now, false);
}

export async function acceptProposedTime(id: string, token: string, now: Date = new Date()): Promise<AcceptOutcome> {
  return check(id, token, now, true);
}

async function check(id: string, token: string, now: Date, commit: boolean): Promise<AcceptOutcome> {
  if (!UUID.test(id) || typeof token !== 'string') return { status: 'invalid', http: 404 };
  const [rows] = await sequelize.query(
    'SELECT id, talent_slug, starts_at, minutes, format, status FROM hire_interviews WHERE id = $1', { bind: [id] },
  );
  const r = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
  if (!r) return { status: 'invalid', http: 404 };
  const start = new Date(r.starts_at as string);
  // A wrong token is the same 404 as a missing interview: it says nothing about which ids exist.
  if (!tokenMatches(token, acceptToken(id, start.toISOString()))) return { status: 'invalid', http: 404 };
  const view = { talentSlug: String(r.talent_slug), startsAt: start.toISOString(), minutes: Number(r.minutes), format: String(r.format) };
  if (r.status === 'confirmed') return { status: 'already', http: 200, ...view };
  if (r.status !== 'rescheduled' || start.getTime() <= now.getTime()) return { status: 'gone', http: 409 };
  if (!commit) return { status: 'open', http: 200, ...view };
  const [updated] = await sequelize.query(
    `UPDATE hire_interviews SET status = 'confirmed', updated_at = NOW()
      WHERE id = $1 AND status = 'rescheduled' AND starts_at = $2 RETURNING id`,
    { bind: [id, start] },
  );
  if (!Array.isArray(updated) || !updated.length) return { status: 'gone', http: 409 };
  return { status: 'confirmed', http: 200, ...view };
}
