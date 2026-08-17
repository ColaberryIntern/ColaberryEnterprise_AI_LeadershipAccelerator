/**
 * One-off historical bulk-clear for Reese's stuck `student_support` ticket backlog
 * (see this run's execution-contract.md for the full DISCOVER trail — 15 tickets
 * stuck `backlog`, verified live, 2 of which have a strictly-newer sibling ticket for
 * the same DM room right now; a genuine missing-mechanism situation, NOT a sync gap —
 * nothing in `reeseReplyService.ts`/`reeseTicketLinkService.ts` has ever advanced a
 * `student_support` ticket's status).
 *
 * Classification and I/O are delegated entirely to
 * `intelligence/autonomy/reeseStudentSupportSupersessionResolver.ts`'s
 * `fetchLiveResolvableStudentSupportTickets()` (read-only) / the real
 * `services/company/ticketOrchestrator.ts` write path this file replicates directly
 * (see `runApply` below for why). Undo-log/report construction is delegated to
 * `lib/reeseStudentSupportSupersessionArtifacts.ts`. This file is the I/O
 * orchestration layer + CLI only.
 *
 * Modeled directly on `resolveCoryBrainInitiativeStaleTickets.ts`'s three-mode CLI
 * shape and its same "live re-derivation at --apply time, not stale --plan-time text"
 * choice: a room could legitimately gain or lose a sibling ticket between --plan and
 * --apply (a new student message could arrive), so --apply re-classifies every
 * undo-log row against CURRENT live data before writing, treats "this row no longer
 * qualifies to close" as a normal, individually-reported skip (not a whole-batch
 * abort), and never writes a ticket outside the undo log's own reviewed id set.
 *
 * Bypasses `ticketService.ts`'s state-machine-gated `updateTicketStatus()` on
 * purpose, same as every other resolver built today — `backlog -> done` is not a
 * valid transition in that state machine (only `backlog -> todo/cancelled` are).
 * Unlike the live resolver (which calls `ticketOrchestrator.ts`'s `updateTicketStatus()`
 * directly, one ticket at a time, no transaction), THIS CLI replicates that same
 * write (`Ticket.update()` + `TicketActivity.create()`, matching
 * `ticketOrchestrator.ts`'s own implementation field-for-field) directly inside a
 * `sequelize.transaction()` per batch — the same choice
 * `resolveCoryBrainInitiativeStaleTickets.ts` made, for the same reason: batched
 * historical writes need transactional safety (a mid-batch failure leaves earlier
 * batches committed and the rest safe to resume) that a bare per-call
 * `ticketOrchestrator.updateTicketStatus()` invocation doesn't provide on its own.
 *
 * Three modes:
 *
 *   node resolveReeseStudentSupportSupersession.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Fetches every live open Reese student_support ticket,
 *     classifies each one, writes a dry-run report (.md, grouped by outcome) AND an
 *     undo log (.json, one entry per ticket that WOULD close, covering its current
 *     status) to --out-dir (default: cwd). Makes zero writes.
 *
 *   node resolveReeseStudentSupportSupersession.js --apply --undo-log <path> [--batch-size 200]
 *     Loads the undo log, re-fetches LIVE classification for every ticket it covers,
 *     applies only the rows that STILL classify should_close on fresh data, skips
 *     rows already done/cancelled (idempotent), skips rows whose live signal no
 *     longer says should_close (reported, not force-closed), and reports rows that no
 *     longer exist. Batched (`sequelize.transaction()` per batch).
 *
 *   node resolveReeseStudentSupportSupersession.js --revert --undo-log <path> [--batch-size 200]
 *     The tested rollback path. Restores each APPLIED row's status to the undo log's
 *     recorded previous_status. Idempotent. Never deletes any row or TicketActivity.
 */
import {
  buildPlan,
  writeUndoLog,
  writeReport,
  readUndoLog,
  UndoLog,
} from './lib/reeseStudentSupportSupersessionArtifacts';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_SESSION_ID = 'unspecified-session';
const ACTOR_TYPE = 'ai_staff';

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

async function resolveActorId(): Promise<string> {
  const { getReeseAdminUserId } = await import('../services/reese/reeseIdentitySeed');
  const id = await getReeseAdminUserId();
  return id || 'Reese';
}

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalChecked: number;
  totalWouldClose: number;
  breakdown: Record<string, { checked: number; would_close: number }>;
}

/** --plan (default). Read-only. Writes the dry-run report + undo log to disk. */
export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const { fetchLiveResolvableStudentSupportTickets } = await import(
    '../intelligence/autonomy/reeseStudentSupportSupersessionResolver'
  );
  const { Ticket } = await import('../models');
  const { Op } = await import('sequelize');

  const results = await fetchLiveResolvableStudentSupportTickets();

  // fetchLiveResolvableStudentSupportTickets() doesn't carry each ticket's current
  // `status` value (only that it's open) — buildPlan()'s undo log needs the real
  // previous_status per row for --revert, so it's read directly here.
  const ticketIds = results.map((r) => r.ticket_id);
  const statusRows = ticketIds.length
    ? await (Ticket as any).findAll({ where: { id: { [Op.in]: ticketIds } }, attributes: ['id', 'status'] })
    : [];
  const statusByTicketId = new Map<string, string>(statusRows.map((t: any) => [t.id, t.status]));

  const { undoLog, reportMarkdown } = buildPlan(results, statusByTicketId, sessionId);

  const ts = Date.now();
  const undoLogPath = writeUndoLog(undoLog, outDir, ts);
  const reportPath = writeReport(reportMarkdown, outDir, ts);

  console.log(
    JSON.stringify({
      event: 'resolve_reese_student_support_supersession.planned',
      service: 'resolve-reese-student-support-supersession',
      total_checked: results.length,
      total_would_close: undoLog.rows.length,
      breakdown: undoLog.breakdown,
      reportPath,
      undoLogPath,
    }),
  );

  return {
    reportPath,
    undoLogPath,
    totalChecked: results.length,
    totalWouldClose: undoLog.rows.length,
    breakdown: undoLog.breakdown,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ApplyRunResult {
  processed: number;
  closed: number;
  skippedAlreadyDone: number;
  skippedConditionReemerged: number;
  skippedNotFound: number;
  batches: number;
}

/**
 * --apply --undo-log <path>. Batched, transaction-per-batch. Re-derives fresh live
 * classification for every undo-log row before writing (see file header for why).
 * Never writes a ticket outside the undo log's own id set.
 */
export async function runApply(undoLogPath: string, batchSize: number): Promise<ApplyRunResult> {
  const { Ticket, TicketActivity } = await import('../models');
  const { sequelize } = await import('../config/database');
  const { fetchLiveResolvableStudentSupportTickets } = await import(
    '../intelligence/autonomy/reeseStudentSupportSupersessionResolver'
  );

  const actorId = await resolveActorId();
  const undoLog = readUndoLog(undoLogPath);
  const liveResults = await fetchLiveResolvableStudentSupportTickets();
  const liveByTicketId = new Map(liveResults.map((r) => [r.ticket_id, r]));

  const batches = chunk(undoLog.rows, batchSize);
  let closed = 0;
  let skippedAlreadyDone = 0;
  let skippedConditionReemerged = 0;
  let skippedNotFound = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await sequelize.transaction(async (t) => {
      for (const row of batch) {
        const ticket = await (Ticket as any).findByPk(row.ticket_id, { transaction: t });
        if (!ticket) {
          skippedNotFound++;
          continue;
        }
        if (ticket.status === 'done' || ticket.status === 'cancelled') {
          skippedAlreadyDone++; // idempotent: already applied (this run or the cron)
          continue;
        }

        const liveResult = liveByTicketId.get(row.ticket_id);
        if (!liveResult || !liveResult.should_close) {
          // Real drift since --plan: the room's sibling set changed (e.g. the
          // superseding ticket itself closed, or a newer ticket appeared and this
          // one is no longer the specific superseded row). Reported, not
          // force-closed — see file header.
          skippedConditionReemerged++;
          continue;
        }

        const fromStatus = ticket.status;
        await ticket.update({ status: 'done', completed_at: new Date() }, { transaction: t });
        await (TicketActivity as any).create(
          {
            ticket_id: row.ticket_id,
            actor_type: ACTOR_TYPE,
            actor_id: actorId,
            action: 'status_changed',
            from_value: fromStatus,
            to_value: 'done',
            comment: liveResult.evidence_note, // fresh evidence, not the stale --plan-time text
          },
          { transaction: t },
        );
        closed++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'resolve_reese_student_support_supersession.batch_applied',
        service: 'resolve-reese-student-support-supersession',
        batch_index: i + 1,
        batch_count: batches.length,
        rows_in_batch: batch.length,
        closed_so_far: closed,
        skipped_already_done: skippedAlreadyDone,
        skipped_condition_reemerged: skippedConditionReemerged,
        skipped_not_found: skippedNotFound,
      }),
    );
  }

  return {
    processed: undoLog.rows.length,
    closed,
    skippedAlreadyDone,
    skippedConditionReemerged,
    skippedNotFound,
    batches: batches.length,
  };
}

export interface RevertRunResult {
  processed: number;
  reverted: number;
  skippedAlreadyAtPreviousStatus: number;
  batches: number;
}

/** --revert --undo-log <path>. The tested rollback path. */
export async function runRevert(undoLogPath: string, batchSize: number): Promise<RevertRunResult> {
  const { Ticket, TicketActivity } = await import('../models');
  const { sequelize } = await import('../config/database');
  const actorId = await resolveActorId();
  const undoLog: UndoLog = readUndoLog(undoLogPath);
  const batches = chunk(undoLog.rows, batchSize);
  let reverted = 0;
  let skipped = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await sequelize.transaction(async (t) => {
      for (const row of batch) {
        const ticket = await (Ticket as any).findByPk(row.ticket_id, { transaction: t });
        if (!ticket) throw new Error(`Ticket ${row.ticket_id} not found mid-revert — aborting batch ${i + 1}`);
        if (ticket.status === row.previous_status) {
          skipped++;
          continue;
        }

        const fromStatus = ticket.status;
        await ticket.update(
          { status: row.previous_status as any, ...(row.previous_status !== 'done' ? { completed_at: null } : {}) },
          { transaction: t },
        );
        await (TicketActivity as any).create(
          {
            ticket_id: row.ticket_id,
            actor_type: ACTOR_TYPE,
            actor_id: actorId,
            action: 'status_changed',
            from_value: fromStatus,
            to_value: row.previous_status,
            comment: `Reverted by resolveReeseStudentSupportSupersession --revert (undo log: ${undoLogPath}). Status restored to '${row.previous_status}'.`,
          },
          { transaction: t },
        );
        reverted++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'resolve_reese_student_support_supersession.batch_reverted',
        service: 'resolve-reese-student-support-supersession',
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
    const { sequelize } = await import('../config/database');
    await sequelize.authenticate();
    if (opts.mode === 'plan') await runPlan(opts.outDir, opts.sessionId);
    else if (opts.mode === 'apply') await runApply(opts.undoLogPath!, opts.batchSize);
    else await runRevert(opts.undoLogPath!, opts.batchSize);
    process.exit(0);
  })().catch((err: any) => {
    console.error(
      JSON.stringify({
        event: 'resolve_reese_student_support_supersession.failed',
        service: 'resolve-reese-student-support-supersession',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
