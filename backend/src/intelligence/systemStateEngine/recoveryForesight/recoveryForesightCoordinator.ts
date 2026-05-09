/**
 * recoveryForesightCoordinator — Phase 30. Read-only top-level
 * composite + 5-hash boundary proof chain.
 *
 * Architectural commitment:
 *   - PURE READ-ONLY composite. No mutation, no side effects.
 *   - 5-hash boundary proof chain: comparison + survivability +
 *     tradeoff + archaeology + replay.
 *   - Operators verify same stabilization inputs == same comparison
 *     outputs via the chain.
 */

import { createHash } from 'crypto';
import type {
  DecisionBoundaryProofChain,
  StabilizationDecisionComparisonProfile,
  RollbackSurvivabilityComparison,
  ContinuityTradeoffProfile,
  RecoveryArchaeologyReplayTrace,
} from './recoveryForesightTypes';
import { buildStabilizationDecisionComparison } from './stabilizationDecisionEngine';
import { buildRollbackSurvivabilityComparison } from './rollbackSurvivabilityComparator';
import { buildContinuityTradeoffProfile } from './continuityTradeoffAnalyzer';
import { buildRecoveryArchaeologyReplay } from './recoveryArchaeologyReplay';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildCompositeInput {
  readonly organization_id: string;
  readonly operator_id: string;
  readonly archetype_ids?: ReadonlyArray<string>;
}

export interface RecoveryForesightComposite {
  readonly organization_id: string;
  readonly comparison: StabilizationDecisionComparisonProfile;
  readonly survivability: RollbackSurvivabilityComparison;
  readonly tradeoff: ContinuityTradeoffProfile;
  readonly archaeology: RecoveryArchaeologyReplayTrace;
  readonly boundary_proof_chain: DecisionBoundaryProofChain;
  readonly built_at: string;
}

export function buildRecoveryForesightComposite(
  input: BuildCompositeInput,
): RecoveryForesightComposite {
  const comparison = buildStabilizationDecisionComparison({
    organization_id: input.organization_id,
    operator_id: input.operator_id,
    archetype_ids: input.archetype_ids,
  });
  const survivability = buildRollbackSurvivabilityComparison({
    organization_id: input.organization_id,
    archetype_ids: input.archetype_ids,
  });
  const tradeoff = buildContinuityTradeoffProfile({
    organization_id: input.organization_id,
    archetype_ids: input.archetype_ids,
  });
  const archaeology = buildRecoveryArchaeologyReplay({
    organization_id: input.organization_id,
  });

  const replay_hash = deterministicHash(
    `${comparison.comparison_hash}::${survivability.survivability_hash}::${tradeoff.tradeoff_hash}::${archaeology.archaeology_hash}`,
  );

  const boundary_proof_chain: DecisionBoundaryProofChain = {
    comparison_hash: comparison.comparison_hash,
    survivability_hash: survivability.survivability_hash,
    tradeoff_hash: tradeoff.tradeoff_hash,
    archaeology_hash: archaeology.archaeology_hash,
    replay_hash,
  };

  return {
    organization_id: input.organization_id,
    comparison, survivability, tradeoff, archaeology,
    boundary_proof_chain,
    built_at: new Date().toISOString(),
  };
}
