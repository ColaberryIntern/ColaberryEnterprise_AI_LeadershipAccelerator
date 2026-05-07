/**
 * governanceTaskShaper — Phase 12 governance-driven rank adjustments.
 * Pure synchronous function (DB lookup is best-effort + cached) that
 * applies type-specific rank biases derived from pending high-priority
 * GovernanceRecommendation rows.
 *
 * The function MUST stay synchronous and fail-soft because it's called
 * from the engine state build loop. It reads from a small in-memory
 * recommendation cache populated by the recommendation persistence
 * flow on creation.
 *
 * Shaping policy:
 *   - 'pause_orchestration' pending → flatten all rank deltas (everyone
 *     equal-priority while the operator decides).
 *   - 'escalate_remediation' pending → bump matched cluster's UI tasks
 *     by another -5.
 *   - 'accelerate_cluster' pending → bump matched cluster's UI tasks
 *     by another -8.
 *   - 'request_operator_review' pending high-priority → no rank shift,
 *     but adds a `governance_block: true` flag (consumers may decide
 *     to display a warning).
 *
 * Phase 12 §C.
 */

import type { AuthoritativeTask } from '../types/systemState.types';

interface CachedRecommendation {
  type: string;
  priority: number;
  cluster_signature?: string | null;
  cached_at: number;
}

const CACHE_TTL_MS = 60_000;
const cachedByProject = new Map<string, CachedRecommendation[]>();

export function noteRecommendationCreated(project_id: string, rec: { type: string; priority: number; supporting_evidence?: any }): void {
  const list = cachedByProject.get(project_id) || [];
  const cluster_signature = (rec.supporting_evidence as any)?.cluster_signature || null;
  list.push({ type: rec.type, priority: rec.priority, cluster_signature, cached_at: Date.now() });
  cachedByProject.set(project_id, list);
}

export function noteRecommendationDecided(project_id: string, decision: { type: string; cluster_signature?: string | null }): void {
  const list = cachedByProject.get(project_id);
  if (!list) return;
  const filtered = list.filter(r => !(r.type === decision.type && r.cluster_signature === (decision.cluster_signature ?? null)));
  cachedByProject.set(project_id, filtered);
}

/** Test-only: clear the cache. */
export function _resetGovernanceShaperCache(): void {
  cachedByProject.clear();
}

export function governanceTaskShaper(tasks: ReadonlyArray<AuthoritativeTask>, projectId: string): ReadonlyArray<AuthoritativeTask> {
  const list = cachedByProject.get(projectId) || [];
  const fresh = list.filter(r => Date.now() - r.cached_at < CACHE_TTL_MS);
  cachedByProject.set(projectId, fresh);
  if (fresh.length === 0) return tasks;
  const types = new Set(fresh.map(r => r.type));
  if (types.has('pause_orchestration')) {
    // Flatten — equalize rank deltas across the queue
    const avg = tasks.reduce((s, t) => s + ((t as any).calculated_rank || 0), 0) / Math.max(1, tasks.length);
    return Object.freeze(tasks.map(t => ({ ...t, calculated_rank: Math.round(avg) } as AuthoritativeTask)));
  }
  const escalateClusters = new Set(
    fresh.filter(r => r.type === 'escalate_remediation' || r.type === 'accelerate_cluster')
      .map(r => r.cluster_signature)
      .filter((s): s is string => !!s),
  );
  if (escalateClusters.size === 0) return tasks;
  return Object.freeze(tasks.map(task => {
    const sig = (task as any).cluster_signature || (task as any).bp_cluster_signature;
    if (!sig || !escalateClusters.has(sig)) return task;
    const accelerate = fresh.find(r => r.type === 'accelerate_cluster' && r.cluster_signature === sig);
    const bump = accelerate ? -8 : -5;
    const current = (task as any).calculated_rank;
    if (current == null) return task;
    return { ...task, calculated_rank: current + bump } as AuthoritativeTask;
  }));
}
