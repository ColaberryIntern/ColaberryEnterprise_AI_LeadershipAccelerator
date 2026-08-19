/**
 * Re-resolves the `assigned_to_type`/`assigned_to_id` on currently-open
 * tickets (status NOT IN done, cancelled) against the AI Leadership / AI
 * Staff hierarchy (Ali, live, 2026-08-19 — see
 * ticketCreatorReportsToResolver.ts's resolveReportsToHuman() for the chain
 * walk). A ticket created by an AI Staff agent that used to resolve directly
 * to a human (the flat model shipped 2026-08-18) now resolves through that
 * agent's AI Leadership agent instead — for many tickets this lands on a
 * DIFFERENT human than before (e.g. a StudentSuccessArchitect ticket moves
 * from Taiwo to Ali, since it now resolves through CoryBrain). This script
 * finds and applies exactly those changes, and leaves everything else alone.
 *
 * Reuses resolveCreatorAiAgent() + resolveReportsToHuman() — the exact same
 * resolution logic ticketService.createTicket() enforces going forward — so
 * this can never drift from what the live gate actually does. Reuses
 * ticketReportsToBackfillArtifacts.ts's undo-log/report shape verbatim
 * (generic enough already: ticket id, creator, previous/new assignee — none
 * of that is specific to flat-vs-chain resolution).
 *
 * Three modes, same shape as backfillTicketReportsToAssignee.ts:
 *
 *   node resolveTicketReportsToChain.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Scans live open tickets, resolves each
 *     creator's CURRENT chain, writes a dry-run report (.md) AND an undo log
 *     (.json) to --out-dir. Makes zero writes. A ticket already carrying the
 *     correct (post-hierarchy) assignee is not reported as a change.
 *
 *   node resolveTicketReportsToChain.js --apply --undo-log <path> [--batch-size 200]
 *     Loads the undo log; for each row, re-checks the ticket LIVE and
 *     re-resolves the creator's CURRENT chain fresh (never trusts the
 *     plan-time snapshot) before writing. Idempotent.
 *
 *   node resolveTicketReportsToChain.js --revert --undo-log <path> [--batch-size 200]
 *     Restores each row's assigned_to_type/assigned_to_id to the undo log's
 *     previous_* values verbatim. Idempotent.
 *
 * Status is never touched by any mode.
 */
import { Op } from 'sequelize';
import { Ticket } from '../models';
import { sequelize } from '../config/database';
import { resolveCreatorAiAgent, resolveReportsToHuman } from '../services/ticketCreatorReportsToResolver';
import {
  buildPlanReport,
  writeUndoLog,
  writeReport,
  readUndoLog,
  type BackfillUndoLog,
  type BackfillUndoRow,
  type BackfillUnresolvedRow,
} from './lib/ticketReportsToBackfillArtifacts';

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

async function fetchLiveOpenNonHumanTickets() {
  return Ticket.findAll({
    where: {
      status: { [Op.notIn]: TERMINAL_STATUSES },
      created_by_type: { [Op.ne]: 'human' },
    },
    attributes: ['id', 'created_by_type', 'created_by_id', 'assigned_to_type', 'assigned_to_id', 'status'],
  });
}

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalCandidates: number;
  totalResolved: number;
  totalUnresolved: number;
  totalUnchanged: number;
}

/** --plan (default). Read-only. Writes the dry-run report + undo log to disk. */
export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const candidates = await fetchLiveOpenNonHumanTickets();

  const rows: BackfillUndoRow[] = [];
  const unresolved: BackfillUnresolvedRow[] = [];
  let unchanged = 0;

  for (const ticket of candidates) {
    const agent = await resolveCreatorAiAgent(ticket.created_by_type, ticket.created_by_id);
    if (!agent) {
      unresolved.push({
        ticket_id: ticket.id,
        created_by_type: ticket.created_by_type,
        created_by_id: ticket.created_by_id,
        reason: 'unregistered',
      });
      continue;
    }
    const resolvedHumanId = await resolveReportsToHuman(agent);
    if (!resolvedHumanId) {
      unresolved.push({
        ticket_id: ticket.id,
        created_by_type: ticket.created_by_type,
        created_by_id: ticket.created_by_id,
        reason: 'no_reports_to',
      });
      continue;
    }
    // Already correctly assigned under the NEW chain — nothing to change. This
    // is the common case for the 2 AI Leadership agents' own tickets (their
    // chain is unchanged, still 1 hop) and any ticket whose creator's chain
    // happens to resolve to the same human it already had.
    if (ticket.assigned_to_type === 'org_member' && ticket.assigned_to_id === resolvedHumanId) {
      unchanged++;
      continue;
    }
    rows.push({
      ticket_id: ticket.id,
      created_by_type: ticket.created_by_type,
      created_by_id: ticket.created_by_id,
      previous_assigned_to_type: ticket.assigned_to_type,
      previous_assigned_to_id: ticket.assigned_to_id,
      new_assigned_to_type: 'org_member',
      new_assigned_to_id: resolvedHumanId,
    });
  }

  const { undoLog, reportMarkdown } = buildPlanReport(rows, unresolved, sessionId);
  const ts = Date.now();
  const undoLogPath = writeUndoLog(undoLog, outDir, ts);
  const reportPath = writeReport(reportMarkdown, outDir, ts);

  console.log(
    JSON.stringify({
      event: 'resolve_ticket_reports_to_chain.planned',
      service: 'resolve-ticket-reports-to-chain',
      total_candidates: candidates.length,
      total_resolved_and_changed: rows.length,
      total_unchanged: unchanged,
      total_unresolved: unresolved.length,
      reportPath,
      undoLogPath,
    }),
  );

  return {
    reportPath,
    undoLogPath,
    totalCandidates: candidates.length,
    totalResolved: rows.length,
    totalUnresolved: unresolved.length,
    totalUnchanged: unchanged,
  };
}

export interface ApplyRunResult {
  processed: number;
  updated: number;
  skippedAlreadyCorrect: number;
  skippedNoLongerOpen: number;
  skippedNoLongerResolves: number;
  batches: number;
}

/** --apply --undo-log <path>. Batched, transaction-per-batch. Re-derives each
 * ticket's LIVE state and the creator's CURRENT chain resolution fresh before
 * writing. Idempotent. */
export async function runApply(undoLogPath: string, batchSize: number): Promise<ApplyRunResult> {
  const undoLog = readUndoLog(undoLogPath);
  const batches = chunk(undoLog.rows, batchSize);

  let updated = 0;
  let skippedAlreadyCorrect = 0;
  let skippedNoLongerOpen = 0;
  let skippedNoLongerResolves = 0;

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

        const agent = await resolveCreatorAiAgent(ticket.created_by_type, ticket.created_by_id);
        const resolvedHumanId = agent ? await resolveReportsToHuman(agent) : null;
        if (!resolvedHumanId) {
          skippedNoLongerResolves++;
          continue;
        }

        if (ticket.assigned_to_type === 'org_member' && ticket.assigned_to_id === resolvedHumanId) {
          skippedAlreadyCorrect++;
          continue;
        }

        await ticket.update(
          { assigned_to_type: 'org_member', assigned_to_id: resolvedHumanId, updated_at: new Date() } as any,
          { transaction: t },
        );
        updated++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'resolve_ticket_reports_to_chain.batch_applied',
        service: 'resolve-ticket-reports-to-chain',
        batch_index: i + 1,
        batch_count: batches.length,
        updated_so_far: updated,
        skipped_already_correct_so_far: skippedAlreadyCorrect,
        skipped_no_longer_open_so_far: skippedNoLongerOpen,
        skipped_no_longer_resolves_so_far: skippedNoLongerResolves,
      }),
    );
  }

  return {
    processed: undoLog.rows.length,
    updated,
    skippedAlreadyCorrect,
    skippedNoLongerOpen,
    skippedNoLongerResolves,
    batches: batches.length,
  };
}

export interface RevertRunResult {
  processed: number;
  reverted: number;
  skippedAlreadyAtPreviousState: number;
  batches: number;
}

/** --revert --undo-log <path>. Restores assigned_to_type/assigned_to_id verbatim. */
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

        const alreadyReverted =
          ticket.assigned_to_type === row.previous_assigned_to_type &&
          ticket.assigned_to_id === row.previous_assigned_to_id;
        if (alreadyReverted) {
          skipped++;
          continue;
        }

        await ticket.update(
          {
            assigned_to_type: row.previous_assigned_to_type as any,
            assigned_to_id: row.previous_assigned_to_id as any,
            updated_at: new Date(),
          } as any,
          { transaction: t },
        );
        reverted++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'resolve_ticket_reports_to_chain.batch_reverted',
        service: 'resolve-ticket-reports-to-chain',
        batch_index: i + 1,
        batch_count: batches.length,
        reverted_so_far: reverted,
        skipped_so_far: skipped,
      }),
    );
  }

  return { processed: undoLog.rows.length, reverted, skippedAlreadyAtPreviousState: skipped, batches: batches.length };
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
        event: 'resolve_ticket_reports_to_chain.failed',
        service: 'resolve-ticket-reports-to-chain',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
