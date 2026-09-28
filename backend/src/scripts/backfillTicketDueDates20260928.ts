/**
 * Ticket due-date validation gap (2026-09-28) — Ali: "Tickets should not be
 * allowed to be created with no due date. That's how ghost tickets and
 * looking up to 500 open tickets happens." Confirmed: fix system-wide
 * (models/ticketDueDateDefaultHook.ts, this run's own R110/R111 — closes the
 * gap for every future ticket), and backfill the EXISTING backlog rather than
 * leave it permanently invisible to any overdue check.
 *
 * As of this run, the live backlog is 340 currently-open (status NOT IN
 * done, cancelled) tickets with due_date IS NULL. Confirmed via AskUserQuestion:
 * backfill anchor is TODAY + a priority-based window, not created_at + a
 * window — a fresh grace period from the day this ships, not an
 * honest-but-alarming step-change against tickets that are, on average,
 * weeks old.
 *
 * Three modes, mirroring the proven shape of
 * backend/src/scripts/backfillTicketReportsToAssignee.ts (the same `tickets`
 * table, the same `status NOT IN ('done','cancelled')` live-candidate
 * filter):
 *
 *   node backfillTicketDueDates20260928.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Scans live open tickets with due_date IS NULL,
 *     computes each one's proposed due_date (today + its own priority's
 *     window), writes a dry-run report (.md) AND an undo log (.json) to
 *     --out-dir (default: cwd). Makes zero writes.
 *
 *   node backfillTicketDueDates20260928.js --apply --undo-log <path> [--batch-size 200]
 *     Loads the undo log; for each row, re-checks the ticket LIVE (still
 *     open? still due_date IS NULL — not already backfilled by a prior
 *     --apply, and not already given a real due_date by the R110/R111 hook if
 *     it was created after that code deployed but before this script ran?)
 *     before writing, re-anchored at the CURRENT moment, not the plan-time
 *     snapshot. Idempotent: a ticket already carrying a real due_date, or no
 *     longer open, is skipped with zero write.
 *
 *   node backfillTicketDueDates20260928.js --revert --undo-log <path> [--batch-size 200]
 *     Restores due_date to NULL for each row in the undo log. Idempotent (a
 *     row already null is skipped).
 */
import { Op } from 'sequelize';
import { Ticket } from '../models';
import { sequelize } from '../config/database';
import { computeDefaultTicketDueDate } from '../services/ticketDueDateDefault';
import {
  buildPlanReport,
  writeUndoLog,
  writeReport,
  readUndoLog,
  type BackfillUndoLog,
  type BackfillUndoRow,
} from './lib/ticketDueDateBackfillArtifacts';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_SESSION_ID = 'unspecified-session';
const TERMINAL_STATUSES = ['done', 'cancelled'];

export interface CliOptions {
  mode: 'plan' | 'apply' | 'revert';
  undoLogPath?: string;
  batchSize: number;
  outDir: string;
  sessionId: string;
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

  const sessionIdx = argv.indexOf('--session-id');
  const sessionId = sessionIdx >= 0 ? argv[sessionIdx + 1] : DEFAULT_SESSION_ID;

  return { mode, undoLogPath, batchSize, outDir, sessionId };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Live open tickets (status NOT IN done, cancelled) with no due date. */
async function fetchLiveOpenNullDueDateTickets() {
  return Ticket.findAll({
    where: {
      status: { [Op.notIn]: TERMINAL_STATUSES },
      due_date: { [Op.is]: null as any },
    },
    attributes: ['id', 'priority', 'status', 'due_date'],
  });
}

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalCandidates: number;
}

/** --plan (default). Read-only. Writes the dry-run report + undo log to disk. */
export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const candidates = await fetchLiveOpenNullDueDateTickets();
  const now = new Date();

  const rows: BackfillUndoRow[] = candidates.map((ticket) => ({
    ticket_id: ticket.id,
    priority: ticket.priority,
    previous_due_date: null,
    new_due_date: computeDefaultTicketDueDate(ticket.priority, now).toISOString(),
  }));

  const { undoLog, reportMarkdown } = buildPlanReport(rows, sessionId);
  const ts = Date.now();
  const undoLogPath = writeUndoLog(undoLog, outDir, ts);
  const reportPath = writeReport(reportMarkdown, outDir, ts);

  console.log(
    JSON.stringify({
      event: 'backfill_ticket_due_dates.planned',
      service: 'backfill-ticket-due-dates',
      total_candidates: candidates.length,
      reportPath,
      undoLogPath,
    }),
  );

  return { reportPath, undoLogPath, totalCandidates: candidates.length };
}

export interface ApplyRunResult {
  processed: number;
  updated: number;
  skippedAlreadyHasDueDate: number;
  skippedNoLongerOpen: number;
  batches: number;
}

/**
 * --apply --undo-log <path>. Batched, transaction-per-batch. Re-derives each
 * ticket's LIVE state fresh (never blindly trusts the plan-time snapshot)
 * before writing, re-anchoring the computed due_date at the CURRENT moment —
 * matching Ali's "today + a window" answer even when --apply runs some time
 * after --plan. Idempotent: a ticket already carrying a real due_date, or no
 * longer open, is skipped with zero write, not an error. This is also what
 * makes it safe to run at any point after the R110/R111 hook is deployed:
 * any ticket created in that gap already has a real due_date from the hook,
 * so the live re-check here skips it rather than double-processing.
 */
export async function runApply(undoLogPath: string, batchSize: number): Promise<ApplyRunResult> {
  const undoLog = readUndoLog(undoLogPath);
  const batches = chunk(undoLog.rows, batchSize);

  let updated = 0;
  let skippedAlreadyHasDueDate = 0;
  let skippedNoLongerOpen = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await sequelize.transaction(async (t) => {
      for (const row of batch) {
        const ticket = await Ticket.findByPk(row.ticket_id, { transaction: t });
        if (!ticket) {
          throw new Error(`Ticket ${row.ticket_id} not found mid-apply — aborting batch ${i + 1}`);
        }
        if (TERMINAL_STATUSES.includes(ticket.status)) {
          skippedNoLongerOpen++;
          continue;
        }
        if (ticket.due_date !== null && ticket.due_date !== undefined) {
          skippedAlreadyHasDueDate++;
          continue;
        }

        const newDueDate = computeDefaultTicketDueDate(ticket.priority, new Date());
        await ticket.update({ due_date: newDueDate, updated_at: new Date() } as any, { transaction: t });
        updated++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'backfill_ticket_due_dates.batch_applied',
        service: 'backfill-ticket-due-dates',
        batch_index: i + 1,
        batch_count: batches.length,
        updated_so_far: updated,
        skipped_already_has_due_date_so_far: skippedAlreadyHasDueDate,
        skipped_no_longer_open_so_far: skippedNoLongerOpen,
      }),
    );
  }

  return {
    processed: undoLog.rows.length,
    updated,
    skippedAlreadyHasDueDate,
    skippedNoLongerOpen,
    batches: batches.length,
  };
}

export interface RevertRunResult {
  processed: number;
  reverted: number;
  skippedAlreadyNull: number;
  batches: number;
}

/** --revert --undo-log <path>. Restores due_date to NULL for the undo log's rows. */
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
        if (!ticket) {
          throw new Error(`Ticket ${row.ticket_id} not found mid-revert — aborting batch ${i + 1}`);
        }

        if (ticket.due_date === null || ticket.due_date === undefined) {
          skipped++;
          continue;
        }

        await ticket.update({ due_date: null, updated_at: new Date() } as any, { transaction: t });
        reverted++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'backfill_ticket_due_dates.batch_reverted',
        service: 'backfill-ticket-due-dates',
        batch_index: i + 1,
        batch_count: batches.length,
        reverted_so_far: reverted,
        skipped_so_far: skipped,
      }),
    );
  }

  return { processed: undoLog.rows.length, reverted, skippedAlreadyNull: skipped, batches: batches.length };
}

/* istanbul ignore next — CLI entry point, exercised operationally not in unit tests */
if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  (async () => {
    await sequelize.authenticate();
    if (opts.mode === 'plan') await runPlan(opts.outDir, opts.sessionId);
    else if (opts.mode === 'apply') await runApply(opts.undoLogPath!, opts.batchSize);
    else await runRevert(opts.undoLogPath!, opts.batchSize);
    process.exit(0);
  })().catch((err: any) => {
    console.error(
      JSON.stringify({
        event: 'backfill_ticket_due_dates.failed',
        service: 'backfill-ticket-due-dates',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
