import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { type ClipDecision } from './broadcastClipDecisionPolicy';

/**
 * D11 — reading and writing the keep-or-cut decisions for one airing.
 *
 * Thin on purpose. The rules are in `broadcastClipDecisionPolicy`, which is pure and knows
 * nothing about a database; this is the two queries that feed it.
 */

export interface StoredDecision {
  segment_id: string;
  decision: ClipDecision;
}

/** Every decision a person has made about this airing, as a map the clip list can look into. */
export async function listClipDecisions(occurrenceId: string): Promise<Record<string, ClipDecision>> {
  const rows = await sequelize.query<StoredDecision>(
    `SELECT segment_id, decision
       FROM broadcast_clip_decisions
      WHERE occurrence_id = :occurrenceId`,
    { replacements: { occurrenceId }, type: QueryTypes.SELECT },
  );
  const out: Record<string, ClipDecision> = {};
  for (const r of rows) out[r.segment_id] = r.decision;
  return out;
}

/**
 * Record a decision, replacing any previous one for that segment.
 *
 * AN UPSERT, NOT AN INSERT, and that is the difference from both clip tables in this subtree.
 * They use ON CONFLICT DO NOTHING because a second advance to one slide, or a second press in
 * one second, is the same event arriving twice - the first answer is the true one.
 *
 * A decision is not an event, it is a current opinion. Changing your mind is the normal case:
 * an editor flips a segment to cut, scrubs it, and flips it back. DO NOTHING would keep the
 * first answer and show them their old decision after they changed it, which is the worst kind
 * of bug in a review tool - it looks like the click did not register, so they click again.
 *
 * `decided_at` moves with the decision, so the column always says when the CURRENT opinion was
 * formed rather than when the segment was first touched.
 */
export async function setClipDecision(
  occurrenceId: string,
  segmentId: string,
  decision: ClipDecision,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO broadcast_clip_decisions (occurrence_id, segment_id, decision)
     VALUES (:occurrenceId, :segmentId, :decision)
     ON CONFLICT (occurrence_id, segment_id)
     DO UPDATE SET decision = EXCLUDED.decision, decided_at = NOW()`,
    { replacements: { occurrenceId, segmentId, decision } },
  );
}

/**
 * The airing a session was recorded as, for keying a decision.
 *
 * Here rather than reached across from `broadcastClipListController`, which has the same query
 * as a private helper. A controller is not a module other controllers import from, and the
 * source ref is the only join from a session to its occurrence either way.
 */
export async function airedOccurrenceId(sessionId: string): Promise<string | null> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT o.id
       FROM broadcast_source_refs r
       JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE r.source_type = 'live_session' AND r.source_id = :sid
      LIMIT 1`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  return rows[0]?.id ?? null;
}
