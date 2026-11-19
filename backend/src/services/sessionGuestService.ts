/**
 * sessionGuestService.ts — the guest flow: join with name + email (no login
 * link), see what is on the projected deck, vote, set a status, ask a question.
 * Two doors: the Open House join page, and (since 2026-11-19) the class QR
 * check-in on any class — see `assertCheckinSession`.
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
import { getBroadcast, PollLockedError, isValidPulseState, PulseState, BroadcastPrompt } from './sessionLiveStateService';
import {
  findGuest, getGuestChoice, recordGuestVote, upsertGuest, setGuestPulse, getGuestPulse, addGuestQuestion,
} from './sessionGuestStore';
import { classWindowAt, ClassWindow } from './classCheckinWindow';
import { recordAttendanceRow } from './liveSessionAttendanceService';
import { formatDisplayName } from './sessionPresenceService';

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

/**
 * The class QR check-in (`/portal/class-checkin/:id`) is a DIFFERENT door from the Open House
 * join page, and it is open on every class (Ali, 2026-11-19: "They should get name and email
 * here for tracking"). Attendees scan the deck's QR on their phones; most are not signed in,
 * and on 2026-11-19 the cohort's enrollment list was not a real roster either, so check-in
 * cannot depend on being a signed-in member of the class.
 *
 * What it still refuses:
 *  - a session that does not exist (404);
 *  - a session an operator explicitly closed to guests (`guest_access === false`, 404). NULL is
 *    "never configured" and admits — that is every class today — but a deliberate "no" on
 *    Studio setup is honoured here exactly as on the Open House page (D4);
 *  - a class that has ended (410): a scan afterwards is not attendance.
 *
 * Capability is unchanged: the pass this mints is the same session-scoped guest pass, so a
 * check-in guest can read what is on screen, vote, set a status and ask a question — and
 * nothing in the portal. Nothing here sends a message to anyone.
 */
export async function assertCheckinSession(sessionId: string): Promise<LiveSession> {
  const s = await LiveSession.findByPk(sessionId, {
    attributes: ['id', 'title', 'guest_access', 'status', 'session_date', 'start_time', 'end_time'],
  });
  if (!s || s.get('guest_access') === false) throw new GuestError(404, 'This class is not taking check-ins');
  return s;
}

export interface GuestJoinResult { pass: string; name: string; matched: boolean; class_window?: ClassWindow }

/**
 * `via: 'checkin'` is the class QR door above; omitted is the Open House page, unchanged.
 *
 * On the check-in door, inside the class window, a visitor whose email matches an enrollment in
 * the class's cohort also gets that enrollment's attendance row (create-only, never a
 * downgrade, no points — typing an email is a claim, not a sign-in). Everyone else is recorded
 * as a guest of the session, the way Open House guests are. Before the window the guest row is
 * captured with `awaiting_class`, so it does not count as attendance until they scan in class.
 */
export async function joinAsGuest(
  sessionId: string, name: string, email: string,
  opts: { via?: 'checkin'; now?: Date } = {},
): Promise<GuestJoinResult> {
  if (opts.via !== 'checkin') {
    await assertGuestSession(sessionId);
    const g = await upsertGuest(sessionId, name, email);
    return { pass: mintGuestPass(sessionId, g.id), name: g.name, matched: !!g.enrollment_id };
  }
  const s = await assertCheckinSession(sessionId);
  const now = opts.now ?? new Date();
  const window = classWindowAt({
    sessionDate: String(s.get('session_date')),
    startTime: String(s.get('start_time')),
    endTime: s.get('end_time') as string | null,
    status: s.get('status') as string,
    now,
  });
  if (window === 'ended') throw new GuestError(410, 'This class has already ended');
  const g = await upsertGuest(sessionId, name, email, { awaitingClass: window === 'before' });
  if (window === 'open' && g.enrollment_id) {
    await recordAttendanceRow(g.enrollment_id, {
      id: sessionId,
      session_date: String(s.get('session_date')),
      start_time: String(s.get('start_time')),
    }, now);
  }
  return { pass: mintGuestPass(sessionId, g.id), name: g.name, matched: !!g.enrollment_id, class_window: window };
}

/** A guest taps a live status (here / building / stuck / finished). */
export async function setGuestPulseFor(sessionId: string, pass: string | undefined, state: unknown): Promise<PulseState> {
  if (!isValidPulseState(state)) throw new GuestError(400, 'state must be one of: here, building, stuck, finished');
  const guest = await requireGuest(sessionId, pass);
  await setGuestPulse(sessionId, guest.id, state);
  return state;
}

/** Longest question a guest may send — the signed-in class chat's own cap. */
export const MAX_GUEST_QUESTION = 500;

/** A guest asks a question; it reaches the instructor deck beside the class chat. */
export async function askAsGuest(sessionId: string, pass: string | undefined, text: string): Promise<void> {
  const guest = await requireGuest(sessionId, pass);
  const content = text.trim();
  if (!content || content.length > MAX_GUEST_QUESTION) throw new GuestError(400, 'Write a question (up to 500 characters)');
  // The deck is projected, so the name shown is redacted exactly like a student's ("Ana R.").
  await addGuestQuestion(sessionId, guest.id, formatDisplayName(guest.name), content);
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
  /**
   * What the deck is on. Added for the class check-in page, which mirrors the deck the way a
   * signed-in student's phone does; the Open House page reads only `question` and `title`, so
   * every field below `question` is additive. Build Mode prompts and broadcast prompts are
   * already projected on the room's screen, so a guest seeing them reveals nothing new.
   */
  phase: 'status' | 'question' | 'broadcast' | 'prompt';
  question: null | {
    key: string; q: string; options: string[]; my_choice: number | null; locked: boolean; revealed: boolean; answer: number | null;
    kind: 'prediction' | 'poll' | 'trivia';
    theater?: { state: 'voting' | 'locked' | 'revealed' };
  };
  prompt?: BroadcastPrompt | null;
  broadcast_prompts?: string[];
  my_pulse: PulseState | null;
}

/** What the guest's phone shows: the question on the projected deck, if any. */
export async function getGuestState(sessionId: string, pass: string | undefined): Promise<GuestState> {
  const guest = await requireGuest(sessionId, pass);
  const bc = await getBroadcast(sessionId);
  const pulse = await getGuestPulse(sessionId, guest.id);
  const my_pulse = isValidPulseState(pulse) ? pulse : null;
  const base = { name: guest.name, title: bc?.title || '', my_pulse };
  if (bc?.phase === 'prompt') return { ...base, phase: 'prompt', question: null, prompt: bc.prompt || null };
  if (bc?.phase === 'broadcast') return { ...base, phase: 'broadcast', question: null, broadcast_prompts: bc.broadcast_prompts };
  if (!bc || bc.phase !== 'question' || !bc.question) return { ...base, phase: 'status', question: null };
  const q = bc.question;
  const st = q.theater?.state;
  return {
    ...base,
    phase: 'question',
    question: {
      kind: q.kind,
      theater: q.theater ? { state: q.theater.state } : undefined,
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
