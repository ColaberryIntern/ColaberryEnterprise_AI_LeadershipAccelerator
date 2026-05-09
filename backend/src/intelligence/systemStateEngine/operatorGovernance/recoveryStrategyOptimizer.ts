/**
 * recoveryStrategyOptimizer — Phase 18. Tracks per-recovery-chain
 * outcomes + builds `RecoveryOptimizationInsights` that bias future
 * recovery planning.
 *
 * Architectural commitment (per Phase 18 stress-test):
 *   - Optimization INFORMS planning. The operator still executes steps.
 *   - We aggregate observed step sequences into "archetypes" keyed by
 *     ordered step-kind-list, track success rate + avg time to stabilize.
 *   - The recommended_ordering is a heuristic ordering; chain planners
 *     can use it to prefer high-success orderings, but the operator
 *     reviews the chain before executing.
 *   - `RecoveryDecisionAttribution` (per the addendum) explains every
 *     ordering decision so operators see WHY the chain looks the way
 *     it does.
 */

import type {
  RecoveryArchetype, RecoveryOptimizationInsights, RecoveryDecisionAttribution,
} from './operatorGovernanceTypes';

interface ArchetypeObservation {
  step_sequence: string[];
  succeeded: boolean;
  minutes_to_stabilize: number;
  recorded_at: number;
}

const projectArchetypes = new Map<string, ArchetypeObservation[]>();

const MAX_OBSERVATIONS_PER_PROJECT = 200;

export interface ObserveRecoveryOutcomeInput {
  readonly project_id: string;
  readonly step_sequence: ReadonlyArray<string>;     // ordered step kinds
  readonly succeeded: boolean;
  readonly minutes_to_stabilize: number;
}

export function observeRecoveryOutcome(input: ObserveRecoveryOutcomeInput): void {
  const list = projectArchetypes.get(input.project_id) ?? [];
  list.push({
    step_sequence: [...input.step_sequence],
    succeeded: input.succeeded,
    minutes_to_stabilize: input.minutes_to_stabilize,
    recorded_at: Date.now(),
  });
  if (list.length > MAX_OBSERVATIONS_PER_PROJECT) list.shift();
  projectArchetypes.set(input.project_id, list);
}

export function buildRecoveryOptimizationInsights(project_id: string): RecoveryOptimizationInsights {
  const observations = projectArchetypes.get(project_id) ?? [];

  // Group by canonical step_sequence string.
  const groups = new Map<string, ArchetypeObservation[]>();
  for (const obs of observations) {
    const key = obs.step_sequence.join(' → ');
    const arr = groups.get(key) ?? [];
    arr.push(obs);
    groups.set(key, arr);
  }

  const archetypes: RecoveryArchetype[] = [];
  for (const [key, arr] of groups.entries()) {
    const successCount = arr.filter(o => o.succeeded).length;
    const success_rate = arr.length === 0 ? 0 : Math.round((successCount / arr.length) * 100);
    const avg_minutes_to_stabilize = arr.length === 0 ? 0 :
      Math.round(arr.reduce((s, o) => s + o.minutes_to_stabilize, 0) / arr.length);
    const note = arr.length === 0
      ? 'no observations yet'
      : `${successCount}/${arr.length} succeeded`;
    archetypes.push({
      archetype_id: hashKey(key),
      step_sequence: key.split(' → '),
      observed_count: arr.length,
      success_rate,
      avg_minutes_to_stabilize,
      notes: note,
    });
  }

  // Sort by success_rate × observed_count (so we prefer well-supported orderings).
  archetypes.sort((a, b) => (b.success_rate * b.observed_count) - (a.success_rate * a.observed_count));

  // Recommended ordering is the highest-scoring archetype's step sequence
  // when it has at least 2 observations; otherwise the engine returns an
  // empty recommendation (caller falls back to the default planner).
  const top = archetypes.find(a => a.observed_count >= 2 && a.success_rate >= 50) ?? null;
  const recommended_ordering = top?.step_sequence ?? [];

  // Build attribution for the recommended ordering.
  const attributions: RecoveryDecisionAttribution[] = top
    ? top.step_sequence.map((step, i) => ({
        recovery_step: step,
        ordering_reason: i === 0
          ? `First step in highest-scoring archetype (${top.success_rate}% success across ${top.observed_count} observations).`
          : `Position ${i + 1} in archetype with ${top.avg_minutes_to_stabilize}min avg stabilization.`,
        optimization_inputs: {
          historical_success_rate: top.success_rate,
          avg_minutes_to_stabilize: top.avg_minutes_to_stabilize,
          observed_count: top.observed_count,
        },
        stabilization_expectation: top.success_rate >= 80 ? 'high' : top.success_rate >= 60 ? 'moderate' : 'low',
      }))
    : [];

  return {
    project_id,
    archetypes,
    recommended_ordering,
    attributions,
    built_at: new Date().toISOString(),
  };
}

function hashKey(key: string): string {
  // Stable djb2-style hash for archetype id — replay-safe.
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h) + key.charCodeAt(i);
    h = h & h;
  }
  return `arch-${(h >>> 0).toString(16)}`;
}

export function _resetRecoveryOptimizer(): void {
  projectArchetypes.clear();
}

export const _MAX_OBSERVATIONS_PER_PROJECT_FOR_TESTS = MAX_OBSERVATIONS_PER_PROJECT;
