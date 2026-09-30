/**
 * File I/O and report/undo-log construction for the bpos_orchestrator capability
 * ticket reconciliation (see ../resolveBposCapabilityTickets.ts). Kept separate from
 * the classification logic
 * (services/company/bposCapabilityTicketResolutionRules.ts) and from the DB-apply
 * logic so each file stays well under CLAUDE.md's size ceiling and is independently
 * testable — mirrors reeseStudentSupportSupersessionArtifacts.ts's shape exactly (same
 * writeUndoLog/writeReport/readUndoLog signatures, same "write undo log before any DB
 * write" contract).
 */
import fs from 'fs';
import path from 'path';
import type { BposCapabilityTicketOutcome } from '../../services/company/bposCapabilityTicketResolutionRules';
import type { BposCapabilityTicketCandidate } from '../../services/company/bposCapabilityTicketAutoResolver';

export interface UndoRow {
  ticket_id: string;
  entity_id: string | null;
  capability_name: string | null;
  outcome: BposCapabilityTicketOutcome;
  /** This ticket type has TWO possible close targets ('done' or 'cancelled'), unlike
   * a single-target resolver — --apply/--revert must read and use this, never
   * hardcode 'done'. */
  close_to_status: 'done' | 'cancelled';
  /** The ticket's real `status` at --plan time — `--revert` needs this to restore the
   * exact prior value. */
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
  breakdown: Record<BposCapabilityTicketOutcome, { checked: number; would_close: number }>;
}

export interface PlanResult {
  undoLog: UndoLog;
  reportMarkdown: string;
}

function emptyBreakdown(): Record<BposCapabilityTicketOutcome, { checked: number; would_close: number }> {
  return {
    capability_verified: { checked: 0, would_close: 0 },
    capability_deleted: { checked: 0, would_close: 0 },
    no_signal: { checked: 0, would_close: 0 },
    already_terminal: { checked: 0, would_close: 0 },
  };
}

/**
 * Builds the dry-run report + undo log from a fresh
 * `fetchLiveResolvableBposCapabilityTickets()` pass (the caller already ran it) plus
 * each candidate ticket's real current `status` (the candidate shape doesn't itself
 * carry it — the caller supplies it via a direct, separate live lookup).
 */
export function buildPlan(
  results: BposCapabilityTicketCandidate[],
  statusByTicketId: Map<string, string>,
  sessionId: string,
): PlanResult {
  const breakdown = emptyBreakdown();
  const rows: UndoRow[] = [];
  const byOutcome = new Map<BposCapabilityTicketOutcome, BposCapabilityTicketCandidate[]>();

  for (const r of results) {
    breakdown[r.outcome].checked++;
    if (r.should_close) breakdown[r.outcome].would_close++;

    if (!byOutcome.has(r.outcome)) byOutcome.set(r.outcome, []);
    byOutcome.get(r.outcome)!.push(r);

    if (r.should_close && r.close_to_status) {
      rows.push({
        ticket_id: r.ticket_id,
        entity_id: r.entity_id,
        capability_name: r.capability_name,
        outcome: r.outcome,
        close_to_status: r.close_to_status,
        previous_status: statusByTicketId.get(r.ticket_id) || 'in_progress',
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const totalWouldClose = rows.length;

  const order: BposCapabilityTicketOutcome[] = ['capability_verified', 'capability_deleted', 'no_signal', 'already_terminal'];
  const sections: string[] = [];
  for (const outcome of order) {
    const rowsForOutcome = byOutcome.get(outcome) || [];
    if (rowsForOutcome.length === 0) continue;
    sections.push(renderOutcomeSection(outcome, rowsForOutcome));
  }

  const reportMarkdown = [
    '# Dry run — bpos_orchestrator capability ticket reconciliation',
    '',
    `Generated: ${generatedAt}`,
    `Session: ${sessionId}`,
    `Total open bpos_execution tickets checked: ${results.length}`,
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
        outcome === 'no_signal'
          ? "capability's user_status is not 'verified' (still in_progress/archived/unknown) — no reliable signal today"
          : outcome === 'already_terminal'
            ? 'already done/cancelled — should not appear (the query excludes terminal tickets); defense-in-depth only'
            : 'this row already closes (should_close true)';
      return `| ${outcome} | ${b.checked} | ${b.would_close} | ${untouched} | ${why} |`;
    }),
    '',
    'No writes have occurred. This file plus its paired undo-log JSON are the full',
    'evidence trail for review before `--apply` is ever run. `--apply` re-derives fresh',
    'live evidence for every row at apply time rather than replaying this snapshot',
    'verbatim — a ticket whose capability changed status between this dry run and',
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
  outcome: BposCapabilityTicketOutcome,
  rows: BposCapabilityTicketCandidate[],
): string {
  const closing = rows.filter((r) => r.should_close);
  const staying = rows.filter((r) => !r.should_close);
  const lines = [
    `## ${outcome} (${rows.length} tickets: ${closing.length} would close, ${staying.length} left open)`,
    '',
    '| ticket_id | entity_id | capability_name | close_to_status | would_close | evidence |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.ticket_id} | ${r.entity_id ?? ''} | ${r.capability_name ?? ''} | ${r.close_to_status ?? ''} | ${r.should_close ? 'YES' : 'no'} | ${r.evidence_note.replace(/\|/g, '\\|').slice(0, 200)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** Writes the undo log to disk. Call this BEFORE any DB write — --plan does, always. */
export function writeUndoLog(undoLog: UndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `bpos-capability-ticket-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

/** Writes the human-readable dry-run report to disk. */
export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `bpos-capability-ticket-dry-run-${timestamp}.md`);
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
