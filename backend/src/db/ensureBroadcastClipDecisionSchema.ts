import { sequelize } from '../config/database';

/**
 * D11 — the keep-or-cut decision an editor made about one segment of one airing.
 *
 * ## Only decisions live here
 *
 * There is no row for a segment nobody has judged, and no backfill writing the defaults in at
 * creation time. A break reads as cut because its own template says it is edited out, and that
 * is derived at read time by `broadcastClipDecisionPolicy`.
 *
 * Storing the defaults would have recorded a decision no human made as though one had, and
 * thrown away the distinction that matters when somebody comes back to a half-reviewed list:
 * which rows have been through a pair of eyes. A row here always means a person chose.
 *
 * ## Keyed on the occurrence, like everything else in this subtree
 *
 * A session is taught many times and recorded separately each time. A decision about "the
 * break" is a decision about the break IN ONE RECORDING, and keying on the session would carry
 * last month's edit into this month's footage.
 *
 * ## The segment id is a plain string on purpose
 *
 * It comes from the run-of-show template, not from a table, so there is nothing to reference.
 * A decision about a segment that a later template renames is simply never read again - the
 * clip list resolves decisions BY the segment ids its own markers carry, so an orphaned row is
 * inert rather than wrong. Cheaper than a foreign key to a list that lives in TypeScript.
 *
 * Additive, in its own file, per the rule in ensureBroadcastSchema's header.
 */
export const CLIP_DECISION_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS broadcast_clip_decisions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     occurrence_id UUID NOT NULL REFERENCES broadcast_occurrences(id) ON DELETE CASCADE,
     -- From the run of show. Not a reference: the segment list lives in TypeScript.
     segment_id TEXT NOT NULL,
     -- Exactly two values. A CHECK rather than an enum type, matching end_reason's shape, so
     -- adding a third later is an additive statement rather than a type migration.
     decision TEXT NOT NULL CHECK (decision IN ('keep', 'cut')),
     decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  /*
   * ONE DECISION PER SEGMENT PER AIRING, and the write is an UPSERT rather than an insert.
   *
   * Changing your mind is the normal case here, not an error: an editor flips a segment to cut,
   * scrubs it, and flips it back. ON CONFLICT DO NOTHING - the pattern both clip tables use -
   * would be exactly wrong, because it would silently keep the FIRST answer and show the editor
   * their old decision after they changed it.
   */
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_clip_decision_segment
     ON broadcast_clip_decisions (occurrence_id, segment_id)`,
];

export const CLIP_DECISION_TABLE = 'broadcast_clip_decisions';

export async function ensureBroadcastClipDecisionSchema(): Promise<void> {
  for (const sql of CLIP_DECISION_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] broadcast clip decision schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Broadcast clip decision schema ensured');
}
