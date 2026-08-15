/**
 * One-off bulk-close: collapse the verified duplicate OpenclawLearningOptimizationAgent
 * tickets (cory-engine + workforce_intelligence_engine — see
 * backend/src/scripts/lib/openclawDuplicateTicketClusters.ts for the exact,
 * content-verified predicates; 3,219 rows in production as of 2026-08-15) down to one
 * representative ticket per cluster marked status='done' with a real resolution
 * comment, and every other duplicate closed to the same status with a real
 * "closed as duplicate of <representative>" comment.
 *
 * Background: PR #1465 (6456abb4) and PR #1468 (3e95ac8b), both 2026-08-14, fixed the
 * underlying bug (two varchar overflows plus the ticket-creation dedup logic itself)
 * but never touched the historical duplicates that bug already created. Ali's explicit
 * decision: archive the duplicates, keep one representative per cluster as the
 * queryable record — clears the board without erasing history.
 *
 * Three modes. Each of --apply/--revert requires an undo-log file already on disk
 * from a prior --plan run — this is deliberate, so "dry run reviewed first" and
 * "undo log written before any write" are real operator gates, not internal
 * implementation details nobody inspects.
 *
 *   node archiveDuplicateOpenclawLearningTickets.js [--plan] [--out-dir <dir>]
 *     Default mode. Read-only. Scans both clusters fresh, writes a dry-run report
 *     (.md) AND an undo log (.json, one entry per affected ticket with its CURRENT
 *     status) to --out-dir (default: cwd). Makes zero writes.
 *
 *   node archiveDuplicateOpenclawLearningTickets.js --apply --undo-log <path> [--batch-size 200]
 *     Loads the undo log, re-derives live candidates fresh, ABORTS with no writes if
 *     the live candidate id-set has drifted from the undo log's. Otherwise closes
 *     each row to status='done' in batches, one sequelize.transaction() per batch — a
 *     failure in batch N leaves batches 1..N-1 committed and N untouched, safe to
 *     resume. Idempotent: any row already status='done' is skipped, so re-running
 *     --apply with the same undo-log file after a partial or full run never
 *     double-writes and never double-comments.
 *
 *   node archiveDuplicateOpenclawLearningTickets.js --revert --undo-log <path> [--batch-size 200]
 *     The tested rollback path (not a documented-only procedure). Restores each row's
 *     status to its undo-log `previous_status`. Idempotent. Never deletes any row or
 *     TicketActivity — only adds new activity rows, per this repo's append-only
 *     ledger rule.
 *
 * Deliberately bypasses ticketService.ts's updateTicketStatus(): its VALID_TRANSITIONS
 * state machine has no direct todo/backlog -> done path (it exists to gate interactive
 * workflow steps; this is a one-off historical migration, matching the direct-.update()
 * approach backfillTicketTitlesWithNames.ts already uses in this same directory).
 * Also deliberately skips emitLedgerEventSafe() (ProofDesk Work Ledger — confirmed
 * shadow-mode/purely-additive telemetry) and updateTicketStatus()'s
 * scheduleOutcomeMeasurement() side effect (would schedule ~3,219 meaningless 7-day
 * recurrence checks against synthetic per-cycle entity ids). Both TicketActivity rows
 * this script writes (status_changed + commented) match the repo's existing
 * addTicketComment()/updateTicketStatus() convention exactly.
 */
import { Op } from 'sequelize';
import { Ticket, TicketActivity } from '../models';
import { sequelize } from '../config/database';
import { TicketLike, isDuplicateTicket } from './lib/openclawDuplicateTicketClusters';
import { buildPlan, writeUndoLog, writeReport, readUndoLog, UndoLog } from './lib/openclawDuplicateTicketArtifacts';

const TARGET_CREATED_BY_IDS = ['cory-engine', 'workforce_intelligence_engine'];
const DEFAULT_BATCH_SIZE = 200;
const ACTOR = { type: 'human' as const, id: 'ali@colaberry.com' };

export interface CliOptions {
  mode: 'plan' | 'apply' | 'revert';
  undoLogPath?: string;
  batchSize: number;
  outDir: string;
}

export function parseArgs(argv: string[]): CliOptions {
  const apply = argv.includes('--apply');
  const revert = argv.includes('--revert');
  if (apply && revert) throw new Error('--apply and --revert are mutually exclusive');
  const mode: CliOptions['mode'] = revert ? 'revert' : apply ? 'apply' : 'plan';

  const undoLogIdx = argv.indexOf('--undo-log');
  const undoLogPath = undoLogIdx >= 0 ? argv[undoLogIdx + 1] : undefined;
  if ((mode === 'apply' || mode === 'revert') && !undoLogPath) {
    throw new Error(`--${mode} requires --undo-log <path>`);
  }

  const batchSizeIdx = argv.indexOf('--batch-size');
  const parsedBatchSize = batchSizeIdx >= 0 ? parseInt(argv[batchSizeIdx + 1], 10) : NaN;
  const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : DEFAULT_BATCH_SIZE;

  const outDirIdx = argv.indexOf('--out-dir');
  const outDir = outDirIdx >= 0 ? argv[outDirIdx + 1] : process.cwd();

  return { mode, undoLogPath, batchSize, outDir };
}

function toTicketLike(row: InstanceType<typeof Ticket>): TicketLike {
  const plain: any = row.toJSON();
  return {
    id: plain.id,
    created_by_id: plain.created_by_id,
    title: plain.title,
    description: plain.description ?? null,
    status: plain.status,
    created_at: plain.created_at,
  };
}

/**
 * Content-predicate re-query, used by --plan (to build candidates) and --apply/
 * --revert drift-checking (to confirm the live candidate SET hasn't changed since
 * --plan ran). This is intentionally scoped by predicate content only, not by
 * `status`, so a partially-applied resume (where some rows are already `done`) is
 * still recognized as the same candidate set rather than tripping a false drift abort
 * — the separate "skip if already done" check inside runApply/runRevert is what
 * implements resume idempotency.
 */
async function fetchLiveCandidates(): Promise<TicketLike[]> {
  const rows = await Ticket.findAll({
    where: { created_by_id: { [Op.in]: TARGET_CREATED_BY_IDS } },
    order: [['created_at', 'ASC']],
  });
  return rows.map(toTicketLike).filter(isDuplicateTicket);
}

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalCandidates: number;
  clusterCounts: Record<string, number>;
}

/** --plan (default). Read-only. Writes the dry-run report + undo log to disk. */
export async function runPlan(outDir: string): Promise<PlanRunResult> {
  const candidates = await fetchLiveCandidates();
  const { undoLog, reportMarkdown } = buildPlan(candidates);

  const ts = Date.now();
  const undoLogPath = writeUndoLog(undoLog, outDir, ts);
  const reportPath = writeReport(reportMarkdown, outDir, ts);

  const clusterCounts: Record<string, number> = {};
  for (const [name, info] of Object.entries(undoLog.clusters)) {
    clusterCounts[name] = info!.duplicate_count;
  }

  console.log(
    JSON.stringify({
      event: 'archive_duplicate_tickets.planned',
      service: 'archive-duplicate-tickets',
      total_candidates: candidates.length,
      cluster_counts: clusterCounts,
      reportPath,
      undoLogPath,
    }),
  );

  return { reportPath, undoLogPath, totalCandidates: candidates.length, clusterCounts };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Aborts (no writes) if the live candidate id-set differs from the undo log's. */
function checkDrift(undoLog: UndoLog, liveCandidates: TicketLike[]): void {
  const undoIds = new Set(undoLog.rows.map((r) => r.ticket_id));
  const liveIds = new Set(liveCandidates.map((t) => t.id));
  const missingFromLive = [...undoIds].filter((id) => !liveIds.has(id));
  const extraInLive = [...liveIds].filter((id) => !undoIds.has(id));
  if (missingFromLive.length > 0 || extraInLive.length > 0) {
    throw new Error(
      `Drift detected between undo log and live candidates — aborting before any write. ` +
        `${missingFromLive.length} row(s) in the undo log no longer match live predicates, ` +
        `${extraInLive.length} new candidate row(s) exist live that the undo log doesn't cover. ` +
        `Re-run --plan and review the new dry-run report before applying.`,
    );
  }
}

export interface ApplyRunResult {
  processed: number;
  closed: number;
  skippedAlreadyDone: number;
  batches: number;
}

/** --apply --undo-log <path>. Batched, transaction-per-batch, idempotent. */
export async function runApply(undoLogPath: string, batchSize: number): Promise<ApplyRunResult> {
  const undoLog = readUndoLog(undoLogPath);
  const liveCandidates = await fetchLiveCandidates();
  checkDrift(undoLog, liveCandidates);

  const batches = chunk(undoLog.rows, batchSize);
  let closed = 0;
  let skippedAlreadyDone = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await sequelize.transaction(async (t) => {
      for (const row of batch) {
        const ticket = await Ticket.findByPk(row.ticket_id, { transaction: t });
        if (!ticket) throw new Error(`Ticket ${row.ticket_id} not found mid-apply — aborting batch ${i + 1}`);
        if (ticket.status === 'done') {
          skippedAlreadyDone++;
          continue;
        }

        const fromStatus = ticket.status;
        const clusterInfo = undoLog.clusters[row.cluster]!;
        const comment = row.is_representative ? clusterInfo.representative_comment : clusterInfo.duplicate_pointer_comment;

        await ticket.update({ status: 'done' }, { transaction: t });
        await TicketActivity.create(
          {
            ticket_id: row.ticket_id,
            actor_type: ACTOR.type,
            actor_id: ACTOR.id,
            action: 'status_changed',
            from_value: fromStatus,
            to_value: 'done',
          },
          { transaction: t },
        );
        await TicketActivity.create(
          { ticket_id: row.ticket_id, actor_type: ACTOR.type, actor_id: ACTOR.id, action: 'commented', comment },
          { transaction: t },
        );
        closed++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'archive_duplicate_tickets.batch_applied',
        service: 'archive-duplicate-tickets',
        batch_index: i + 1,
        batch_count: batches.length,
        rows_in_batch: batch.length,
        closed_so_far: closed,
        skipped_so_far: skippedAlreadyDone,
      }),
    );
  }

  return { processed: undoLog.rows.length, closed, skippedAlreadyDone, batches: batches.length };
}

export interface RevertRunResult {
  processed: number;
  reverted: number;
  skippedAlreadyAtPreviousStatus: number;
  batches: number;
}

/** --revert --undo-log <path>. The tested rollback path. */
export async function runRevert(undoLogPath: string, batchSize: number): Promise<RevertRunResult> {
  const undoLog = readUndoLog(undoLogPath);
  const batches = chunk(undoLog.rows, batchSize);
  let reverted = 0;
  let skipped = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await sequelize.transaction(async (t) => {
      for (const row of batch) {
        const ticket = await Ticket.findByPk(row.ticket_id, { transaction: t });
        if (!ticket) throw new Error(`Ticket ${row.ticket_id} not found mid-revert — aborting batch ${i + 1}`);
        if (ticket.status === row.previous_status) {
          skipped++;
          continue;
        }

        const fromStatus = ticket.status;
        await ticket.update({ status: row.previous_status as any }, { transaction: t });
        await TicketActivity.create(
          {
            ticket_id: row.ticket_id,
            actor_type: ACTOR.type,
            actor_id: ACTOR.id,
            action: 'status_changed',
            from_value: fromStatus,
            to_value: row.previous_status,
          },
          { transaction: t },
        );
        await TicketActivity.create(
          {
            ticket_id: row.ticket_id,
            actor_type: ACTOR.type,
            actor_id: ACTOR.id,
            action: 'commented',
            comment: `Reverted by archiveDuplicateOpenclawLearningTickets --revert (undo log: ${undoLogPath}). Status restored to '${row.previous_status}'.`,
          },
          { transaction: t },
        );
        reverted++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'archive_duplicate_tickets.batch_reverted',
        service: 'archive-duplicate-tickets',
        batch_index: i + 1,
        batch_count: batches.length,
        reverted_so_far: reverted,
        skipped_so_far: skipped,
      }),
    );
  }

  return { processed: undoLog.rows.length, reverted, skippedAlreadyAtPreviousStatus: skipped, batches: batches.length };
}

/* istanbul ignore next — CLI entry point, exercised operationally not in unit tests */
if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  (async () => {
    await sequelize.authenticate();
    if (opts.mode === 'plan') await runPlan(opts.outDir);
    else if (opts.mode === 'apply') await runApply(opts.undoLogPath!, opts.batchSize);
    else await runRevert(opts.undoLogPath!, opts.batchSize);
    process.exit(0);
  })().catch((err: any) => {
    console.error(
      JSON.stringify({
        event: 'archive_duplicate_tickets.failed',
        service: 'archive-duplicate-tickets',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
