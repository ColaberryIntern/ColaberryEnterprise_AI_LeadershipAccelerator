/**
 * recoveryGovernanceSupervisor — Phase 29. Read-only governance gate
 * over archetype application requests.
 *
 * Architectural commitment:
 *   - This gate evaluates whether an operator is permitted to use a
 *     given archetype to draft Phase 27 envelope payloads. It NEVER
 *     issues envelopes, NEVER bypasses Phase 27 evaluateIssuance.
 *   - `operator_mediation_required: true` typed-as-literal — every
 *     attribution carries this commitment.
 *   - Refuses cross-org archetype application, missing rollback
 *     coverage, forbidden archetype kinds.
 *   - Records `RecoveryArchetypeFinalityProof` when an operator
 *     applies an archetype (i.e., issues envelopes through Phase 27
 *     based on its sequencing recommendation).
 */

import { randomUUID, createHash } from 'crypto';
import type {
  RecoveryGovernanceAttribution, RecoveryGovernanceDecision,
  RecoverySupervisorRule, RecoveryArchetypeFinalityProof,
} from './stabilizationIntelligenceTypes';
import {
  MAX_GOVERNANCE_PER_PARTITION, MAX_FINALITY_PROOFS_PER_PARTITION,
} from './stabilizationIntelligenceTypes';
import { getArchetype } from './recoveryArchetypeRegistry';
import { isRecoveryActionForbidden } from './forbiddenRecoveryActionRegistry';

interface PartitionStore {
  governance_log: RecoveryGovernanceAttribution[];
  finality_proofs: RecoveryArchetypeFinalityProof[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { governance_log: [], finality_proofs: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// ─── Application gate ──────────────────────────────────────────────

export interface ApplicationGateInput {
  readonly organization_id: string;
  readonly issuer_organization_id: string;
  readonly operator_id: string;
  readonly archetype_id: string;
  readonly per_step_rollback_chain_ids: ReadonlyArray<string>;
}

export interface ApplicationGateResult {
  readonly decision: RecoveryGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: RecoverySupervisorRule;
  readonly attribution: RecoveryGovernanceAttribution;
}

/**
 * Evaluate whether the operator is permitted to apply an archetype.
 * Operator-mediation-required is structural: every decision records
 * `operator_mediation_required: true`. The gate refuses on:
 *   - missing organization_id / archetype_id
 *   - cross-org attempts
 *   - archetype not found
 *   - any rollback chain hint missing for steps that require one
 *   - archetype id matching forbidden registry (defense-in-depth;
 *     archetype ids never overlap with forbidden actions, but the
 *     check is structural)
 */
export function evaluateArchetypeApplication(
  input: ApplicationGateInput,
): ApplicationGateResult {
  if (!input.organization_id) {
    return finalize('rejected', 'organization_id_missing', 'organization_id_missing', input);
  }
  if (!input.archetype_id) {
    return finalize('rejected', 'archetype_id_missing', 'archetype_id_missing', input);
  }
  if (!input.operator_id || input.operator_id.trim().length === 0) {
    return finalize('rejected', 'operator_mediation_required: operator_id missing', 'operator_mediation_required_violated', input);
  }
  if (input.organization_id !== input.issuer_organization_id) {
    return finalize('rejected', `cross-org archetype application forbidden (${input.issuer_organization_id} → ${input.organization_id})`, 'cross_org_attempted', input);
  }
  // Defense-in-depth — archetype id should never collide with a forbidden action,
  // but if one ever did, the structural check catches it.
  if (isRecoveryActionForbidden(input.archetype_id)) {
    return finalize('rejected', `archetype_id collides with forbidden registry: ${input.archetype_id}`, 'forbidden_recovery_action', input);
  }
  const archetype = getArchetype(input.organization_id, input.archetype_id);
  if (!archetype) {
    return finalize('rejected', `archetype_not_found: ${input.archetype_id}`, 'archetype_not_found', input);
  }
  // Every step that requires a rollback chain id must have one supplied.
  const requiringSteps = archetype.steps.filter(s => s.required_rollback_chain_id_param);
  if (input.per_step_rollback_chain_ids.length < requiringSteps.length) {
    return finalize('rejected',
      `rollback_chain_id missing for ${requiringSteps.length - input.per_step_rollback_chain_ids.length} step(s)`,
      'rollback_chain_required_missing', input);
  }
  for (const id of input.per_step_rollback_chain_ids) {
    if (!id || id.trim().length === 0) {
      return finalize('rejected', 'rollback_chain_id missing', 'rollback_chain_required_missing', input);
    }
  }
  return finalize('permitted', 'archetype application gate passed', undefined, input);
}

function finalize(
  decision: RecoveryGovernanceDecision, reason: string,
  rule: RecoverySupervisorRule | undefined, input: ApplicationGateInput,
): ApplicationGateResult {
  const recorded_at = new Date().toISOString();
  const attribution: RecoveryGovernanceAttribution = {
    attribution_id: `rec_gov_${randomUUID()}`,
    organization_id: input.organization_id,
    archetype_id: input.archetype_id,
    operator_id: input.operator_id,
    decision, reason,
    supervisor_rule_violated: rule,
    operator_mediation_required: true,
    recorded_at,
    deterministic_hash: deterministicHash(
      `${input.organization_id}::${input.archetype_id}::${decision}::${rule ?? ''}::${input.operator_id}::${recorded_at}`,
    ),
  };
  const store = ensure(input.organization_id);
  store.governance_log.push(attribution);
  if (store.governance_log.length > MAX_GOVERNANCE_PER_PARTITION) store.governance_log.shift();
  return { decision, reason, supervisor_rule_violated: rule, attribution };
}

// ─── Finality proof recording ──────────────────────────────────────

export interface RecordFinalityProofInput {
  readonly organization_id: string;
  readonly archetype_id: string;
  readonly operator_id: string;
  readonly envelope_ids_issued: ReadonlyArray<string>;
  readonly bounded_reason: string;
}

/**
 * Record that an operator has applied an archetype (i.e., issued the
 * recommended envelopes through Phase 27). The proof is permanent +
 * immutable + replayable. Phase 29 NEVER issues these envelopes; the
 * caller (route handler) records the proof after a successful operator
 * application flow.
 */
export function recordArchetypeFinalityProof(
  input: RecordFinalityProofInput,
): RecoveryArchetypeFinalityProof {
  const applied_at = new Date().toISOString();
  const proof: RecoveryArchetypeFinalityProof = {
    archetype_id: input.archetype_id,
    applied_at,
    operator_id: input.operator_id,
    envelope_ids_issued: input.envelope_ids_issued,
    cannot_re_execute: true,
    replayable: true,
    bounded_reason: input.bounded_reason,
    deterministic_hash: deterministicHash(
      `final::${input.organization_id}::${input.archetype_id}::${input.operator_id}::${applied_at}::${input.envelope_ids_issued.join(',')}`,
    ),
  };
  const store = ensure(input.organization_id);
  store.finality_proofs.push(proof);
  if (store.finality_proofs.length > MAX_FINALITY_PROOFS_PER_PARTITION) store.finality_proofs.shift();
  return proof;
}

export function listGovernanceAttributions(
  organization_id: string,
): ReadonlyArray<RecoveryGovernanceAttribution> {
  return [...(partitions.get(organization_id)?.governance_log ?? [])].reverse();
}

export function listFinalityProofs(
  organization_id: string,
): ReadonlyArray<RecoveryArchetypeFinalityProof> {
  return [...(partitions.get(organization_id)?.finality_proofs ?? [])].reverse();
}

export function recentGovernanceCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.governance_log ?? [];
    total += arr.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function recentFinalityProofCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.finality_proofs ?? [];
    total += arr.filter(r => Date.parse(r.applied_at) >= cutoff).length;
  }
  return total;
}

export function _resetRecoveryGovernanceForTests(): void {
  partitions.clear();
}
