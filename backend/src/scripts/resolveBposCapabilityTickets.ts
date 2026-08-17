/**
 * One-off historical bulk-clear for bpos_orchestrator's stuck `bpos_execution` ticket
 * backlog (see this run's execution-contract.md for the full DISCOVER trail — 11
 * tickets stuck `in_progress` since 2026-04-24..2026-04-30; 5 are a genuine SYNC GAP
 * (their capability reached user_status:'verified' after the ticket opened, but the
 * one call that would have closed the ticket lives on a frontend route deleted
 * 2026-07-18), 1 references a capability that has been hard-deleted, and 5 are a
 * GENUINE STALL with no real signal — left untouched, never force-closed).
 *
 * Classification and I/O are delegated entirely to
 * `services/company/bposCapabilityTicketAutoResolver.ts`'s
 * `fetchLiveResolvableBposCapabilityTickets()` (read-only) / the real
 * `services/company/ticketOrchestrator.ts` write path this file replicates directly
 * (see `runApply` below for why). Undo-log/report construction is delegated to
 * `lib/bposCapabilityTicketArtifacts.ts`. This file is the I/O orchestration layer +
 * CLI only.
 *
 * Modeled directly on `resolveReeseStudentSupportSupersession.ts`'s three-mode CLI
 * shape and its same "live re-derivation at --apply time, not stale --plan-time text"
 * choice: a capability could legitimately change `user_status` between --plan and
 * --apply, so --apply re-classifies every undo-log row against CURRENT live data
 * before writing, treats "this row no longer qualifies to close" as a normal,
 * individually-reported skip (not a whole-batch abort), and never writes a ticket
 * outside the undo log's own reviewed id set.
 *
 * Bypasses `ticketService.ts`'s state-machine-gated `updateTicketStatus()` on purpose,
 * same as every other resolver built today for this same class of problem — even
 * though `in_progress -> done`/`in_progress -> cancelled` ARE valid transitions under
 * that real state machine (unlike some sibling fixes' `backlog -> done` bypass), this
 * CLI still replicates `ticketOrchestrator.ts`'s own write
 * (`Ticket.update()` + `TicketActivity.create()`, matching its implementation
 * field-for-field) directly inside a `sequelize.transaction()` per batch, for the same
 * reason every other historical-clear CLI built today did: batched historical writes
 * need transactional safety (a mid-batch failure leaves earlier batches committed and
 * the rest safe to resume) that a bare per-call `ticketOrchestrator.updateTicketStatus()`
 * invocation doesn't provide on its own.
 *
 * Three modes:
 *
 *   node resolveBposCapabilityTickets.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Fetches every live open bpos_execution ticket,
 *     classifies each one, writes a dry-run report (.md, grouped by outcome) AND an
 *     undo log (.json, one entry per ticket that WOULD close, covering its current
 *     status and its target close_to_status) to --out-dir (default: cwd). Makes zero
 *     writes.
 *
 *   node resolveBposCapabilityTickets.js --apply --undo-log <path> [--batch-size 200]
 *     Loads the undo log, re-fetches LIVE classification for every ticket it covers,
 *     applies only the rows that STILL classify should_close on fresh data (to their
 *     OWN recorded close_to_status, not always 'done'), skips rows already
 *     done/cancelled (idempotent), skips rows whose live signal no longer says
 *     should_close (reported, not force-closed), and reports rows that no longer
 *     exist. Batched (`sequelize.transaction()` per batch).
 *
 *   node resolveBposCapabilityTickets.js --revert --undo-log <path> [--batch-size 200]
 *     The tested rollback path. Restores each APPLIED row's status to the undo log's
 *     recorded previous_status. Idempotent. Never deletes any row or TicketActivity.
 */
import {
  buildPlan,
  writeUndoLog,
  writeReport,
  readUndoLog,
  UndoLog,
} from './lib/bposCapabilityTicketArtifacts';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_SESSION_ID = 'unspecified-session';
const ACTOR_TYPE = 'cory';
const ACTOR_ID = 'bpos_orchestrator';

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

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalChecked: number;
  totalWouldClose: number;
  breakdown: Record<string, { checked: number; would_close: number }>;
}

/** --plan (default). Read-only. Writes the dry-run report + undo log to disk. */
export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const { fetchLiveResolvableBposCapabilityTickets } = await import(
    '../services/company/bposCapabilityTicketAutoResolver'
  );
  const { Ticket } = await import('../models');
  const { Op } = await import('sequelize');

  const results = await fetchLiveResolvableBposCapabilityTickets();

  // fetchLiveResolvableBposCapabilityTickets() doesn't carry each ticket's current
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
      event: 'resolve_bpos_capability_tickets.planned',
      service: 'resolve-bpos-capability-tickets',
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
 * Never writes a ticket outside the undo log's own id set. Writes to the row's OWN
 * `close_to_status` ('done' or 'cancelled'), never assumes a single target.
 */
export async function runApply(undoLogPath: string, batchSize: number): Promise<ApplyRunResult> {
  const { Ticket, TicketActivity } = await import('../models');
  const { sequelize } = await import('../config/database');
  const { fetchLiveResolvableBposCapabilityTickets } = await import(
    '../services/company/bposCapabilityTicketAutoResolver'
  );

  const undoLog = readUndoLog(undoLogPath);
  const liveResults = await fetchLiveResolvableBposCapabilityTickets();
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
        if (!liveResult || !liveResult.should_close || !liveResult.close_to_status) {
          // Real drift since --plan: the capability's user_status changed (e.g. it
          // was un-verified, or a deleted capability was somehow restored — neither
          // expected, but handled). Reported, not force-closed — see file header.
          skippedConditionReemerged++;
          continue;
        }

        const fromStatus = ticket.status;
        const targetStatus = liveResult.close_to_status;
        await ticket.update(
          { status: targetStatus, ...(targetStatus === 'done' ? { completed_at: new Date() } : {}) },
          { transaction: t },
        );
        await (TicketActivity as any).create(
          {
            ticket_id: row.ticket_id,
            actor_type: ACTOR_TYPE,
            actor_id: ACTOR_ID,
            action: 'status_changed',
            from_value: fromStatus,
            to_value: targetStatus,
            comment: liveResult.evidence_note, // fresh evidence, not the stale --plan-time text
          },
          { transaction: t },
        );
        closed++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'resolve_bpos_capability_tickets.batch_applied',
        service: 'resolve-bpos-capability-tickets',
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
            actor_id: ACTOR_ID,
            action: 'status_changed',
            from_value: fromStatus,
            to_value: row.previous_status,
            comment: `Reverted by resolveBposCapabilityTickets --revert (undo log: ${undoLogPath}). Status restored to '${row.previous_status}'.`,
          },
          { transaction: t },
        );
        reverted++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'resolve_bpos_capability_tickets.batch_reverted',
        service: 'resolve-bpos-capability-tickets',
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
        event: 'resolve_bpos_capability_tickets.failed',
        service: 'resolve-bpos-capability-tickets',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
