// sessionLiveStateService — the live class loop that keeps the instructor deck
// and the students' phones in sync:
//   • pulse: students set status (here/building/stuck/finished) from the phone.
//   • broadcast: the deck writes its CURRENT view (slide/segment/active question)
//     so phones switch to the matching view automatically.
//   • poll responses: phones answer the active question; the deck reads live tallies.
//   • stats: how many are checked in (present) and how many are participating.
//
// Pulse/broadcast/poll are one upserted row (ON CONFLICT) so rapid taps and slide
// changes never duplicate. Questions reuse session_chat_messages.
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getRecentPresenceEvents, PresenceEvent, formatDisplayName } from './sessionPresenceService';

export type PulseState = 'here' | 'building' | 'stuck' | 'finished';
const VALID_STATES: PulseState[] = ['here', 'building', 'stuck', 'finished'];

export function isValidPulseState(s: unknown): s is PulseState {
  return typeof s === 'string' && (VALID_STATES as string[]).includes(s);
}

/**
 * Authorization guard: true only if the session belongs to the caller's cohort.
 * Every participant write/read here must pass this so a student in one cohort
 * cannot touch another class's live state (CLAUDE.md Security: validate the
 * resource belongs to the caller).
 */
export async function sessionInCohort(sessionId: string, cohortId: string | null | undefined): Promise<boolean> {
  if (!cohortId) return false;
  const rows = await sequelize.query(
    `SELECT 1 FROM live_sessions WHERE id = :sid AND cohort_id = :cid LIMIT 1`,
    { replacements: { sid: sessionId, cid: cohortId }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
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

// ---- broadcast (deck → phones) ----

export type TheaterState = 'voting' | 'locked' | 'revealed';

export interface BroadcastQuestion {
  key: string;               // stable per interaction slide (poll grouping key)
  kind: 'prediction' | 'poll' | 'trivia';
  q: string;
  options: string[];
  answer?: number | null;    // trivia correct index (only meaningful once revealed)
  revealed: boolean;
  /** Present only for "Live Decision Theater" full-screen moments. When set,
   * recordPollResponse enforces the lock server-side (not just hidden client-side). */
  theater?: { state: TheaterState };
}

/** A coding prompt pushed to student phones (Build Mode) so they can copy it
 * without reading it off the projected screen. All fields but label/prompt are
 * optional — older content without Build Bay metadata still broadcasts fine. */
export interface BroadcastPrompt {
  label: string;
  prompt: string;
  pasteWhere?: string;
  ccMode?: string;
  expectedResult?: string;
  stopCondition?: string;
  rescue?: string;
}

export interface BroadcastState {
  slide_index: number;
  slide_id: string;
  title: string;
  segment_label: string;
  phase: 'status' | 'question' | 'broadcast' | 'prompt';
  question: BroadcastQuestion | null;
  broadcast_prompts?: string[];
  prompt?: BroadcastPrompt | null;
  updated_at?: string;
}

/** The deck writes its current view; phones read it and switch to match. */
export async function setBroadcast(sessionId: string, state: BroadcastState): Promise<void> {
  await sequelize.query(
    `INSERT INTO session_broadcast (session_id, state, updated_at)
       VALUES (:sid, :state, NOW())
     ON CONFLICT (session_id)
       DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
    { replacements: { sid: sessionId, state: JSON.stringify(state) }, type: QueryTypes.INSERT },
  );
}

export async function getBroadcast(sessionId: string): Promise<BroadcastState | null> {
  const rows = await sequelize.query<{ state: any; updated_at: string }>(
    `SELECT state, updated_at FROM session_broadcast WHERE session_id = :sid`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  if (!rows.length) return null;
  const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
  return { ...state, updated_at: String(rows[0].updated_at) };
}

// ---- poll responses (phones → deck) ----

/** Thrown when a Live Decision Theater vote has been locked by the instructor —
 * the controller maps this to 409 so the phone can show "voting is locked"
 * instead of silently accepting a vote that will never be counted. */
export class PollLockedError extends Error {
  constructor() { super('POLL_LOCKED'); this.name = 'PollLockedError'; }
}

export async function recordPollResponse(sessionId: string, enrollmentId: string, pollKey: string, choice: number): Promise<void> {
  const bc = await getBroadcast(sessionId);
  if (bc?.question?.key === pollKey && bc.question.theater && bc.question.theater.state !== 'voting') {
    throw new PollLockedError();
  }
  await sequelize.query(
    `INSERT INTO session_poll_responses (session_id, enrollment_id, poll_key, choice, created_at)
       VALUES (:sid, :eid, :key, :choice, NOW())
     ON CONFLICT (session_id, enrollment_id, poll_key)
       DO UPDATE SET choice = EXCLUDED.choice, created_at = NOW()`,
    { replacements: { sid: sessionId, eid: enrollmentId, key: pollKey, choice } },
  );
}

/** Vote counts per option index for one poll. */
export async function getPollTally(sessionId: string, pollKey: string): Promise<number[]> {
  const rows = await sequelize.query<{ choice: number; n: string }>(
    `SELECT choice, COUNT(*)::int AS n FROM session_poll_responses
      WHERE session_id = :sid AND poll_key = :key GROUP BY choice`,
    { replacements: { sid: sessionId, key: pollKey }, type: QueryTypes.SELECT },
  );
  const tally: number[] = [];
  for (const r of rows) tally[r.choice] = Number(r.n) || 0;
  return tally;
}

/**
 * Names of participants who chose the correct option for a Live Decision
 * Theater question — only meaningful once the instructor has revealed the
 * answer (the caller gates that). Names are redacted via `formatDisplayName`
 * ("Ali Muwwakkil" -> "Ali M.") — the same convention this repo already uses
 * for any name shown on the shared/projected Class Kit deck
 * (`session_presence_events.display_name`), never the raw `full_name`.
 */
export async function getPollCorrectResponders(sessionId: string, pollKey: string, correctChoice: number): Promise<string[]> {
  const rows = await sequelize.query<{ full_name: string }>(
    `SELECT e.full_name FROM session_poll_responses r
       JOIN enrollments e ON e.id = r.enrollment_id
      WHERE r.session_id = :sid AND r.poll_key = :key AND r.choice = :choice
      ORDER BY e.full_name`,
    { replacements: { sid: sessionId, key: pollKey, choice: correctChoice }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => formatDisplayName(r.full_name));
}

// ---- reads ----

export interface LiveQuestion { name: string; text: string; at: string; }
export interface LiveState {
  present: number;        // checked in (attendance rows)
  participated: number;   // distinct students who pulsed / answered / asked
  here: number;
  building: number;
  stuck: number;
  finished: number;
  questions: LiveQuestion[];
  poll: {
    key: string; options: string[]; tally: number[]; total: number;
    /** Redacted names ("First L.") of participants who chose the correct
     * option — only populated once a Live Decision Theater question has been
     * revealed and has a numeric answer; `null` otherwise (voting/locked, a
     * non-theater question, or a poll with no single correct answer). */
    correctResponders: string[] | null;
  } | null;
  recentEvents: PresenceEvent[]; // the deck's live "who's here" ticker
}

/** Aggregate class state for the instructor deck. */
export async function getLiveState(sessionId: string): Promise<LiveState> {
  const counts = await sequelize.query<{ state: string; n: string }>(
    `SELECT state, COUNT(*)::int AS n FROM session_pulse WHERE session_id = :sid GROUP BY state`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  const c: Record<string, number> = { here: 0, building: 0, stuck: 0, finished: 0 };
  for (const row of counts) c[row.state] = Number(row.n) || 0;

  const [presentRow] = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM attendance_records WHERE session_id = :sid AND status IN ('present','late','excused')`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  const [participatedRow] = await sequelize.query<{ n: string }>(
    `SELECT COUNT(DISTINCT eid)::int AS n FROM (
       SELECT enrollment_id AS eid FROM session_pulse WHERE session_id = :sid
       UNION SELECT enrollment_id FROM session_poll_responses WHERE session_id = :sid
       UNION SELECT enrollment_id FROM session_chat_messages WHERE session_id = :sid
     ) u`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );

  const msgs = await sequelize.query<{ sender_name: string; content: string; created_at: string }>(
    `SELECT sender_name, content, created_at FROM session_chat_messages
      WHERE session_id = :sid ORDER BY created_at DESC LIMIT 15`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );

  // If a question is currently on screen, include its live tally.
  let poll: LiveState['poll'] = null;
  const bc = await getBroadcast(sessionId);
  if (bc && bc.phase === 'question' && bc.question) {
    const opts = Array.isArray(bc.question.options) ? bc.question.options : [];
    const tally = await getPollTally(sessionId, bc.question.key);
    const filled = opts.map((_, i) => tally[i] || 0);
    const revealedTheater = !!bc.question.theater && bc.question.revealed;
    const correctResponders = revealedTheater && typeof bc.question.answer === 'number'
      ? await getPollCorrectResponders(sessionId, bc.question.key, bc.question.answer)
      : null;
    poll = { key: bc.question.key, options: opts, tally: filled, total: filled.reduce((a, b) => a + b, 0), correctResponders };
  }

  const recentEvents = await getRecentPresenceEvents(sessionId);

  return {
    present: Number(presentRow?.n) || 0,
    participated: Number(participatedRow?.n) || 0,
    here: c.here, building: c.building, stuck: c.stuck, finished: c.finished,
    questions: msgs.map((m) => ({ name: m.sender_name, text: m.content, at: String(m.created_at) })),
    poll,
    recentEvents,
  };
}

// ---- companion (phone) view ----

export interface CompanionState {
  phase: 'status' | 'question' | 'broadcast' | 'prompt';
  title: string;
  question: (BroadcastQuestion & { my_choice: number | null }) | null;
  broadcast_prompts?: string[];
  prompt?: BroadcastPrompt | null;
  my_pulse: PulseState | null;
}

/** What one student's phone should show right now, mirroring the deck. */
export async function getCompanionState(sessionId: string, enrollmentId: string): Promise<CompanionState> {
  const bc = await getBroadcast(sessionId);

  const [pulseRow] = await sequelize.query<{ state: string }>(
    `SELECT state FROM session_pulse WHERE session_id = :sid AND enrollment_id = :eid`,
    { replacements: { sid: sessionId, eid: enrollmentId }, type: QueryTypes.SELECT },
  );
  const my_pulse = (pulseRow?.state as PulseState) || null;

  if (!bc || bc.phase === 'status') {
    return { phase: 'status', title: bc?.title || '', question: null, my_pulse };
  }
  if (bc.phase === 'broadcast') {
    return { phase: 'broadcast', title: bc.title, question: null, broadcast_prompts: bc.broadcast_prompts, my_pulse };
  }
  if (bc.phase === 'prompt') {
    return { phase: 'prompt', title: bc.title, question: null, prompt: bc.prompt || null, my_pulse };
  }
  // question phase — include this student's own answer
  let my_choice: number | null = null;
  if (bc.question) {
    const [ansRow] = await sequelize.query<{ choice: number }>(
      `SELECT choice FROM session_poll_responses WHERE session_id = :sid AND enrollment_id = :eid AND poll_key = :key`,
      { replacements: { sid: sessionId, eid: enrollmentId, key: bc.question.key }, type: QueryTypes.SELECT },
    );
    my_choice = ansRow ? ansRow.choice : null;
  }
  return {
    phase: 'question', title: bc.title,
    question: bc.question ? { ...bc.question, my_choice } : null,
    my_pulse,
  };
}
