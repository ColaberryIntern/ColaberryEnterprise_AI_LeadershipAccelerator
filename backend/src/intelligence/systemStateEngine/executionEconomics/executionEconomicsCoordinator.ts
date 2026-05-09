/**
 * executionEconomicsCoordinator — Phase 28. Read-only top-level
 * composite that combines quota + pressure + load + forecast + tier
 * classification + boundary-proof chain.
 *
 * Architectural commitment:
 *   - PURE READ-ONLY composite. No mutation, no side effects, no
 *     decisions, no authority changes.
 *   - All component snapshots are deterministic functions of observable
 *     state at sample time.
 */

import { createHash } from 'crypto';
import type {
  ExecutionEconomicsTier, ExecutionEconomicsBoundaryProofChain,
  ExecutionEconomicsReplay, EconomicsReplayDeterminismAttribution,
} from './executionEconomicsTypes';
import { buildExecutionQuotaProfile, listQuotaGovernanceAttributions, listQuotaExhaustions } from './executionQuotaEngine';
import { buildRuntimePressureProfile } from './runtimePressureGovernor';
import { buildTopologyLoadDistributionProfile } from './topologyLoadDistributionProfiler';
import { buildRollbackResourceForecast } from './rollbackResourceForecaster';
import { classifyEconomicsTier } from './delegatedPressureClassifier';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildEconomicsCompositeInput {
  readonly organization_id: string;
}

export interface EconomicsComposite {
  readonly organization_id: string;
  readonly tier: ExecutionEconomicsTier;
  readonly quota: ReturnType<typeof buildExecutionQuotaProfile>;
  readonly pressure: ReturnType<typeof buildRuntimePressureProfile>;
  readonly topology_load: ReturnType<typeof buildTopologyLoadDistributionProfile>;
  readonly rollback_forecast: ReturnType<typeof buildRollbackResourceForecast>;
  readonly boundary_proof_chain: ExecutionEconomicsBoundaryProofChain;
  readonly built_at: string;
}

export function buildEconomicsComposite(
  input: BuildEconomicsCompositeInput,
): EconomicsComposite {
  const quota = buildExecutionQuotaProfile(input.organization_id);
  const pressure = buildRuntimePressureProfile(input.organization_id);
  const topology_load = buildTopologyLoadDistributionProfile(input.organization_id);
  const rollback_forecast = buildRollbackResourceForecast(input.organization_id);
  const tier = classifyEconomicsTier({ pressure, quota });

  const boundary_proof_chain: ExecutionEconomicsBoundaryProofChain = {
    quota_hash: quota.deterministic_hash,
    pressure_hash: pressure.sample_hash,
    topology_load_hash: topology_load.distribution_hash,
    rollback_forecast_hash: rollback_forecast.forecast_hash,
    replay_hash: deterministicHash(
      `${quota.deterministic_hash}::${pressure.sample_hash}::${topology_load.distribution_hash}::${rollback_forecast.forecast_hash}`,
    ),
  };

  return {
    organization_id: input.organization_id,
    tier,
    quota,
    pressure,
    topology_load,
    rollback_forecast,
    boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}

/** Build the read-only replay bundle. */
export function buildExecutionEconomicsReplay(input: { organization_id: string }): ExecutionEconomicsReplay {
  const composite = buildEconomicsComposite({ organization_id: input.organization_id });
  const determinism_attribution: EconomicsReplayDeterminismAttribution = {
    organization_id: input.organization_id,
    counter_snapshot_hash: composite.pressure.sample_hash,
    quota_snapshot_hash: composite.quota.deterministic_hash,
    pressure_sample_hash: composite.pressure.sample_hash,
    load_snapshot_hash: composite.topology_load.distribution_hash,
    forecast_snapshot_hash: composite.rollback_forecast.forecast_hash,
    composite_hash: composite.boundary_proof_chain.replay_hash,
    recorded_at: new Date().toISOString(),
  };
  return {
    organization_id: input.organization_id,
    quota_profile: composite.quota,
    pressure_profile: composite.pressure,
    topology_load: composite.topology_load,
    rollback_forecast: composite.rollback_forecast,
    recent_quota_governance: listQuotaGovernanceAttributions(input.organization_id).slice(0, 25),
    recent_quota_exhaustions: listQuotaExhaustions(input.organization_id).slice(0, 25),
    determinism_attribution,
    boundary_proof_chain: composite.boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}

/**
 * Verify replay determinism by re-running snapshots and comparing
 * boundary-proof-chain hashes. Read-only.
 */
export function verifyEconomicsReplayDeterminism(input: {
  organization_id: string;
  expected_replay_hash: string;
}): { deterministic: boolean; actual_replay_hash: string } {
  const composite = buildEconomicsComposite({ organization_id: input.organization_id });
  return {
    deterministic: composite.boundary_proof_chain.replay_hash === input.expected_replay_hash,
    actual_replay_hash: composite.boundary_proof_chain.replay_hash,
  };
}
