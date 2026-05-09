/**
 * handoffGovernanceSupervisor — Phase 32. Read-only governance gate
 * over handoff requests.
 *
 * Architectural commitment:
 *   - Refuses cross-org, missing fields, self-handoffs, terminal handoffs,
 *     forbidden actions.
 *   - `operator_mediation_required: true` + `no_operator_ranking: true`
 *     + `no_collaboration_scoring: true` typed-as-literal on every
 *     attribution.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  HandoffGovernanceAttribution, HandoffGovernanceDecision,
  HandoffGovernanceSupervisorRule,
} from './operatorContinuityTypes';
import { MAX_GOVERNANCE_PER_PARTITION } from './operatorContinuityTypes';
import { isHandoffActionForbidden } from './forbiddenHandoffActionRegistry';
import { getHandoff } from './governanceHandoffRegistry';

interface PartitionStore {
  governance_log: HandoffGovernanceAttribution[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { governance_log: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface HandoffGateInput {
  readonly organization_id: string;
  readonly issuer_organization_id: string;
  readonly from_operator_id: string;
  readonly to_operator_id?: string;
  readonly handoff_id?: string;
  readonly requested_action_kind?: string;
}

export interface HandoffGateResult {
  readonly decision: HandoffGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: HandoffGovernanceSupervisorRule;
  readonly attribution: HandoffGovernanceAttribution;
}

export function evaluateHandoffRequest(input: HandoffGateInput): HandoffGateResult {
  if (!input.organization_id) {
    return finalize('rejected', 'organization_id missing', 'organization_id_missing', input);
  }
  if (!input.from_operator_id || input.from_operator_id.trim().length === 0) {
    return finalize('rejected', 'operator_mediation_required: from_operator_id missing', 'from_operator_id_missing', input);
  }
  if (input.organization_id !== input.issuer_organization_id) {
    return finalize('rejected', `cross-org handoff forbidden (${input.issuer_organization_id} → ${input.organization_id})`, 'cross_org_attempted', input);
  }
  if (input.requested_action_kind && isHandoffActionForbidden(input.requested_action_kind)) {
    return finalize('rejected', `requested_action_kind=${input.requested_action_kind} is in forbidden handoff registry`, 'forbidden_handoff_action', input);
  }
  if (input.to_operator_id !== undefined) {
    if (!input.to_operator_id || input.to_operator_id.trim().length === 0) {
      return finalize('rejected', 'to_operator_id missing', 'to_operator_id_missing', input);
    }
    if (input.from_operator_id === input.to_operator_id) {
      return finalize('rejected', 'self-handoff forbidden', 'self_handoff_attempted', input);
    }
  }
  if (input.handoff_id) {
    const handoff = getHandoff(input.organization_id, input.handoff_id);
    if (!handoff) {
      return finalize('rejected', `handoff_id_not_found: ${input.handoff_id}`, 'handoff_id_not_found', input);
    }
    if (handoff.lifecycle_state === 'completed' || handoff.lifecycle_state === 'declined' || handoff.lifecycle_state === 'expired') {
      return finalize('rejected', `handoff_already_terminal: ${input.handoff_id}`, 'handoff_already_terminal', input);
    }
  }
  return finalize('permitted', 'handoff gate passed', undefined, input);
}

function finalize(
  decision: HandoffGovernanceDecision, reason: string,
  rule: HandoffGovernanceSupervisorRule | undefined, input: HandoffGateInput,
): HandoffGateResult {
  const recorded_at = new Date().toISOString();
  const attribution: HandoffGovernanceAttribution = {
    attribution_id: `hand_gov_${randomUUID()}`,
    organization_id: input.organization_id,
    handoff_id: input.handoff_id,
    from_operator_id: input.from_operator_id,
    to_operator_id: input.to_operator_id,
    decision, reason,
    supervisor_rule_violated: rule,
    operator_mediation_required: true,
    no_operator_ranking: true,
    no_collaboration_scoring: true,
    recorded_at,
    deterministic_hash: deterministicHash(
      `${input.organization_id}::${decision}::${rule ?? ''}::${input.from_operator_id}::${recorded_at}`,
    ),
  };
  const store = ensure(input.organization_id);
  store.governance_log.push(attribution);
  if (store.governance_log.length > MAX_GOVERNANCE_PER_PARTITION) store.governance_log.shift();
  return { decision, reason, supervisor_rule_violated: rule, attribution };
}

export function listHandoffGovernanceAttributions(
  organization_id: string,
): ReadonlyArray<HandoffGovernanceAttribution> {
  return [...(partitions.get(organization_id)?.governance_log ?? [])].reverse();
}

export function recentHandoffGovernanceCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.governance_log ?? [];
    total += arr.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetHandoffSupervisorForTests(): void {
  partitions.clear();
}
