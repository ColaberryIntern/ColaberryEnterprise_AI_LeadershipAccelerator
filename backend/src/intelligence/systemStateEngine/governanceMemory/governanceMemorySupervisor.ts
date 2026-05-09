/**
 * governanceMemorySupervisor — Phase 31. Read-only governance gate
 * over memory operations.
 *
 * Architectural commitment:
 *   - Refuses cross-org memory ops, missing organization_id, missing
 *     operator_id, forbidden memory actions.
 *   - `operator_mediation_required: true` + `no_operator_profiling: true`
 *     typed-as-literal on every attribution.
 *   - Records governance attributions in a per-org log.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  GovernanceMemoryAttribution, GovernanceMemoryDecision,
  GovernanceMemorySupervisorRule, StabilizationSessionEventKind,
} from './governanceMemoryTypes';
import { MAX_GOVERNANCE_PER_PARTITION } from './governanceMemoryTypes';
import { isMemoryActionForbidden } from './forbiddenMemoryActionRegistry';
import { getSession } from './stabilizationSessionTimeline';

interface PartitionStore {
  governance_log: GovernanceMemoryAttribution[];
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

const VALID_EVENT_KINDS: ReadonlyArray<StabilizationSessionEventKind> = [
  'session_opened', 'archetype_viewed', 'comparison_built',
  'survivability_reviewed', 'tradeoff_reviewed', 'archaeology_replayed',
  'walkthrough_generated', 'guidance_built', 'governance_evaluated',
  'archetype_applied', 'session_closed', 'note_recorded',
];

export interface MemoryGateInput {
  readonly organization_id: string;
  readonly issuer_organization_id: string;
  readonly operator_id: string;
  readonly session_id?: string;
  readonly event_kind?: StabilizationSessionEventKind;
  readonly requested_action_kind?: string;
}

export interface MemoryGateResult {
  readonly decision: GovernanceMemoryDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: GovernanceMemorySupervisorRule;
  readonly attribution: GovernanceMemoryAttribution;
}

export function evaluateMemoryRequest(input: MemoryGateInput): MemoryGateResult {
  if (!input.organization_id) {
    return finalize('rejected', 'organization_id missing', 'organization_id_missing', input);
  }
  if (!input.operator_id || input.operator_id.trim().length === 0) {
    return finalize('rejected', 'operator_mediation_required: operator_id missing', 'operator_mediation_required_violated', input);
  }
  if (input.organization_id !== input.issuer_organization_id) {
    return finalize('rejected', `cross-org memory forbidden (${input.issuer_organization_id} → ${input.organization_id})`, 'cross_org_attempted', input);
  }
  if (input.requested_action_kind && isMemoryActionForbidden(input.requested_action_kind)) {
    return finalize('rejected', `requested_action_kind=${input.requested_action_kind} is in forbidden memory registry`, 'forbidden_memory_action', input);
  }
  if (input.event_kind && !(VALID_EVENT_KINDS as ReadonlyArray<string>).includes(input.event_kind)) {
    return finalize('rejected', `event_kind=${input.event_kind} not recognized`, 'event_kind_invalid', input);
  }
  if (input.session_id) {
    const session = getSession(input.organization_id, input.session_id);
    if (!session) {
      return finalize('rejected', `session_id_not_found: ${input.session_id}`, 'session_id_not_found', input);
    }
    if (session.lifecycle_state === 'closed' || session.lifecycle_state === 'expired') {
      return finalize('rejected', `session_already_closed: ${input.session_id}`, 'session_already_closed', input);
    }
  }
  return finalize('permitted', 'memory gate passed', undefined, input);
}

function finalize(
  decision: GovernanceMemoryDecision, reason: string,
  rule: GovernanceMemorySupervisorRule | undefined, input: MemoryGateInput,
): MemoryGateResult {
  const recorded_at = new Date().toISOString();
  const attribution: GovernanceMemoryAttribution = {
    attribution_id: `mem_gov_${randomUUID()}`,
    organization_id: input.organization_id,
    session_id: input.session_id,
    operator_id: input.operator_id,
    decision, reason,
    supervisor_rule_violated: rule,
    operator_mediation_required: true,
    no_operator_profiling: true,
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

export function listMemoryGovernanceAttributions(
  organization_id: string,
): ReadonlyArray<GovernanceMemoryAttribution> {
  return [...(partitions.get(organization_id)?.governance_log ?? [])].reverse();
}

export function recentMemoryGovernanceCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.governance_log ?? [];
    total += arr.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetMemorySupervisorForTests(): void {
  partitions.clear();
}
