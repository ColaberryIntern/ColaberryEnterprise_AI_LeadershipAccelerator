/**
 * federatedEffectivenessTracker — Phase 20. Refines federated archetype
 * effectiveness using REAL observed outcomes from local applications.
 *
 * Architectural commitment (per the Phase 20 stress-test):
 *   - Refinement is DETERMINISTIC update rules over observed outcomes.
 *     NO ML, NO probabilistic models, NO predictive scoring.
 *   - Inputs: outcome observations from `FederationConsumptionAttribution`
 *     (Phase 19) + Phase 19's `CalibrationImpactReplay` deltas.
 *   - Outputs: `FederatedEffectivenessProfile` per archetype with moving
 *     averages over the last MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE
 *     observations.
 *   - Storage: persisted via the broker adapter so future Redis/DB
 *     swaps don't change the contract.
 */

import type {
  FederatedEffectivenessObservation, FederatedEffectivenessProfile,
  RefinementSignal,
} from './federatedLearningTypes';
import {
  MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE,
} from './federatedLearningTypes';
import { getBrokerAdapter, BROKER_NAMESPACES } from './persistentFederationBroker';

interface StoredEffectivenessState {
  observations: FederatedEffectivenessObservation[];
  confidence_history: Array<{ recorded_at: string; value: number }>;
}

const STORE_NAMESPACE = BROKER_NAMESPACES.effectiveness;

export interface RecordOutcomeInput {
  readonly organization_id: string;
  readonly archetype_signature: string;
  readonly signal: RefinementSignal;
  readonly stabilization_delta: number;
  readonly propagation_reduction: number;
  readonly recovery_succeeded: boolean;
  readonly anomaly_observed: boolean;
  /** Optional originating project — when present, an audit row is
   *  written with this project_id. When absent, the audit is skipped
   *  (counters still update); avoids notNull violations on org-scoped
   *  refreshes. */
  readonly originating_project_id?: string;
}

export async function recordOutcomeObservation(input: RecordOutcomeInput): Promise<void> {
  const broker = getBrokerAdapter();
  const existing = await broker.get<StoredEffectivenessState>(input.organization_id, STORE_NAMESPACE, input.archetype_signature);
  const state: StoredEffectivenessState = existing ?? { observations: [], confidence_history: [] };

  const observation: FederatedEffectivenessObservation = {
    archetype_signature: input.archetype_signature,
    observed_at: new Date().toISOString(),
    signal: input.signal,
    stabilization_delta: input.stabilization_delta,
    propagation_reduction: input.propagation_reduction,
    recovery_succeeded: input.recovery_succeeded,
    anomaly_observed: input.anomaly_observed,
  };

  state.observations.push(observation);
  // Bounded — drop oldest when cap exceeded.
  if (state.observations.length > MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE) state.observations.shift();

  // Track confidence evolution: append a snapshot value so the profile
  // can render an evolution series.
  const profileNow = computeProfile(input.archetype_signature, state);
  state.confidence_history.push({ recorded_at: observation.observed_at, value: profileNow.organizational_consistency });
  if (state.confidence_history.length > MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE) state.confidence_history.shift();

  await broker.put(input.organization_id, STORE_NAMESPACE, input.archetype_signature, state);

  // Audit row + event (skipped when no originating_project_id is supplied)
  await writeAudit(input.organization_id, observation, input.originating_project_id ?? null);
}

export async function readEffectivenessProfile(organization_id: string, archetype_signature: string): Promise<FederatedEffectivenessProfile | null> {
  const state = await getBrokerAdapter().get<StoredEffectivenessState>(organization_id, STORE_NAMESPACE, archetype_signature);
  if (!state) return null;
  return computeProfile(archetype_signature, state);
}

export async function listEffectivenessProfiles(organization_id: string): Promise<ReadonlyArray<FederatedEffectivenessProfile>> {
  const broker = getBrokerAdapter();
  const keys = await broker.listKeys(organization_id, STORE_NAMESPACE);
  const out: FederatedEffectivenessProfile[] = [];
  for (const key of keys) {
    const state = await broker.get<StoredEffectivenessState>(organization_id, STORE_NAMESPACE, key);
    if (state) out.push(computeProfile(key, state));
  }
  return out.sort((a, b) => b.organizational_consistency - a.organizational_consistency);
}

function computeProfile(archetype_signature: string, state: StoredEffectivenessState): FederatedEffectivenessProfile {
  const obs = state.observations;
  const n = obs.length;
  if (n === 0) {
    return {
      archetype_signature,
      observed_stabilization_delta: 0,
      propagation_reduction: 0,
      recovery_success_rate: 100,        // cold-start
      anomaly_frequency: 0,
      organizational_consistency: 50,    // cold-start neutral
      confidence_evolution: [],
      built_at: new Date().toISOString(),
    };
  }
  const stabilizationAvg = Math.round(obs.reduce((s, o) => s + o.stabilization_delta, 0) / n);
  const propagationAvg = Math.round(obs.reduce((s, o) => s + o.propagation_reduction, 0) / n);
  const recoveryCount = obs.filter(o => o.recovery_succeeded).length;
  const recovery_success_rate = Math.round((recoveryCount / n) * 100);
  const anomalyCount = obs.filter(o => o.anomaly_observed).length;
  const anomaly_frequency = Math.round((anomalyCount / n) * 100);
  // Organizational consistency: low stddev in stabilization delta + high
  // recovery rate + low anomaly frequency = high consistency.
  const stabilizationMean = obs.reduce((s, o) => s + o.stabilization_delta, 0) / n;
  const stabilizationVariance = obs.reduce((s, o) => s + (o.stabilization_delta - stabilizationMean) ** 2, 0) / n;
  const stabilizationStddev = Math.sqrt(stabilizationVariance);
  const consistencyFromStddev = Math.max(0, 100 - Math.round(stabilizationStddev * 2));
  const organizational_consistency = Math.max(0, Math.min(100, Math.round(
    (consistencyFromStddev * 0.5) + (recovery_success_rate * 0.3) + ((100 - anomaly_frequency) * 0.2),
  )));
  return {
    archetype_signature,
    observed_stabilization_delta: stabilizationAvg,
    propagation_reduction: propagationAvg,
    recovery_success_rate,
    anomaly_frequency,
    organizational_consistency,
    confidence_evolution: [...state.confidence_history],
    built_at: new Date().toISOString(),
  };
}

async function writeAudit(organization_id: string, observation: FederatedEffectivenessObservation, originating_project_id: string | null): Promise<void> {
  // Audit row requires a non-null project_id. When the caller doesn't
  // supply one (pure analytical refresh), skip the audit; counters
  // still carry the activity via `federated_learning_summary`.
  if (!originating_project_id) return;
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: originating_project_id,
      kind: 'federated_effectiveness_updated',
      subject_id: observation.archetype_signature,
      payload: { organization_id, ...observation },
      operator_id: null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[federatedEffectivenessTracker] audit write failed:', err?.message);
  }
}

export const _MAX_REFINEMENT_OBSERVATIONS_FOR_TESTS = MAX_REFINEMENT_OBSERVATIONS_PER_ARCHETYPE;
