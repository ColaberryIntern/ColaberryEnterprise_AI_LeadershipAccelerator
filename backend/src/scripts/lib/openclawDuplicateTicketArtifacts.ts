/**
 * File I/O and report/undo-log construction for the OpenclawLearningOptimizationAgent
 * duplicate-ticket archive (see ../archiveDuplicateOpenclawLearningTickets.ts). Kept
 * separate from cluster-detection logic (openclawDuplicateTicketClusters.ts) and from
 * the DB-apply logic so each file stays well under CLAUDE.md's size ceiling and is
 * independently testable.
 */
import fs from 'fs';
import path from 'path';
import {
  TicketLike,
  ClusterName,
  clusterOf,
  pickRepresentative,
  buildRepresentativeComment,
  buildDuplicatePointerComment,
} from './openclawDuplicateTicketClusters';

export interface ClusterUndoInfo {
  representative_id: string;
  duplicate_count: number;
  earliest_seen_at: string;
  latest_seen_at: string;
  representative_comment: string;
  duplicate_pointer_comment: string;
}

export interface UndoLogRow {
  ticket_id: string;
  cluster: ClusterName;
  previous_status: string;
  is_representative: boolean;
}

export interface UndoLog {
  generated_at: string;
  clusters: Partial<Record<ClusterName, ClusterUndoInfo>>;
  rows: UndoLogRow[];
}

export interface PlanResult {
  undoLog: UndoLog;
  reportMarkdown: string;
}

/**
 * Groups candidates by cluster, picks each cluster's representative (most recent),
 * and builds the exact comment text that will later be persisted verbatim by
 * --apply — so what a reviewer reads in the dry-run report is byte-identical to what
 * ends up in production.
 */
export function buildPlan(candidates: TicketLike[]): PlanResult {
  const byCluster = new Map<ClusterName, TicketLike[]>();
  for (const t of candidates) {
    const c = clusterOf(t);
    if (!c) continue; // belt-and-suspenders: fetchLiveCandidates() already filters this
    if (!byCluster.has(c)) byCluster.set(c, []);
    byCluster.get(c)!.push(t);
  }

  const clusters: UndoLog['clusters'] = {};
  const rows: UndoLogRow[] = [];
  const reportSections: string[] = [];

  for (const [clusterName, clusterRows] of byCluster) {
    const sorted = [...clusterRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const representative = pickRepresentative(sorted)!;
    const earliestSeenAt = sorted[0].created_at;
    const latestSeenAt = representative.created_at;

    const representativeComment = buildRepresentativeComment({
      clusterName,
      duplicateCount: sorted.length,
      earliestSeenAt,
      latestSeenAt,
    });
    const duplicatePointerComment = buildDuplicatePointerComment(representative.id);

    clusters[clusterName] = {
      representative_id: representative.id,
      duplicate_count: sorted.length,
      earliest_seen_at: new Date(earliestSeenAt).toISOString(),
      latest_seen_at: new Date(latestSeenAt).toISOString(),
      representative_comment: representativeComment,
      duplicate_pointer_comment: duplicatePointerComment,
    };

    for (const t of sorted) {
      rows.push({
        ticket_id: t.id,
        cluster: clusterName,
        previous_status: t.status,
        is_representative: t.id === representative.id,
      });
    }

    reportSections.push(renderClusterSection(clusterName, sorted, representative.id));
  }

  const generatedAt = new Date().toISOString();
  const reportMarkdown = [
    '# Bulk-close dry run — OpenclawLearningOptimizationAgent duplicate tickets',
    '',
    `Generated: ${generatedAt}`,
    `Total tickets that WOULD be closed: ${rows.length}`,
    `Clusters: ${byCluster.size}`,
    '',
    'No writes have occurred. This file plus its paired undo-log JSON are the full',
    'evidence trail for review before `--apply` is ever run.',
    '',
    ...reportSections,
  ].join('\n');

  return { undoLog: { generated_at: generatedAt, clusters, rows }, reportMarkdown };
}

function renderClusterSection(clusterName: ClusterName, rows: TicketLike[], representativeId: string): string {
  const lines = [
    `## Cluster: ${clusterName}`,
    '',
    `${rows.length} tickets. Representative: **${representativeId}** (-> \`status='done'\` + full resolution comment). Every other row -> \`status='done'\` + a short pointer comment referencing the representative.`,
    '',
    '| ticket_id | created_at | previous_status | role |',
    '|---|---|---|---|',
  ];
  for (const t of rows) {
    const role = t.id === representativeId ? '**REPRESENTATIVE**' : 'duplicate';
    lines.push(`| ${t.id} | ${new Date(t.created_at).toISOString()} | ${t.status} | ${role} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Writes the undo log to disk. Call this BEFORE any DB write — --plan does, always. */
export function writeUndoLog(undoLog: UndoLog, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `undo-log-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(undoLog, null, 2), 'utf8');
  return filePath;
}

/** Writes the human-readable dry-run report to disk. */
export function writeReport(markdown: string, outDir: string, timestamp: number = Date.now()): string {
  const filePath = path.join(outDir, `bulk-close-dry-run-${timestamp}.md`);
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

/** Reads and validates an undo-log file (used by --apply and --revert). */
export function readUndoLog(filePath: string): UndoLog {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as UndoLog;
  if (!Array.isArray(parsed.rows) || !parsed.clusters) {
    throw new Error(`Malformed undo log at ${filePath}: missing rows[] or clusters{}`);
  }
  return parsed;
}
