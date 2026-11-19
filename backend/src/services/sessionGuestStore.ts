/**
 * sessionGuestStore.ts — the data layer for Open House GUESTS: people who join
 * a live session's voting with just a name and email (no login link), Ali
 * 2026-10-29: "we will just take their word for it and try to match the emails
 * with the enrollments."
 *
 * Guests live in their own tables (session_guests, session_guest_poll_responses,
 * see ensureLiveSessionSchema.ts) because session_poll_responses.enrollment_id
 * is a foreign key to enrollments — a guest is not an enrollment, and creating
 * enrollments for unverified emails would pollute cohort counts. A guest whose
 * email matches an enrollment in the session's cohort gets `enrollment_id` set,
 * for follow-up only; it grants nothing.
 *
 * DB-only and dependency-light so sessionLiveStateService can fold guest
 * counts/tallies/names into the deck's live state without a circular import.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { formatDisplayName } from './sessionPresenceService';

export interface SessionGuest { id: string; session_id: string; name: string; email: string; enrollment_id: string | null }

/** Idempotent on (session, lower(email)): re-joining returns the same guest and
 * refreshes the name, so a phone that reloads never becomes a second voter.
 *
 * `awaitingClass` is true for a QR check-in scanned BEFORE the class window: the
 * name and email are captured, but it is not attendance yet. A later scan inside
 * the window clears it (AND keeps it cleared — a checked-in guest who re-scans
 * after class is never un-checked). Every Open House join passes false. */
export async function upsertGuest(
  sessionId: string, name: string, email: string, opts: { awaitingClass?: boolean } = {},
): Promise<SessionGuest> {
  const [match] = await sequelize.query<{ id: string }>(
    `SELECT e.id FROM enrollments e JOIN live_sessions s ON s.cohort_id = e.cohort_id
      WHERE s.id = :sid AND LOWER(e.email) = LOWER(:email) LIMIT 1`,
    { replacements: { sid: sessionId, email }, type: QueryTypes.SELECT },
  );
  const rows = await sequelize.query<SessionGuest>(
    `INSERT INTO session_guests (session_id, name, email, email_lower, enrollment_id, awaiting_class, created_at, updated_at)
       VALUES (:sid, :name, :email, LOWER(:email), :eid, :awaiting, NOW(), NOW())
     ON CONFLICT (session_id, email_lower)
       DO UPDATE SET name = EXCLUDED.name, enrollment_id = COALESCE(EXCLUDED.enrollment_id, session_guests.enrollment_id),
                     awaiting_class = session_guests.awaiting_class AND EXCLUDED.awaiting_class, updated_at = NOW()
     RETURNING id, session_id, name, email, enrollment_id`,
    { replacements: { sid: sessionId, name, email, eid: match?.id ?? null, awaiting: !!opts.awaitingClass }, type: QueryTypes.SELECT },
  );
  return rows[0];
}

/** A guest's live status (the same four states a signed-in student taps). */
export async function setGuestPulse(sessionId: string, guestId: string, state: string): Promise<void> {
  await sequelize.query(
    `UPDATE session_guests SET pulse_state = :state, updated_at = NOW() WHERE id = :gid AND session_id = :sid`,
    { replacements: { sid: sessionId, gid: guestId, state } },
  );
}

export async function getGuestPulse(sessionId: string, guestId: string): Promise<string | null> {
  const [r] = await sequelize.query<{ pulse_state: string | null }>(
    `SELECT pulse_state FROM session_guests WHERE id = :gid AND session_id = :sid`,
    { replacements: { gid: guestId, sid: sessionId }, type: QueryTypes.SELECT },
  );
  return r?.pulse_state ?? null;
}

/** Guest pulse counts per state, merged into the deck's pulse rail. */
export async function getGuestPulseCounts(sessionId: string): Promise<Record<string, number>> {
  const rows = await sequelize.query<{ state: string; n: number }>(
    `SELECT pulse_state AS state, COUNT(*)::int AS n FROM session_guests
      WHERE session_id = :sid AND pulse_state IS NOT NULL GROUP BY pulse_state`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.state] = Number(r.n) || 0;
  return out;
}

export async function addGuestQuestion(sessionId: string, guestId: string, senderName: string, content: string): Promise<void> {
  await sequelize.query(
    `INSERT INTO session_guest_questions (session_id, guest_id, sender_name, content, created_at)
       VALUES (:sid, :gid, :name, :content, NOW())`,
    { replacements: { sid: sessionId, gid: guestId, name: senderName, content } },
  );
}

/** Most-recent-first guest questions, same shape the deck reads from the class chat. */
export async function getGuestQuestions(sessionId: string, limit = 15): Promise<Array<{ sender_name: string; content: string; created_at: string }>> {
  return sequelize.query<{ sender_name: string; content: string; created_at: string }>(
    `SELECT sender_name, content, created_at FROM session_guest_questions
      WHERE session_id = :sid ORDER BY created_at DESC LIMIT :lim`,
    { replacements: { sid: sessionId, lim: limit }, type: QueryTypes.SELECT },
  );
}

/** Guests who did anything in class (pulsed, voted or asked) — the deck's "participated". */
export async function countParticipatingGuests(sessionId: string): Promise<number> {
  const [r] = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM session_guests g
      WHERE g.session_id = :sid AND (
        g.pulse_state IS NOT NULL
        OR EXISTS (SELECT 1 FROM session_guest_poll_responses r WHERE r.guest_id = g.id)
        OR EXISTS (SELECT 1 FROM session_guest_questions q WHERE q.guest_id = g.id))`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  return Number(r?.n) || 0;
}

export async function findGuest(sessionId: string, guestId: string): Promise<SessionGuest | null> {
  const [g] = await sequelize.query<SessionGuest>(
    `SELECT id, session_id, name, email, enrollment_id FROM session_guests WHERE id = :gid AND session_id = :sid`,
    { replacements: { gid: guestId, sid: sessionId }, type: QueryTypes.SELECT },
  );
  return g || null;
}

export async function recordGuestVote(sessionId: string, guestId: string, pollKey: string, choice: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO session_guest_poll_responses (session_id, guest_id, poll_key, choice, created_at)
       VALUES (:sid, :gid, :key, :choice, NOW())
     ON CONFLICT (session_id, guest_id, poll_key) DO UPDATE SET choice = EXCLUDED.choice, created_at = NOW()`,
    { replacements: { sid: sessionId, gid: guestId, key: pollKey, choice } },
  );
}

export async function getGuestChoice(sessionId: string, guestId: string, pollKey: string): Promise<number | null> {
  const [r] = await sequelize.query<{ choice: number }>(
    `SELECT choice FROM session_guest_poll_responses WHERE session_id = :sid AND guest_id = :gid AND poll_key = :key`,
    { replacements: { sid: sessionId, gid: guestId, key: pollKey }, type: QueryTypes.SELECT },
  );
  return r ? Number(r.choice) : null;
}

export async function countGuests(sessionId: string): Promise<number> {
  const [r] = await sequelize.query<{ n: number }>(
    // A pre-class scan is not attendance (see upsertGuest).
    `SELECT COUNT(*)::int AS n FROM session_guests WHERE session_id = :sid AND NOT awaiting_class`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  return Number(r?.n) || 0;
}

/** Guest votes per option index, same shape as getPollTally. */
export async function getGuestTally(sessionId: string, pollKey: string): Promise<number[]> {
  const rows = await sequelize.query<{ choice: number; n: number }>(
    `SELECT choice, COUNT(*)::int AS n FROM session_guest_poll_responses
      WHERE session_id = :sid AND poll_key = :key GROUP BY choice`,
    { replacements: { sid: sessionId, key: pollKey }, type: QueryTypes.SELECT },
  );
  const tally: number[] = [];
  for (const r of rows) tally[r.choice] = Number(r.n) || 0;
  return tally;
}

/** Redacted names ("First L.") of guests who chose `choice` — the raffle pool. */
export async function getGuestCorrectNames(sessionId: string, pollKey: string, choice: number): Promise<string[]> {
  const rows = await sequelize.query<{ name: string }>(
    `SELECT g.name FROM session_guest_poll_responses r JOIN session_guests g ON g.id = r.guest_id
      WHERE r.session_id = :sid AND r.poll_key = :key AND r.choice = :choice ORDER BY g.name`,
    { replacements: { sid: sessionId, key: pollKey, choice }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => formatDisplayName(r.name));
}

/** Element-wise sum of two tallies (either may be sparse). */
export function addTallies(a: number[], b: number[]): number[] {
  const out: number[] = [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) out[i] = (a[i] || 0) + (b[i] || 0);
  return out;
}
