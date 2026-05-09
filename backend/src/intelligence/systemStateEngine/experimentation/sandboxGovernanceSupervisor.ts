/**
 * sandboxGovernanceSupervisor — Phase 25. Hard gate at sandbox
 * submission time.
 *
 * Architectural commitment:
 *   - Violations REJECT the submission outright. No silent downgrade,
 *     no auto-correction.
 *   - Every decision (permitted / rejected / flagged) emits an
 *     `ExperimentationGovernanceAttribution` row.
 *   - Bounded ring buffer per partition.
 *   - Mirrors Phase 23 `executionGovernanceSupervisor` shape.
 */

import type {
  ExperimentationGovernanceAttribution, SandboxGovernanceDecision,
  SandboxSupervisorRule, HypotheticalAction,
} from './experimentationTypes';
import {
  MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX, MAX_REHEARSAL_CHAIN_DEPTH,
  MAX_PROJECTION_BUDGET_MS, MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION,
} from './experimentationTypes';

interface PartitionAttributions {
  rows: ExperimentationGovernanceAttribution[];
  counts: { permitted: number; rejected: number; flagged: number };
  violations: Map<SandboxSupervisorRule, number>;
}

const partitions = new Map<string, PartitionAttributions>();

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

const KNOWN_ACTION_KINDS = new Set<string>([
  'lift_broker_isolation',
  'add_broker_isolation',
  'lift_execution_isolation',
  'execute_topology_recovery_step',
  'force_continuity_replay',
  'rollback_worker_lifecycle',
]);

export interface SandboxSupervisorCheckInput {
  readonly experiment_id: string;
  readonly organization_id: string;
  readonly hypothetical_actions: ReadonlyArray<HypotheticalAction>;
  readonly chain_depth: number;
  readonly projection_budget_ms: number;
}

export interface SandboxSupervisorCheckResult {
  readonly decision: SandboxGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: SandboxSupervisorRule;
  readonly attribution: ExperimentationGovernanceAttribution;
}

export function evaluateSandboxSubmission(input: SandboxSupervisorCheckInput): SandboxSupervisorCheckResult {
  // 1. Organization presence.
  if (!input.organization_id || input.organization_id.trim().length === 0) {
    return finalize('rejected', 'organization_id missing or empty', 'organization_id_missing', input);
  }
  // 2. Action count bound.
  if (input.hypothetical_actions.length > MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX) {
    return finalize('rejected', `${input.hypothetical_actions.length} actions exceeds MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX=${MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX}`, 'action_count_exceeded', input);
  }
  // 3. Chain depth bound (only relevant for chained_rehearsal tier).
  if (input.chain_depth > MAX_REHEARSAL_CHAIN_DEPTH) {
    return finalize('rejected', `chain_depth=${input.chain_depth} exceeds MAX_REHEARSAL_CHAIN_DEPTH=${MAX_REHEARSAL_CHAIN_DEPTH}`, 'chain_depth_exceeded', input);
  }
  // 4. Projection budget bound.
  if (input.projection_budget_ms > MAX_PROJECTION_BUDGET_MS) {
    return finalize('rejected', `projection_budget_ms=${input.projection_budget_ms} exceeds MAX=${MAX_PROJECTION_BUDGET_MS}`, 'projection_budget_exceeded', input);
  }
  // 5. Action-kind validity.
  for (const a of input.hypothetical_actions) {
    if (!KNOWN_ACTION_KINDS.has(a.kind)) {
      return finalize('rejected', `unknown hypothetical action kind: ${a.kind}`, 'unknown_action_kind', input);
    }
  }
  return finalize('permitted', 'all sandbox governance checks passed', undefined, input);
}

function finalize(
  decision: SandboxGovernanceDecision,
  reason: string,
  rule: SandboxSupervisorRule | undefined,
  input: SandboxSupervisorCheckInput,
): SandboxSupervisorCheckResult {
  const attribution: ExperimentationGovernanceAttribution = {
    experiment_id: input.experiment_id,
    organization_id: input.organization_id,
    decision,
    reason,
    supervisor_rule_violated: rule,
    recorded_at: new Date().toISOString(),
  };
  recordAttribution(input.organization_id, attribution);
  return { decision, reason, supervisor_rule_violated: rule, attribution };
}

function recordAttribution(organization_id: string, attribution: ExperimentationGovernanceAttribution): void {
  const p = ensure(organization_id);
  p.rows.push(attribution);
  if (p.rows.length > MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION) p.rows.shift();
  p.counts[attribution.decision]++;
  if (attribution.supervisor_rule_violated) {
    p.violations.set(attribution.supervisor_rule_violated, (p.violations.get(attribution.supervisor_rule_violated) ?? 0) + 1);
  }
}

export function listSandboxGovernanceAttributions(organization_id: string): ReadonlyArray<ExperimentationGovernanceAttribution> {
  return [...ensure(organization_id).rows].reverse();
}

export function buildSandboxGovernanceProfile(organization_id: string) {
  const p = ensure(organization_id);
  const violation_counts: Record<SandboxSupervisorRule, number> = {
    organization_id_missing: 0, action_count_exceeded: 0,
    chain_depth_exceeded: 0, projection_budget_exceeded: 0,
    recursive_sandbox_attempt: 0, unknown_action_kind: 0,
    cross_org_action_attempt: 0, mutation_action_attempted_outside_sandbox: 0,
  };
  for (const [rule, count] of p.violations.entries()) violation_counts[rule] = count;
  return {
    organization_id,
    recent_decisions: [...p.rows].reverse(),
    decision_counts: { ...p.counts },
    violation_counts_by_rule: violation_counts,
    built_at: new Date().toISOString(),
  };
}

export function recentSandboxDecisionCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const rows = partitions.get(o)?.rows ?? [];
    total += rows.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetSandboxGovernanceForTests(): void {
  partitions.clear();
}
