/**
 * One-off historical resolution: of the `strategic_initiatives` rows still at
 * `status='proposed'` (68 in production as of 2026-08-15 — see
 * .loop-architect/runs/20260815-corybrain-stale-findings-resolution/execution-contract.md
 * for the full DISCOVER trail), most describe an agent's error state/rate and the
 * agent has since recovered — but nothing before PR #1491 ever gave an initiative a
 * path to `completed`/`cancelled`, and nothing before this script ever re-checked an
 * already-`proposed` one against the agent's REAL CURRENT health.
 *
 * Classification is delegated entirely to `lib/staleInitiativeResolutionRules.ts`
 * (pure, reuses PR #1482's exact `workforceTicketAutoResolver.ts` threshold — this
 * file never re-derives the numbers). Undo-log/report construction is delegated to
 * `lib/staleInitiativeResolutionArtifacts.ts`. This file is the I/O orchestration
 * layer only: fetch live data, classify, write/read artifacts, apply/revert.
 *
 * **Both tables, not one.** Unlike the closest same-table precedent
 * (`consolidateDuplicateStrategicInitiatives.ts`, which deliberately never imports
 * `Ticket`), this script writes both `strategic_initiatives` (direct `.update()` —
 * confirmed safe: `status` is an unconstrained `STRING(20)` with no state machine,
 * same as that precedent) AND the linked `tickets` row. The ticket side deliberately
 * does **not** go through `ticketService.ts`'s state-machine-gated
 * `updateTicketStatus()`: every one of the 68 candidate tickets predates PR #1491
 * (which changed the ticket start-state to `in_review`) and still sits at
 * `status='backlog'` (confirmed live), and `backlog -> done` is not a valid
 * transition in that state machine (only `backlog -> todo/cancelled` are) — calling
 * `coryInitiatives.ts`'s `completeInitiative()` here would silently no-op the ticket
 * side (it wraps that call in `.catch(() => {})`) while the initiative row itself
 * flipped to `completed`, reproducing the exact orphaned-ticket bug this cleanup
 * exists to close. Instead, the ticket write reproduces the same effect
 * `ticketOrchestrator.ts`'s `updateTicketStatus()` already produces in production
 * (PR #1482's `workforceTicketAutoResolver.ts` uses it for this exact class of
 * problem) — a raw `Ticket.update()` + single `TicketActivity.create()` combining the
 * status change and a real evidence comment, no state-machine check — but inlined
 * with `{ transaction: t }` rather than calling that function directly, since it does
 * not accept a transaction option and this run's data-safety requirement (CLAUDE.md:
 * "Partial commits are forbidden; use transactions or compensating actions") needs
 * the initiative write and the ticket write to commit as one atomic unit. This
 * matches `archiveDuplicateOpenclawLearningTickets.ts`'s own precedent of writing
 * `Ticket`/`TicketActivity` directly inside a transaction rather than through a
 * non-transactional shared helper.
 *
 * Three modes, mirroring both precedents' proven shape:
 *
 *   node resolveStaleStrategicInitiatives.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Fetches every live `proposed` initiative + its linked
 *     ticket + the full `ai_agents` table, classifies each row, writes a dry-run
 *     report (.md) AND an undo log (.json, one entry per row that WOULD be resolved,
 *     covering both tables' previous state) to --out-dir (default: cwd). Makes zero
 *     writes.
 *
 *   node resolveStaleStrategicInitiatives.js --apply --undo-log <path> [--batch-size 200]
 *     Loads the undo log, re-fetches live state for every row it covers, ABORTS with
 *     no writes if any row's live state matches neither the undo log's recorded
 *     previous state nor its target state (real drift — something else changed the
 *     row between --plan and --apply). Rows already at their target state on BOTH
 *     tables are skipped (idempotent re-run). Otherwise resolves each row in batches
 *     (one `sequelize.transaction()` per batch, matching both precedents' granularity
 *     — a mid-batch failure rolls back that whole batch, not just one row, and
 *     earlier committed batches are unaffected).
 *
 *   node resolveStaleStrategicInitiatives.js --revert --undo-log <path> [--batch-size 200]
 *     The tested rollback path. Restores each row's initiative `status`/`description`
 *     AND its ticket `status` to the undo log's recorded previous values. Idempotent.
 *     Never deletes any row or `TicketActivity` (append-only ledger, per this repo's
 *     own convention).
 */
import { Op } from 'sequelize';
import { logAiEvent } from '../services/aiEventService';
import { RETIRED_AGENTS } from '../services/agentRegistrySeed';
import { classifyInitiative, AgentHealthSnapshot } from './lib/staleInitiativeResolutionRules';
import {
  buildPlan,
  writeUndoLog,
  writeReport,
  readUndoLog,
  buildInitiativeDescriptionUpdate,
  buildTicketComment,
  ResolvableRow,
  StaleInitiativeUndoLog,
  StaleInitiativeUndoRow,
} from './lib/staleInitiativeResolutionArtifacts';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_SESSION_ID = 'unspecified-session';
const ACTOR_TYPE = 'agent';
const ACTOR_ID = 'CoryBrain';

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

/**
 * Fetches every live `proposed` initiative, its linked ticket (if any), and the full
 * `ai_agents` table (small — ~129 rows, confirmed in this repo's own PROGRESS.md —
 * fetching all of it is simpler and avoids re-implementing the title-parsing regexes
 * a second time just to know which names to filter by), then classifies each row via
 * `classifyInitiative()`. Pure I/O + delegation — no classification logic lives here.
 */
export async function fetchLiveResolvableRows(): Promise<ResolvableRow[]> {
  const { StrategicInitiative, Ticket, AiAgent } = await import('../models');

  const initiatives = await (StrategicInitiative as any).findAll({
    where: { status: 'proposed' },
    order: [['title', 'ASC']],
  });

  const ticketIds = initiatives.map((i: any) => i.ticket_id).filter((id: any): id is string => !!id);
  const tickets = ticketIds.length
    ? await (Ticket as any).findAll({ where: { id: { [Op.in]: ticketIds } } })
    : [];
  const ticketById = new Map<string, any>(tickets.map((t: any) => [t.id, t]));

  const agents = await (AiAgent as any).findAll();
  const agentHealthByName = new Map<string, AgentHealthSnapshot>(
    agents.map((a: any) => [
      a.agent_name,
      { status: a.status, enabled: a.enabled, run_count: a.run_count || 0, error_count: a.error_count || 0 },
    ]),
  );

  return initiatives.map((init: any) => {
    const classification = classifyInitiative({ id: init.id, title: init.title }, agentHealthByName, RETIRED_AGENTS);
    const ticket = init.ticket_id ? ticketById.get(init.ticket_id) : undefined;
    return {
      initiative_id: init.id,
      title: init.title,
      description: init.description ?? null,
      ticket_id: init.ticket_id ?? null,
      ticket_status: ticket ? ticket.status : null,
      classification,
    };
  });
}

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalCandidates: number;
  totalRowsToResolve: number;
  breakdown: Record<string, number>;
}

/** --plan (default). Read-only. Writes the dry-run report + undo log to disk. */
export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const rows = await fetchLiveResolvableRows();
  const { undoLog, reportMarkdown } = buildPlan(rows, sessionId);

  const ts = Date.now();
  const undoLogPath = writeUndoLog(undoLog, outDir, ts);
  const reportPath = writeReport(reportMarkdown, outDir, ts);

  const breakdown: Record<string, number> = {};
  for (const r of undoLog.rows) breakdown[r.outcome] = (breakdown[r.outcome] || 0) + 1;
  for (const s of undoLog.skipped) breakdown[s.outcome] = (breakdown[s.outcome] || 0) + 1;

  console.log(
    JSON.stringify({
      event: 'resolve_stale_initiatives.planned',
      service: 'resolve-stale-initiatives',
      total_candidates: rows.length,
      total_rows_to_resolve: undoLog.rows.length,
      breakdown,
      reportPath,
      undoLogPath,
    }),
  );

  return { reportPath, undoLogPath, totalCandidates: rows.length, totalRowsToResolve: undoLog.rows.length, breakdown };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type ApplyAction = 'apply' | 'skip_already_applied';

/**
 * For each undo-log row, re-fetches BOTH live rows and decides: still at the
 * recorded previous state on both tables -> apply; already at the target state on
 * both tables -> skip (idempotent re-run); anything else -> real drift, collected and
 * thrown together so a single abort message names every drifted row at once.
 */
async function partitionForApply(
  undoLog: StaleInitiativeUndoLog,
): Promise<Array<{ row: StaleInitiativeUndoRow; action: ApplyAction }>> {
  const { StrategicInitiative, Ticket } = await import('../models');
  const initiativeIds = undoLog.rows.map((r) => r.initiative_id);
  const ticketIds = undoLog.rows.map((r) => r.ticket_id);

  const liveInitiatives = initiativeIds.length
    ? await (StrategicInitiative as any).findAll({ where: { id: { [Op.in]: initiativeIds } } })
    : [];
  const liveTickets = ticketIds.length ? await (Ticket as any).findAll({ where: { id: { [Op.in]: ticketIds } } }) : [];

  const initiativeById = new Map<string, any>(liveInitiatives.map((i: any) => [i.id, i]));
  const ticketById = new Map<string, any>(liveTickets.map((t: any) => [t.id, t]));

  const result: Array<{ row: StaleInitiativeUndoRow; action: ApplyAction }> = [];
  const driftMessages: string[] = [];

  for (const row of undoLog.rows) {
    const initiative = initiativeById.get(row.initiative_id);
    const ticket = ticketById.get(row.ticket_id);

    if (!initiative) {
      driftMessages.push(`Initiative ${row.initiative_id} not found live`);
      continue;
    }
    if (!ticket) {
      driftMessages.push(`Ticket ${row.ticket_id} (for initiative ${row.initiative_id}) not found live`);
      continue;
    }

    const atTarget = initiative.status === row.target_initiative_status && ticket.status === row.target_ticket_status;
    const atPrevious =
      initiative.status === row.previous_initiative_status && ticket.status === row.previous_ticket_status;

    if (atTarget) {
      result.push({ row, action: 'skip_already_applied' });
    } else if (atPrevious) {
      result.push({ row, action: 'apply' });
    } else {
      driftMessages.push(
        `Row ${row.initiative_id}: live state (initiative='${initiative.status}', ticket='${ticket.status}') ` +
          `matches neither the undo log's previous state ('${row.previous_initiative_status}'/'${row.previous_ticket_status}') ` +
          `nor its target state ('${row.target_initiative_status}'/'${row.target_ticket_status}')`,
      );
    }
  }

  if (driftMessages.length > 0) {
    throw new Error(
      `Drift detected between undo log and live data — aborting before any write.\n${driftMessages.join('\n')}\n` +
        `Re-run --plan and review the new dry-run report before applying.`,
    );
  }

  return result;
}

export interface ApplyRunResult {
  processed: number;
  resolved: number;
  skippedAlreadyApplied: number;
  batches: number;
}

/** --apply --undo-log <path>. Batched, transaction-per-batch, idempotent, touches both tables. */
export async function runApply(undoLogPath: string, batchSize: number): Promise<ApplyRunResult> {
  const { StrategicInitiative, Ticket, TicketActivity } = await import('../models');
  const { sequelize } = await import('../config/database');
  const undoLog = readUndoLog(undoLogPath);
  const partitioned = await partitionForApply(undoLog);

  const toApply = partitioned.filter((p) => p.action === 'apply');
  const skippedAlreadyApplied = partitioned.filter((p) => p.action === 'skip_already_applied').length;

  const resolvedAtDate = new Date().toISOString().slice(0, 10);
  const batches = chunk(toApply, batchSize);
  let resolved = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await sequelize.transaction(async (t) => {
      for (const { row } of batch) {
        const initiative = await (StrategicInitiative as any).findByPk(row.initiative_id, { transaction: t });
        if (!initiative) throw new Error(`Initiative ${row.initiative_id} not found mid-apply — aborting batch ${i + 1}`);
        const ticket = await (Ticket as any).findByPk(row.ticket_id, { transaction: t });
        if (!ticket) throw new Error(`Ticket ${row.ticket_id} not found mid-apply — aborting batch ${i + 1}`);

        const newDescription = buildInitiativeDescriptionUpdate(row, resolvedAtDate);
        await initiative.update({ status: row.target_initiative_status, description: newDescription }, { transaction: t });

        const fromTicketStatus = ticket.status;
        await ticket.update(
          {
            status: row.target_ticket_status,
            ...(row.target_ticket_status === 'done' ? { completed_at: new Date() } : {}),
          },
          { transaction: t },
        );
        await (TicketActivity as any).create(
          {
            ticket_id: row.ticket_id,
            actor_type: ACTOR_TYPE,
            actor_id: ACTOR_ID,
            action: 'status_changed',
            from_value: fromTicketStatus,
            to_value: row.target_ticket_status,
            comment: buildTicketComment(row, resolvedAtDate),
          },
          { transaction: t },
        );

        resolved++;

        await logAiEvent('CoryBrain', 'INITIATIVE_STALE_RESOLVED', 'strategic_initiatives', row.initiative_id, {
          outcome: row.outcome,
          agent_name: row.agent_name,
          ticket_id: row.ticket_id,
        }).catch(() => {});
      }
    });

    console.log(
      JSON.stringify({
        event: 'resolve_stale_initiatives.batch_applied',
        service: 'resolve-stale-initiatives',
        batch_index: i + 1,
        batch_count: batches.length,
        rows_in_batch: batch.length,
        resolved_so_far: resolved,
        skipped_already_applied: skippedAlreadyApplied,
      }),
    );
  }

  return { processed: undoLog.rows.length, resolved, skippedAlreadyApplied, batches: batches.length };
}

export interface RevertRunResult {
  processed: number;
  reverted: number;
  skippedAlreadyAtPreviousState: number;
  batches: number;
}

/** --revert --undo-log <path>. Restores both tables to their recorded previous state. */
export async function runRevert(undoLogPath: string, batchSize: number): Promise<RevertRunResult> {
  const { StrategicInitiative, Ticket, TicketActivity } = await import('../models');
  const { sequelize } = await import('../config/database');
  const undoLog = readUndoLog(undoLogPath);
  const batches = chunk(undoLog.rows, batchSize);
  let reverted = 0;
  let skipped = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await sequelize.transaction(async (t) => {
      for (const row of batch) {
        const initiative = await (StrategicInitiative as any).findByPk(row.initiative_id, { transaction: t });
        if (!initiative) throw new Error(`Initiative ${row.initiative_id} not found mid-revert — aborting batch ${i + 1}`);
        const ticket = await (Ticket as any).findByPk(row.ticket_id, { transaction: t });
        if (!ticket) throw new Error(`Ticket ${row.ticket_id} not found mid-revert — aborting batch ${i + 1}`);

        const alreadyReverted =
          initiative.status === row.previous_initiative_status &&
          initiative.description === row.previous_initiative_description &&
          ticket.status === row.previous_ticket_status;
        if (alreadyReverted) {
          skipped++;
          continue;
        }

        await initiative.update(
          { status: row.previous_initiative_status, description: row.previous_initiative_description },
          { transaction: t },
        );

        const fromTicketStatus = ticket.status;
        await ticket.update(
          { status: row.previous_ticket_status, ...(row.previous_ticket_status !== 'done' ? { completed_at: null } : {}) },
          { transaction: t },
        );
        await (TicketActivity as any).create(
          {
            ticket_id: row.ticket_id,
            actor_type: ACTOR_TYPE,
            actor_id: ACTOR_ID,
            action: 'status_changed',
            from_value: fromTicketStatus,
            to_value: row.previous_ticket_status,
            comment: `Reverted by resolveStaleStrategicInitiatives --revert (undo log: ${undoLogPath}). Status restored to '${row.previous_ticket_status}'.`,
          },
          { transaction: t },
        );

        reverted++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'resolve_stale_initiatives.batch_reverted',
        service: 'resolve-stale-initiatives',
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
    const { sequelize } = await import('../config/database');
    await sequelize.authenticate();
    if (opts.mode === 'plan') await runPlan(opts.outDir, opts.sessionId);
    else if (opts.mode === 'apply') await runApply(opts.undoLogPath!, opts.batchSize);
    else await runRevert(opts.undoLogPath!, opts.batchSize);
    process.exit(0);
  })().catch((err: any) => {
    console.error(
      JSON.stringify({
        event: 'resolve_stale_initiatives.failed',
        service: 'resolve-stale-initiatives',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
