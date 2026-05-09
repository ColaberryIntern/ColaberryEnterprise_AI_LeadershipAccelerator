/**
 * recoveryForesightTrustSurface — Phase 30. 6-band trust surface
 * inherited from observable Phase 29 + Phase 30 state.
 *
 * Architectural commitment:
 *   - Trust is INHERITED, never synthesized.
 *   - Cross-organization isolation absolute.
 *   - `comparison_neutrality`, `guidance_advisory_safety`, and
 *     `decision_governance_trust` are STRUCTURAL (always 100) — they
 *     reflect typed-as-literal commitments.
 */

import type { RecoveryForesightTrustSurface } from './recoveryForesightTypes';
import { buildRecoveryForesightComposite } from './recoveryForesightCoordinator';

export interface BuildTrustSurfaceInput {
  readonly organization_id: string;
  readonly operator_id: string;
  readonly archetype_ids?: ReadonlyArray<string>;
}

export function buildRecoveryForesightTrustSurface(
  input: BuildTrustSurfaceInput,
): RecoveryForesightTrustSurface {
  const composite = buildRecoveryForesightComposite(input);

  // comparison_neutrality — structural (engine_never_ranks: true).
  const comparison_neutrality = 100;

  // survivability_visibility — 100 if rows present + at least one
  // confidence > 0; 80 otherwise (still structurally visible but no
  // signal to display).
  const hasRows = composite.survivability.rows.length > 0;
  const hasSignal = composite.survivability.rows.some(r => r.inherited_confidence.score > 0);
  const survivability_visibility = hasRows && hasSignal ? 100 : 80;

  // tradeoff_clarity — 100 if every tradeoff row has individual citations
  // (which is structurally true — every row has a deterministic_hash).
  const tradeoff_clarity = composite.tradeoff.rows.every(r => r.deterministic_hash) ? 100 : 80;

  // archaeology_integrity — 100 since archaeology is deterministic
  // read-only over Phase 29 stores; cross_phase_archaeology=false typed-as-literal.
  const archaeology_integrity = 100;

  // guidance_advisory_safety — structural (advisory_only: true).
  const guidance_advisory_safety = 100;

  // decision_governance_trust — structural (operator_mediation_required: true).
  const decision_governance_trust = 100;

  const bands = [
    {
      label: 'comparison_neutrality',
      score: comparison_neutrality,
      inherited_from_phase: 'phase_30_foresight' as const,
      drivers: ['engine_never_ranks=true', 'no_aggregate_score', 'no_selected_archetype'],
      source_attribution_id: composite.comparison.comparison_hash,
    },
    {
      label: 'survivability_visibility',
      score: survivability_visibility,
      inherited_from_phase: 'phase_30_foresight' as const,
      drivers: [`rows=${composite.survivability.rows.length}`, `has_signal=${hasSignal}`],
      source_attribution_id: composite.survivability.survivability_hash,
    },
    {
      label: 'tradeoff_clarity',
      score: tradeoff_clarity,
      inherited_from_phase: 'phase_30_foresight' as const,
      drivers: [`tradeoff_rows=${composite.tradeoff.rows.length}`],
      source_attribution_id: composite.tradeoff.tradeoff_hash,
    },
    {
      label: 'archaeology_integrity',
      score: archaeology_integrity,
      inherited_from_phase: 'phase_30_foresight' as const,
      drivers: [`read_only=true`, `cross_phase_archaeology=false`],
      source_attribution_id: composite.archaeology.archaeology_hash,
    },
    {
      label: 'guidance_advisory_safety',
      score: guidance_advisory_safety,
      inherited_from_phase: 'phase_30_foresight' as const,
      drivers: ['advisory_only=true'],
      source_attribution_id: 'structural',
    },
    {
      label: 'decision_governance_trust',
      score: decision_governance_trust,
      inherited_from_phase: 'phase_30_foresight' as const,
      drivers: ['operator_mediation_required=true'],
      source_attribution_id: 'structural',
    },
  ];

  const aggregate_score = Math.round(
    bands.reduce((acc, b) => acc + b.score, 0) / bands.length,
  );

  return {
    organization_id: input.organization_id,
    bands,
    aggregate_score,
    built_at: new Date().toISOString(),
  };
}
