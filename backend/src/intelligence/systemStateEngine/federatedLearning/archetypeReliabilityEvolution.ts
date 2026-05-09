/**
 * archetypeReliabilityEvolution — Phase 20. Per-archetype reliability
 * profile evolution using deterministic update rules.
 *
 * Architectural commitment (per the Phase 20 stress-test):
 *   - DETERMINISTIC update rules. No ML, no probabilistic models.
 *   - 6-tier classification: emerging / stable / trusted / cautionary
 *     / degraded / suppressed.
 *   - Every refinement carries a `FederatedLearningAttribution` that
 *     explains why the score / tier moved.
 *   - Storage: persisted via the broker adapter.
 *   - Suppression is OPERATOR-SET (not auto-applied).
 */

import type {
  ArchetypeReliabilityProfile, ArchetypeReliabilityTier,
  FederatedLearningAttribution, FederatedEffectivenessProfile,
} from './federatedLearningTypes';
import {
  RELIABILITY_DELTA_PER_OBSERVATION,
  MAX_RELIABILITY_HISTORY_PER_ARCHETYPE,
} from './federatedLearningTypes';
import { getBrokerAdapter, BROKER_NAMESPACES } from './persistentFederationBroker';
import { readEffectivenessProfile } from './federatedEffectivenessTracker';

const STORE_NAMESPACE = BROKER_NAMESPACES.reliability;

// Per-organization operator-set suppression set.
const orgSuppressedArchetypes = new Map<string, Set<string>>();

function getSuppressionSet(organization_id: string): Set<string> {
  let s = orgSuppressedArchetypes.get(organization_id);
  if (!s) { s = new Set(); orgSuppressedArchetypes.set(organization_id, s); }
  return s;
}

export interface EvolveReliabilityInput {
  readonly organization_id: string;
  readonly archetype_signature: string;
  /** Caller passes a recent effectiveness profile so we don't
   *  double-fetch when running in a refinement loop. */
  readonly effectiveness?: FederatedEffectivenessProfile | null;
  /** Optional originating project — when present, an audit row is
   *  written with this project_id on tier transitions. When absent,
   *  the audit is skipped (the profile/tier still updates); avoids
   *  notNull violations on org-scoped refreshes. */
  readonly originating_project_id?: string;
}

export async function evolveReliability(input: EvolveReliabilityInput): Promise<ArchetypeReliabilityProfile> {
  const broker = getBrokerAdapter();
  const existing = await broker.get<ArchetypeReliabilityProfile>(input.organization_id, STORE_NAMESPACE, input.archetype_signature);
  const effectiveness = input.effectiveness ?? await readEffectivenessProfile(input.organization_id, input.archetype_signature);

  const suppressed = getSuppressionSet(input.organization_id).has(input.archetype_signature);
  const previousScore = existing?.current_score ?? 50;
  const previousTier = existing?.current_tier ?? 'emerging';

  const counts = aggregateCounts(effectiveness);
  const { newScore: rawNewScore, attribution } = computeNewScore(input.archetype_signature, previousScore, effectiveness, counts);
  // Suppression drops the score to 0 (matching Phase 17's freeze semantics).
  const newScore = suppressed ? 0 : rawNewScore;
  const newTier = classifyTier(newScore, counts.observation_count, suppressed);

  const historyEntry = { recorded_at: new Date().toISOString(), tier: newTier, score: newScore, reason: attribution.refinement_reason };
  const previousHistory = existing?.history ?? [];
  const history = [...previousHistory, historyEntry].slice(-MAX_RELIABILITY_HISTORY_PER_ARCHETYPE);

  const next: ArchetypeReliabilityProfile = {
    archetype_signature: input.archetype_signature,
    current_tier: newTier,
    current_score: newScore,
    observation_count: counts.observation_count,
    net_improvement_count: counts.net_improvement_count,
    net_regression_count: counts.net_regression_count,
    stabilization_consistency: effectiveness?.organizational_consistency ?? 50,
    anomaly_pressure: effectiveness?.anomaly_frequency ?? 0,
    replay_reliability: effectiveness?.recovery_success_rate ?? 100,
    organizational_usefulness: organizationalUsefulnessScore(effectiveness),
    history,
    last_attribution: { ...attribution, confidence_shift: { from: previousScore, to: newScore } },
  };

  await broker.put(input.organization_id, STORE_NAMESPACE, input.archetype_signature, next);

  // Audit + event for tier transitions
  if (newTier !== previousTier) {
    await writeReliabilityAudit(input.organization_id, next, previousTier, input.originating_project_id ?? null);
  }

  return next;
}

interface CountsSnapshot {
  observation_count: number;
  net_improvement_count: number;
  net_regression_count: number;
  anomaly_count: number;
  stabilization_consistency_score: number;
}

function aggregateCounts(effectiveness: FederatedEffectivenessProfile | null): CountsSnapshot {
  if (!effectiveness) {
    return { observation_count: 0, net_improvement_count: 0, net_regression_count: 0, anomaly_count: 0, stabilization_consistency_score: 50 };
  }
  // We don't have raw observations here, so derive counts from rates.
  const total = Math.round(effectiveness.confidence_evolution.length);
  const improvementRate = Math.max(0, Math.min(100, Math.round(50 + effectiveness.observed_stabilization_delta / 2)));
  const net_improvement_count = Math.round((improvementRate / 100) * total);
  const net_regression_count = total - net_improvement_count;
  const anomaly_count = Math.round((effectiveness.anomaly_frequency / 100) * total);
  return {
    observation_count: total,
    net_improvement_count,
    net_regression_count,
    anomaly_count,
    stabilization_consistency_score: effectiveness.organizational_consistency,
  };
}

function computeNewScore(
  archetype_signature: string,
  previousScore: number,
  effectiveness: FederatedEffectivenessProfile | null,
  counts: CountsSnapshot,
): { newScore: number; attribution: FederatedLearningAttribution } {
  if (!effectiveness || counts.observation_count === 0) {
    const attribution: FederatedLearningAttribution = {
      archetype_signature,
      refinement_reason: 'no observations yet (cold-start)',
      observed_inputs: { ...counts },
      reliability_delta: 0,
      stabilization_delta: 0,
      anomaly_impact: 0,
      confidence_shift: { from: previousScore, to: previousScore },
    };
    return { newScore: previousScore, attribution };
  }

  // Deterministic update rule:
  //   delta = (improvement_rate - regression_rate) * RELIABILITY_DELTA_PER_OBSERVATION
  //         - anomaly_pressure_factor
  // Where rates are fractions in [0..1] derived from counts.
  const improvementRate = counts.observation_count === 0 ? 0 : counts.net_improvement_count / counts.observation_count;
  const regressionRate = counts.observation_count === 0 ? 0 : counts.net_regression_count / counts.observation_count;
  const balancedSignal = improvementRate - regressionRate;
  const anomalyFactor = effectiveness.anomaly_frequency / 20;     // up to ±5 dampening when anomaly_freq=100
  const reliability_delta = Math.round(balancedSignal * RELIABILITY_DELTA_PER_OBSERVATION - anomalyFactor);
  const newScoreRaw = previousScore + reliability_delta;
  const newScore = Math.max(0, Math.min(100, Math.round(newScoreRaw)));

  let reason: string;
  if (reliability_delta > 0) {
    reason = `${counts.net_improvement_count} net improvements vs ${counts.net_regression_count} regressions; reliability +${reliability_delta}`;
  } else if (reliability_delta < 0) {
    reason = `${counts.net_regression_count} regressions + anomaly pressure ${effectiveness.anomaly_frequency}% dampened reliability ${reliability_delta}`;
  } else {
    reason = 'balanced observations — reliability unchanged';
  }

  const attribution: FederatedLearningAttribution = {
    archetype_signature,
    refinement_reason: reason,
    observed_inputs: { ...counts },
    reliability_delta,
    stabilization_delta: effectiveness.observed_stabilization_delta,
    anomaly_impact: effectiveness.anomaly_frequency,
    confidence_shift: { from: previousScore, to: newScore },
  };
  return { newScore, attribution };
}

function classifyTier(score: number, observation_count: number, suppressed: boolean): ArchetypeReliabilityTier {
  if (suppressed) return 'suppressed';
  if (observation_count < 5) return 'emerging';
  if (score >= 80) return 'trusted';
  if (score >= 60) return 'stable';
  if (score >= 40) return 'cautionary';
  return 'degraded';
}

function organizationalUsefulnessScore(effectiveness: FederatedEffectivenessProfile | null): number {
  if (!effectiveness) return 50;
  // Composite of stabilization + propagation reduction + recovery success.
  const stab = Math.max(-100, Math.min(100, effectiveness.observed_stabilization_delta));
  const prop = Math.max(-100, Math.min(100, effectiveness.propagation_reduction));
  return Math.max(0, Math.min(100, Math.round(((stab + 100) / 2) * 0.4 + ((prop + 100) / 2) * 0.3 + effectiveness.recovery_success_rate * 0.3)));
}

// ─── Operator suppression surface ────────────────────────────────────

export function suppressArchetype(organization_id: string, archetype_signature: string): void {
  getSuppressionSet(organization_id).add(archetype_signature);
}

export function unsuppressArchetype(organization_id: string, archetype_signature: string): void {
  getSuppressionSet(organization_id).delete(archetype_signature);
}

export function isArchetypeSuppressed(organization_id: string, archetype_signature: string): boolean {
  return getSuppressionSet(organization_id).has(archetype_signature);
}

export async function readReliabilityProfile(organization_id: string, archetype_signature: string): Promise<ArchetypeReliabilityProfile | null> {
  return getBrokerAdapter().get<ArchetypeReliabilityProfile>(organization_id, STORE_NAMESPACE, archetype_signature);
}

export async function listReliabilityProfiles(organization_id: string): Promise<ReadonlyArray<ArchetypeReliabilityProfile>> {
  return getBrokerAdapter().listValues<ArchetypeReliabilityProfile>(organization_id, STORE_NAMESPACE);
}

async function writeReliabilityAudit(organization_id: string, profile: ArchetypeReliabilityProfile, previousTier: ArchetypeReliabilityTier, originating_project_id: string | null): Promise<void> {
  // Audit row requires a non-null project_id. When the caller doesn't
  // supply one (pure organizational refinement), skip the audit; the
  // profile + tier still update via the broker.
  if (!originating_project_id) return;
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: originating_project_id,
      kind: 'archetype_reliability_evolved',
      subject_id: profile.archetype_signature,
      payload: {
        organization_id,
        previous_tier: previousTier,
        current_tier: profile.current_tier,
        current_score: profile.current_score,
        attribution: profile.last_attribution,
      },
      operator_id: null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[archetypeReliabilityEvolution] audit write failed:', err?.message);
  }
}

export function _resetReliabilitySuppressions(): void {
  orgSuppressedArchetypes.clear();
}

export const _RELIABILITY_DELTA_PER_OBSERVATION_FOR_TESTS = RELIABILITY_DELTA_PER_OBSERVATION;
export const _MAX_RELIABILITY_HISTORY_FOR_TESTS = MAX_RELIABILITY_HISTORY_PER_ARCHETYPE;
