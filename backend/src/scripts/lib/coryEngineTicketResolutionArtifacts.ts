/**
 * File I/O and report/undo-log construction for the cory-engine historical ticket
 * bulk-clear (see ../resolveCoryEngineStaleTickets.ts). Kept separate from the
 * classification logic (coryEngineTicketResolutionRules.ts) and from the DB-apply
 * logic so each file stays well under CLAUDE.md's size ceiling and is independently
 * testable — mirrors openclawDuplicateTicketArtifacts.ts's shape (same
 * writeUndoLog/writeReport/readUndoLog signatures, same "write undo log before any DB
 * write" contract).
 */
import fs from 'fs';
import path from 'path';
import type { CoryEngineConditionType } from '../../intelligence/autonomy/coryEngineTicketResolutionRules';
import type { CoryEngineTicketRecheckResult } from '../../intelligence/autonomy/coryEngineTicketAutoResolver';

export interface UndoRow {
  ticket_id: string;
  ticket_number: number | null;
  condition_type: CoryEngineConditionType;
  previous_status: string;
}

export interface UndoLog {
  generated_at: string;
  session_id: string;
  /** Rows that WOULD close (should_close:true at --plan time). --apply re-derives
   * fresh live evidence for each of these rather than replaying this snapshot's
   * evidence text verbatim — see resolveCoryEngineStaleTickets.ts's header for why. */
  rows: UndoRow[];
  /** Full breakdown across EVERY open ticket checked at --plan time (not just the
   * ones that would close) — for the dry-run report's honesty (shows what was left
   * untouched and why, per condition-type). */
  breakdown: Record<CoryEngineConditionType, { checked: number; would_close: number }>;
}

export interface PlanResult {
  undoLog: UndoLog;
  reportMarkdown: string;
}

function emptyBreakdown(): Record<CoryEngineConditionType, { checked: number; would_close: number }> {
  return {
    agent_failure: { checked: 0, would_close: 0 },
    conversion_drop: { checked: 0, would_close: 0 },
    error_spike: { checked: 0, would_close: 0 },
    unclassified: { checked: 0, would_close: 0 },
  };
}

/**
 * Builds the dry-run report + undo log from a fresh classification pass (the caller
 * already called fetchLiveResolvableCoryEngineTickets()). Grouped by condition-type
 * per this run's explicit requirement ("report what it WOULD close and why, per
 * ticket, grouped by condition-type"). Requires a ticket's `previous_status` to be
 * supplied by the caller alongside each classification result (T003's
 * CoryEngineTicketRecheckResult does not itself carry the ticket's live `status`
 * value, only that it's open — the CLI's own live Ticket query supplies it).
 */
export function buildPlan(
  results: CoryEngineTicketRecheckResult[],
  statusByTicketId: Map<string, string>,
  sessionId: string,
): PlanResult {
  const breakdown = emptyBreakdown();
  const rows: UndoRow[] = [];
  const byCondition = new Map<CoryEngineConditionType, CoryEngineTicketRecheckResult[]>();

  for (const r of results) {
    breakdown[r.condition_type].checked++;
    if (r.should_close) breakdown[r.condition_type].would_close++;

    if (!byCondition.has(r.condition_type)) byCondition.set(r.condition_type, []);
    byCondition.get(r.condition_type)!.push(r);

    if (r.should_close) {
      rows.push({
        ticket_id: r.ticket_id,
        ticket_number: r.ticket_number,
        condition_type: r.condition_type,
        previous_status: statusByTicketId.get(r.ticket_id) || 'todo',
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const totalWouldClose = rows.length;

  const sections: string[] = [];
  const order: CoryEngineConditionType[] = ['agent_failure', 'conversion_drop', 'error_spike', 'unclassified'];
  for (const conditionType of order) {
    const rowsForType = byCondition.get(conditionType) || [];
    if (rowsForType.length === 0) continue;
    sections.push(renderConditionSection(conditionType, rowsForType));
  }

  const reportMarkdown = [
    '# Dry run — cory-engine ticket auto-resolve',
    '',
    `Generated: ${generatedAt}`,
    `Session: ${sessionId}`,
    `Total open tickets checked: ${results.length}`,
    `Total that WOULD close: ${totalWouldClose}`,
    '',
    '## Breakdown by condition-type',
    '',
    '| condition_type | checked | would_close | left_untouched | why_untouched |',
    '|---|---|---|---|---|',
    ...order.map((ct) => {
      const b = breakdown[ct];
      const untouched = b.checked - b.would_close;
      const why =
        ct === 'error_spike'
          ? 'detectErrorSpikes() SQL references a column that does not exist in production — no reliable live re-check available, never auto-closed by design'
          : ct === 'unclassified'
            ? 'description matches no recognized condition-type template'
            : 'condition still true on live re-check';
      return `| ${ct} | ${b.checked} | ${b.would_close} | ${untouched} | ${why} |`;
    }),
    '',
    'No writes have occurred. This file plus its paired undo-log JSON are the full',
    'evidence trail for review before `--apply` is ever run. `--apply` re-derives fresh',
    'live evidence for every row at apply time rather than replaying this snapshot',
    'verbatim — a ticket whose condition has changed again between this dry run and',
    '`--apply` is skipped, not blindly closed on stale evidence.',
    '',
    ...sections,
  ].join('\n');

  return {
    undoLog: { generated_at: generatedAt, session_id: sessionId, rows, breakdown },
    reportMarkdown,
  };
}

function renderConditionSection(conditionType: CoryEngineConditionType, rows: CoryEngineTicketRecheckResult[]): string {
  const closing = rows.filter((r) => r.should_close);
  const staying = rows.filter((r) => !r.should_close);
  const lines = [
    `## ${conditionType} (${rows.length} tickets: ${closing.length} would close, ${staying.length} left open)`,
    '',
    '| ticket_id | ticket_number | outcome | would_close | evidence |',
    '|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.ticket_id} | ${r.ticket_number ?? ''} | ${r.outcome} | ${r.should_close ? 'YES' : 'no'} | ${r.evidence_note.replace(/\|/g, '\\|').slice(0, 200)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** Writes the undo log to disk. Call this BEFORE any DB write — --plan does, always. */
export function writeUndoLog(undoLog: UndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `cory-engine-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

/** Writes the human-readable dry-run report to disk. */
export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `cory-engine-dry-run-${timestamp}.md`);
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

/** Reads and validates an undo-log file (used by --apply and --revert). */
export function readUndoLog(filePath: string): UndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as UndoLog;
  if (!Array.isArray(parsed.rows) || !parsed.breakdown) {
    throw new Error(`Malformed undo log at ${filePath}: missing rows[] or breakdown{}`);
  }
  return parsed;
}
