/**
 * One-off historical cleanup: collapse the verified duplicate-explosion clusters in
 * `strategic_initiatives` (350 `proposed` rows in production as of 2026-08-15; 282 of
 * them are older re-observations of the same underlying condition under a different
 * embedded number — see backend/src/scripts/lib/strategicInitiativeDedupGroups.ts and
 * .loop-architect/runs/20260815-214613-strategic-initiative-dedup-consolidation/ for
 * the full breakdown) down to one survivor (the most recent row) per group, with
 * every older row marked `status='cancelled'` and a consolidation note appended to
 * its `description`. The survivor is never modified. **No `tickets` row is ever read
 * or written by this file — it imports neither `Ticket` nor `TicketActivity`.**
 *
 * Background: `createStrategicInitiative()`'s dedup was an exact-title match, so a
 * title carrying a volatile embedded number (a duration, a percentage, an alert
 * count) never deduped against its own earlier occurrence, and a fresh row was
 * created on every sweep where the underlying condition was still true. That dedup
 * is fixed going forward in backend/src/services/cory/coryInitiatives.ts's
 * normalizeInitiativeDedupTitle(), imported by this file's grouping dependency
 * (strategicInitiativeDedupGroups.ts) so the historical cleanup can never drift from
 * the runtime dedup key it is cleaning up after. This script only ever fixes the
 * PAST rows that dedup fix cannot retroactively touch.
 *
 * Three modes, mirroring the proven shape of
 * backend/src/scripts/archiveDuplicateOpenclawLearningTickets.ts (PR #1483/#1484):
 *
 *   node consolidateDuplicateStrategicInitiatives.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Scans live `status='proposed'` rows, groups them,
 *     writes a dry-run report (.md) AND an undo log (.json, one entry per row that
 *     WOULD be cancelled, survivor rows recorded only in group metadata) to
 *     --out-dir (default: cwd). Makes zero writes.
 *
 *   node consolidateDuplicateStrategicInitiatives.js --apply --undo-log <path> [--batch-size 200]
 *     Loads the undo log, re-derives live duplicate groups fresh, ABORTS with no
 *     writes if either the live non-survivor id set OR any group's live survivor id
 *     has drifted from the undo log's. Otherwise cancels each row in batches, one
 *     sequelize.transaction() per batch. Idempotent: a row already `status='cancelled'`
 *     is skipped, so re-running --apply with the same undo-log file never
 *     double-writes or double-appends the note.
 *
 *   node consolidateDuplicateStrategicInitiatives.js --revert --undo-log <path> [--batch-size 200]
 *     The tested rollback path. Restores each row's `status` to `'proposed'` AND its
 *     `description` to the undo log's stored `previous_description` verbatim (a full
 *     revert, not just a status flip — the appended note must not linger). Idempotent.
 *     Never deletes any row.
 *
 * Deliberately bypasses no ticket-service gate because it never touches a ticket at
 * all — `StrategicInitiative.status` is an unconstrained `STRING(20)` with no state
 * machine (confirmed against backend/src/models/StrategicInitiative.ts and this
 * repo's own PR #1491/#1492 finding), so a direct `.update()` is safe, matching the
 * ticket-archive script's own direct-`.update()` precedent for historical migrations.
 */
import { Op } from 'sequelize';
import StrategicInitiative from '../models/StrategicInitiative';
import { sequelize } from '../config/database';
import { logAiEvent } from '../services/aiEventService';
import { InitiativeLike, duplicateGroups, pickSurvivor } from './lib/strategicInitiativeDedupGroups';
import {
  buildPlan,
  writeUndoLog,
  writeReport,
  readUndoLog,
  noteForRow,
  ConsolidationUndoLog,
} from './lib/strategicInitiativeConsolidationArtifacts';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_SESSION_ID = 'unspecified-session';

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

function toInitiativeLike(row: InstanceType<typeof StrategicInitiative>): InitiativeLike {
  const plain: any = row.toJSON();
  return {
    id: plain.id,
    title: plain.title,
    description: plain.description ?? null,
    status: plain.status,
    created_at: plain.created_at,
  };
}

/** Live `status='proposed'` rows, ordered by created_at — the full candidate pool for a NEW plan. */
async function fetchLiveProposedCandidates(): Promise<InitiativeLike[]> {
  const rows = await StrategicInitiative.findAll({
    where: { status: 'proposed' },
    order: [['created_at', 'ASC']],
  });
  return rows.map(toInitiativeLike);
}

/**
 * Live `status IN ('proposed', 'cancelled')` rows — the candidate pool used ONLY for
 * --apply's drift check, deliberately broader than fetchLiveProposedCandidates().
 * `cancelled` is included on purpose: this script is the only writer of that status
 * on this table (confirmed live — zero `cancelled` rows existed before this script's
 * first run), so a `cancelled` row here means "already processed by a prior --apply
 * of this exact undo log," not an unrelated rejection. Scoping the drift check by
 * status='proposed' ALONE (an earlier version of this file did) breaks idempotency:
 * once --apply cancels a group's non-survivor rows, a second --apply run would no
 * longer see them among 'proposed' candidates, duplicateGroups() would find no
 * group left (the lone still-'proposed' survivor doesn't group with anything), and
 * checkDrift() would wrongly report all those rows as "no longer match a live
 * duplicate group" and abort — turning a legitimate no-op re-run into a hard error.
 * Including 'cancelled' rows keeps every already-applied group's full membership
 * (survivor + its now-cancelled duplicates) visible to duplicateGroups()/
 * pickSurvivor(), which only look at title/created_at and are status-agnostic, so a
 * second run against fully-applied data reconstructs an IDENTICAL non-survivor id
 * set and survivor mapping to the undo log — zero drift, exactly the "second --apply
 * makes zero further writes" contract this script is supposed to honor. A row that
 * moved to any OTHER status (e.g. a human `approved` it via the API between --plan
 * and --apply) is correctly excluded here and therefore correctly still trips a real
 * drift abort, which is the safety behavior we want.
 */
async function fetchLiveDriftCheckCandidates(): Promise<InitiativeLike[]> {
  const rows = await StrategicInitiative.findAll({
    where: { status: { [Op.in]: ['proposed', 'cancelled'] } },
    order: [['created_at', 'ASC']],
  });
  return rows.map(toInitiativeLike);
}

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalCandidates: number;
  totalRowsToCancel: number;
  groupCount: number;
}

/** --plan (default). Read-only. Writes the dry-run report + undo log to disk. */
export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const candidates = await fetchLiveProposedCandidates();
  const { undoLog, reportMarkdown } = buildPlan(candidates, sessionId);

  const ts = Date.now();
  const undoLogPath = writeUndoLog(undoLog, outDir, ts);
  const reportPath = writeReport(reportMarkdown, outDir, ts);

  console.log(
    JSON.stringify({
      event: 'consolidate_strategic_initiatives.planned',
      service: 'consolidate-strategic-initiatives',
      total_candidates: candidates.length,
      total_rows_to_cancel: undoLog.rows.length,
      group_count: Object.keys(undoLog.groups).length,
      reportPath,
      undoLogPath,
    }),
  );

  return {
    reportPath,
    undoLogPath,
    totalCandidates: candidates.length,
    totalRowsToCancel: undoLog.rows.length,
    groupCount: Object.keys(undoLog.groups).length,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Aborts (no writes) if live reality has drifted from the undo log: either the
 * non-survivor id set differs, or any group's freshly-recomputed survivor differs
 * from the undo log's recorded survivor (a newer row could have landed in a group
 * between --plan and --apply, which would change who the correct survivor is).
 */
function checkDrift(undoLog: ConsolidationUndoLog, liveCandidates: InitiativeLike[]): void {
  const liveGroups = duplicateGroups(liveCandidates);

  const liveNonSurvivorIds = new Set<string>();
  const liveSurvivorByGroup: Record<string, string> = {};
  for (const [key, members] of liveGroups) {
    const survivor = pickSurvivor(members);
    liveSurvivorByGroup[key] = survivor.id;
    for (const m of members) {
      if (m.id !== survivor.id) liveNonSurvivorIds.add(m.id);
    }
  }

  const undoRowIds = new Set(undoLog.rows.map((r) => r.initiative_id));
  const missingFromLive = [...undoRowIds].filter((id) => !liveNonSurvivorIds.has(id));
  const extraInLive = [...liveNonSurvivorIds].filter((id) => !undoRowIds.has(id));
  const survivorMismatches = Object.entries(undoLog.groups).filter(
    ([key, info]) => liveSurvivorByGroup[key] !== undefined && liveSurvivorByGroup[key] !== info.survivor_id,
  );

  if (missingFromLive.length > 0 || extraInLive.length > 0 || survivorMismatches.length > 0) {
    throw new Error(
      `Drift detected between undo log and live strategic_initiatives — aborting before any write. ` +
        `${missingFromLive.length} row(s) in the undo log no longer match a live duplicate group, ` +
        `${extraInLive.length} new row(s) exist live that the undo log doesn't cover, ` +
        `${survivorMismatches.length} group(s) have a different live survivor than planned. ` +
        `Re-run --plan and review the new dry-run report before applying.`,
    );
  }
}

export interface ApplyRunResult {
  processed: number;
  cancelled: number;
  skippedAlreadyCancelled: number;
  batches: number;
}

/** --apply --undo-log <path>. Batched, transaction-per-batch, idempotent, ticket-free. */
export async function runApply(undoLogPath: string, batchSize: number): Promise<ApplyRunResult> {
  const undoLog = readUndoLog(undoLogPath);
  const liveCandidates = await fetchLiveDriftCheckCandidates();
  checkDrift(undoLog, liveCandidates);

  const consolidatedAt = new Date().toISOString().slice(0, 10);
  const batches = chunk(undoLog.rows, batchSize);
  let cancelled = 0;
  let skippedAlreadyCancelled = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await sequelize.transaction(async (t) => {
      for (const row of batch) {
        const initiative = await StrategicInitiative.findByPk(row.initiative_id, { transaction: t });
        if (!initiative) throw new Error(`Initiative ${row.initiative_id} not found mid-apply — aborting batch ${i + 1}`);
        if (initiative.status === 'cancelled') {
          skippedAlreadyCancelled++;
          continue;
        }

        const note = noteForRow(undoLog, row, consolidatedAt);
        const newDescription = (initiative.description || '') + note;
        await initiative.update({ status: 'cancelled', description: newDescription }, { transaction: t });
        cancelled++;

        await logAiEvent('CoryBrain', 'INITIATIVE_CONSOLIDATED', 'strategic_initiatives', row.initiative_id, {
          group_key: row.group_key,
          survivor_id: undoLog.groups[row.group_key]?.survivor_id,
        }).catch(() => {});
      }
    });

    console.log(
      JSON.stringify({
        event: 'consolidate_strategic_initiatives.batch_applied',
        service: 'consolidate-strategic-initiatives',
        batch_index: i + 1,
        batch_count: batches.length,
        rows_in_batch: batch.length,
        cancelled_so_far: cancelled,
        skipped_so_far: skippedAlreadyCancelled,
      }),
    );
  }

  return { processed: undoLog.rows.length, cancelled, skippedAlreadyCancelled, batches: batches.length };
}

export interface RevertRunResult {
  processed: number;
  reverted: number;
  skippedAlreadyAtPreviousState: number;
  batches: number;
}

/** --revert --undo-log <path>. Restores status AND description verbatim. */
export async function runRevert(undoLogPath: string, batchSize: number): Promise<RevertRunResult> {
  const undoLog = readUndoLog(undoLogPath);
  const batches = chunk(undoLog.rows, batchSize);
  let reverted = 0;
  let skipped = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await sequelize.transaction(async (t) => {
      for (const row of batch) {
        const initiative = await StrategicInitiative.findByPk(row.initiative_id, { transaction: t });
        if (!initiative) throw new Error(`Initiative ${row.initiative_id} not found mid-revert — aborting batch ${i + 1}`);

        const alreadyReverted =
          initiative.status === row.previous_status && initiative.description === row.previous_description;
        if (alreadyReverted) {
          skipped++;
          continue;
        }

        await initiative.update(
          { status: row.previous_status as any, description: row.previous_description as any },
          { transaction: t },
        );
        reverted++;
      }
    });

    console.log(
      JSON.stringify({
        event: 'consolidate_strategic_initiatives.batch_reverted',
        service: 'consolidate-strategic-initiatives',
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
        event: 'consolidate_strategic_initiatives.failed',
        service: 'consolidate-strategic-initiatives',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
