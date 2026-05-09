/**
 * runtimePressureGovernor — Phase 28. Deterministic 5-tier pressure
 * classification derived from observable counters ONLY.
 *
 * Architectural commitment:
 *   - Pressure is OBSERVATION, not authority.
 *   - Sources MUST be observable counters: Phase 21 broker isolations,
 *     Phase 22 fragmentation, Phase 23 worker failures, Phase 27
 *     envelopes/executions/refusals/timeouts/expirations.
 *   - NO inferred operator intent, NO probabilistic prediction,
 *     NO behavioral heuristics.
 *   - Deterministic: same observed_counters → same tier + same hash.
 */

import { createHash } from 'crypto';
import type {
  RuntimePressureProfile, DelegatedPressureTier,
} from './executionEconomicsTypes';
import {
  PRESSURE_SCORE_LOW, PRESSURE_SCORE_MODERATE,
  PRESSURE_SCORE_ELEVATED, PRESSURE_SCORE_CRITICAL,
  MAX_PRESSURE_SAMPLES_PER_PARTITION,
} from './executionEconomicsTypes';
import {
  recentEnvelopeCount24h,
} from '../delegatedExecution/authorityEnvelopeEngine';
import {
  recentExecutionCount24h, recentRefusalCount24h,
  recentTimeoutCount24h, recentExpirationCount24h,
} from '../delegatedExecution/delegatedExecutionCoordinator';
import { buildIsolationProfile as buildBrokerIsoProfile } from '../distributedRuntime/brokerIsolationEngine';
import { getActiveAdapterKind } from '../distributedRuntime/distributedBrokerRuntime';
import { buildTopologyFragmentationProfile } from '../topology/topologyFragmentationDetector';
import { recentLifecycleCount24h } from '../executionSubstrate/executionRuntimeCoordinator';

interface PartitionStore {
  samples: RuntimePressureProfile[];
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

function classifyPressure(score: number): DelegatedPressureTier {
  if (score >= PRESSURE_SCORE_CRITICAL) return 'saturated';
  if (score >= PRESSURE_SCORE_ELEVATED) return 'critical';
  if (score >= PRESSURE_SCORE_MODERATE) return 'elevated';
  if (score >= PRESSURE_SCORE_LOW) return 'moderate';
  return 'low';
}

/**
 * Build a deterministic pressure profile for an organization. Reads
 * observable counters across Phase 21/22/23/27 and computes a 0–100
 * composite score with deterministic tier mapping.
 */
export function buildRuntimePressureProfile(organization_id: string): RuntimePressureProfile {
  const envelopes = recentEnvelopeCount24h(organization_id);
  const executions = recentExecutionCount24h(organization_id);
  const refusals = recentRefusalCount24h(organization_id);
  const timeouts = recentTimeoutCount24h(organization_id);
  const expirations = recentExpirationCount24h(organization_id);

  const brokerIso = buildBrokerIsoProfile(getActiveAdapterKind());
  const broker_isolations_active = brokerIso.isolated_namespaces.filter(
    i => i.organization_id === organization_id || i.organization_id === null,
  ).length;

  const fragmentation = buildTopologyFragmentationProfile(organization_id);
  const topology_fragmentations_active = fragmentation.active_isolation_count;

  const lifecycle = recentLifecycleCount24h();
  const execution_worker_failures_24h = lifecycle.failed + lifecycle.interrupted;

  // Composite score: deterministic linear combination of observable signals.
  // Each component bounded; sum capped at 100.
  // - refusals + timeouts dominate (signal of stress)
  // - broker_isolations + topology_fragmentation are second-order
  // - executions/envelopes are activity, not pressure (mild contribution)
  const refusal_pressure = Math.min(40, refusals * 4);
  const timeout_pressure = Math.min(30, timeouts * 6);
  const expiration_pressure = Math.min(15, expirations * 3);
  const isolation_pressure = Math.min(20, broker_isolations_active * 5);
  const fragmentation_pressure = Math.min(15, topology_fragmentations_active * 3);
  const worker_failure_pressure = Math.min(15, execution_worker_failures_24h * 3);
  // Activity is a weak signal — only contributes if both envelopes and
  // executions are unusually high.
  const activity_pressure =
    envelopes >= 30 || executions >= 20 ? Math.min(10, Math.floor(envelopes / 6)) : 0;

  const score = Math.min(100,
    refusal_pressure +
    timeout_pressure +
    expiration_pressure +
    isolation_pressure +
    fragmentation_pressure +
    worker_failure_pressure +
    activity_pressure,
  );

  const tier = classifyPressure(score);
  const recorded_at = new Date().toISOString();

  const observed_counters = {
    envelopes_24h: envelopes,
    executions_24h: executions,
    refusals_24h: refusals,
    timeouts_24h: timeouts,
    expirations_24h: expirations,
    broker_isolations_active,
    topology_fragmentations_active,
    execution_worker_failures_24h,
  };
  const sample_hash = deterministicHash(
    `${organization_id}::${JSON.stringify(observed_counters)}::${score}::${tier}`,
  );

  const profile: RuntimePressureProfile = {
    organization_id,
    tier,
    score,
    observed_counters,
    sample_hash,
    recorded_at,
  };

  // Record sample (bounded ring buffer).
  const store = ensure(organization_id);
  store.samples.push(profile);
  if (store.samples.length > MAX_PRESSURE_SAMPLES_PER_PARTITION) store.samples.shift();

  return profile;
}

export function listPressureSamples(
  organization_id: string,
): ReadonlyArray<RuntimePressureProfile> {
  return [...(partitions.get(organization_id)?.samples ?? [])].reverse();
}

export function recentPressureSampleCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const samples = partitions.get(o)?.samples ?? [];
    total += samples.filter(s => Date.parse(s.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetPressureGovernorForTests(): void {
  partitions.clear();
}
