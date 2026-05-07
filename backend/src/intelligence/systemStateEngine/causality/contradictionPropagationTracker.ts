/**
 * contradictionPropagationTracker — Phase 16. Temporal+spatial
 * clustering of contradiction flags so the platform can answer:
 *   - Where did this contradiction originate?
 *   - Which capabilities/clusters are it co-occurring with?
 *   - Is the same contradiction recurring, or is it new?
 *
 * Pure analytical function over a list of ContradictionFlag rows.
 * No DB writes; the `contradictionDetector` already produced the flags.
 *
 * "Spatial" here = sharing the same `subject_id` (capability id /
 * cluster signature). "Temporal" = within PROPAGATION_TEMPORAL_WINDOW_MS.
 *
 * Per the Phase 16 stress-test: this is honest temporal+spatial
 * clustering, NOT an SIR epidemiology model. The naming reflects that.
 */

import type { ContradictionFlag } from '../types/systemState.types';
import type {
  ContradictionCluster, ContradictionPropagationProfile,
} from './causalityTypes';
import { PROPAGATION_TEMPORAL_WINDOW_MS } from './causalityTypes';

export interface BuildPropagationInput {
  readonly project_id: string;
  readonly contradictions: ReadonlyArray<ContradictionFlag>;
  /** Default = now. Tests can pin this for determinism. */
  readonly now_ms?: number;
}

export function buildContradictionPropagationProfile(input: BuildPropagationInput): ContradictionPropagationProfile {
  const now = input.now_ms ?? Date.now();
  const windowStart = now - PROPAGATION_TEMPORAL_WINDOW_MS;

  // Filter to recent contradictions belonging to the project.
  const recent = input.contradictions.filter(c => {
    if (c.project_id !== input.project_id) return false;
    const ts = readEvidenceTimestamp(c, now);
    return ts >= windowStart;
  });

  // Group by (capability_id || task_id || 'project') for spatial proximity.
  const bySubject = new Map<string, ContradictionFlag[]>();
  for (const c of recent) {
    const subject = c.capability_id || c.task_id || 'project';
    const arr = bySubject.get(subject) || [];
    arr.push(c);
    bySubject.set(subject, arr);
  }

  // Within each subject group, cluster by anchor kind so a single subject
  // can have multiple distinct clusters (e.g., one cluster of "telemetry_drift",
  // another of "frontend_complete_backend_missing").
  const clusters: ContradictionCluster[] = [];
  for (const [subject, list] of bySubject.entries()) {
    const byKind = new Map<string, ContradictionFlag[]>();
    for (const c of list) {
      const arr = byKind.get(c.kind) || [];
      arr.push(c);
      byKind.set(c.kind, arr);
    }
    for (const [kind, members] of byKind.entries()) {
      const ts = members.map(m => readEvidenceTimestamp(m, now));
      const start = Math.min(...ts);
      const end = Math.max(...ts);
      clusters.push({
        cluster_id: `cluster-${subject}-${kind}-${start}`,
        anchor_kind: kind as any,
        project_id: input.project_id,
        window_start: new Date(start).toISOString(),
        window_end: new Date(end).toISOString(),
        members,
        affected_subjects: [subject],
        density: recent.length === 0 ? 0 : Math.round((members.length / recent.length) * 100) / 100,
      });
    }
  }

  // Hotspots: subjects with the highest contradiction count + worst severity.
  const hotspots = Array.from(bySubject.entries()).map(([subject_id, list]) => {
    const worst: 'info' | 'warning' | 'error' = list.some(c => c.severity === 'error') ? 'error'
      : list.some(c => c.severity === 'warning') ? 'warning' : 'info';
    return { subject_id, count: list.length, worst_severity: worst };
  }).sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    project_id: input.project_id,
    clusters: clusters.sort((a, b) => b.members.length - a.members.length),
    total_contradictions_in_window: recent.length,
    hotspots,
    built_at: new Date(now).toISOString(),
  };
}

/** Whether the same anchor_kind+subject_id reappears in successive windows. */
export function isRecurrent(
  current: ContradictionPropagationProfile,
  prior: ContradictionPropagationProfile,
): ReadonlyArray<{ subject_id: string; kind: string }> {
  const recurrent: { subject_id: string; kind: string }[] = [];
  for (const cur of current.clusters) {
    const sub = cur.affected_subjects[0];
    if (!sub) continue;
    const match = prior.clusters.find(p =>
      p.anchor_kind === cur.anchor_kind && p.affected_subjects[0] === sub,
    );
    if (match) recurrent.push({ subject_id: sub, kind: cur.anchor_kind });
  }
  return recurrent;
}

function readEvidenceTimestamp(c: ContradictionFlag, fallbackMs: number): number {
  const t = (c.evidence as any)?.timestamp;
  if (typeof t === 'number') return t;
  if (typeof t === 'string') {
    const parsed = Date.parse(t);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallbackMs;
}

export const _PROPAGATION_TEMPORAL_WINDOW_MS_FOR_TESTS = PROPAGATION_TEMPORAL_WINDOW_MS;
