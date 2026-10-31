/**
 * sessionRaffleService.ts — live giveaway draws, done and RECORDED on the
 * server. Before this the deck picked a name in the browser and kept it in
 * localStorage, so the Oct 29 Open House winners had to be recovered from the
 * Zoom recording (Ali, 2026-10-30: "I like the idea of saving the winners to
 * the database. We will start doing these open houses every 2 weeks").
 *
 * Entrants = everyone who picked the draw question's `answer` option: Open
 * House guests (session_guest_poll_responses) and logged-in students
 * (session_poll_responses). The draw is uniform (crypto.randomInt) over the
 * entrants who have not already won this draw.
 *
 * Idempotent: (session, poll_key, draw_number) is unique. A repeated draw
 * number — a double click, a reloaded deck, a retried request — returns the
 * stored winner and never draws again. Partial unique indexes stop the same
 * person winning one draw twice even under a race.
 *
 * Failure modes: question not on screen / no answer option (RaffleError 409),
 * draw number beyond the prize count (400), nobody left to draw (409).
 */
import { randomInt } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getBroadcast } from './sessionLiveStateService';
import { formatDisplayName } from './sessionPresenceService';

export class RaffleError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'RaffleError'; }
}

export interface RaffleWinner {
  poll_key: string;
  draw_number: number;
  display_name: string;
  full_name: string;
  email: string | null;
  created_at: string;
}

interface Entrant { guest_id: string | null; enrollment_id: string | null; full_name: string; email: string | null }

/** Pure: pick one entrant uniformly from those not already drawn. Exported for tests. */
export function pickEntrant<T>(pool: T[], rand: (n: number) => number = randomInt): T | null {
  if (!pool.length) return null;
  return pool[rand(pool.length)];
}

export async function listRaffleWinners(sessionId: string): Promise<RaffleWinner[]> {
  return sequelize.query<RaffleWinner>(
    `SELECT poll_key, draw_number, display_name, full_name, email, created_at FROM session_raffle_winners
      WHERE session_id = :sid ORDER BY poll_key, draw_number`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
}

async function existingWinner(sessionId: string, pollKey: string, drawNumber: number): Promise<RaffleWinner | null> {
  const [w] = await sequelize.query<RaffleWinner>(
    `SELECT poll_key, draw_number, display_name, full_name, email, created_at FROM session_raffle_winners
      WHERE session_id = :sid AND poll_key = :key AND draw_number = :n`,
    { replacements: { sid: sessionId, key: pollKey, n: drawNumber }, type: QueryTypes.SELECT },
  );
  return w || null;
}

/** Everyone who entered (picked `answer`) and has not won this draw yet. */
async function remainingEntrants(sessionId: string, pollKey: string, answer: number): Promise<Entrant[]> {
  return sequelize.query<Entrant>(
    `SELECT g.id AS guest_id, NULL::uuid AS enrollment_id, g.name AS full_name, g.email
       FROM session_guest_poll_responses r JOIN session_guests g ON g.id = r.guest_id
      WHERE r.session_id = :sid AND r.poll_key = :key AND r.choice = :ans
        AND NOT EXISTS (SELECT 1 FROM session_raffle_winners w WHERE w.session_id = :sid AND w.poll_key = :key AND w.guest_id = g.id)
     UNION ALL
     SELECT NULL::uuid, e.id, e.full_name, e.email
       FROM session_poll_responses r JOIN enrollments e ON e.id = r.enrollment_id
      WHERE r.session_id = :sid AND r.poll_key = :key AND r.choice = :ans
        AND NOT EXISTS (SELECT 1 FROM session_raffle_winners w WHERE w.session_id = :sid AND w.poll_key = :key AND w.enrollment_id = e.id)
     ORDER BY 3`,
    { replacements: { sid: sessionId, key: pollKey, ans: answer }, type: QueryTypes.SELECT },
  );
}

/**
 * Draw winner number `drawNumber` (1-based) of `maxWinners` for the draw
 * question currently on screen. Returns the stored winner if that number was
 * already drawn.
 */
export async function drawRaffleWinner(
  sessionId: string, pollKey: string, drawNumber: number, maxWinners: number,
  rand: (n: number) => number = randomInt,
): Promise<RaffleWinner> {
  if (!Number.isInteger(drawNumber) || drawNumber < 1 || drawNumber > maxWinners) throw new RaffleError(400, 'All winners for this draw are already drawn');
  const already = await existingWinner(sessionId, pollKey, drawNumber);
  if (already) return already;

  const bc = await getBroadcast(sessionId);
  const q = bc?.question;
  if (!q || q.key !== pollKey || typeof q.answer !== 'number') throw new RaffleError(409, 'That draw is not on screen');

  // Two attempts: if a concurrent request took the same person (unique index),
  // re-read the pool once and draw again; never loop unbounded.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pick = pickEntrant(await remainingEntrants(sessionId, pollKey, q.answer), rand);
    if (!pick) throw new RaffleError(409, 'No entrants left to draw');
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO session_raffle_winners (session_id, poll_key, draw_number, guest_id, enrollment_id, display_name, full_name, email, created_at)
         VALUES (:sid, :key, :n, :gid, :eid, :dn, :fn, :email, NOW())
       ON CONFLICT DO NOTHING RETURNING id`,
      {
        replacements: { sid: sessionId, key: pollKey, n: drawNumber, gid: pick.guest_id, eid: pick.enrollment_id,
          dn: formatDisplayName(pick.full_name), fn: pick.full_name, email: pick.email },
        type: QueryTypes.SELECT,
      },
    );
    const stored = await existingWinner(sessionId, pollKey, drawNumber);
    if (stored) return stored;           // ours, or a concurrent request's for this number
    if (rows.length) break;              // inserted but unreadable: fall through to the error
  }
  throw new RaffleError(409, 'Draw collided with another request; press Draw again');
}
