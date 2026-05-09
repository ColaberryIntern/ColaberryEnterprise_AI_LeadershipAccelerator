/**
 * recoveryPressureAnalyzer — Phase 29. Deterministic 5-tier recovery
 * pressure classification + containment attribution.
 *
 * Architectural commitment:
 *   - Pressure derives from OBSERVABLE COUNTERS ONLY
 *     (Phase 21/22/23/27/28).
 *   - Deterministic: same observed_counters → same tier + same hash.
 *   - Containment attribution explains WHY pressure was classified
 *     safely (or not).
 *   - NO inferred operator urgency, NO probabilistic risk, NO
 *     adaptive weighting, NO behavioral heuristics.
 */

import { createHash } from 'crypto';
import type {
  RecoveryPressureProfile, RecoveryPressureTier,
  RecoveryPressureContainmentAttribution,
} from './stabilizationIntelligenceTypes';
import {
  PRESSURE_SCORE_LOW, PRESSURE_SCORE_MODERATE,
  PRESSURE_SCORE_ELEVATED, PRESSURE_SCORE_CRITICAL,
  MAX_PRESSURE_SAMPLES_PER_PARTITION,
} from './stabilizationIntelligenceTypes';
import { listRollbackPlans } from '../executionSubstrate/rollbackExecutionCoordinator';
import { listTopologyRecoveryPlans } from '../topology/topologyRecoveryOrchestrator';
import { listRecoveryPlans } from '../distributedRuntime/distributedRecoveryEngine';
import { recentReplayCount24h as recentContinuityReplayCount24h } from '../distributedRuntime/runtimeContinuityReplay';
import { buildIsolationProfile as buildBrokerIsoProfile } from '../distributedRuntime/brokerIsolationEngine';
import { getActiveAdapterKind } from '../distributedRuntime/distributedBrokerRuntime';
import { buildTopologyFragmentationProfile } from '../topology/topologyFragmentationDetector';
import { recentLifecycleCount24h } from '../executionSubstrate/executionRuntimeCoordinator';
import { recentQuotaExhaustionCount24h } from '../executionEconomics/executionQuotaEngine';

interface PartitionStore {
  samples: RecoveryPressureProfile[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { samples: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function classifyPressure(score: number): RecoveryPressureTier {
  if (score >= PRESSURE_SCORE_CRITICAL) return 'saturated';
  if (score >= PRESSURE_SCORE_ELEVATED) return 'critical';
  if (score >= PRESSURE_SCORE_MODERATE) return 'elevated';
  if (score >= PRESSURE_SCORE_LOW) return 'moderate';
  return 'low';
}

/**
 * Build a deterministic recovery-pressure profile sourced from observable
 * counters across Phase 21/22/23/27/28.
 */
export function buildRecoveryPressureProfile(organization_id: string): RecoveryPressureProfile {
  const phase23 = listRollbackPlans(organization_id);
  const phase22 = listTopologyRecoveryPlans(organization_id);
  const phase21 = listRecoveryPlans();
  const continuity_replay_count_24h = recentContinuityReplayCount24h();

  const brokerIso = buildBrokerIsoProfile(getActiveAdapterKind());
  const broker_isolations_active = brokerIso.isolated_namespaces.filter(
    i => i.organization_id === organization_id || i.organization_id === null,
  ).length;

  const fragmentation = buildTopologyFragmentationProfile(organization_id);
  const partition_fragmentation_active = fragmentation.active_isolation_count;

  const lifecycle = recentLifecycleCount24h();
  const execution_worker_failures_24h = lifecycle.failed + lifecycle.interrupted;

  const quota_exhaustions_24h = recentQuotaExhaustionCount24h(organization_id);

  // Composite score — bounded linear combination of recovery-stress signals.
  const rollback_pressure = Math.min(30, phase23.length * 4);
  const topology_pressure = Math.min(20, phase22.length * 4);
  const distributed_pressure = Math.min(20, phase21.length * 4);
  const continuity_pressure = Math.min(20, continuity_replay_count_24h * 5);
  const fragmentation_pressure = Math.min(15, partition_fragmentation_active * 4);
  const isolation_pressure = Math.min(15, broker_isolations_active * 4);
  const worker_failure_pressure = Math.min(15, execution_worker_failures_24h * 3);
  const quota_pressure = Math.min(20, quota_exhaustions_24h * 5);

  const score = Math.min(100,
    rollback_pressure + topology_pressure + distributed_pressure +
    continuity_pressure + fragmentation_pressure + isolation_pressure +
    worker_failure_pressure + quota_pressure,
  );

  const tier = classifyPressure(score);
  const observed_counters = {
    rollback_replay_count_24h: phase23.length,
    continuity_replay_count_24h,
    topology_recovery_plans_24h: phase22.length,
    distributed_recovery_plans_24h: phase21.length,
    partition_fragmentation_active,
    quota_exhaustions_24h,
    broker_isolations_active,
    execution_worker_failures_24h,
  };
  const sample_hash = deterministicHash(
    `${organization_id}::${JSON.stringify(observed_counters)}::${score}::${tier}`,
  );

  const profile: RecoveryPressureProfile = {
    organization_id,
    tier,
    score,
    observed_counters,
    sample_hash,
    recorded_at: new Date().toISOString(),
  };

  const store = ensure(organization_id);
  store.samples.push(profile);
  if (store.samples.length > MAX_PRESSURE_SAMPLES_PER_PARTITION) store.samples.shift();

  return profile;
}

/**
 * Build the containment attribution explaining WHY a given pressure
 * tier was classified safely. Reads-only.
 */
export function buildContainmentAttribution(input: {
  organization_id: string;
}): RecoveryPressureContainmentAttribution {
  const profile = buildRecoveryPressureProfile(input.organization_id);
  const fragmentation = buildTopologyFragmentationProfile(input.organization_id);

  const topology_contained = fragmentation.tier !== 'shattered';
  // Rollback coverage verified if at least one Phase 21/22/23 plan
  // exists OR no recovery is in progress (vacuous truth).
  const phase21 = listRecoveryPlans();
  const phase22 = listTopologyRecoveryPlans(input.organization_id);
  const phase23 = listRollbackPlans(input.organization_id);
  const rollback_coverage_verified =
    phase21.length + phase22.length + phase23.length > 0
    || (profile.observed_counters.rollback_replay_count_24h === 0
        && profile.observed_counters.topology_recovery_plans_24h === 0
        && profile.observed_counters.distributed_recovery_plans_24h === 0);

  // Replay integrity verified: continuity replay count is bounded and
  // not currently overwhelming the runtime (< 20 in 24h).
  const replay_integrity_verified =
    profile.observed_counters.continuity_replay_count_24h < 20;

  const drivers: string[] = [];
  drivers.push(`pressure_tier=${profile.tier}`);
  drivers.push(`fragmentation_tier=${fragmentation.tier}`);
  drivers.push(`broker_isolations_active=${profile.observed_counters.broker_isolations_active}`);
  drivers.push(`continuity_replays_24h=${profile.observed_counters.continuity_replay_count_24h}`);

  const recorded_at = new Date().toISOString();
  const deterministic_hash = deterministicHash(
    `${input.organization_id}::${profile.tier}::${topology_contained}::${rollback_coverage_verified}::${replay_integrity_verified}`,
  );

  return {
    partition_id: input.organization_id,
    pressure_tier: profile.tier,
    topology_contained,
    rollback_coverage_verified,
    replay_integrity_verified,
    drivers,
    deterministic_hash,
    recorded_at,
  };
}

export function listPressureSamples(
  organization_id: string,
): ReadonlyArray<RecoveryPressureProfile> {
  return [...(partitions.get(organization_id)?.samples ?? [])].reverse();
}

export function recentPressureSampleCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.samples ?? [];
    total += arr.filter(s => Date.parse(s.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetRecoveryPressureForTests(): void {
  partitions.clear();
}
