/**
 * decisionGovernanceSupervisor — Phase 30. Read-only governance gate
 * over comparison/walkthrough/archaeology requests.
 *
 * Architectural commitment:
 *   - This gate evaluates whether an operator may request a comparison,
 *     archaeology, or walkthrough. It NEVER selects archetypes, NEVER
 *     issues envelopes, NEVER bypasses Phase 27/28/29 gates.
 *   - `operator_mediation_required: true` typed-as-literal — every
 *     attribution carries this commitment.
 *   - Refuses cross-org, missing organization_id, missing operator_id,
 *     archetype_not_found (when archetype_id supplied), forbidden
 *     foresight actions.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  DecisionGovernanceAttribution, DecisionGovernanceDecision,
  DecisionSupervisorRule,
} from './recoveryForesightTypes';
import { MAX_GOVERNANCE_PER_PARTITION } from './recoveryForesightTypes';
import { getArchetype } from '../stabilizationIntelligence/recoveryArchetypeRegistry';
import { isForesightActionForbidden } from './forbiddenForesightActionRegistry';

interface PartitionStore {
  governance_log: DecisionGovernanceAttribution[];
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

export interface ComparisonGateInput {
  readonly organization_id: string;
  readonly issuer_organization_id: string;
  readonly operator_id: string;
  readonly comparison_id?: string;
  readonly archetype_id?: string;                              // optional — present for per-archetype gates
  readonly requested_action_kind?: string;                     // for forbidden registry check
}

export interface ComparisonGateResult {
  readonly decision: DecisionGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: DecisionSupervisorRule;
  readonly attribution: DecisionGovernanceAttribution;
}

export function evaluateComparisonRequest(input: ComparisonGateInput): ComparisonGateResult {
  if (!input.organization_id) {
    return finalize('rejected', 'organization_id missing', 'organization_id_missing', input);
  }
  if (!input.operator_id || input.operator_id.trim().length === 0) {
    return finalize('rejected', 'operator_mediation_required: operator_id missing', 'operator_mediation_required_violated', input);
  }
  if (input.organization_id !== input.issuer_organization_id) {
    return finalize('rejected', `cross-org foresight forbidden (${input.issuer_organization_id} → ${input.organization_id})`, 'cross_org_attempted', input);
  }
  if (input.requested_action_kind && isForesightActionForbidden(input.requested_action_kind)) {
    return finalize('rejected', `requested_action_kind=${input.requested_action_kind} is in forbidden foresight registry`, 'forbidden_foresight_action', input);
  }
  if (input.archetype_id) {
    const arch = getArchetype(input.organization_id, input.archetype_id);
    if (!arch) {
      return finalize('rejected', `archetype_not_found: ${input.archetype_id}`, 'archetype_not_found', input);
    }
  }
  return finalize('permitted', 'comparison gate passed', undefined, input);
}

function finalize(
  decision: DecisionGovernanceDecision, reason: string,
  rule: DecisionSupervisorRule | undefined, input: ComparisonGateInput,
): ComparisonGateResult {
  const recorded_at = new Date().toISOString();
  const attribution: DecisionGovernanceAttribution = {
    attribution_id: `dec_gov_${randomUUID()}`,
    organization_id: input.organization_id,
    comparison_id: input.comparison_id,
    operator_id: input.operator_id,
    decision, reason,
    supervisor_rule_violated: rule,
    operator_mediation_required: true,
    recorded_at,
    deterministic_hash: deterministicHash(
      `${input.organization_id}::${decision}::${rule ?? ''}::${input.operator_id}::${recorded_at}`,
    ),
  };
  const store = ensure(input.organization_id);
  store.governance_log.push(attribution);
  if (store.governance_log.length > MAX_GOVERNANCE_PER_PARTITION) store.governance_log.shift();
  return { decision, reason, supervisor_rule_violated: rule, attribution };
}

export function listDecisionGovernanceAttributions(
  organization_id: string,
): ReadonlyArray<DecisionGovernanceAttribution> {
  return [...(partitions.get(organization_id)?.governance_log ?? [])].reverse();
}

export function recentDecisionGovernanceCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.governance_log ?? [];
    total += arr.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetDecisionGovernanceForTests(): void {
  partitions.clear();
}
