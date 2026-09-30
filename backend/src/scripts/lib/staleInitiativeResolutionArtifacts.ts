/**
 * Undo-log / dry-run report construction and file I/O for the stale
 * `strategic_initiatives` resolution (see ../resolveStaleStrategicInitiatives.ts).
 * Mirrors `strategicInitiativeConsolidationArtifacts.ts`'s shape (dry-run report +
 * undo log, written to disk BEFORE any write) with one structural extension that
 * precedent didn't need: this undo log records BOTH tables' previous state
 * (`strategic_initiatives` AND the linked `tickets` row), since this run's `--apply`
 * writes both.
 *
 * This module does NOT classify rows — that is `staleInitiativeResolutionRules.ts`'s
 * job (pure, no I/O). This module takes already-classified rows (the caller already
 * ran `classifyInitiative()` against live `ai_agents` data) and turns them into the
 * undo-log/report artifacts. One responsibility per module (CLAUDE.md's Modular
 * Composition Rule).
 */
import fs from 'fs';
import path from 'path';
import { ClassificationResult, ResolutionOutcome, isUntouchedOutcome } from './staleInitiativeResolutionRules';

export interface ResolvableRow {
  initiative_id: string;
  title: string;
  description: string | null;
  ticket_id: string | null;
  ticket_status: string | null;
  classification: ClassificationResult;
}

export interface StaleInitiativeUndoRow {
  initiative_id: string;
  ticket_id: string;
  outcome: ResolutionOutcome;
  agent_name: string | null;
  previous_initiative_status: string;
  previous_initiative_description: string | null;
  previous_ticket_status: string;
  target_initiative_status: 'completed' | 'cancelled';
  target_ticket_status: 'done' | 'cancelled';
  evidence_note: string;
}

export interface SkippedRowRecord {
  initiative_id: string;
  title: string;
  outcome: ResolutionOutcome;
  reason: string;
}

export interface StaleInitiativeUndoLog {
  generated_at: string;
  session_id: string;
  /** Rows --apply WILL write. Every row here has a non-null ticket_id. */
  rows: StaleInitiativeUndoRow[];
  /** Rows deliberately left untouched, recorded for transparency/audit only — --apply never reads this array. */
  skipped: SkippedRowRecord[];
}

export interface PlanBuildResult {
  undoLog: StaleInitiativeUndoLog;
  reportMarkdown: string;
}

const RESOLVABLE_INITIATIVE_STATUS: Record<Exclude<ResolutionOutcome, 'still_unhealthy' | 'explicitly_excluded' | 'ambiguous_skipped'>, 'completed' | 'cancelled'> = {
  healthy_completed: 'completed',
  retired_completed: 'completed',
  dept_alert_cancelled: 'cancelled',
};

const RESOLVABLE_TICKET_STATUS: Record<Exclude<ResolutionOutcome, 'still_unhealthy' | 'explicitly_excluded' | 'ambiguous_skipped'>, 'done' | 'cancelled'> = {
  healthy_completed: 'done',
  retired_completed: 'done',
  dept_alert_cancelled: 'cancelled',
};

/**
 * Builds the undo log + human-readable dry-run report from already-classified rows.
 * Rows whose classification is an untouched outcome (`still_unhealthy`,
 * `explicitly_excluded`, `ambiguous_skipped`) never appear in `rows[]` — only in the
 * report and `skipped[]`, for transparency. A row classified as resolvable but with
 * no `ticket_id` is defensively downgraded to skipped (never partial-written) — this
 * should never happen against real data (every one of the 68 real rows has a linked
 * ticket, confirmed live in DISCOVER), but the code does not assume it.
 */
export function buildPlan(rows: ResolvableRow[], sessionId: string): PlanBuildResult {
  const undoRows: StaleInitiativeUndoRow[] = [];
  const skipped: SkippedRowRecord[] = [];

  for (const row of rows) {
    const { classification } = row;
    if (isUntouchedOutcome(classification.outcome)) {
      skipped.push({
        initiative_id: row.initiative_id,
        title: row.title,
        outcome: classification.outcome,
        reason: classification.evidence_note,
      });
      continue;
    }

    if (!row.ticket_id || !row.ticket_status) {
      skipped.push({
        initiative_id: row.initiative_id,
        title: row.title,
        outcome: classification.outcome,
        reason:
          `Classified as resolvable (${classification.outcome}) but has no linked ticket_id/ticket_status — ` +
          `skipping defensively rather than writing the initiative without its ticket.`,
      });
      continue;
    }

    const resolvableOutcome = classification.outcome as keyof typeof RESOLVABLE_INITIATIVE_STATUS;
    undoRows.push({
      initiative_id: row.initiative_id,
      ticket_id: row.ticket_id,
      outcome: classification.outcome,
      agent_name: classification.agent_name,
      previous_initiative_status: 'proposed',
      previous_initiative_description: row.description,
      previous_ticket_status: row.ticket_status,
      target_initiative_status: RESOLVABLE_INITIATIVE_STATUS[resolvableOutcome],
      target_ticket_status: RESOLVABLE_TICKET_STATUS[resolvableOutcome],
      evidence_note: classification.evidence_note,
    });
  }

  const generatedAt = new Date().toISOString();
  const undoLog: StaleInitiativeUndoLog = { generated_at: generatedAt, session_id: sessionId, rows: undoRows, skipped };
  const reportMarkdown = renderReport(undoLog, rows.length);

  return { undoLog, reportMarkdown };
}

function countByOutcome<T extends { outcome: ResolutionOutcome }>(items: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.outcome] = (counts[item.outcome] || 0) + 1;
  return counts;
}

function renderReport(undoLog: StaleInitiativeUndoLog, totalCandidates: number): string {
  const resolvedCounts = countByOutcome(undoLog.rows);
  const skippedCounts = countByOutcome(undoLog.skipped);

  const lines: string[] = [
    '# Dry run — stale strategic_initiatives resolution',
    '',
    `Generated: ${undoLog.generated_at}`,
    `Session: ${undoLog.session_id}`,
    `Total candidate rows examined: ${totalCandidates}`,
    `Rows that WOULD be resolved: ${undoLog.rows.length}`,
    `Rows left untouched: ${undoLog.skipped.length}`,
    '',
    'No writes have occurred. This file plus its paired undo-log JSON are the full',
    'evidence trail for review before `--apply` runs.',
    '',
    '## Resolved (would write both strategic_initiatives and tickets)',
    '',
    `| Outcome | Count |`,
    `|---|---|`,
    ...Object.entries(resolvedCounts).map(([outcome, count]) => `| ${outcome} | ${count} |`),
    '',
    '| initiative_id | agent_name | outcome | initiative: proposed -> | ticket: prev -> new |',
    '|---|---|---|---|---|',
    ...undoLog.rows.map(
      (r) =>
        `| ${r.initiative_id} | ${r.agent_name ?? '(n/a)'} | ${r.outcome} | ${r.target_initiative_status} | ${r.previous_ticket_status} -> ${r.target_ticket_status} |`,
    ),
    '',
    '## Left untouched (transparency only — never written by --apply)',
    '',
    `| Outcome | Count |`,
    `|---|---|`,
    ...Object.entries(skippedCounts).map(([outcome, count]) => `| ${outcome} | ${count} |`),
    '',
    '| initiative_id | title | outcome | reason |',
    '|---|---|---|---|',
    ...undoLog.skipped.map((s) => `| ${s.initiative_id} | ${s.title} | ${s.outcome} | ${s.reason.replace(/\|/g, '\\|')} |`),
    '',
  ];

  return lines.join('\n');
}

/** Writes the undo log to disk. Call this BEFORE any DB write — --plan does, always. */
export function writeUndoLog(undoLog: StaleInitiativeUndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `stale-initiative-resolution-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

/** Writes the human-readable dry-run report to disk. */
export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `stale-initiative-resolution-dry-run-${timestamp}.md`);
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

/**
 * Builds the text appended to the initiative's `description` — append-only, matching
 * `strategicInitiativeConsolidationArtifacts.ts`'s `noteForRow()` convention exactly
 * (that precedent also computes its date stamp at --apply time, not --plan time; this
 * mirrors that rather than baking a plan-time date into the undo log).
 */
export function buildInitiativeDescriptionUpdate(row: StaleInitiativeUndoRow, resolvedAtDate: string): string {
  const note = `\n\n[AUTO-RESOLVED ${resolvedAtDate}] ${row.evidence_note}`;
  return (row.previous_initiative_description || '') + note;
}

/**
 * Builds the ticket comment text passed to `ticketOrchestrator.ts`'s
 * `updateTicketStatus()`. Deliberately distinct from
 * `buildInitiativeDescriptionUpdate()` above: a `TicketActivity.comment` is a single
 * fresh field on its own audit row (not a running log to append to, unlike
 * `description`), so this never prepends prior content.
 */
export function buildTicketComment(row: StaleInitiativeUndoRow, resolvedAtDate: string): string {
  return `[AUTO-RESOLVED ${resolvedAtDate}] ${row.evidence_note}`;
}

/** Reads and validates an undo-log file (used by --apply and --revert). */
export function readUndoLog(filePath: string): StaleInitiativeUndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as StaleInitiativeUndoLog;
  if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.skipped)) {
    throw new Error(`Malformed undo log at ${filePath}: missing rows[] or skipped[]`);
  }
  return parsed;
}
