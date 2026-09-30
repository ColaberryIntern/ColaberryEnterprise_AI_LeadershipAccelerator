/**
 * One-off historical bulk-clear: of cory-engine's 6,843 open tickets (`todo`, spanning
 * 2026-03-13 through 2026-08-13 — see this run's execution-contract.md for the full
 * DISCOVER trail, verified directly against production), most were opened for a
 * condition (an agent's error state, a lead-generation drop) that has since cleared,
 * but nothing before this run ever re-checked an already-open one.
 *
 * Classification is delegated entirely to `intelligence/autonomy/coryEngineTicketResolutionRules.ts`
 * (pure) via `intelligence/autonomy/coryEngineTicketAutoResolver.ts`'s
 * `fetchLiveResolvableCoryEngineTickets()` (I/O, re-runs the SAME detectors
 * `autonomousEngine.ts` uses). Undo-log/report construction is delegated to
 * `lib/coryEngineTicketResolutionArtifacts.ts`. This file is the I/O orchestration
 * layer + CLI only.
 *
 * Modeled directly on `archiveDuplicateOpenclawLearningTickets.ts`'s three-mode CLI
 * shape (the closest precedent: also a single-table `tickets` bulk resolution) and
 * `resolveStaleStrategicInitiatives.ts`'s "re-check against live health data, not
 * time" evidence-gating pattern — see execution-contract.md §5 for the full precedent
 * mapping.
 *
 * **Deliberate departure from both precedents' drift-check (documented, not an
 * oversight):** `archiveDuplicateOpenclawLearningTickets.ts`/`resolveStaleStrategicInitiatives.ts`
 * ABORT the entire batch on ANY row drifting from its --plan-time snapshot, because
 * their classification facts are effectively static between runs. This resolver's
 * classification is, by design, a LIVE re-derivation every time it runs (that is the
 * whole point of "evidence-gated" — an agent can recover OR fail again between --plan
 * and --apply, and the conversion_drop signal is a shared, moving, noisy metric that
 * can legitimately flip on its own). Aborting the whole 6,843-ticket batch because a
 * handful of agent_failure rows flipped state in the intervening minutes would be
 * operationally unusable and would not make the tool more honest — it would just make
 * it less useful while providing no additional safety, since --apply is ALREADY
 * re-deriving fresh live evidence rather than trusting stale --plan-time text. So
 * --apply here: (1) never writes anything outside the undo log's reviewed ticket-id
 * set (the safety property the abort-on-drift check exists to protect, preserved),
 * (2) re-classifies each of those specific rows against CURRENT live data before
 * writing (never replays stale evidence text), (3) treats "this specific row no longer
 * qualifies to close" as a normal, expected, individually-reported skip — not a
 * whole-batch abort — because at this row count, over any real time window, some rows
 * genuinely re-flipping is the expected behavior of an honest re-check, not a signal
 * something is broken.
 *
 * Bypasses `ticketService.ts`'s state-machine-gated `updateTicketStatus()` on purpose,
 * same as `workforceTicketAutoResolver.ts` (PR #1482) — `todo -> done` is not a valid
 * transition in that state machine (only `todo -> in_progress/cancelled` are); this
 * uses `company/ticketOrchestrator.ts`'s already-proven, non-state-machine
 * `updateTicketStatus()` for the identical class of problem.
 *
 * Three modes:
 *
 *   node resolveCoryEngineStaleTickets.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Fetches every live open cory-engine ticket, classifies
 *     each one, writes a dry-run report (.md, grouped by condition-type) AND an undo
 *     log (.json, one entry per ticket that WOULD close, covering its current status)
 *     to --out-dir (default: cwd). Makes zero writes.
 *
 *   node resolveCoryEngineStaleTickets.js --apply --undo-log <path> [--batch-size 200]
 *     Loads the undo log, re-fetches LIVE classification for every ticket it covers,
 *     applies only the rows that STILL classify should_close on fresh data (see the
 *     departure-from-precedent note above), skips rows already done/cancelled
 *     (idempotent), skips rows whose live condition re-emerged (reported, not
 *     force-closed), and reports rows that no longer exist. Batched
 *     (`sequelize.transaction()` per batch) so a mid-batch failure leaves earlier
 *     batches committed and the rest safe to resume.
 *
 *   node resolveCoryEngineStaleTickets.js --revert --undo-log <path> [--batch-size 200]
 *     The tested rollback path. Restores each APPLIED row's status to the undo log's
 *     recorded previous_status. Idempotent. Never deletes any row or TicketActivity.
 */
import { Op } from 'sequelize';
import {
  buildPlan,
  writeUndoLog,
  writeReport,
  readUndoLog,
  UndoLog,
} from './lib/coryEngineTicketResolutionArtifacts';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_SESSION_ID = 'unspecified-session';
const ACTOR_TYPE = 'agent';
const ACTOR_ID = 'cory-engine';

// NOTE on scope: this file does NOT declare its own copy of the defensive triple key
// (`created_by_id='cory-engine' AND type='agent_action' AND source='cory_autonomous_cycle'`)
// — a prior draft did, as a decorative constant that was never actually referenced by
// any query in this file (flagged in T005's task verification as misleading dead code,
// since a reader could assume it enforces scope here). The real, functioning
// enforcement lives entirely in `coryEngineTicketAutoResolver.ts`'s
// `fetchLiveResolvableCoryEngineTickets()`, which both `runPlan()` and `runApply()`
// below call for all live data — this file only ever queries by `ticket_id` afterward
// (already scoped by construction), so a second, unused copy of the same key here
// would only be able to drift, never add real protection.

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
  const { fetchLiveResolvableCoryEngineTickets } = await import('../intelligence/autonomy/coryEngineTicketAutoResolver');
  const { Ticket } = await import('../models');

  const results = await fetchLiveResolvableCoryEngineTickets();

  // fetchLiveResolvableCoryEngineTickets() doesn't carry each ticket's current
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
      event: 'resolve_cory_engine_tickets.planned',
      service: 'resolve-cory-engine-tickets',
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
 * classification for every undo-log row before writing (see file header for why this
 * departs from the abort-on-any-drift precedent). Never writes a ticket outside the
 * undo log's own id set.
 */
export async function runApply(undoLogPath: string, batchSize: number): Promise<ApplyRunResult> {
  const { Ticket, TicketActivity } = await import('../models');
  const { sequelize } = await import('../config/database');
  const { fetchLiveResolvableCoryEngineTickets } = await import('../intelligence/autonomy/coryEngineTicketAutoResolver');

  const undoLog = readUndoLog(undoLogPath);
  const liveResults = await fetchLiveResolvableCoryEngineTickets();
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
          // Real drift since --plan: the specific condition this ticket describes is
          // true again right now. Reported, not force-closed — see file header.
          skippedConditionReemerged++;
          continue;
        }

        const fromStatus = ticket.status;
        await ticket.update({ status: 'done', completed_at: new Date() }, { transaction: t });
        await (TicketActivity as any).create(
          {
            ticket_id: row.ticket_id,
            actor_type: ACTOR_TYPE,
            actor_id: ACTOR_ID,
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
        event: 'resolve_cory_engine_tickets.batch_applied',
        service: 'resolve-cory-engine-tickets',
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
            comment: `Reverted by resolveCoryEngineStaleTickets --revert (undo log: ${undoLogPath}). Status restored to '${row.previous_status}'.`,
          },
          { transaction: t },
        );
        reverted++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'resolve_cory_engine_tickets.batch_reverted',
        service: 'resolve-cory-engine-tickets',
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
        event: 'resolve_cory_engine_tickets.failed',
        service: 'resolve-cory-engine-tickets',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
