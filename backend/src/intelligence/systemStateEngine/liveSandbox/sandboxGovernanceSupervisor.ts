/**
 * sandboxGovernanceSupervisor — Phase 26. Hard gate at submission +
 * heartbeat time for live sandbox runtimes.
 *
 * Architectural commitment:
 *   - Distinct from Phase 25's `sandboxGovernanceSupervisor` (different
 *     directory). On re-export this is aliased to `liveSandboxGovernance`
 *     to avoid symbol collision.
 *   - Violations REJECT the submission outright. No silent downgrade.
 *   - Bounded ring buffer per partition.
 */

import type {
  SandboxGovernanceAttribution, LiveSandboxGovernanceDecision,
  LiveSandboxSupervisorRule, SandboxGovernanceProfile,
} from './liveSandboxTypes';
import {
  MAX_LIVE_SANDBOX_DEPTH, MAX_RUNTIME_TTL_MS,
  MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION,
} from './liveSandboxTypes';
import { MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX } from '../experimentation/experimentationTypes';

interface PartitionAttributions {
  rows: SandboxGovernanceAttribution[];
  counts: { permitted: number; rejected: number; flagged: number };
  violations: Map<LiveSandboxSupervisorRule, number>;
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

export interface LiveSandboxGovernanceCheckInput {
  readonly runtime_id: string;
  readonly organization_id: string;
  readonly operator_id: string;
  readonly action_count: number;
  readonly ttl_ms: number;
  readonly depth: number;
  readonly underlying_phase_25_permitted: boolean;
}

export interface LiveSandboxGovernanceCheckResult {
  readonly decision: LiveSandboxGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: LiveSandboxSupervisorRule;
  readonly attribution: SandboxGovernanceAttribution;
}

export function evaluateLiveSandboxSubmission(input: LiveSandboxGovernanceCheckInput): LiveSandboxGovernanceCheckResult {
  // 1. Organization presence.
  if (!input.organization_id || input.organization_id.trim().length === 0) {
    return finalize('rejected', 'organization_id missing or empty', 'organization_id_missing', input);
  }
  // 2. Operator presence.
  if (!input.operator_id || input.operator_id.trim().length === 0) {
    return finalize('rejected', 'operator_id missing or empty', 'operator_id_missing', input);
  }
  // 3. TTL bound.
  if (input.ttl_ms <= 0 || input.ttl_ms > MAX_RUNTIME_TTL_MS) {
    return finalize('rejected', `ttl_ms=${input.ttl_ms} outside [1, ${MAX_RUNTIME_TTL_MS}]`, 'ttl_exceeds_max', input);
  }
  // 4. Action count bound.
  if (input.action_count > MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX) {
    return finalize('rejected', `${input.action_count} actions exceeds MAX=${MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX}`, 'action_count_exceeds_max', input);
  }
  // 5. Depth bound (no recursive rehearsals).
  if (input.depth > MAX_LIVE_SANDBOX_DEPTH) {
    return finalize('rejected', `depth=${input.depth} exceeds MAX_LIVE_SANDBOX_DEPTH=${MAX_LIVE_SANDBOX_DEPTH}`, 'recursive_sandbox_attempt', input);
  }
  // 6. Underlying Phase 25 permission required.
  if (!input.underlying_phase_25_permitted) {
    return finalize('rejected', 'underlying Phase 25 simulation rejected by experimentation supervisor', 'underlying_phase_25_rejected', input);
  }
  return finalize('permitted', 'all live-sandbox governance checks passed', undefined, input);
}

function finalize(
  decision: LiveSandboxGovernanceDecision,
  reason: string,
  rule: LiveSandboxSupervisorRule | undefined,
  input: LiveSandboxGovernanceCheckInput,
): LiveSandboxGovernanceCheckResult {
  const attribution: SandboxGovernanceAttribution = {
    runtime_id: input.runtime_id,
    organization_id: input.organization_id,
    operator_id: input.operator_id,
    decision,
    reason,
    supervisor_rule_violated: rule,
    recorded_at: new Date().toISOString(),
  };
  recordAttribution(input.organization_id, attribution);
  return { decision, reason, supervisor_rule_violated: rule, attribution };
}

function recordAttribution(organization_id: string, attribution: SandboxGovernanceAttribution): void {
  const p = ensure(organization_id);
  p.rows.push(attribution);
  if (p.rows.length > MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION) p.rows.shift();
  p.counts[attribution.decision]++;
  if (attribution.supervisor_rule_violated) {
    p.violations.set(attribution.supervisor_rule_violated, (p.violations.get(attribution.supervisor_rule_violated) ?? 0) + 1);
  }
}

export function listLiveSandboxGovernanceAttributions(organization_id: string): ReadonlyArray<SandboxGovernanceAttribution> {
  return [...ensure(organization_id).rows].reverse();
}

export function buildLiveSandboxGovernanceProfile(organization_id: string): SandboxGovernanceProfile {
  const p = ensure(organization_id);
  const violation_counts: Record<LiveSandboxSupervisorRule, number> = {
    organization_id_missing: 0, operator_id_missing: 0,
    ttl_exceeds_max: 0, budget_exceeds_max: 0,
    action_count_exceeds_max: 0, recursive_sandbox_attempt: 0,
    depth_exceeds_max: 0, underlying_phase_25_rejected: 0,
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

export function recentLiveSandboxDecisionCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const rows = partitions.get(o)?.rows ?? [];
    total += rows.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetLiveSandboxGovernanceForTests(): void {
  partitions.clear();
}
