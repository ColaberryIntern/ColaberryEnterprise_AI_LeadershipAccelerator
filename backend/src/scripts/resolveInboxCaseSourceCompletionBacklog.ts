/**
 * One-off historical bulk-clear for InboxCaseEngine's stuck ticket backlog (see this
 * run's execution-contract.md for the full DISCOVER trail — 627 tickets stuck
 * `in_progress`/`in_review`, verified live, none linked to an already-`RESOLVED` case,
 * i.e. NOT a sync gap; a genuine missing-mechanism situation).
 *
 * Classification and I/O are delegated entirely to
 * `intelligence/autonomy/inboxCaseSourceCompletionResolver.ts`'s
 * `previewInboxCaseSourceCompletionResolution()` (read-only) /
 * `classifyOpenBasecampTodoItems()`, `applyItemDispositions()`, `closeEligibleCases()`
 * (the real write functions, re-used here rather than re-implemented). Undo-log/report
 * construction is delegated to `lib/inboxCaseSourceCompletionArtifacts.ts`. This file
 * is the I/O orchestration layer + CLI only.
 *
 * Modeled directly on `resolveCoryBrainInitiativeStaleTickets.ts`'s three-mode CLI
 * shape and its same "live re-derivation at --apply time, not stale --plan-time text"
 * choice: a case could legitimately change between --plan and --apply (e.g. a new item
 * lands on it via the hourly discovery cron), so --apply re-classifies strictly within
 * the undo log's own reviewed item/case id set against CURRENT live data before
 * writing, treats "this row no longer qualifies" as a normal, individually-reported
 * skip (not a whole-batch abort), and never writes anything outside that reviewed set.
 *
 * Three modes:
 *
 *   node resolveInboxCaseSourceCompletionBacklog.js [--plan] [--out-dir <dir>] [--session-id <id>]
 *     Default mode. Read-only. Runs the real preview, writes a dry-run report (.md)
 *     AND an undo log (.json) to --out-dir (default: cwd). Makes zero writes.
 *
 *   node resolveInboxCaseSourceCompletionBacklog.js --apply --undo-log <path> [--batch-size 200]
 *     Loads the undo log, re-derives LIVE classification for every item it covers and
 *     applies only the ones still eligible, then re-checks the real closure guard for
 *     every case in the undo log's reviewed set and closes the ones that genuinely
 *     pass. Never touches an item/case outside that reviewed set. Batched for progress
 *     reporting.
 *
 *   node resolveInboxCaseSourceCompletionBacklog.js --revert --undo-log <path>
 *     The tested rollback path. For each undo-log row: nulls out exactly the item
 *     dispositions this run set (only if they still hold the value this run wrote —
 *     never stomps a disposition something else changed since), and reopens the case
 *     via the real, state-machine-legal `reopenCase()` if it is currently `RESOLVED`.
 */
import {
  buildPlan,
  writeUndoLog,
  writeReport,
  readUndoLog,
  UndoLog,
} from './lib/inboxCaseSourceCompletionArtifacts';

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

export interface PlanRunResult {
  reportPath: string;
  undoLogPath: string;
  totalChecked: number;
  totalWouldClose: number;
}

/** --plan (default). Read-only. Writes the dry-run report + undo log to disk. */
export async function runPlan(outDir: string, sessionId: string): Promise<PlanRunResult> {
  const { previewInboxCaseSourceCompletionResolution } = await import(
    '../intelligence/autonomy/inboxCaseSourceCompletionResolver'
  );
  const { getCaseTicketId } = await import('../services/inboxCase/caseTicketService');
  const { default: InboxCase } = await import('../models/InboxCase');

  const report = await previewInboxCaseSourceCompletionResolution();

  const wouldCloseCaseIds = report.case_results.filter((r) => r.closable).map((r) => r.case_id);
  const previousStateByCaseId = new Map<string, string>();
  const ticketIdByCaseId = new Map<string, string | null>();
  for (const caseId of wouldCloseCaseIds) {
    const caseRow = await (InboxCase as any).findByPk(caseId, { attributes: ['id', 'state'] });
    previousStateByCaseId.set(caseId, caseRow?.state ?? 'UNKNOWN');
    ticketIdByCaseId.set(caseId, await getCaseTicketId(caseId));
  }

  const { undoLog, reportMarkdown } = buildPlan(report, previousStateByCaseId, ticketIdByCaseId, sessionId);

  const ts = Date.now();
  const undoLogPath = writeUndoLog(undoLog, outDir, ts);
  const reportPath = writeReport(reportMarkdown, outDir, ts);

  console.log(
    JSON.stringify({
      event: 'resolve_inboxcase_source_completion.planned',
      service: 'resolve-inboxcase-source-completion',
      total_checked: report.cases_checked,
      total_would_close: undoLog.rows.length,
      items_breakdown: report.items_breakdown,
      reportPath,
      undoLogPath,
    }),
  );

  return { reportPath, undoLogPath, totalChecked: report.cases_checked, totalWouldClose: undoLog.rows.length };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ApplyRunResult {
  itemsReviewed: number;
  itemsDisposed: number;
  casesReviewed: number;
  casesClosed: number;
  casesSkippedNotClosable: number;
  batches: number;
}

/**
 * --apply --undo-log <path>. Re-derives fresh live classification for every item the
 * undo log covers (never touches an item outside that reviewed set — a new item that
 * appeared after --plan is correctly left for the next --plan or the recurring cron),
 * applies dispositions, then batches the reviewed case set through the real closure
 * guard and closes whichever ones genuinely pass right now.
 */
export async function runApply(undoLogPath: string, batchSize: number): Promise<ApplyRunResult> {
  const { classifyOpenBasecampTodoItems, applyItemDispositions, closeEligibleCases } = await import(
    '../intelligence/autonomy/inboxCaseSourceCompletionResolver'
  );

  const undoLog = readUndoLog(undoLogPath);
  const reviewedItemIds = new Set(undoLog.rows.flatMap((r) => r.item_ids_disposed.map((i) => i.item_id)));
  const reviewedCaseIds = Array.from(new Set(undoLog.rows.map((r) => r.case_id)));

  const liveAll = await classifyOpenBasecampTodoItems();
  const liveScoped = liveAll.filter((c) => reviewedItemIds.has(c.item_id));
  const itemResults = await applyItemDispositions(liveScoped);
  const itemsDisposed = itemResults.filter((r) => r.applied).length;

  const batches = chunk(reviewedCaseIds, batchSize);
  let casesClosed = 0;
  let casesSkippedNotClosable = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const closeResults = await closeEligibleCases(batch);
    for (const r of closeResults) {
      if (r.closed) casesClosed++;
      else casesSkippedNotClosable++;
    }
    console.log(
      JSON.stringify({
        event: 'resolve_inboxcase_source_completion.batch_applied',
        service: 'resolve-inboxcase-source-completion',
        batch_index: i + 1,
        batch_count: batches.length,
        rows_in_batch: batch.length,
        cases_closed_so_far: casesClosed,
        cases_skipped_so_far: casesSkippedNotClosable,
      }),
    );
  }

  return {
    itemsReviewed: reviewedItemIds.size,
    itemsDisposed,
    casesReviewed: reviewedCaseIds.length,
    casesClosed,
    casesSkippedNotClosable,
    batches: batches.length,
  };
}

export interface RevertRunResult {
  itemsReverted: number;
  itemsSkippedAlreadyChanged: number;
  casesReopened: number;
  casesSkippedNotResolved: number;
}

/** --revert --undo-log <path>. The tested rollback path. */
export async function runRevert(undoLogPath: string): Promise<RevertRunResult> {
  const { default: InboxCase } = await import('../models/InboxCase');
  const { default: InboxCaseItem } = await import('../models/InboxCaseItem');
  const { reopenCase } = await import('../services/inboxCase/caseRepository');

  const undoLog: UndoLog = readUndoLog(undoLogPath);
  let itemsReverted = 0;
  let itemsSkippedAlreadyChanged = 0;
  let casesReopened = 0;
  let casesSkippedNotResolved = 0;

  for (const row of undoLog.rows) {
    for (const itemRow of row.item_ids_disposed) {
      const item = await (InboxCaseItem as any).findByPk(itemRow.item_id);
      if (!item) {
        itemsSkippedAlreadyChanged++;
        continue;
      }
      if (item.disposition === itemRow.disposition) {
        await item.update({ disposition: null, disposition_reason: null, updated_at: new Date() });
        itemsReverted++;
      } else {
        // Something else changed this item's disposition since this run set it — never
        // stomp unrelated work on revert.
        itemsSkippedAlreadyChanged++;
      }
    }

    try {
      const caseRow = await (InboxCase as any).findByPk(row.case_id);
      if (!caseRow || caseRow.state !== 'RESOLVED') {
        casesSkippedNotResolved++;
        continue;
      }
      await reopenCase(row.case_id, {
        actor_type: 'system',
        actor_id: 'InboxCaseSourceCompletionResolver',
        event_type: 'case_reverted_by_source_completion_backlog_script',
        reason: `Reverted by resolveInboxCaseSourceCompletionBacklog --revert (undo log: ${undoLogPath})`,
      });
      casesReopened++;
    } catch (err: any) {
      console.error(
        `[resolveInboxCaseSourceCompletionBacklog] Failed to reopen case ${row.case_id} during revert: ${err?.message || err}`,
      );
      casesSkippedNotResolved++;
    }
  }

  console.log(
    JSON.stringify({
      event: 'resolve_inboxcase_source_completion.reverted',
      service: 'resolve-inboxcase-source-completion',
      items_reverted: itemsReverted,
      items_skipped_already_changed: itemsSkippedAlreadyChanged,
      cases_reopened: casesReopened,
      cases_skipped_not_resolved: casesSkippedNotResolved,
    }),
  );

  return { itemsReverted, itemsSkippedAlreadyChanged, casesReopened, casesSkippedNotResolved };
}

/* istanbul ignore next — CLI entry point, exercised operationally not in unit tests */
if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  (async () => {
    const { sequelize } = await import('../config/database');
    await sequelize.authenticate();
    if (opts.mode === 'plan') await runPlan(opts.outDir, opts.sessionId);
    else if (opts.mode === 'apply') await runApply(opts.undoLogPath!, opts.batchSize);
    else await runRevert(opts.undoLogPath!);
    process.exit(0);
  })().catch((err: any) => {
    console.error(
      JSON.stringify({
        event: 'resolve_inboxcase_source_completion.failed',
        service: 'resolve-inboxcase-source-completion',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
