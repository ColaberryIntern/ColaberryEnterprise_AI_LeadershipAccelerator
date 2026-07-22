// sessionLiveStateService — the live "class pulse": students set a status from
// their phone (here / building / stuck / finished) and ask questions; the
// instructor's Class Kit deck reads aggregate counts + recent questions to drive
// the pulse rail and presenter feedback.
//
// Pulse is one upserted row per (enrollment, session) — race-safe under rapid
// taps via ON CONFLICT. Questions reuse the existing session_chat_messages table
// (a question IS a chat message), so nothing new is needed to store them.
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

export type PulseState = 'here' | 'building' | 'stuck' | 'finished';
const VALID_STATES: PulseState[] = ['here', 'building', 'stuck', 'finished'];

export function isValidPulseState(s: unknown): s is PulseState {
  return typeof s === 'string' && (VALID_STATES as string[]).includes(s);
}

/** Upsert a student's live status for a session (one row per enrollment+session). */
export async function recordPulse(sessionId: string, enrollmentId: string, state: PulseState): Promise<void> {
  await sequelize.query(
    `INSERT INTO session_pulse (session_id, enrollment_id, state, updated_at)
       VALUES (:sid, :eid, :state, NOW())
     ON CONFLICT (enrollment_id, session_id)
       DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
    { replacements: { sid: sessionId, eid: enrollmentId, state } },
  );
}

export interface LiveQuestion { name: string; text: string; at: string; }
export interface LiveState {
  here: number;
  building: number;
  stuck: number;
  finished: number;
  questions: LiveQuestion[];
}

/** Aggregate pulse counts + the most recent questions (chat) for a session. */
export async function getLiveState(sessionId: string): Promise<LiveState> {
  const counts = await sequelize.query<{ state: string; n: string }>(
    `SELECT state, COUNT(*)::int AS n FROM session_pulse WHERE session_id = :sid GROUP BY state`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  const c: Record<string, number> = { here: 0, building: 0, stuck: 0, finished: 0 };
  for (const row of counts) c[row.state] = Number(row.n) || 0;

  const msgs = await sequelize.query<{ sender_name: string; content: string; created_at: string }>(
    `SELECT sender_name, content, created_at
       FROM session_chat_messages
      WHERE session_id = :sid
      ORDER BY created_at DESC
      LIMIT 15`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );

  return {
    here: c.here, building: c.building, stuck: c.stuck, finished: c.finished,
    questions: msgs.map((m) => ({ name: m.sender_name, text: m.content, at: String(m.created_at) })),
  };
}
