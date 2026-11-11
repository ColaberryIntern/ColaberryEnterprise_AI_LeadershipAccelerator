/**
 * sessionGuestService.ts — the Open House guest flow: join with name + email
 * (no login link), see the question that is on the projected deck, vote.
 *
 * Guest passes are SESSION-SCOPED signed tokens (typ 'guest'): they authorize
 * exactly two things for one session — reading the current question and
 * casting a vote. They grant no portal access, so typing a real student's
 * email can never open that student's account; the email is only matched to
 * an enrollment for follow-up.
 *
 * A session accepts guests when `guest_access` is true, and only then. This was
 * a match on the class TITLE until D4 (P4-01) made it an explicit setting on
 * Studio setup; see `assertGuestSession` for why the title was not kept as a
 * fallback.
 *
 * Failure modes handled: a session that does not accept guests (GuestError 404),
 * malformed input (400 at the controller), expired/forged pass (401), a vote
 * after the instructor locked the question (PollLockedError → 409), a vote on
 * a question that is not on screen (409). Re-joining with the same email is
 * idempotent (same guest, same votes).
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import LiveSession from '../models/LiveSession';
import { getBroadcast, PollLockedError } from './sessionLiveStateService';
import { findGuest, getGuestChoice, recordGuestVote, upsertGuest } from './sessionGuestStore';

export class GuestError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'GuestError'; }
}

interface GuestPass { typ: 'guest'; sid: string; gid: string }

export function mintGuestPass(sessionId: string, guestId: string): string {
  return jwt.sign({ typ: 'guest', sid: sessionId, gid: guestId } as GuestPass, env.jwtSecret, { expiresIn: '12h' });
}

/** The guest id when `token` is a valid pass for this session, else null. */
export function verifyGuestPass(token: string | undefined, sessionId: string): string | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.jwtSecret) as GuestPass;
    return p?.typ === 'guest' && p.sid === sessionId && typeof p.gid === 'string' ? p.gid : null;
  } catch {
    return null;
  }
}

/**
 * D4 — guest access is a SETTING on the session, not a property of its title.
 *
 * This used to read `/open house/i` against the class title, so whether an outsider could watch
 * depended on what the class was called. Renaming a class changed who could see it; a class that
 * wanted guests had to be called "Open House" whatever it was actually about.
 *
 * `guest_access` now decides, and nothing else does. The title is still returned because callers
 * display it, but it no longer gates anything.
 *
 * NULL and false both refuse, and they are not the same thing: NULL is "never configured", false
 * is "somebody decided no". Both deny, so the fail-closed default survives either way — but the
 * distinction is why `ensureStudioSetupSchema`'s backfill is scoped to `guest_access IS NULL`.
 * An operator who turns guests OFF on a session that happens to be called "Open House" stays off.
 * Keeping the title as an OR-fallback would have let the name of the class override that explicit
 * refusal, which is the opposite of what this change is for.
 *
 * Capability is untouched: a guest may still only read the current question and vote. This
 * decides WHO may join, never WHAT they may do.
 */
export async function assertGuestSession(sessionId: string): Promise<{ title: string }> {
  const s = await LiveSession.findByPk(sessionId, {
    attributes: ['id', 'title', 'guest_access'],
  });
  const title = s ? String(s.get('title') || '') : '';
  if (!s || s.get('guest_access') !== true) {
    throw new GuestError(404, 'This session is not open to guests');
  }
  return { title };
}

export async function joinAsGuest(sessionId: string, name: string, email: string): Promise<{ pass: string; name: string; matched: boolean }> {
  await assertGuestSession(sessionId);
  const g = await upsertGuest(sessionId, name, email);
  return { pass: mintGuestPass(sessionId, g.id), name: g.name, matched: !!g.enrollment_id };
}

async function requireGuest(sessionId: string, pass: string | undefined) {
  const gid = verifyGuestPass(pass, sessionId);
  const guest = gid ? await findGuest(sessionId, gid) : null;
  if (!guest) throw new GuestError(401, 'Please join again');
  return guest;
}

export interface GuestState {
  name: string;
  title: string;
  question: null | { key: string; q: string; options: string[]; my_choice: number | null; locked: boolean; revealed: boolean; answer: number | null };
}

/** What the guest's phone shows: the question on the projected deck, if any. */
export async function getGuestState(sessionId: string, pass: string | undefined): Promise<GuestState> {
  const guest = await requireGuest(sessionId, pass);
  const bc = await getBroadcast(sessionId);
  if (!bc || bc.phase !== 'question' || !bc.question) return { name: guest.name, title: bc?.title || '', question: null };
  const q = bc.question;
  const st = q.theater?.state;
  return {
    name: guest.name,
    title: bc.title,
    question: {
      key: q.key, q: q.q, options: q.options,
      my_choice: await getGuestChoice(sessionId, guest.id, q.key),
      locked: st === 'locked' || st === 'revealed',
      revealed: !!q.revealed,
      // The answer reaches the phone only after the instructor reveals it.
      answer: q.revealed && typeof q.answer === 'number' ? q.answer : null,
    },
  };
}

export async function castGuestVote(sessionId: string, pass: string | undefined, pollKey: string, choice: number): Promise<void> {
  const guest = await requireGuest(sessionId, pass);
  const bc = await getBroadcast(sessionId);
  if (!bc || bc.phase !== 'question' || !bc.question || bc.question.key !== pollKey) throw new GuestError(409, 'That question is no longer open');
  if (choice >= bc.question.options.length) throw new GuestError(400, 'Unknown option');
  if (bc.question.theater && bc.question.theater.state !== 'voting') throw new PollLockedError();
  await recordGuestVote(sessionId, guest.id, pollKey, choice);
}
