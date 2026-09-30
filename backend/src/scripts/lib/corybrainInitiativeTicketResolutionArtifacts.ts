/**
 * File I/O and report/undo-log construction for the CoryBrain initiative-ticket
 * reconciliation (see ../resolveCoryBrainInitiativeStaleTickets.ts). Kept separate from
 * the classification logic (corybrainInitiativeTicketResolutionRules.ts) and from the
 * DB-apply logic so each file stays well under CLAUDE.md's size ceiling and is
 * independently testable — mirrors coryEngineTicketResolutionArtifacts.ts's shape
 * exactly (same writeUndoLog/writeReport/readUndoLog signatures, same "write undo log
 * before any DB write" contract).
 */
import fs from 'fs';
import path from 'path';
import type { CoryBrainTicketResolutionOutcome } from '../../intelligence/autonomy/corybrainInitiativeTicketResolutionRules';
import type { CoryBrainInitiativeTicketRecheckResult } from '../../intelligence/autonomy/corybrainInitiativeTicketAutoResolver';

export interface UndoRow {
  ticket_id: string;
  ticket_number: number | null;
  is_subtask: boolean;
  linked_initiative_id: string | null;
  linked_initiative_status: string | null;
  outcome: CoryBrainTicketResolutionOutcome;
  target_status: 'done' | 'cancelled';
  previous_status: string;
}

export interface UndoLog {
  generated_at: string;
  session_id: string;
  /** Rows that WOULD close (should_close:true at --plan time). --apply re-derives fresh
   * live evidence for each of these rather than replaying this snapshot's evidence text
   * verbatim — see resolveCoryBrainInitiativeStaleTickets.ts's header for why. */
  rows: UndoRow[];
  /** Full breakdown across EVERY open ticket checked at --plan time (not just the ones
   * that would close) — for the dry-run report's honesty. */
  breakdown: Record<CoryBrainTicketResolutionOutcome, { checked: number; would_close: number }>;
}

export interface PlanResult {
  undoLog: UndoLog;
  reportMarkdown: string;
}

function emptyBreakdown(): Record<CoryBrainTicketResolutionOutcome, { checked: number; would_close: number }> {
  return {
    initiative_cancelled: { checked: 0, would_close: 0 },
    initiative_completed: { checked: 0, would_close: 0 },
    initiative_still_active: { checked: 0, would_close: 0 },
    initiative_not_found: { checked: 0, would_close: 0 },
  };
}

/**
 * Builds the dry-run report + undo log from a fresh classification pass (the caller
 * already called fetchLiveResolvableCoryBrainInitiativeTickets()). Grouped by outcome
 * per this run's explicit requirement ("report what it WOULD close and why, per
 * category"). Requires each ticket's `previous_status` to be supplied by the caller
 * (CoryBrainInitiativeTicketRecheckResult does not itself carry the ticket's live
 * `status` value, only that it's open — the CLI's own live Ticket query supplies it).
 */
export function buildPlan(
  results: CoryBrainInitiativeTicketRecheckResult[],
  statusByTicketId: Map<string, string>,
  sessionId: string,
): PlanResult {
  const breakdown = emptyBreakdown();
  const rows: UndoRow[] = [];
  const byOutcome = new Map<CoryBrainTicketResolutionOutcome, CoryBrainInitiativeTicketRecheckResult[]>();

  for (const r of results) {
    breakdown[r.outcome].checked++;
    if (r.should_close) breakdown[r.outcome].would_close++;

    if (!byOutcome.has(r.outcome)) byOutcome.set(r.outcome, []);
    byOutcome.get(r.outcome)!.push(r);

    if (r.should_close && r.target_status) {
      rows.push({
        ticket_id: r.ticket_id,
        ticket_number: r.ticket_number,
        is_subtask: r.is_subtask,
        linked_initiative_id: r.linked_initiative_id,
        linked_initiative_status: r.linked_initiative_status,
        outcome: r.outcome,
        target_status: r.target_status,
        previous_status: statusByTicketId.get(r.ticket_id) || 'backlog',
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const totalWouldClose = rows.length;

  const sections: string[] = [];
  const order: CoryBrainTicketResolutionOutcome[] = [
    'initiative_cancelled',
    'initiative_completed',
    'initiative_still_active',
    'initiative_not_found',
  ];
  for (const outcome of order) {
    const rowsForOutcome = byOutcome.get(outcome) || [];
    if (rowsForOutcome.length === 0) continue;
    sections.push(renderOutcomeSection(outcome, rowsForOutcome));
  }

  const reportMarkdown = [
    '# Dry run — CoryBrain initiative-ticket reconciliation',
    '',
    `Generated: ${generatedAt}`,
    `Session: ${sessionId}`,
    `Total open CoryBrain tickets checked: ${results.length}`,
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
        outcome === 'initiative_still_active'
          ? 'linked strategic_initiatives row is still proposed/approved/in_progress — real, legitimately unstarted or in-progress work'
          : outcome === 'initiative_not_found'
            ? 'no matching strategic_initiatives row found — unclassifiable, no reliable check available'
            : 'this row already closes (should_close true)';
      return `| ${outcome} | ${b.checked} | ${b.would_close} | ${untouched} | ${why} |`;
    }),
    '',
    'No writes have occurred. This file plus its paired undo-log JSON are the full',
    'evidence trail for review before `--apply` is ever run. `--apply` re-derives fresh',
    'live evidence for every row at apply time rather than replaying this snapshot',
    'verbatim — a ticket whose linked initiative has changed again between this dry run',
    'and `--apply` is skipped, not blindly closed on stale evidence.',
    '',
    ...sections,
  ].join('\n');

  return {
    undoLog: { generated_at: generatedAt, session_id: sessionId, rows, breakdown },
    reportMarkdown,
  };
}

function renderOutcomeSection(outcome: CoryBrainTicketResolutionOutcome, rows: CoryBrainInitiativeTicketRecheckResult[]): string {
  const closing = rows.filter((r) => r.should_close);
  const staying = rows.filter((r) => !r.should_close);
  const lines = [
    `## ${outcome} (${rows.length} tickets: ${closing.length} would close, ${staying.length} left open)`,
    '',
    '| ticket_id | ticket_number | is_subtask | linked_initiative_id | would_close | evidence |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.ticket_id} | ${r.ticket_number ?? ''} | ${r.is_subtask} | ${r.linked_initiative_id ?? ''} | ${r.should_close ? 'YES' : 'no'} | ${r.evidence_note.replace(/\|/g, '\\|').slice(0, 200)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** Writes the undo log to disk. Call this BEFORE any DB write — --plan does, always. */
export function writeUndoLog(undoLog: UndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `corybrain-initiative-ticket-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

/** Writes the human-readable dry-run report to disk. */
export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `corybrain-initiative-ticket-dry-run-${timestamp}.md`);
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
