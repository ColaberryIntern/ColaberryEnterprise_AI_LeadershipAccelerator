/**
 * File I/O and report/undo-log construction for the ticket due-date validation
 * gap's one-time backfill (see ../backfillTicketDueDates20260928.ts). Mirrors
 * ticketReportsToBackfillArtifacts.ts's shape exactly (dry-run report + undo
 * log, written to disk BEFORE any write) — simpler in one respect: every
 * ticket has a real `priority` (the column's own `defaultValue: 'medium'`),
 * so `computeDefaultTicketDueDate()` never fails to produce a value — there is
 * no "unresolved" concept here, unlike the reports_to backfill.
 */
import fs from 'fs';
import path from 'path';

export interface BackfillUndoRow {
  ticket_id: string;
  priority: string;
  /** Always null going in — this backfill only ever targets rows the live
   * query already filtered to `due_date IS NULL`. */
  previous_due_date: null;
  new_due_date: string;
}

export interface BackfillUndoLog {
  generated_at: string;
  session_id: string;
  rows: BackfillUndoRow[];
}

export interface BackfillPlanResult {
  undoLog: BackfillUndoLog;
  reportMarkdown: string;
}

export function buildPlanReport(rows: BackfillUndoRow[], sessionId: string): BackfillPlanResult {
  const generatedAt = new Date().toISOString();
  const undoLog: BackfillUndoLog = { generated_at: generatedAt, session_id: sessionId, rows };

  const byPriority: Record<string, number> = {};
  for (const r of rows) byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;

  const lines: string[] = [
    '# Backfill dry run — currently-open tickets\' due_date',
    '',
    `Generated: ${generatedAt}`,
    `Session: ${sessionId}`,
    '',
    '## Summary',
    '',
    `- Tickets that WOULD be backfilled: ${rows.length}`,
    ...Object.entries(byPriority).map(([p, c]) => `  - ${p}: ${c}`),
    '',
    '## Tickets that would be backfilled',
    '',
    '| Ticket | Priority | New due_date |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.ticket_id} | ${r.priority} | ${r.new_due_date} |`),
    '',
  ];

  return { undoLog, reportMarkdown: lines.join('\n') };
}

export function writeUndoLog(undoLog: BackfillUndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `ticket-due-date-backfill-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `ticket-due-date-backfill-dry-run-${timestamp}.md`);
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

export function readUndoLog(filePath: string): BackfillUndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as BackfillUndoLog;
  if (!Array.isArray(parsed.rows)) {
    throw new Error(`Malformed undo log at ${filePath}: missing rows[]`);
  }
  return parsed;
}
