/**
 * File I/O and report/undo-log construction for the Reese student_support ticket
 * supersession reconciliation (see ../resolveReeseStudentSupportSupersession.ts).
 * Kept separate from the classification logic
 * (intelligence/autonomy/reeseStudentSupportSupersessionRules.ts) and from the
 * DB-apply logic so each file stays well under CLAUDE.md's size ceiling and is
 * independently testable — mirrors corybrainInitiativeTicketResolutionArtifacts.ts's
 * shape exactly (same writeUndoLog/writeReport/readUndoLog signatures, same "write
 * undo log before any DB write" contract).
 */
import fs from 'fs';
import path from 'path';
import type { StudentSupportSupersessionOutcome } from '../../intelligence/autonomy/reeseStudentSupportSupersessionRules';
import type { StudentSupportSupersessionCandidate } from '../../intelligence/autonomy/reeseStudentSupportSupersessionResolver';

export interface UndoRow {
  ticket_id: string;
  entity_id: string | null;
  outcome: StudentSupportSupersessionOutcome;
  superseded_by_ticket_id: string | null;
  /** The ticket's real `status` at --plan time — `--revert` needs this to restore
   * the exact prior value. */
  previous_status: string;
}

export interface UndoLog {
  generated_at: string;
  session_id: string;
  /** Rows that WOULD close (should_close:true at --plan time). --apply re-derives
   * fresh live evidence for each of these rather than replaying this snapshot's
   * evidence text verbatim. */
  rows: UndoRow[];
  /** Full breakdown across EVERY open ticket checked at --plan time (not just the
   * ones that would close) — for the dry-run report's honesty. */
  breakdown: Record<StudentSupportSupersessionOutcome, { checked: number; would_close: number }>;
}

export interface PlanResult {
  undoLog: UndoLog;
  reportMarkdown: string;
}

function emptyBreakdown(): Record<StudentSupportSupersessionOutcome, { checked: number; would_close: number }> {
  return {
    superseded: { checked: 0, would_close: 0 },
    current: { checked: 0, would_close: 0 },
    sole_ticket: { checked: 0, would_close: 0 },
    already_terminal: { checked: 0, would_close: 0 },
  };
}

/**
 * Builds the dry-run report + undo log from a fresh
 * `fetchLiveResolvableStudentSupportTickets()` pass (the caller already ran it) plus
 * each candidate ticket's real current `status` (the candidate shape doesn't itself
 * carry it — the caller supplies it via a direct, separate live lookup).
 */
export function buildPlan(
  results: StudentSupportSupersessionCandidate[],
  statusByTicketId: Map<string, string>,
  sessionId: string,
): PlanResult {
  const breakdown = emptyBreakdown();
  const rows: UndoRow[] = [];
  const byOutcome = new Map<StudentSupportSupersessionOutcome, StudentSupportSupersessionCandidate[]>();

  for (const r of results) {
    breakdown[r.outcome].checked++;
    if (r.should_close) breakdown[r.outcome].would_close++;

    if (!byOutcome.has(r.outcome)) byOutcome.set(r.outcome, []);
    byOutcome.get(r.outcome)!.push(r);

    if (r.should_close) {
      rows.push({
        ticket_id: r.ticket_id,
        entity_id: r.entity_id,
        outcome: r.outcome,
        superseded_by_ticket_id: r.superseded_by_ticket_id,
        previous_status: statusByTicketId.get(r.ticket_id) || 'backlog',
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const totalWouldClose = rows.length;

  const order: StudentSupportSupersessionOutcome[] = ['superseded', 'current', 'sole_ticket', 'already_terminal'];
  const sections: string[] = [];
  for (const outcome of order) {
    const rowsForOutcome = byOutcome.get(outcome) || [];
    if (rowsForOutcome.length === 0) continue;
    sections.push(renderOutcomeSection(outcome, rowsForOutcome));
  }

  const reportMarkdown = [
    '# Dry run — Reese student_support ticket supersession reconciliation',
    '',
    `Generated: ${generatedAt}`,
    `Session: ${sessionId}`,
    `Total open student_support tickets checked: ${results.length}`,
    `Total that WOULD close: ${totalWouldClose}`,
    '',
    '## Breakdown by outcome',
    '',
    '| outcome | checked | would_close | left_untouched | why_untouched |',
    '|---|---|---|---|---|',
    ...order.map((outcome) => {
      const b = breakdown[outcome];
      const untouched = b.checked - b.would_close;
      const why =
        outcome === 'current'
          ? 'this is the newest ticket for its room — the current tracking object, not a stale duplicate'
          : outcome === 'sole_ticket'
            ? 'no other ticket exists for this room — no reliable signal today for whether the underlying issue was resolved'
            : outcome === 'already_terminal'
              ? 'already done/cancelled — should not appear (the query excludes terminal tickets); defense-in-depth only'
              : 'this row already closes (should_close true)';
      return `| ${outcome} | ${b.checked} | ${b.would_close} | ${untouched} | ${why} |`;
    }),
    '',
    'No writes have occurred. This file plus its paired undo-log JSON are the full',
    'evidence trail for review before `--apply` is ever run. `--apply` re-derives fresh',
    'live evidence for every row at apply time rather than replaying this snapshot',
    'verbatim — a ticket whose room gained/lost a sibling between this dry run and',
    '`--apply` is skipped, not blindly closed on stale evidence.',
    '',
    ...sections,
  ].join('\n');

  return {
    undoLog: { generated_at: generatedAt, session_id: sessionId, rows, breakdown },
    reportMarkdown,
  };
}

function renderOutcomeSection(
  outcome: StudentSupportSupersessionOutcome,
  rows: StudentSupportSupersessionCandidate[],
): string {
  const closing = rows.filter((r) => r.should_close);
  const staying = rows.filter((r) => !r.should_close);
  const lines = [
    `## ${outcome} (${rows.length} tickets: ${closing.length} would close, ${staying.length} left open)`,
    '',
    '| ticket_id | entity_id | superseded_by_ticket_id | would_close | evidence |',
    '|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.ticket_id} | ${r.entity_id ?? ''} | ${r.superseded_by_ticket_id ?? ''} | ${r.should_close ? 'YES' : 'no'} | ${r.evidence_note.replace(/\|/g, '\\|').slice(0, 200)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** Writes the undo log to disk. Call this BEFORE any DB write — --plan does, always. */
export function writeUndoLog(undoLog: UndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `reese-student-support-supersession-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

/** Writes the human-readable dry-run report to disk. */
export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `reese-student-support-supersession-dry-run-${timestamp}.md`);
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
