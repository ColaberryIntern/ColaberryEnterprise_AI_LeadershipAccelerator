/**
 * stabilizationDecisionEngine — Phase 30. Side-by-side multi-archetype
 * comparison engine. NEVER ranks. NEVER selects. NEVER recommends.
 *
 * Architectural commitment:
 *   - `engine_never_ranks: true` typed-as-literal on every output.
 *   - NO `selected_archetype`, NO `recommended_archetype`, NO
 *     `aggregate_score`, NO `composite_priority`.
 *   - Comparison rows ordered ALPHABETICALLY by archetype_id
 *     (deterministic, no score-based ordering).
 *   - Reads ONLY Phase 29 archetypes + Phase 29 forecasts + Phase 29
 *     governance. Produces typed comparison data structures.
 *   - Cross-organization isolation absolute.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  StabilizationDecisionComparisonProfile, ArchetypeComparisonRow,
  DecisionForesightTier, ComparisonNeutralityProof,
  DecisionVisibilityAttribution,
} from './recoveryForesightTypes';
import {
  MAX_COMPARISONS_PER_PARTITION, COMPARISON_TIER_CONFIDENCE_THRESHOLD,
  FORESIGHT_CONFIDENCE_CAP,
} from './recoveryForesightTypes';
import { listArchetypes } from '../stabilizationIntelligence/recoveryArchetypeRegistry';
import { buildContinuityRestorationForecast } from '../stabilizationIntelligence/continuityRestorationForecaster';
import { evaluateArchetypeApplication } from '../stabilizationIntelligence/recoveryGovernanceSupervisor';

interface PartitionStore {
  comparisons: StabilizationDecisionComparisonProfile[];
  neutrality_proofs: ComparisonNeutralityProof[];
  visibility_attributions: DecisionVisibilityAttribution[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) {
    s = { comparisons: [], neutrality_proofs: [], visibility_attributions: [] };
    partitions.set(organization_id, s);
  }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildComparisonInput {
  readonly organization_id: string;
  readonly operator_id: string;
  readonly per_step_rollback_chain_id_hint?: string;          // single hint for governance gate
  readonly archetype_ids?: ReadonlyArray<string>;             // optional filter; default: all
}

/**
 * Build a multi-archetype side-by-side comparison. Reads existing
 * archetypes; runs Phase 29 forecast + governance for each; assembles
 * rows; orders ALPHABETICALLY; classifies foresight tier; produces
 * neutrality proof. NEVER selects an archetype.
 */
export function buildStabilizationDecisionComparison(
  input: BuildComparisonInput,
): StabilizationDecisionComparisonProfile {
  const all = listArchetypes(input.organization_id);
  const filtered = input.archetype_ids
    ? all.filter(a => input.archetype_ids!.includes(a.archetype_id))
    : all;

  // Sort alphabetically — deterministic, no ranking by score.
  const sorted = [...filtered].sort((a, b) => a.archetype_id.localeCompare(b.archetype_id));

  const rows: ArchetypeComparisonRow[] = sorted.map(arch => {
    // Per-archetype forecast (heuristic).
    const forecastResult = buildContinuityRestorationForecast({
      organization_id: input.organization_id,
      archetype_id: arch.archetype_id,
    });
    const forecast = forecastResult.built ? forecastResult.forecast : null;

    // Per-archetype governance pre-check (use a placeholder rollback
    // chain id hint so the gate validates the structural shape only).
    const rollback_hint = input.per_step_rollback_chain_id_hint ?? `comparison_chain_${arch.archetype_id}`;
    const gate = evaluateArchetypeApplication({
      organization_id: input.organization_id,
      issuer_organization_id: input.organization_id,
      operator_id: input.operator_id,
      archetype_id: arch.archetype_id,
      per_step_rollback_chain_ids: arch.steps
        .filter(s => s.required_rollback_chain_id_param)
        .map(() => rollback_hint),
    });

    const duration_ms = forecast?.estimated_total_duration_ms ?? 0;
    const strain_pressure = forecast?.estimated_partition_strain_pressure ?? 0;
    const confidence = forecast?.inherited_confidence.score ?? 30;

    const row_hash = deterministicHash(
      `${arch.archetype_id}::${arch.deterministic_hash}::${duration_ms}::${strain_pressure}::${confidence}::${gate.decision}`,
    );

    return {
      archetype_id: arch.archetype_id,
      archetype_name: arch.name,
      provenance: arch.provenance,
      step_count: arch.steps.length,
      duration_ms,
      strain_pressure,
      confidence,
      governance_passed: gate.decision === 'permitted',
      governance_reason: gate.decision !== 'permitted' ? gate.reason : undefined,
      deterministic_hash: row_hash,
    };
  });

  // Classify foresight tier — DETERMINISTIC from row aggregates,
  // NOT a ranking signal. Used to surface a high-level state, not
  // to recommend.
  const tier = classifyForesightTier(rows);

  const comparison_id = `cmp_${randomUUID()}`;
  const comparison_hash = deterministicHash(
    `${input.organization_id}::${rows.map(r => r.deterministic_hash).join('::')}::${tier}`,
  );
  const built_at = new Date().toISOString();

  const profile: StabilizationDecisionComparisonProfile = {
    comparison_id,
    organization_id: input.organization_id,
    rows,
    engine_never_ranks: true,
    advisory_only: true,
    tier,
    comparison_hash,
    built_at,
  };

  const store = ensure(input.organization_id);
  store.comparisons.push(profile);
  if (store.comparisons.length > MAX_COMPARISONS_PER_PARTITION) store.comparisons.shift();

  // Record the neutrality proof as a structural attestation that the
  // engine remained neutral on this comparison.
  const neutrality_proof: ComparisonNeutralityProof = {
    comparison_id,
    engine_never_ranks: true,
    no_aggregate_score: true,
    no_selected_archetype: true,
    deterministic_hash: deterministicHash(
      `neutrality::${comparison_id}::${comparison_hash}`,
    ),
    recorded_at: built_at,
  };
  store.neutrality_proofs.push(neutrality_proof);
  if (store.neutrality_proofs.length > MAX_COMPARISONS_PER_PARTITION) store.neutrality_proofs.shift();

  // Record per-row visibility attribution — operators see WHY each row
  // appeared as it did.
  for (const row of rows) {
    const visibility: DecisionVisibilityAttribution = {
      archetype_id: row.archetype_id,
      surfaced_metrics: ['duration_ms', 'strain_pressure', 'confidence', 'step_count'],
      surfaced_tradeoffs: [],
      surfaced_uncertainty: forecastResultUncertaintyKeys(),
      governance_visibility_verified: row.governance_passed || row.governance_reason !== undefined,
      deterministic_hash: deterministicHash(
        `visibility::${comparison_id}::${row.archetype_id}::${row.deterministic_hash}`,
      ),
      recorded_at: built_at,
    };
    store.visibility_attributions.push(visibility);
    if (store.visibility_attributions.length > MAX_COMPARISONS_PER_PARTITION * rows.length) {
      store.visibility_attributions.shift();
    }
  }

  return profile;
}

function forecastResultUncertaintyKeys(): ReadonlyArray<string> {
  return ['uncertainty_bounds.low', 'uncertainty_bounds.expected', 'uncertainty_bounds.high', 'inherited_confidence.score'];
}

function classifyForesightTier(rows: ReadonlyArray<ArchetypeComparisonRow>): DecisionForesightTier {
  if (rows.length === 0) return 'unsuitable';
  const permitted = rows.filter(r => r.governance_passed);
  if (permitted.length === 0) return 'blocked';

  // Highest confidence among permitted rows.
  const maxConfidence = Math.max(...permitted.map(r => r.confidence));
  if (maxConfidence >= COMPARISON_TIER_CONFIDENCE_THRESHOLD) return 'clear';

  // Confidence spread — wide spread = explorable, narrow spread = contested.
  const confidences = permitted.map(r => r.confidence);
  const minC = Math.min(...confidences);
  const maxC = Math.max(...confidences);
  const spread = maxC - minC;
  if (spread >= 20) return 'explorable';
  return 'contested';
}

export function listComparisons(
  organization_id: string,
): ReadonlyArray<StabilizationDecisionComparisonProfile> {
  return [...(partitions.get(organization_id)?.comparisons ?? [])].reverse();
}

export function listNeutralityProofs(
  organization_id: string,
): ReadonlyArray<ComparisonNeutralityProof> {
  return [...(partitions.get(organization_id)?.neutrality_proofs ?? [])].reverse();
}

export function listVisibilityAttributions(
  organization_id: string,
): ReadonlyArray<DecisionVisibilityAttribution> {
  return [...(partitions.get(organization_id)?.visibility_attributions ?? [])].reverse();
}

export function recentComparisonCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.comparisons ?? [];
    total += arr.filter(c => Date.parse(c.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetDecisionEngineForTests(): void {
  partitions.clear();
}

void FORESIGHT_CONFIDENCE_CAP;     // referenced for static analysis
