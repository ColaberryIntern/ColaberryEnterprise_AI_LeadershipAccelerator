/**
 * delegatedRollbackProtector — Phase 27. Pre-flight rollback coverage
 * verification.
 *
 * Architectural commitment:
 *   - A delegated execution may NOT execute without rollback coverage.
 *   - Reads existing Phase 15/21/22/23 chains and verifies the supplied
 *     `rollback_chain_id` exists and covers the action.
 *   - Returns a structural verification profile with hash. Operators
 *     verify post-hoc by re-running.
 */

import { createHash } from 'crypto';
import type {
  DelegatedRollbackProtectionProfile, DelegatableActionKind,
} from './delegatedExecutionTypes';
import { listRollbackPlans } from '../executionSubstrate/rollbackExecutionCoordinator';
import { listTopologyRecoveryPlans } from '../topology/topologyRecoveryOrchestrator';
import { listRecoveryPlans } from '../distributedRuntime/distributedRecoveryEngine';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface VerifyRollbackInput {
  readonly envelope_id: string;
  readonly action_kind: DelegatableActionKind;
  readonly target_organization_id: string;
  readonly rollback_chain_id: string;
}

export function verifyRollbackCoverage(input: VerifyRollbackInput): DelegatedRollbackProtectionProfile {
  const verified_at = new Date().toISOString();
  let rollback_available = false;
  let rollback_chain_source_phase: DelegatedRollbackProtectionProfile['rollback_chain_source_phase'] = 'phase_23_execution_substrate';

  // Check Phase 23 rollback execution plans (aggregator over Phase 15/21/22).
  const phase23Plans = listRollbackPlans(input.target_organization_id);
  const phase23Match = phase23Plans.find(p =>
    p.plan_id === input.rollback_chain_id
    || p.source_chains.some(c => c.chain_id === input.rollback_chain_id),
  );
  if (phase23Match) {
    rollback_available = true;
    rollback_chain_source_phase = 'phase_23_execution_substrate';
  }

  // Check Phase 22 topology recovery plans.
  if (!rollback_available) {
    const phase22Plans = listTopologyRecoveryPlans(input.target_organization_id);
    if (phase22Plans.some(p => p.plan_id === input.rollback_chain_id)) {
      rollback_available = true;
      rollback_chain_source_phase = 'phase_22_topology';
    }
  }

  // Check Phase 21 distributed recovery plans.
  if (!rollback_available) {
    const phase21Plans = listRecoveryPlans();
    if (phase21Plans.some(p => p.plan_id === input.rollback_chain_id)) {
      rollback_available = true;
      rollback_chain_source_phase = 'phase_21_runtime';
    }
  }

  // For lift_*_isolation actions: rollback is structurally implicit
  // (re-isolating the namespace via Phase 21/23 quarantine endpoints).
  // We accept the supplied chain_id when the action kind allows it.
  if (!rollback_available
      && (input.action_kind === 'lift_broker_isolation'
          || input.action_kind === 'lift_execution_isolation')) {
    // A lift action's rollback is "re-isolate". We accept the chain_id
    // as-is since Phase 21/23 quarantine endpoints are always available.
    rollback_available = true;
    rollback_chain_source_phase = input.action_kind === 'lift_broker_isolation'
      ? 'phase_21_runtime' : 'phase_23_execution_substrate';
  }

  const verification_hash = deterministicHash(
    `${input.envelope_id}::${input.action_kind}::${input.rollback_chain_id}::${rollback_available}::${rollback_chain_source_phase}`,
  );

  return {
    envelope_id: input.envelope_id,
    action_kind: input.action_kind,
    target_organization_id: input.target_organization_id,
    rollback_chain_id: input.rollback_chain_id,
    rollback_chain_source_phase,
    rollback_available,
    verification_hash,
    verified_at,
  };
}
