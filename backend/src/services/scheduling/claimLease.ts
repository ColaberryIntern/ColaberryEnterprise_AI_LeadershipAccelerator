import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Ownership of a claimed `scheduled_emails` row, and the recovery of rows whose owner died.
 *
 * Both functions here exist because of one defect found on 2026-10-27: the scheduler could send
 * the same message to the same lead twice. The chain was
 *
 *   1. a batch claims up to 40 rows and stamps `processing_started_at = NOW()` on all of them,
 *   2. the batch works them serially with 5s plus up to 180s of pacing each, so reaching the
 *      last row can take well over the 10 minute staleness threshold,
 *   3. stale recovery resets the rows the batch has not got to yet back to 'pending',
 *   4. another scheduler process claims one of those rows and sends it,
 *   5. the original batch eventually reaches the same row and sends it again, because it was
 *      holding the row in memory and never re-read it.
 *
 * Three scheduler instances run in production by design, so step 4 is routine rather than
 * unlucky. The per-lead daily cap masks most of this, because the first send writes a
 * communication log the second processor reads. That cap is lifted for a lead who replied to us
 * the same day, so the duplicate lands specifically on leads who just answered.
 *
 * `renewClaim` closes the window at step 5 and `recoverStaleActions` stops step 3 from running
 * forever on a row that can never finish.
 *
 * Deliberately NOT solved here: a mutex preventing two processors from running at once. With
 * three instances running on purpose, an in-process flag would guard nothing, and the row-level
 * claim (`UPDATE ... WHERE status = 'pending' RETURNING`) is already the correct boundary.
 */

/** How long a claimed row may sit in 'processing' before recovery treats its owner as dead. */
export const STALE_AFTER_MS = 10 * 60 * 1000;

export interface RecoveryOutcome {
  /** Rows handed back to 'pending' with an attempt consumed. */
  requeued: number;
  /** Rows that had no attempts left and were failed instead of recycled. */
  exhausted: number;
  /** Ids of every row touched, so a recovery can be traced rather than only counted. */
  ids: string[];
}

/**
 * Re-assert that this processor still owns `actionId`, and push its lease out.
 *
 * Call this immediately before performing the side effect, never once per batch. A single
 * conditional UPDATE does both halves: if the row was recovered and re-claimed while we were
 * paused in pacing, `processor_id` no longer matches and no row is updated, so we return false
 * and the caller skips it. If it does match, we have just reset the staleness clock, which buys
 * another full STALE_AFTER_MS before recovery can take it, far longer than a send takes.
 *
 * Checking ownership with a SELECT instead would only narrow the race rather than close it,
 * because the row could be recovered between the read and the send.
 */
export async function renewClaim(actionId: string, processorId: string): Promise<boolean> {
  const rows = await sequelize.query(
    `UPDATE scheduled_emails
        SET processing_started_at = NOW()
      WHERE id = :actionId
        AND status = 'processing'
        AND processor_id = :processorId
      RETURNING id`,
    { replacements: { actionId, processorId }, type: QueryTypes.SELECT },
  );
  return (rows as unknown[]).length > 0;
}

/**
 * Recover rows whose owner died mid-run, consuming one attempt each.
 *
 * The attempt is the point. Recovery used to reset a stale row to 'pending' without touching
 * `attempts_made`, and `attempts_made` only ever moved when a run *finished*. A row that hung
 * every single time therefore kept `attempts_made` at 0, stayed under `max_attempts` (which
 * defaults to 1), and came back every fifteen minutes forever. That is an unbounded retry loop,
 * which this repository's own rules prohibit by name.
 *
 * So a recovered row now spends an attempt, and a row with none left is failed rather than
 * recycled. Counting the hung run as an attempt is the conservative reading: we cannot tell
 * whether it sent before dying, so we assume it might have.
 */
export async function recoverStaleActions(nowMs: number = Date.now()): Promise<RecoveryOutcome> {
  const staleThreshold = new Date(nowMs - STALE_AFTER_MS);

  return sequelize.transaction(async (transaction) => {
    // Fail first, then requeue. The two predicates are disjoint, but doing it in this order
    // inside one transaction means a row can never satisfy both and be touched twice.
    const exhausted = await sequelize.query(
      `UPDATE scheduled_emails
          SET status = 'failed',
              attempts_made = attempts_made + 1,
              processing_started_at = NULL,
              processor_id = NULL
        WHERE status = 'processing'
          AND processing_started_at < :staleThreshold
          AND attempts_made + 1 >= max_attempts
        RETURNING id`,
      { replacements: { staleThreshold }, type: QueryTypes.SELECT, transaction },
    );

    const requeued = await sequelize.query(
      `UPDATE scheduled_emails
          SET status = 'pending',
              attempts_made = attempts_made + 1,
              processing_started_at = NULL,
              processor_id = NULL
        WHERE status = 'processing'
          AND processing_started_at < :staleThreshold
          AND attempts_made + 1 < max_attempts
        RETURNING id`,
      { replacements: { staleThreshold }, type: QueryTypes.SELECT, transaction },
    );

    const exhaustedIds = (exhausted as Array<{ id: string }>).map((r) => r.id);
    const requeuedIds = (requeued as Array<{ id: string }>).map((r) => r.id);

    return {
      requeued: requeuedIds.length,
      exhausted: exhaustedIds.length,
      ids: [...exhaustedIds, ...requeuedIds],
    };
  });
}
