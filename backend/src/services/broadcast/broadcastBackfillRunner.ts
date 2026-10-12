/**
 * broadcastBackfillRunner — executes a plan the planner already produced.
 *
 * The split matters: broadcastBackfillPlanner decides, this writes, and the decision can be
 * reviewed before a single row is touched. Nothing here re-decides anything — if this module
 * ever needs a rule, the rule is in the wrong place.
 *
 * DRY RUN IS THE DEFAULT. `execute` must be passed explicitly. A backfill whose safe mode is
 * opt-in is a backfill that will eventually be run in anger by someone who forgot a flag.
 *
 * EVERY ROW IS STAMPED WITH THE BATCH ID, so the whole run reverses with one predicate. The
 * reversal deletes source refs only; it deliberately does NOT delete occurrences that have
 * since been edited or gone live, because by then they are no longer just backfill output.
 *
 * ONE ROW PER TRANSACTION, NOT ONE PER BATCH. A single transaction around ten thousand
 * inserts means one bad row discards the whole run and the retry starts from zero. Per-row
 * commits mean a crash leaves the completed work in place and the next run skips it —
 * convergence is the resume mechanism, which is why the planner makes `already_linked` a
 * first-class outcome rather than an error.
 */
import { sequelize } from '../../config/database';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import type { BackfillPlan, BackfillDecision } from './broadcastBackfillPlanner';

export interface RunOptions {
  /** Must be true to write. Absent or false = dry run. */
  execute?: boolean;
  /** Hard ceiling on rows written in one invocation. */
  limit?: number;
}

export interface RunResult {
  batchId: string;
  dryRun: boolean;
  attempted: number;
  written: number;
  skipped: number;
  quarantined: number;
  failed: Array<{ sourceType: string; sourceId: string; error_class: string; message: string }>;
}

function logRun(event: string, outcome: string, context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'broadcast-backfill',
    event, outcome, context,
  }));
}

/**
 * Write the plan's `link` decisions. Quarantined and skipped rows are counted and never
 * touched — a quarantine is a decision to leave the row alone, not a failure to process it.
 */
export async function runBackfill(plan: BackfillPlan, opts: RunOptions = {}): Promise<RunResult> {
  const dryRun = opts.execute !== true;
  const links = plan.decisions.filter((d) => d.action === 'link');
  const toWrite = typeof opts.limit === 'number' ? links.slice(0, opts.limit) : links;

  const result: RunResult = {
    batchId: plan.batchId,
    dryRun,
    attempted: toWrite.length,
    written: 0,
    skipped: plan.counts.skip,
    quarantined: plan.counts.quarantine,
    failed: [],
  };

  if (dryRun) {
    logRun('backfill_dry_run', 'success', {
      batch_id: plan.batchId, would_write: toWrite.length,
      skipped: result.skipped, quarantined: result.quarantined,
    });
    return result;
  }

  for (const d of toWrite) {
    try {
      await writeOne(d, plan.batchId);
      result.written += 1;
    } catch (err: any) {
      // A failed row is recorded and the run continues. Aborting the batch on the first
      // failure would mean one malformed source blocks every valid one behind it, and the
      // operator would have to find and fix it before any progress could be made at all.
      result.failed.push({
        sourceType: d.sourceType,
        sourceId: d.sourceId,
        error_class: err?.error_class || err?.name || 'UnexpectedError',
        message: String(err?.message ?? err).slice(0, 200),
      });
    }
  }

  logRun('backfill_executed', result.failed.length ? 'partial' : 'success', {
    batch_id: plan.batchId, written: result.written, failed: result.failed.length,
    skipped: result.skipped, quarantined: result.quarantined,
  });
  return result;
}

/**
 * One occurrence plus its source ref, in one transaction.
 *
 * The INSERT relies on the database to arbitrate, not on the read: another runner (or a
 * re-run racing this one) may have created the same occurrence_key between the plan and this
 * write, and the unique index is what makes that a caught error rather than a duplicate.
 */
async function writeOne(d: BackfillDecision, batchId: string): Promise<void> {
  await sequelize.transaction(async (tx) => {
    const occurrence = await BroadcastOccurrence.create(
      {
        occurrence_key: d.occurrenceKey!,
        title: `Backfilled ${d.sourceType} ${d.sourceId}`,
        scheduled_start_at: d.startsAt ?? null,
        // From the plan, never re-decided here: private and unpublished.
        access_mode: d.proposed!.access_mode,
        editorial_state: d.proposed!.editorial_state,
      } as any,
      { transaction: tx },
    );

    await sequelize.query(
      `INSERT INTO broadcast_source_refs (occurrence_id, source_type, source_id, is_authoritative, linked_reason, batch_id)
       VALUES (:occurrenceId, :sourceType, :sourceId, true, :reason, :batchId)`,
      {
        replacements: {
          occurrenceId: occurrence.id,
          sourceType: d.sourceType,
          sourceId: d.sourceId,
          reason: `backfill ${batchId}`,
          batchId,
        },
        transaction: tx,
      },
    );
  });
}

/**
 * Reverse a run.
 *
 * Deletes the batch's source refs and the occurrences they created — but ONLY occurrences
 * still in the state the backfill left them in. One that has since been edited, published or
 * gone live is no longer backfill output, and deleting it would destroy real work. Those are
 * reported for manual review instead.
 */
export async function reverseBackfill(batchId: string, opts: RunOptions = {}): Promise<{
  dryRun: boolean; refsDeleted: number; occurrencesDeleted: number; retained: string[];
}> {
  const dryRun = opts.execute !== true;

  const [rows] = await sequelize.query(
    `SELECT r.id AS ref_id, r.occurrence_id, o.editorial_state, o.access_mode
       FROM broadcast_source_refs r
       JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE r.batch_id = :batchId`,
    { replacements: { batchId } },
  );
  const candidates = (rows as any[]) || [];

  const untouched = candidates.filter((r) => r.editorial_state === 'ended' && r.access_mode === 'private');
  const retained = candidates
    .filter((r) => !(r.editorial_state === 'ended' && r.access_mode === 'private'))
    .map((r) => String(r.occurrence_id));

  if (dryRun) {
    logRun('backfill_reverse_dry_run', 'success', {
      batch_id: batchId, would_delete: untouched.length, retained: retained.length,
    });
    return { dryRun, refsDeleted: 0, occurrencesDeleted: 0, retained };
  }

  let refsDeleted = 0;
  let occurrencesDeleted = 0;
  for (const r of untouched) {
    await sequelize.transaction(async (tx) => {
      await sequelize.query('DELETE FROM broadcast_source_refs WHERE id = :id',
        { replacements: { id: r.ref_id }, transaction: tx });
      await sequelize.query('DELETE FROM broadcast_occurrences WHERE id = :id',
        { replacements: { id: r.occurrence_id }, transaction: tx });
    });
    refsDeleted += 1;
    occurrencesDeleted += 1;
  }

  logRun('backfill_reversed', retained.length ? 'partial' : 'success', {
    batch_id: batchId, refs_deleted: refsDeleted, occurrences_deleted: occurrencesDeleted,
    retained_for_review: retained.length,
  });
  return { dryRun, refsDeleted, occurrencesDeleted, retained };
}
