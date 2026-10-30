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
 * refreshes the name, so a phone that reloads never becomes a second voter. */
export async function upsertGuest(sessionId: string, name: string, email: string): Promise<SessionGuest> {
  const [match] = await sequelize.query<{ id: string }>(
    `SELECT e.id FROM enrollments e JOIN live_sessions s ON s.cohort_id = e.cohort_id
      WHERE s.id = :sid AND LOWER(e.email) = LOWER(:email) LIMIT 1`,
    { replacements: { sid: sessionId, email }, type: QueryTypes.SELECT },
  );
  const rows = await sequelize.query<SessionGuest>(
    `INSERT INTO session_guests (session_id, name, email, email_lower, enrollment_id, created_at, updated_at)
       VALUES (:sid, :name, :email, LOWER(:email), :eid, NOW(), NOW())
     ON CONFLICT (session_id, email_lower)
       DO UPDATE SET name = EXCLUDED.name, enrollment_id = COALESCE(EXCLUDED.enrollment_id, session_guests.enrollment_id), updated_at = NOW()
     RETURNING id, session_id, name, email, enrollment_id`,
    { replacements: { sid: sessionId, name, email, eid: match?.id ?? null }, type: QueryTypes.SELECT },
  );
  return rows[0];
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
    `SELECT COUNT(*)::int AS n FROM session_guests WHERE session_id = :sid`,
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
