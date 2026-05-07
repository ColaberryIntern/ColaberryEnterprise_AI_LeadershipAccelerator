/**
 * remediationPriorityWeighting — Phase 10.5 wrapper that boosts UI-related
 * task priority based on the project's current remediation pressure.
 *
 * Kept as a wrapper (not edits to priorityRanker.ts) so the existing 314
 * tests + the priority-ranker contract stay stable. Callers that want
 * the boost (the queue surface in coryOrchestrator) opt in by piping
 * rankTasks() output through this function.
 *
 * Boost formula:
 *   pressure < 25 (calm)        → no change
 *   pressure 25-50 (elevated)   → -3 rank (small boost)
 *   pressure 50-75 (urgent)     → -8 rank (notable boost)
 *   pressure >= 75 (critical)   → -15 rank (large boost)
 *
 * Boost only applies to tasks whose task_type or recommended prompt
 * target indicates UI work (ui_fix, ui_fix_bulk, ui_fix_adaptive,
 * ui_advisor_step, frontend_exposure). Backend/agent tasks are left
 * alone — the pressure system is UX-specific.
 *
 * Phase 10.5 §L.
 */

import type { AuthoritativeTask } from '../types/systemState.types';
import { getRemediationPressure } from './remediationPressureEngine';

const UI_PROMPT_TARGETS = new Set<string>([
  'ui_fix',
  'ui_fix_bulk',
  'ui_fix_adaptive',
  'ui_advisor_step',
  'frontend_exposure',
]);

export function applyRemediationPressureBoost(
  ranked: ReadonlyArray<AuthoritativeTask>,
  projectId: string,
): ReadonlyArray<AuthoritativeTask> {
  const pressure = getRemediationPressure(projectId);
  const boost = boostForPressure(pressure.pressure);
  if (boost === 0) return ranked;

  const adjusted = ranked.map(task => {
    if (!isUITask(task)) return task;
    const calculated_rank = (task as any).calculated_rank != null
      ? (task as any).calculated_rank + boost
      : (task as any).calculated_rank;
    return { ...task, calculated_rank } as AuthoritativeTask;
  });
  return Object.freeze(
    [...adjusted].sort((a, b) => ((a as any).calculated_rank ?? 0) - ((b as any).calculated_rank ?? 0)),
  );
}

/**
 * Phase 11 — same as applyRemediationPressureBoost but enforces a combined
 * adjustment clamp: no task's calculated_rank can be more than 25 LOWER
 * than its pre-boost baseline. Used by systemStateEngine where the boost
 * composes with applyAdaptiveWeighting; without the clamp, adaptive's
 * negative deltas + this wrapper's negative boost can stack into runaway
 * priority.
 *
 * `baselineTasks` is the task list BEFORE any weighting (the merged
 * queue output from buildAuthoritativeQueue). The clamp is computed
 * relative to these baselines so it covers the full adaptive+boost
 * composition, not just our own delta.
 */
const COMBINED_RANK_CLAMP = 25;

export function applyRemediationPressureBoostClamped(
  ranked: ReadonlyArray<AuthoritativeTask>,
  projectId: string,
  baselineTasks: ReadonlyArray<AuthoritativeTask>,
): ReadonlyArray<AuthoritativeTask> {
  const boosted = applyRemediationPressureBoost(ranked, projectId);
  const baselineByKey = new Map<string, number>();
  for (const t of baselineTasks) {
    const key = (t as any).bp_id || t.id;
    if (key && (t as any).calculated_rank != null) baselineByKey.set(key, (t as any).calculated_rank);
  }
  const clamped = boosted.map(task => {
    const key = (task as any).bp_id || task.id;
    const baseline = key ? baselineByKey.get(key) : undefined;
    if (baseline == null) return task;
    const current = (task as any).calculated_rank;
    if (current == null) return task;
    const delta = current - baseline;            // negative = better
    if (delta < -COMBINED_RANK_CLAMP) {
      return { ...task, calculated_rank: baseline - COMBINED_RANK_CLAMP } as AuthoritativeTask;
    }
    return task;
  });
  return Object.freeze(
    [...clamped].sort((a, b) => ((a as any).calculated_rank ?? 0) - ((b as any).calculated_rank ?? 0)),
  );
}

function boostForPressure(pressure: number): number {
  if (pressure >= 75) return -15;
  if (pressure >= 50) return -8;
  if (pressure >= 25) return -3;
  return 0;
}

function isUITask(task: AuthoritativeTask): boolean {
  const target = (task as any).recommended_prompt_target || (task as any).prompt_target || '';
  if (UI_PROMPT_TARGETS.has(target)) return true;
  const taskType = ((task as any).task_type || '').toLowerCase();
  if (taskType.includes('ui') || taskType.includes('visual') || taskType === 'frontend') return true;
  return false;
}

// ── Phase 12 — combined task shaper ────────────────────────────────────────

/**
 * Phase 12 governance shaper signature. Pure function: takes the
 * already-pressure-boosted list, returns a (possibly-reordered) list
 * with adjustments. Implementations live in governance/ and read
 * pending GovernanceRecommendation rows to decide adjustments.
 */
export type GovernanceShaper = (
  tasks: ReadonlyArray<AuthoritativeTask>,
  projectId: string,
) => ReadonlyArray<AuthoritativeTask>;

/**
 * Phase 12 §C — Combined task shaper. Composes Phase 11 pressure
 * boost + Phase 12 governance shaping under ONE -25 clamp vs the
 * baseline. Preserves the Phase 11 invariant: no task may rank more
 * than 25 lower than its pre-weighting baseline, regardless of how
 * many shaping layers compose.
 *
 * Order: pressureBoost → governanceShape → clampVsBaseline.
 * baselineTasks is the merged queue BEFORE adaptiveWeighting (the
 * output of buildAuthoritativeQueue + visual task merge).
 */
export function applyCombinedTaskShaping(
  ranked: ReadonlyArray<AuthoritativeTask>,
  projectId: string,
  baselineTasks: ReadonlyArray<AuthoritativeTask>,
  governanceShaper?: GovernanceShaper,
): ReadonlyArray<AuthoritativeTask> {
  const pressureBoosted = applyRemediationPressureBoost(ranked, projectId);
  const governanceShaped = governanceShaper
    ? governanceShaper(pressureBoosted, projectId)
    : pressureBoosted;
  // Single absolute clamp covering the full composition vs baseline.
  const baselineByKey = new Map<string, number>();
  for (const t of baselineTasks) {
    const key = (t as any).bp_id || t.id;
    if (key && (t as any).calculated_rank != null) baselineByKey.set(key, (t as any).calculated_rank);
  }
  const clamped = governanceShaped.map(task => {
    const key = (task as any).bp_id || task.id;
    const baseline = key ? baselineByKey.get(key) : undefined;
    if (baseline == null) return task;
    const current = (task as any).calculated_rank;
    if (current == null) return task;
    const delta = current - baseline;
    if (delta < -COMBINED_RANK_CLAMP) {
      return { ...task, calculated_rank: baseline - COMBINED_RANK_CLAMP } as AuthoritativeTask;
    }
    return task;
  });
  return Object.freeze(
    [...clamped].sort((a, b) => ((a as any).calculated_rank ?? 0) - ((b as any).calculated_rank ?? 0)),
  );
}

export const _COMBINED_RANK_CLAMP_FOR_TESTS = COMBINED_RANK_CLAMP;
