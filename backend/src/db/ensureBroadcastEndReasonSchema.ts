import { sequelize } from '../config/database';

/**
 * L7.4 — record WHY a broadcast ended, not just when.
 *
 * `ended_at` answers "when", and until L7.4 nothing answered "who decided". Once a broadcast
 * can end itself after a sustained stream loss, that gap becomes a real problem: an occurrence
 * that ended at 14:09 looks identical whether Ali pressed End or whether the safety net fired
 * because the hotel wifi dropped. The ticket says it plainly — six months from now, "why did
 * this class end" must be answerable.
 *
 * NULLABLE AND WITHOUT A DEFAULT, DELIBERATELY. Every occurrence that ended before this column
 * existed genuinely has no recorded reason, and back-filling them with 'producer' would invent
 * a fact. A null here means "ended before we recorded why", which is true, and the one thing a
 * default would destroy.
 *
 * Additive only, in its own ensure file, per the rule in ensureBroadcastSchema's header:
 * that file creates tables and must not be edited to alter one.
 *
 * Values must match END_REASONS in broadcastStateMachine.ts.
 */
export const END_REASON_STATEMENTS: string[] = [
  `ALTER TABLE broadcast_occurrences ADD COLUMN IF NOT EXISTS end_reason TEXT`,
  // The CHECK is added separately and tolerantly: a rerun must not fail because the constraint
  // is already there, and an existing row cannot violate it because every existing value is
  // null. Named so it can be found and dropped deliberately rather than by guesswork.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'chk_broadcast_occ_end_reason'
     ) THEN
       ALTER TABLE broadcast_occurrences
         ADD CONSTRAINT chk_broadcast_occ_end_reason
         CHECK (end_reason IS NULL OR end_reason IN ('producer', 'auto_stream_gone'));
     END IF;
   END $$`,
  // Answering "how many classes ended themselves last month" should not be a sequential scan
  // over every occurrence that ever aired. Partial, because the column is null for most rows.
  `CREATE INDEX IF NOT EXISTS idx_broadcast_occ_end_reason
     ON broadcast_occurrences (end_reason)
   WHERE end_reason IS NOT NULL`,
];

export async function ensureBroadcastEndReasonSchema(): Promise<void> {
  for (const sql of END_REASON_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] broadcast end_reason schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Broadcast end_reason ensured');
}
