/**
 * mutationBlastRadiusForecaster — Phase 15. Pure forward simulation
 * of the blast radius for an operational-state mutation.
 *
 * Phase 14's `assessBlastRadius` (in safeExecutionGuardrails.ts) scored
 * UI/UX-collateral blast for autonomous handoffs. This forecaster
 * tailors the same heuristic to engine-internal state mutations:
 *   - Queue mutations propagate via dependency edges + rerank fanout.
 *   - Policy/threshold nudges destabilize orchestration scoring.
 *   - Trust recalibrations ripple through governance shaping.
 *   - Conflicts with currently-active mutations of the same intent
 *     class are a first-class dimension (Phase 14 didn't have this —
 *     handoffs are queued, not fan-out).
 */

import type {
  MutationBlastForecast,
  MutationIntent,
} from './mutationTypes';

export interface MutationBlastForecastInput {
  readonly intent: MutationIntent;
  readonly project_id: string;
  /** Number of dependent capabilities/clusters that could feel the mutation. */
  readonly dependency_fanout: number;
  /** Magnitude of the rerank/threshold delta. Higher = more destabilizing. */
  readonly proposed_magnitude: number;
  /** How many other live mutations of the same intent class are still
   *  pending verification. Conflicts are weighted heavily. */
  readonly active_class_concurrency: number;
  /** Operational stability proxy (0-100; lower = system already shaky). */
  readonly current_orchestration_stability: number;
  /** Cognition health (0-100). */
  readonly current_cognition_health: number;
}

const TIER_THRESHOLDS = { high: 60, moderate: 35 } as const;

const INTENT_INHERENT_RISK: Record<MutationIntent, number> = {
  QUEUE_STABILIZATION: 25,
  PRESSURE_REBALANCE: 20,
  ISOLATION_CONTAINMENT: 15,
  AUTOMATION_DEESCALATION: 10,
  TRUST_RECALIBRATION: 35,
  POLICY_NUDGE: 40,
  SELF_HEALING_ACTION: 20,
};

export function forecastMutationBlast(input: MutationBlastForecastInput): MutationBlastForecast {
  const dependency_propagation = clamp(input.dependency_fanout * 6 + input.proposed_magnitude * 2, 0, 100);
  const orchestration_destabilization = clamp(
    Math.max(0, 100 - input.current_orchestration_stability) + input.proposed_magnitude * 3,
    0, 100,
  );
  const cognition_ripple = clamp(
    Math.max(0, 100 - input.current_cognition_health) + INTENT_INHERENT_RISK[input.intent] / 2,
    0, 100,
  );
  const conflict_with_active_mutations = clamp(input.active_class_concurrency * 25, 0, 100);

  // Weighted blend tuned to weight orchestration + conflict heavily for
  // operational-state mutations. (Phase 14 weighted UX collateral; we
  // weight orchestration instead because that IS the surface here.)
  const composite =
    dependency_propagation * 0.25 +
    orchestration_destabilization * 0.30 +
    cognition_ripple * 0.20 +
    conflict_with_active_mutations * 0.25;

  const score = Math.round(composite + INTENT_INHERENT_RISK[input.intent] * 0.10);
  const tier: MutationBlastForecast['tier'] =
    score >= TIER_THRESHOLDS.high ? 'high' :
    score >= TIER_THRESHOLDS.moderate ? 'moderate' : 'low';

  const factors: string[] = [];
  if (tier === 'high') factors.push(`Composite mutation blast ${score}/100 — autonomous mutation blocked.`);
  if (dependency_propagation >= 60) factors.push(`Dependency propagation high (${dependency_propagation}/100; fanout ${input.dependency_fanout}).`);
  if (orchestration_destabilization >= 60) factors.push(`Orchestration destabilization risk (${orchestration_destabilization}/100).`);
  if (cognition_ripple >= 60) factors.push(`Cognition ripple risk (${cognition_ripple}/100).`);
  if (conflict_with_active_mutations >= 50) factors.push(`Conflicts with ${input.active_class_concurrency} active ${input.intent} mutation(s).`);

  return {
    score,
    tier,
    contributing_factors: factors,
    dependency_propagation,
    orchestration_destabilization,
    cognition_ripple,
    conflict_with_active_mutations,
  };
}

export function evaluateMutationBlastGate(forecast: MutationBlastForecast): { action: 'apply' | 'reject'; reason: string } {
  if (forecast.tier === 'high') {
    return { action: 'reject', reason: forecast.contributing_factors[0] ?? `Blast ${forecast.score}/100.` };
  }
  return { action: 'apply', reason: `Blast ${forecast.score}/100 (${forecast.tier}).` };
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export const _MUTATION_BLAST_TIER_THRESHOLDS_FOR_TESTS = TIER_THRESHOLDS;
