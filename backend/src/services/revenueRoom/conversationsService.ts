import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { tableExists } from '../revenueFlow/tableExists';
import { ConversationRow, ConversationsView, buildConversations } from './conversations';

/**
 * R7 — read the conversations behind an initiative.
 *
 * The rules live in `conversations.ts` and are pure; this is the half that touches the
 * database, kept separate so the dormancy sentence and the test-row flags can be tested
 * without one.
 *
 * ── WHICH OUTCOMES COUNT AS A CONVERSATION ───────────────────────────────────────────────
 *
 * Three, and the choice is the same one `funnelStages.ts` already made: a booked meeting, an
 * answered call and a reply. Each requires a human to have done something directed at us.
 *
 * An OPEN is excluded deliberately, even though it is the largest number available (14,036).
 * It is fired by a tracking pixel, Apple Mail fires it without a person reading anything, and
 * counting it here would turn a machine event into evidence of a conversation. A no_answer and
 * a voicemail are excluded for the opposite reason: they record that the conversation did NOT
 * happen.
 */

/** The window the board reports on, so this card and the timeline agree about "recent". */
export const CONVERSATION_WINDOW_DAYS = 180;

const OUTCOMES = ['booked_meeting', 'answered', 'replied'];

interface RawRow {
  id: string;
  outcome: string;
  lead_id: number | null;
  name: string | null;
  company: string | null;
  created_at: string;
}

interface StrategyRow {
  status: string | null;
  rows: number | string;
  latest: string | null;
}

/**
 * Read it.
 *
 * Returns null when `interaction_outcomes` is absent, so the caller omits the card rather than
 * rendering an empty one: a missing table is not a quiet quarter, and a zero here would be the
 * exact "sparse rendering as healthy" the ticket warns against, inverted.
 */
export async function getConversations(
  now: Date = new Date(),
): Promise<ConversationsView | null> {
  if (!(await tableExists('interaction_outcomes'))) return null;

  const hasLeads = await tableExists('leads');

  // LEFT JOIN: a row that does not resolve to a lead is still a conversation that happened,
  // and dropping it would quietly shrink the only number on this card.
  const rows = await sequelize.query<RawRow>(
    `SELECT io.id::text              AS id,
            io.outcome::text         AS outcome,
            io.lead_id,
            ${hasLeads ? 'l.name, l.company' : 'NULL AS name, NULL AS company'},
            io.created_at::text      AS created_at
       FROM interaction_outcomes io
       ${hasLeads ? 'LEFT JOIN leads l ON l.id = io.lead_id' : ''}
      WHERE io.outcome::text IN (:outcomes)`,
    { type: QueryTypes.SELECT, replacements: { outcomes: OUTCOMES } },
  );

  // Guarded independently: either table may be absent, and the card still has something true
  // to say about the ones that are present.
  const appointmentsRows = (await tableExists('appointments'))
    ? (await sequelize.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM appointments',
      { type: QueryTypes.SELECT },
    ))[0]?.n ?? 0
    : 0;

  const strategyCalls = (await tableExists('strategy_calls'))
    ? (await sequelize.query<StrategyRow>(
      `SELECT status::text AS status, COUNT(*)::int AS rows, MAX(created_at)::text AS latest
         FROM strategy_calls GROUP BY status`,
      { type: QueryTypes.SELECT },
    )).map((s) => ({
      status: (s.status ?? 'unknown').trim(),
      rows: Number(s.rows) || 0,
      latest: s.latest ? String(s.latest).slice(0, 10) : null,
    }))
    : [];

  const mapped: ConversationRow[] = rows.map((r) => ({
    id: r.id,
    outcome: r.outcome,
    leadId: r.lead_id,
    name: r.name,
    company: r.company,
    at: r.created_at,
  }));

  return buildConversations(mapped, {
    now,
    windowDays: CONVERSATION_WINDOW_DAYS,
    appointmentsRows,
    strategyCalls,
  });
}
