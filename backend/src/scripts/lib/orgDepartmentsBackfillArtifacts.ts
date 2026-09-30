/**
 * File I/O and report/undo-log construction for
 * ../assignOrgDepartments20260819.ts. Mirrors
 * ticketReportsToBackfillArtifacts.ts's shape (dry-run report + undo log,
 * written to disk BEFORE any write) — loop-architect plan-audit cycle 1's
 * finding for this run: a bulk production data change needs a durable,
 * file-based revert record, not console-only output.
 *
 * One structural difference from the ticket backfill: rows here can be
 * either an UPDATE (existing org_members row, `team` changes) or a CREATE
 * (Farhat has no row yet) — `action` distinguishes the two so --revert knows
 * a `created` row was never a real prior state to restore (this repo never
 * hard-deletes real data as a "revert"; see the script's own header comment).
 */
import fs from 'fs';
import path from 'path';

export interface DepartmentUpdateRow {
  action: 'updated';
  org_member_id: string;
  email: string;
  previous_team: string | null;
  new_team: string;
}

export interface DepartmentCreateRow {
  action: 'created';
  org_member_id: string | null; // filled in once --commit actually creates the row
  email: string;
  new_team: string;
}

export type DepartmentUndoRow = DepartmentUpdateRow | DepartmentCreateRow;

export interface DepartmentUnresolvedRow {
  email: string;
  team: string;
  reason: 'no_org_member_row';
}

export interface DepartmentUndoLog {
  generated_at: string;
  session_id: string;
  /** Rows this plan WOULD change (update) or add (create) — what --commit acts on. */
  rows: DepartmentUndoRow[];
  /** Target emails with no existing org_members row (other than the one
   * intentional create) — reported, never silently skipped. */
  unresolved: DepartmentUnresolvedRow[];
}

export interface DepartmentPlanResult {
  undoLog: DepartmentUndoLog;
  reportMarkdown: string;
}

export function buildDepartmentPlanReport(
  rows: DepartmentUndoRow[],
  unresolved: DepartmentUnresolvedRow[],
  sessionId: string,
): DepartmentPlanResult {
  const generatedAt = new Date().toISOString();
  const undoLog: DepartmentUndoLog = { generated_at: generatedAt, session_id: sessionId, rows, unresolved };

  const updates = rows.filter((r): r is DepartmentUpdateRow => r.action === 'updated');
  const creates = rows.filter((r): r is DepartmentCreateRow => r.action === 'created');

  const lines: string[] = [
    "# Dry run — org department assignment + Farhat provisioning",
    '',
    `Generated: ${generatedAt}`,
    `Session: ${sessionId}`,
    '',
    '## Summary',
    '',
    `- Rows that WOULD be updated (team change): ${updates.length}`,
    `- Rows that WOULD be created: ${creates.length}`,
    `- Target emails with no existing org_members row: ${unresolved.length}`,
    '',
    '## Updates',
    '',
    '| Email | Previous team | New team |',
    '|---|---|---|',
    ...updates.map((r) => `| ${r.email} | ${r.previous_team ?? '(none)'} | ${r.new_team} |`),
    '',
    '## Creates',
    '',
    '| Email | New team |',
    '|---|---|',
    ...creates.map((r) => `| ${r.email} | ${r.new_team} |`),
    '',
    '## Unresolved (no existing org_members row — left untouched)',
    '',
    '| Email | Intended team | Reason |',
    '|---|---|---|',
    ...unresolved.map((r) => `| ${r.email} | ${r.team} | ${r.reason} |`),
    '',
  ];

  return { undoLog, reportMarkdown: lines.join('\n') };
}

export function writeUndoLog(undoLog: DepartmentUndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `org-departments-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `org-departments-dry-run-${timestamp}.md`);
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

export function readUndoLog(filePath: string): DepartmentUndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as DepartmentUndoLog;
  if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.unresolved)) {
    throw new Error(`Malformed undo log at ${filePath}: missing rows[] or unresolved[]`);
  }
  return parsed;
}
