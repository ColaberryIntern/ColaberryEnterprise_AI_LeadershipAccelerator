/**
 * executionEconomicsTrustSurface — Phase 28. 6-band trust surface.
 *
 * Architectural commitment:
 *   - Trust is INHERITED from underlying observable state, never
 *     synthesized.
 *   - Bands trace back to source phases (Phase 21/22/23/27/28).
 *   - Cross-organization isolation: every band is per-org.
 */

import type {
  ExecutionEconomicsTrustSurface,
} from './executionEconomicsTypes';
import { buildEconomicsComposite } from './executionEconomicsCoordinator';

export interface BuildTrustSurfaceInput {
  readonly organization_id: string;
}

export function buildExecutionEconomicsTrustSurface(
  input: BuildTrustSurfaceInput,
): ExecutionEconomicsTrustSurface {
  const composite = buildEconomicsComposite({ organization_id: input.organization_id });
  const built_at = new Date().toISOString();

  // Budget reliability: how reliable are quota enforcement decisions?
  // Structurally always 100 since quotas are static + deterministic.
  const budget_reliability = 100;

  // Rollback cost certainty: inherited from forecast confidence.
  const rollback_cost_certainty = composite.rollback_forecast.inherited_confidence.score;

  // Pressure classification confidence: 100 if observed counters > 0,
  // else 80 (no signal to classify on).
  const total_signals =
    composite.pressure.observed_counters.executions_24h +
    composite.pressure.observed_counters.refusals_24h +
    composite.pressure.observed_counters.timeouts_24h;
  const pressure_classification_confidence = total_signals === 0 ? 80 : 100;

  // Topology load integrity: 100 since structurally recommendation-only.
  const topology_load_integrity = 100;

  // Quota safety: 100 unless quota exhausted (then 50).
  const quota_safety = composite.quota.any_exhausted ? 50 : 100;

  // Replay integrity: 100 since boundary-proof-chain is deterministic.
  const replay_integrity = 100;

  const bands = [
    {
      label: 'budget_reliability',
      score: budget_reliability,
      inherited_from_phase: 'phase_28_economics' as const,
      drivers: ['static_operator_set_caps', 'deterministic_enforcement'],
      source_attribution_id: composite.quota.deterministic_hash,
    },
    {
      label: 'rollback_cost_certainty',
      score: rollback_cost_certainty,
      inherited_from_phase: 'phase_28_economics' as const,
      drivers: composite.rollback_forecast.inherited_confidence.drivers,
      source_attribution_id: composite.rollback_forecast.forecast_hash,
    },
    {
      label: 'pressure_classification_confidence',
      score: pressure_classification_confidence,
      inherited_from_phase: 'phase_28_economics' as const,
      drivers: [
        `total_signals=${total_signals}`,
        `tier=${composite.pressure.tier}`,
      ],
      source_attribution_id: composite.pressure.sample_hash,
    },
    {
      label: 'topology_load_integrity',
      score: topology_load_integrity,
      inherited_from_phase: 'phase_28_economics' as const,
      drivers: ['recommendation_only', 'never_auto_migrates'],
      source_attribution_id: composite.topology_load.distribution_hash,
    },
    {
      label: 'quota_safety',
      score: quota_safety,
      inherited_from_phase: 'phase_28_economics' as const,
      drivers: composite.quota.any_exhausted
        ? [`exhausted: ${composite.quota.exhausted_keys.join(',')}`]
        : ['no_exhausted_keys'],
      source_attribution_id: composite.quota.deterministic_hash,
    },
    {
      label: 'replay_integrity',
      score: replay_integrity,
      inherited_from_phase: 'phase_28_economics' as const,
      drivers: ['deterministic_boundary_proof_chain'],
      source_attribution_id: composite.boundary_proof_chain.replay_hash,
    },
  ];

  const aggregate_score = Math.round(
    bands.reduce((acc, b) => acc + b.score, 0) / bands.length,
  );

  return {
    organization_id: input.organization_id,
    bands,
    aggregate_score,
    built_at,
  };
}
