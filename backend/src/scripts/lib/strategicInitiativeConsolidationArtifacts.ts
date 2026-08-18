/**
 * File I/O and report/undo-log construction for the strategic_initiatives historical
 * duplicate-explosion consolidation (see
 * ../consolidateDuplicateStrategicInitiatives.ts). Mirrors
 * openclawDuplicateTicketArtifacts.ts's shape (dry-run report + undo log, written to
 * disk BEFORE any write) with one structural difference: the survivor of each group
 * is never mutated by --apply, so it is recorded only in `groups[key]` metadata, not
 * as a `rows[]` entry — only the rows that actually get cancelled appear in `rows[]`.
 */
import fs from 'fs';
import path from 'path';
import {
  InitiativeLike,
  duplicateGroups,
  pickSurvivor,
  buildConsolidationNote,
} from './strategicInitiativeDedupGroups';

export interface GroupUndoInfo {
  survivor_id: string;
  /** Full cluster size, i.e. rows[] count for this group PLUS the survivor (1). */
  group_count: number;
  earliest_seen_at: string;
  latest_seen_at: string;
}

export interface ConsolidationUndoRow {
  initiative_id: string;
  group_key: string;
  previous_status: string;
  previous_description: string | null;
}

export interface ConsolidationUndoLog {
  generated_at: string;
  session_id: string;
  groups: Record<string, GroupUndoInfo>;
  /** Non-survivor rows only — the ones --apply will cancel. Survivors never appear here. */
  rows: ConsolidationUndoRow[];
}

export interface ConsolidationPlanResult {
  undoLog: ConsolidationUndoLog;
  reportMarkdown: string;
}

/**
 * Groups `candidates` (expected: live status='proposed' rows) into duplicate
 * clusters, picks each cluster's survivor (most recent — left untouched), and builds
 * the undo log + human-readable dry-run report for every OTHER (older) row in each
 * cluster. Singles (candidates not in any duplicate group) never appear in the
 * output — they are out of scope for this cleanup by design.
 */
export function buildPlan(candidates: InitiativeLike[], sessionId: string): ConsolidationPlanResult {
  const groups = duplicateGroups(candidates);

  const groupsOut: ConsolidationUndoLog['groups'] = {};
  const rows: ConsolidationUndoRow[] = [];
  const reportSections: string[] = [];

  for (const [key, members] of groups) {
    const sorted = [...members].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const survivor = pickSurvivor(sorted);
    const nonSurvivors = sorted.filter((m) => m.id !== survivor.id);

    groupsOut[key] = {
      survivor_id: survivor.id,
      group_count: sorted.length,
      earliest_seen_at: new Date(sorted[0].created_at).toISOString(),
      latest_seen_at: new Date(survivor.created_at).toISOString(),
    };

    for (const row of nonSurvivors) {
      rows.push({
        initiative_id: row.id,
        group_key: key,
        previous_status: row.status,
        previous_description: row.description,
      });
    }

    reportSections.push(renderGroupSection(key, sorted, survivor.id));
  }

  const generatedAt = new Date().toISOString();
  const reportMarkdown = [
    '# Consolidation dry run — strategic_initiatives duplicate-explosion cleanup',
    '',
    `Generated: ${generatedAt}`,
    `Session: ${sessionId}`,
    `Total rows that WOULD be marked cancelled: ${rows.length}`,
    `Duplicate groups: ${groups.size}`,
    '',
    'No writes have occurred. Survivors (most recent row per group) are NOT modified.',
    'Ticket rows are never read or written by this script. This file plus its paired',
    'undo-log JSON are the full evidence trail for review before `--apply` runs.',
    '',
    ...reportSections,
  ].join('\n');

  return {
    undoLog: { generated_at: generatedAt, session_id: sessionId, groups: groupsOut, rows },
    reportMarkdown,
  };
}

function renderGroupSection(key: string, sorted: InitiativeLike[], survivorId: string): string {
  const lines = [
    `## Group: "${key}"`,
    '',
    `${sorted.length} rows. Survivor (untouched, stays \`proposed\`): **${survivorId}**. ` +
      `Every other row -> \`status='cancelled'\` + a consolidation note appended to \`description\`.`,
    '',
    '| initiative_id | created_at | previous_status | role |',
    '|---|---|---|---|',
  ];
  for (const row of sorted) {
    const role = row.id === survivorId ? '**SURVIVOR**' : 'cancelled';
    lines.push(`| ${row.id} | ${new Date(row.created_at).toISOString()} | ${row.status} | ${role} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Builds the exact note text that will be appended to a cancelled row's description. */
export function noteForRow(undoLog: ConsolidationUndoLog, row: ConsolidationUndoRow, consolidatedAt: string): string {
  const group = undoLog.groups[row.group_key];
  return buildConsolidationNote({
    survivorId: group.survivor_id,
    survivorCreatedAt: group.latest_seen_at,
    consolidatedAt,
    sessionId: undoLog.session_id,
  });
}

/** Writes the undo log to disk. Call this BEFORE any DB write — --plan does, always. */
export function writeUndoLog(undoLog: ConsolidationUndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `consolidation-undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

/** Writes the human-readable dry-run report to disk. */
export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `consolidation-dry-run-${timestamp}.md`);
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

/** Reads and validates an undo-log file (used by --apply and --revert). */
export function readUndoLog(filePath: string): ConsolidationUndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as ConsolidationUndoLog;
  if (!Array.isArray(parsed.rows) || !parsed.groups) {
    throw new Error(`Malformed undo log at ${filePath}: missing rows[] or groups{}`);
  }
  return parsed;
}
