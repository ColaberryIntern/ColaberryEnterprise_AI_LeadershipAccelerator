/**
 * File I/O and report/undo-log construction for the Agent Ticket Standard's
 * currently-open-ticket assignee backfill (see
 * ../backfillTicketReportsToAssignee.ts). Mirrors
 * strategicInitiativeConsolidationArtifacts.ts's shape (dry-run report + undo log,
 * written to disk BEFORE any write) — one structural difference: each ticket is
 * resolved independently (no duplicate-grouping problem), so the undo log only
 * needs to record the PRIOR assignee, never a group/survivor concept.
 */
import fs from 'fs';
import path from 'path';

export interface BackfillUndoRow {
  ticket_id: string;
  created_by_type: string;
  created_by_id: string;
  previous_assigned_to_type: string | null;
  previous_assigned_to_id: string | null;
  new_assigned_to_type: 'org_member';
  new_assigned_to_id: string;
}

export interface BackfillUnresolvedRow {
  ticket_id: string;
  created_by_type: string;
  created_by_id: string;
  reason: 'unregistered' | 'no_reports_to';
}

export interface BackfillUndoLog {
  generated_at: string;
  session_id: string;
  /** Tickets this plan WOULD reassign — what --apply acts on. */
  rows: BackfillUndoRow[];
  /** Tickets that could not be resolved (stray/unmapped creators) — reported,
   * never touched. Kept in the same undo log so --apply's own report and any
   * later audit can see the full picture in one file. */
  unresolved: BackfillUnresolvedRow[];
}

export interface BackfillPlanResult {
  undoLog: BackfillUndoLog;
  reportMarkdown: string;
}

export function buildPlanReport(
  rows: BackfillUndoRow[],
  unresolved: BackfillUnresolvedRow[],
  sessionId: string,
): BackfillPlanResult {
  const generatedAt = new Date().toISOString();
  const undoLog: BackfillUndoLog = { generated_at: generatedAt, session_id: sessionId, rows, unresolved };

  const lines: string[] = [
    '# Backfill dry run — currently-open tickets\' reports_to assignee',
    '',
    `Generated: ${generatedAt}`,
    `Session: ${sessionId}`,
    '',
    `## Summary`,
    '',
    `- Tickets that WOULD be reassigned: ${rows.length}`,
    `- Tickets left untouched (creator does not resolve to a real reports_to human): ${unresolved.length}`,
    '',
    '## Tickets that would be reassigned',
    '',
    '| Ticket | Creator | New assignee (org_member id) |',
    '|---|---|---|',
    ...rows.map(
      (r) => `| ${r.ticket_id} | ${r.created_by_type}:${r.created_by_id} | ${r.new_assigned_to_id} |`,
    ),
    '',
    '## Unresolved (left untouched — creator not mapped to a real human)',
    '',
    '| Ticket | Creator | Reason |',
    '|---|---|---|',
    ...unresolved.map((r) => `| ${r.ticket_id} | ${r.created_by_type}:${r.created_by_id} | ${r.reason} |`),
    '',
  ];

  return { undoLog, reportMarkdown: lines.join('\n') };
}

export function writeUndoLog(undoLog: BackfillUndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `ticket-reports-to-backfill-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `ticket-reports-to-backfill-dry-run-${timestamp}.md`);
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

export function readUndoLog(filePath: string): BackfillUndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as BackfillUndoLog;
  if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.unresolved)) {
    throw new Error(`Malformed undo log at ${filePath}: missing rows[] or unresolved[]`);
  }
  return parsed;
}
