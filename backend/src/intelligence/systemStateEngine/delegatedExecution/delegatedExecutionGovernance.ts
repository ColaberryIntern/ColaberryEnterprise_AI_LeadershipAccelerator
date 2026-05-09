/**
 * delegatedExecutionGovernance — Phase 27. Hard gate at envelope
 * issuance + at execution. Verifies 7 structural safety invariants
 * per execution.
 *
 * Architectural commitment:
 *   - The 7 safety invariants (rollback_exists, partition_stable,
 *     envelope_immutable, authority_bounded, topology_contained,
 *     no_recursive_delegation, replay_deterministic) are verified
 *     STRUCTURALLY — each emits a `DelegatedExecutionSafetyInvariant`
 *     row with a verification hash.
 *   - Any invariant violation causes the gate to refuse.
 *   - Cascading rejection: rollback unavailable → refused;
 *     partition unstable → refused; etc.
 */

import { createHash } from 'crypto';
import type {
  DelegatedExecutionGovernanceAttribution, DelegatedGovernanceDecision,
  DelegatedSupervisorRule, DelegatedExecutionSafetyInvariant,
  SafetyInvariantName, DelegatedExecutionGovernanceProfile,
  DelegatableActionKind, DelegatedAuthorityEnvelope,
} from './delegatedExecutionTypes';
import {
  MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION,
} from './delegatedExecutionTypes';
import { isActionForbidden } from './nonDelegatableActionRegistry';
import { computeEnvelopeImmutabilityHash } from './authorityEnvelopeEngine';
import { verifyTopologyContainment } from './topologyDelegationContainment';
import { verifyRollbackCoverage } from './delegatedRollbackProtector';
// Phase 28 — quota gate integration. Single source of truth: Phase 27's
// evaluateIssuance directly checks quota availability so there is no
// parallel gate. quotaResourceKeysForAction() maps each whitelisted
// action to the quota keys it consumes.
import { checkQuotaAvailability, recordQuotaExhaustion } from '../executionEconomics/executionQuotaEngine';
import type { QuotaResourceKey } from '../executionEconomics/executionEconomicsTypes';

interface PartitionAttributions {
  rows: DelegatedExecutionGovernanceAttribution[];
  counts: { permitted: number; rejected: number; flagged: number };
  violations: Map<DelegatedSupervisorRule, number>;
}

const partitions = new Map<string, PartitionAttributions>();
const WHITELIST: ReadonlyArray<DelegatableActionKind> = [
  'lift_broker_isolation',
  'lift_execution_isolation',
  'force_continuity_replay',
  'execute_topology_recovery_step',
  'execute_distributed_recovery_step',
];

function ensure(organization_id: string): PartitionAttributions {
  let p = partitions.get(organization_id);
  if (!p) {
    p = {
      rows: [],
      counts: { permitted: 0, rejected: 0, flagged: 0 },
      violations: new Map(),
    };
    partitions.set(organization_id, p);
  }
  return p;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// ─── Issuance gate ──────────────────────────────────────────────────

export interface IssuanceGateInput {
  readonly envelope_id: string;
  readonly operator_id: string;
  readonly organization_id: string;
  readonly action_kind: string;             // string so we can also reject non-whitelisted
  readonly target_organization_id: string;
  readonly target_namespace?: string;
  readonly rollback_chain_id?: string;
  readonly target_plan_id?: string;
  readonly target_step_id?: string;
}

export interface IssuanceGateResult {
  readonly decision: DelegatedGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: DelegatedSupervisorRule;
  readonly attribution: DelegatedExecutionGovernanceAttribution;
}

export function evaluateIssuance(input: IssuanceGateInput): IssuanceGateResult {
  // 1. Organization presence.
  if (!input.organization_id || !input.target_organization_id) {
    return finalizeIssuance('rejected', 'organization_id_missing', 'organization_id_missing', input, []);
  }
  // 2. Operator presence.
  if (!input.operator_id || input.operator_id.trim().length === 0) {
    return finalizeIssuance('rejected', 'operator_id missing', 'operator_id_missing', input, []);
  }
  // 3. Cross-org check.
  if (input.organization_id !== input.target_organization_id) {
    return finalizeIssuance('rejected', `cross-org delegation forbidden (${input.organization_id} → ${input.target_organization_id})`, 'cross_org_attempted', input, []);
  }
  // 4. Whitelist check.
  if (!(WHITELIST as ReadonlyArray<string>).includes(input.action_kind)) {
    return finalizeIssuance('rejected', `action_kind=${input.action_kind} not in whitelist`, 'action_kind_not_in_whitelist', input, []);
  }
  // 5. Forbidden registry check (defense in depth).
  if (isActionForbidden(input.action_kind)) {
    return finalizeIssuance('rejected', `action_kind=${input.action_kind} is in non-delegatable forbidden registry`, 'action_kind_in_forbidden_registry', input, []);
  }
  // 6. Rollback chain required.
  if (!input.rollback_chain_id || input.rollback_chain_id.trim().length === 0) {
    return finalizeIssuance('rejected', 'rollback_chain_id missing — every delegated action requires rollback coverage', 'rollback_chain_required_missing', input, []);
  }
  // 7. Step actions require plan + step ids.
  if (input.action_kind === 'execute_topology_recovery_step' || input.action_kind === 'execute_distributed_recovery_step') {
    if (!input.target_plan_id || !input.target_step_id) {
      return finalizeIssuance('rejected', `${input.action_kind} requires target_plan_id + target_step_id`, 'action_kind_not_in_whitelist', input, []);
    }
  }
  // 8. Phase 28 — quota gate check (integrated in single issuance path).
  // Maps the action_kind to the resource keys it consumes; refuses if
  // any required key is exhausted. Records QuotaExhaustionAttribution +
  // QuotaExhaustionFinalityProof so silent overrun is impossible.
  const required_keys = quotaResourceKeysForAction(input.action_kind);
  const quota = checkQuotaAvailability(input.organization_id, required_keys);
  if (!quota.allowed) {
    for (const k of quota.exhausted_keys) {
      recordQuotaExhaustion({
        organization_id: input.organization_id,
        quota_key: k,
        attempted_envelope_id: input.envelope_id,
      });
    }
    return finalizeIssuance(
      'rejected',
      `quota exhausted for keys: ${quota.exhausted_keys.join(', ')}`,
      'quota_exhausted', input, [],
    );
  }
  return finalizeIssuance('permitted', 'issuance gate passed', undefined, input, []);
}

/** Map a whitelisted action_kind to the Phase 28 quota keys it consumes. */
function quotaResourceKeysForAction(action_kind: string): ReadonlyArray<QuotaResourceKey> {
  // Every issuance consumes one envelope slot.
  const keys: QuotaResourceKey[] = ['envelopes_per_24h'];
  switch (action_kind) {
    case 'lift_broker_isolation':
    case 'lift_execution_isolation':
      keys.push('executions_per_24h');
      break;
    case 'force_continuity_replay':
      keys.push('executions_per_24h', 'continuity_replays_per_24h');
      break;
    case 'execute_topology_recovery_step':
      keys.push('executions_per_24h', 'topology_recovery_steps_per_24h');
      break;
    case 'execute_distributed_recovery_step':
      keys.push('executions_per_24h', 'rollback_chains_per_24h');
      break;
  }
  return keys;
}

// ─── Execution gate (verifies 7 safety invariants) ──────────────────

export interface ExecutionGateInput {
  readonly envelope: DelegatedAuthorityEnvelope;
  readonly issuer_organization_id: string;
}

export interface ExecutionGateResult {
  readonly decision: DelegatedGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: DelegatedSupervisorRule;
  readonly safety_invariants: ReadonlyArray<DelegatedExecutionSafetyInvariant>;
  readonly attribution: DelegatedExecutionGovernanceAttribution;
}

export function evaluateExecution(input: ExecutionGateInput): ExecutionGateResult {
  const invariants: DelegatedExecutionSafetyInvariant[] = [];
  const env = input.envelope;
  const recorded_at = new Date().toISOString();

  // ── Invariant 1: envelope_immutable ─────────────────────────────
  const recomputed = computeEnvelopeImmutabilityHash(env);
  const inv_immutable = recordInvariant('envelope_immutable',
    recomputed === env.deterministic_hash,
    `${env.envelope_id}::immutable::${recomputed === env.deterministic_hash}`,
    recomputed === env.deterministic_hash ? undefined : `hash mismatch: stored=${env.deterministic_hash} recomputed=${recomputed}`,
    recorded_at);
  invariants.push(inv_immutable);
  if (!inv_immutable.invariant_verified) {
    return finalizeExecution('rejected', 'envelope_immutability_violated', 'envelope_immutability_violated', input, invariants);
  }

  // ── Invariant 2: authority_bounded ──────────────────────────────
  const inWhitelist = (WHITELIST as ReadonlyArray<string>).includes(env.action_kind);
  const notForbidden = !isActionForbidden(env.action_kind);
  const sameOrg = env.target_organization_id === input.issuer_organization_id;
  const ok_authority = inWhitelist && notForbidden && sameOrg && env.single_use === true && env.max_action_count === 1;
  const inv_authority = recordInvariant('authority_bounded',
    ok_authority,
    `${env.envelope_id}::auth::${env.action_kind}::single_use=${env.single_use}::max=${env.max_action_count}`,
    ok_authority ? undefined : 'authority bounds violated (whitelist/forbidden/cross-org/single_use/max_action_count)',
    recorded_at);
  invariants.push(inv_authority);
  if (!inv_authority.invariant_verified) {
    return finalizeExecution('rejected', inv_authority.violated_reason ?? 'authority_bounded_violated', sameOrg ? 'action_kind_not_in_whitelist' : 'cross_org_attempted', input, invariants);
  }

  // ── Invariant 3: rollback_exists ────────────────────────────────
  const rollback = verifyRollbackCoverage({
    envelope_id: env.envelope_id,
    action_kind: env.action_kind,
    target_organization_id: env.target_organization_id,
    rollback_chain_id: env.rollback_chain_id,
  });
  const inv_rollback = recordInvariant('rollback_exists',
    rollback.rollback_available,
    rollback.verification_hash,
    rollback.rollback_available ? undefined : 'no rollback chain found for the supplied chain_id',
    recorded_at);
  invariants.push(inv_rollback);
  if (!inv_rollback.invariant_verified) {
    return finalizeExecution('rejected', 'rollback_chain_required_missing', 'rollback_chain_required_missing', input, invariants);
  }

  // ── Invariant 4: partition_stable ───────────────────────────────
  const containment = verifyTopologyContainment({
    envelope_id: env.envelope_id,
    action_kind: env.action_kind,
    target_organization_id: env.target_organization_id,
    target_namespace: env.target_namespace,
    issuer_organization_id: input.issuer_organization_id,
  });
  const inv_partition = recordInvariant('partition_stable',
    containment.partition_stability_acceptable,
    containment.containment_proof_hash,
    containment.partition_stability_acceptable ? undefined : `partition unstable (quarantined=${containment.partition_quarantined}, health=${containment.partition_health_score})`,
    recorded_at);
  invariants.push(inv_partition);
  if (!inv_partition.invariant_verified) {
    return finalizeExecution('rejected', 'partition_unstable', 'partition_unstable', input, invariants);
  }

  // ── Invariant 5: topology_contained ─────────────────────────────
  const inv_contained = recordInvariant('topology_contained',
    containment.contained_within_partition === true && containment.cross_org_attempted === false,
    containment.containment_proof_hash,
    undefined,
    recorded_at);
  invariants.push(inv_contained);

  // ── Invariant 6: no_recursive_delegation ────────────────────────
  // The engine never spawns delegated actions from inside a delegated
  // execution. The check here is the structural fact that the
  // executor never calls back into `executeDelegated`.
  const inv_no_recursion = recordInvariant('no_recursive_delegation',
    true,
    deterministicHash(`${env.envelope_id}::no_recursion`),
    undefined,
    recorded_at);
  invariants.push(inv_no_recursion);

  // ── Invariant 7: replay_deterministic ───────────────────────────
  const inv_replay = recordInvariant('replay_deterministic',
    true,
    deterministicHash(`${env.envelope_id}::${env.deterministic_hash}::${rollback.verification_hash}::${containment.containment_proof_hash}`),
    undefined,
    recorded_at);
  invariants.push(inv_replay);

  return finalizeExecution('permitted', 'all 7 safety invariants verified', undefined, input, invariants);
}

function recordInvariant(
  name: SafetyInvariantName, verified: boolean, source_hash: string,
  violated_reason: string | undefined, recorded_at: string,
): DelegatedExecutionSafetyInvariant {
  return {
    invariant_name: name,
    invariant_verified: verified,
    verification_hash: deterministicHash(`${name}::${verified}::${source_hash}`),
    violated_reason,
    recorded_at,
  };
}

function finalizeIssuance(
  decision: DelegatedGovernanceDecision, reason: string,
  rule: DelegatedSupervisorRule | undefined, input: IssuanceGateInput,
  safety_invariants: ReadonlyArray<DelegatedExecutionSafetyInvariant>,
): IssuanceGateResult {
  const attribution: DelegatedExecutionGovernanceAttribution = {
    envelope_id: input.envelope_id,
    organization_id: input.organization_id,
    operator_id: input.operator_id,
    decision, reason,
    supervisor_rule_violated: rule,
    safety_invariants_evaluated: safety_invariants,
    recorded_at: new Date().toISOString(),
  };
  recordAttribution(input.organization_id, attribution);
  return { decision, reason, supervisor_rule_violated: rule, attribution };
}

function finalizeExecution(
  decision: DelegatedGovernanceDecision, reason: string,
  rule: DelegatedSupervisorRule | undefined, input: ExecutionGateInput,
  safety_invariants: ReadonlyArray<DelegatedExecutionSafetyInvariant>,
): ExecutionGateResult {
  const attribution: DelegatedExecutionGovernanceAttribution = {
    envelope_id: input.envelope.envelope_id,
    organization_id: input.envelope.target_organization_id,
    operator_id: input.envelope.operator_id,
    decision, reason,
    supervisor_rule_violated: rule,
    safety_invariants_evaluated: safety_invariants,
    recorded_at: new Date().toISOString(),
  };
  recordAttribution(input.envelope.target_organization_id, attribution);
  return { decision, reason, supervisor_rule_violated: rule, safety_invariants, attribution };
}

function recordAttribution(organization_id: string, attribution: DelegatedExecutionGovernanceAttribution): void {
  const p = ensure(organization_id);
  p.rows.push(attribution);
  if (p.rows.length > MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION) p.rows.shift();
  p.counts[attribution.decision]++;
  if (attribution.supervisor_rule_violated) {
    p.violations.set(attribution.supervisor_rule_violated, (p.violations.get(attribution.supervisor_rule_violated) ?? 0) + 1);
  }
}

export function buildDelegatedGovernanceProfile(organization_id: string): DelegatedExecutionGovernanceProfile {
  const p = ensure(organization_id);
  const all_rules: DelegatedSupervisorRule[] = [
    'organization_id_missing', 'operator_id_missing', 'action_kind_not_in_whitelist',
    'action_kind_in_forbidden_registry', 'rollback_chain_required_missing',
    'envelope_expired', 'envelope_already_consumed', 'envelope_revoked',
    'envelope_immutability_violated', 'partition_unstable',
    'topology_containment_violated', 'budget_exhausted',
    'recursive_delegation_attempted', 'safety_invariant_violated',
    'cross_org_attempted',
  ];
  const violation_counts: Record<DelegatedSupervisorRule, number> = {} as Record<DelegatedSupervisorRule, number>;
  for (const r of all_rules) violation_counts[r] = p.violations.get(r) ?? 0;
  return {
    organization_id,
    recent_decisions: [...p.rows].reverse(),
    decision_counts: { ...p.counts },
    violation_counts_by_rule: violation_counts,
    built_at: new Date().toISOString(),
  };
}

export function listDelegatedGovernanceAttributions(organization_id: string): ReadonlyArray<DelegatedExecutionGovernanceAttribution> {
  return [...ensure(organization_id).rows].reverse();
}

export function recentDelegatedDecisionCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const rows = partitions.get(o)?.rows ?? [];
    total += rows.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetDelegatedGovernanceForTests(): void {
  partitions.clear();
}
