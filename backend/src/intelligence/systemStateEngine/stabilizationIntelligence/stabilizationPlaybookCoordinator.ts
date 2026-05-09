/**
 * stabilizationPlaybookCoordinator — Phase 29. Read-only top-level
 * composite + 5-hash boundary proof chain.
 *
 * Architectural commitment:
 *   - PURE READ-ONLY composite. No mutation, no side effects.
 *   - 5-hash boundary proof chain enables operators to verify
 *     same stabilization inputs == same recommendation outputs.
 *   - Composite tier classification is deterministic from observable
 *     state.
 */

import { createHash } from 'crypto';
import type {
  StabilizationBoundaryProofChain, StabilizationTier,
  RecoveryPressureProfile, RecoveryPressureContainmentAttribution,
  RecoveryArchetypeProfile, RollbackSequencingProfile,
  ContinuityRestorationForecast,
} from './stabilizationIntelligenceTypes';
import { listArchetypes } from './recoveryArchetypeRegistry';
import {
  buildRecoveryPressureProfile, buildContainmentAttribution,
} from './recoveryPressureAnalyzer';
import { buildRollbackSequencing } from './rollbackSequencingEngine';
import { buildContinuityRestorationForecast } from './continuityRestorationForecaster';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface StabilizationComposite {
  readonly organization_id: string;
  readonly archetype_id?: string;
  readonly archetype?: RecoveryArchetypeProfile;
  readonly sequencing?: RollbackSequencingProfile;
  readonly forecast?: ContinuityRestorationForecast;
  readonly pressure: RecoveryPressureProfile;
  readonly containment: RecoveryPressureContainmentAttribution;
  readonly tier: StabilizationTier;
  readonly boundary_proof_chain: StabilizationBoundaryProofChain;
  readonly built_at: string;
}

export interface BuildCompositeInput {
  readonly organization_id: string;
  readonly archetype_id?: string;
}

/**
 * Composite tier classification:
 *   - failing: pressure tier saturated AND quota exhaustions present
 *   - critical: pressure tier saturated OR critical
 *   - strained: pressure tier elevated
 *   - recovering: pressure tier moderate AND ≥1 active recovery plan
 *   - stable: otherwise
 */
function classifyStabilizationTier(
  pressure: RecoveryPressureProfile,
): StabilizationTier {
  const counters = pressure.observed_counters;
  if (pressure.tier === 'saturated' && counters.quota_exhaustions_24h > 0) return 'failing';
  if (pressure.tier === 'saturated' || pressure.tier === 'critical') return 'critical';
  if (pressure.tier === 'elevated') return 'strained';
  if (pressure.tier === 'moderate'
      && (counters.rollback_replay_count_24h > 0
          || counters.topology_recovery_plans_24h > 0
          || counters.distributed_recovery_plans_24h > 0)) {
    return 'recovering';
  }
  return 'stable';
}

export function buildStabilizationComposite(
  input: BuildCompositeInput,
): StabilizationComposite {
  const pressure = buildRecoveryPressureProfile(input.organization_id);
  const containment = buildContainmentAttribution({ organization_id: input.organization_id });
  const tier = classifyStabilizationTier(pressure);

  let archetype: RecoveryArchetypeProfile | undefined;
  let sequencing: RollbackSequencingProfile | undefined;
  let forecast: ContinuityRestorationForecast | undefined;

  if (input.archetype_id) {
    archetype = listArchetypes(input.organization_id).find(a => a.archetype_id === input.archetype_id);
    if (archetype) {
      const seqResult = buildRollbackSequencing({
        organization_id: input.organization_id,
        archetype_id: input.archetype_id,
      });
      if (seqResult.built) sequencing = seqResult.profile;

      const fcResult = buildContinuityRestorationForecast({
        organization_id: input.organization_id,
        archetype_id: input.archetype_id,
      });
      if (fcResult.built) forecast = fcResult.forecast;
    }
  }

  const boundary_proof_chain: StabilizationBoundaryProofChain = {
    archetype_hash: archetype?.deterministic_hash ?? '_no_archetype_',
    sequencing_hash: sequencing?.sequencing_hash ?? '_no_sequencing_',
    forecast_hash: forecast?.forecast_hash ?? '_no_forecast_',
    pressure_hash: pressure.sample_hash,
    replay_hash: deterministicHash(
      `${archetype?.deterministic_hash ?? '_'}::${sequencing?.sequencing_hash ?? '_'}::${forecast?.forecast_hash ?? '_'}::${pressure.sample_hash}`,
    ),
  };

  return {
    organization_id: input.organization_id,
    archetype_id: input.archetype_id,
    archetype,
    sequencing,
    forecast,
    pressure,
    containment,
    tier,
    boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}
