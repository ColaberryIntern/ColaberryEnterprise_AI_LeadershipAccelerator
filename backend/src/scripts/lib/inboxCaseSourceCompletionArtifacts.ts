/**
 * File I/O and report/undo-log construction for the InboxCaseEngine source-completion
 * reconciliation (see ../resolveInboxCaseSourceCompletionBacklog.ts). Kept separate
 * from the classification logic (inboxCaseSourceCompletionRules.ts) and the DB-apply
 * logic (inboxCaseSourceCompletionResolver.ts) so each file stays well under CLAUDE.md's
 * size ceiling and is independently testable — mirrors
 * corybrainInitiativeTicketResolutionArtifacts.ts's shape exactly (same
 * writeUndoLog/writeReport/readUndoLog signatures, same "write undo log before any DB
 * write" contract).
 */
import fs from 'fs';
import path from 'path';
import type { SourceCompletionReport } from '../../intelligence/autonomy/inboxCaseSourceCompletionResolver';

export interface UndoRow {
  case_id: string;
  ticket_id: string | null;
  /** Every item this run would disposition on this case (empty if the case closes
   * purely via the general guard sweep with no Basecamp signal involved). */
  item_ids_disposed: Array<{ item_id: string; disposition: 'RESOLVED' | 'NO_ACTION' }>;
  /** Whether this case is projected to close as a result of this run (either from the
   * item dispositions above, or purely via the general sweep). */
  case_would_close: boolean;
  /** The case's real `state` at --plan time — `--revert` needs this to know it's
   * restoring a genuinely-closed-by-this-run case, not one that was already terminal. */
  case_previous_state: string;
}

export interface UndoLog {
  generated_at: string;
  session_id: string;
  rows: UndoRow[];
  /** Full item-level breakdown across EVERY checked item (not just disposed ones), for
   * the dry-run report's honesty. */
  items_breakdown: SourceCompletionReport['items_breakdown'];
  items_checked: number;
  cases_checked: number;
}

export interface PlanResult {
  undoLog: UndoLog;
  reportMarkdown: string;
}

/**
 * Builds the dry-run report + undo log from a fresh `previewInboxCaseSourceCompletionResolution()`
 * pass (the caller already ran it) plus each would-close case's real previous `state`
 * and ticket id (the preview report doesn't itself carry either — the caller supplies
 * them via a direct, separate live lookup).
 */
export function buildPlan(
  report: SourceCompletionReport,
  previousStateByCaseId: Map<string, string>,
  ticketIdByCaseId: Map<string, string | null>,
  sessionId: string,
): PlanResult {
  const itemsByCaseId = new Map<string, Array<{ item_id: string; disposition: 'RESOLVED' | 'NO_ACTION' }>>();
  for (const item of report.item_results) {
    if (!item.applied || item.disposition === null) continue;
    if (!itemsByCaseId.has(item.case_id)) itemsByCaseId.set(item.case_id, []);
    itemsByCaseId.get(item.case_id)!.push({ item_id: item.item_id, disposition: item.disposition });
  }

  const rows: UndoRow[] = [];
  for (const caseResult of report.case_results) {
    if (!caseResult.closable) continue;
    rows.push({
      case_id: caseResult.case_id,
      ticket_id: ticketIdByCaseId.get(caseResult.case_id) ?? null,
      item_ids_disposed: itemsByCaseId.get(caseResult.case_id) ?? [],
      case_would_close: true,
      case_previous_state: previousStateByCaseId.get(caseResult.case_id) ?? 'UNKNOWN',
    });
  }

  const generatedAt = new Date().toISOString();
  const bySignal = rows.filter((r) => r.item_ids_disposed.length > 0);
  const byGeneralSweepOnly = rows.filter((r) => r.item_ids_disposed.length === 0);

  const reportMarkdown = [
    '# Dry run — InboxCaseEngine source-completion reconciliation',
    '',
    `Generated: ${generatedAt}`,
    `Session: ${sessionId}`,
    `Total non-terminal cases checked: ${report.cases_checked}`,
    `Total undispositioned basecamp_todo items checked: ${report.items_checked}`,
    `Total that WOULD close: ${rows.length} (${bySignal.length} via a new Basecamp-completion signal, ${byGeneralSweepOnly.length} already closeable via the existing guard, never previously invoked)`,
    '',
    '## Item-level breakdown',
    '',
    '| outcome | count | meaning |',
    '|---|---|---|',
    `| completed_at_source | ${report.items_breakdown.completed_at_source} | live Basecamp status is 'completed' — dispositioned RESOLVED |`,
    `| trashed_at_source | ${report.items_breakdown.trashed_at_source} | live Basecamp status is 'trashed' — dispositioned NO_ACTION |`,
    `| still_active | ${report.items_breakdown.still_active} | live Basecamp status is 'active' — genuinely open, left untouched |`,
    `| no_live_signal | ${report.items_breakdown.no_live_signal} | no matching ops_bc_todos row or unrecognized status — left untouched |`,
    '',
    'No writes have occurred. This file plus its paired undo-log JSON are the full',
    'evidence trail for review before `--apply` is ever run. `--apply` re-derives fresh',
    'live evidence for every row at apply time rather than replaying this snapshot',
    'verbatim — a case whose live state has changed again between this dry run and',
    '`--apply` is skipped, not blindly closed on stale evidence.',
    '',
    '## Cases that WOULD close',
    '',
    '| case_id | ticket_id | previous_state | items_disposed | via |',
    '|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.case_id} | ${r.ticket_id ?? ''} | ${r.case_previous_state} | ${r.item_ids_disposed.length} | ${r.item_ids_disposed.length > 0 ? 'Basecamp completion signal' : 'general guard sweep (already closeable)'} |`,
    ),
    '',
  ].join('\n');

  return {
    undoLog: {
      generated_at: generatedAt,
      session_id: sessionId,
      rows,
      items_breakdown: report.items_breakdown,
      items_checked: report.items_checked,
      cases_checked: report.cases_checked,
    },
    reportMarkdown,
  };
}

/** Writes the undo log to disk. Call this BEFORE any DB write — --plan does, always. */
export function writeUndoLog(undoLog: UndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `inboxcase-source-completion-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

/** Writes the human-readable dry-run report to disk. */
export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `inboxcase-source-completion-dry-run-${timestamp}.md`);
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

/** Reads and validates an undo-log file (used by --apply and --revert). */
export function readUndoLog(filePath: string): UndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as UndoLog;
  if (!Array.isArray(parsed.rows)) {
    throw new Error(`Malformed undo log at ${filePath}: missing rows[]`);
  }
  return parsed;
}
