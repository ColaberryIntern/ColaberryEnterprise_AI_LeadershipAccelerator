/**
 * executionGovernanceSupervisor — Phase 23. Hard gate at registration
 * time and at heartbeat time.
 *
 * Architectural commitment:
 *   - Violations REJECT the registration outright. No silent downgrade,
 *     no auto-correction, no envelope mutation.
 *   - Every decision (permitted / rejected / isolated / flagged) emits
 *     an `ExecutionGovernanceAttribution` row.
 *   - Attribution is persisted in a bounded ring buffer per partition.
 */

import type {
  ExecutionGovernanceAttribution, ExecutionGovernanceDecision,
  SupervisorRule, ExecutionWorkerKind, ExecutionBoundedEnvelope,
  ExecutionGovernanceProfile,
} from './executionSubstrateTypes';
import {
  MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION,
  MAX_PARENT_DEPTH, MAX_DURATION_MS_CAP, MAX_ATTEMPTS_CAP,
} from './executionSubstrateTypes';

interface PartitionAttributions {
  rows: ExecutionGovernanceAttribution[];
  counts: {
    permitted: number;
    rejected: number;
    isolated: number;
    flagged: number;
  };
  violations: Map<SupervisorRule, number>;
}

const partitions = new Map<string, PartitionAttributions>();

function ensure(organization_id: string): PartitionAttributions {
  let p = partitions.get(organization_id);
  if (!p) {
    p = {
      rows: [],
      counts: { permitted: 0, rejected: 0, isolated: 0, flagged: 0 },
      violations: new Map(),
    };
    partitions.set(organization_id, p);
  }
  return p;
}

export interface SupervisorCheckInput {
  readonly worker_id: string;
  readonly kind: ExecutionWorkerKind;
  readonly organization_id: string;
  readonly bounded_envelope: ExecutionBoundedEnvelope;
  readonly parent_depth: number;
  readonly is_isolated: boolean;            // caller (substrate) supplies isolation state
}

export interface SupervisorCheckResult {
  readonly decision: ExecutionGovernanceDecision;
  readonly reason: string;
  readonly supervisor_rule_violated?: SupervisorRule;
  readonly attribution: ExecutionGovernanceAttribution;
}

/**
 * Hard gate. Returns `permitted` only when ALL checks pass. Returns
 * `rejected` (with the violated rule) when any check fails. Returns
 * `isolated` when the kind is currently isolated.
 */
export function evaluateRegistration(input: SupervisorCheckInput): SupervisorCheckResult {
  // 1. Organization must be present and non-empty.
  if (!input.organization_id || input.organization_id.trim().length === 0) {
    return finalize('rejected', 'organization_id_missing_or_empty', 'organization_id_missing', input);
  }
  // 2. Isolated kind → reject with `isolated` decision.
  if (input.is_isolated) {
    return finalize('isolated', `kind=${input.kind} for org=${input.organization_id} is isolated by the circuit breaker`, 'kind_isolated', input);
  }
  // 3. Parent depth limit.
  if (input.parent_depth > MAX_PARENT_DEPTH) {
    return finalize('rejected', `parent_depth=${input.parent_depth} exceeds MAX_PARENT_DEPTH=${MAX_PARENT_DEPTH} (no recursive worker spawning)`, 'parent_depth_limit_exceeded', input);
  }
  // 4. Envelope shape: max_duration_ms must be a positive number ≤ MAX_DURATION_MS_CAP.
  const dur = input.bounded_envelope.max_duration_ms;
  if (!Number.isFinite(dur) || dur <= 0 || dur > MAX_DURATION_MS_CAP) {
    return finalize('rejected', `max_duration_ms=${dur} is invalid (must be 1..${MAX_DURATION_MS_CAP})`, 'envelope_max_duration_invalid', input);
  }
  // 5. Envelope shape: max_attempts must be a positive integer ≤ MAX_ATTEMPTS_CAP.
  const att = input.bounded_envelope.max_attempts;
  if (!Number.isInteger(att) || att <= 0 || att > MAX_ATTEMPTS_CAP) {
    return finalize('rejected', `max_attempts=${att} is invalid (must be 1..${MAX_ATTEMPTS_CAP})`, 'envelope_max_attempts_invalid', input);
  }
  // 6. Envelope shape: at least one allowed namespace.
  if (!Array.isArray(input.bounded_envelope.allowed_namespaces) || input.bounded_envelope.allowed_namespaces.length === 0) {
    return finalize('rejected', 'allowed_namespaces is empty (worker must declare at least one)', 'envelope_namespaces_empty', input);
  }
  // 7. Envelope shape: parent_depth_limit must be a non-negative integer ≤ MAX_PARENT_DEPTH.
  const limit = input.bounded_envelope.parent_depth_limit;
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_PARENT_DEPTH) {
    return finalize('rejected', `parent_depth_limit=${limit} is invalid (must be 0..${MAX_PARENT_DEPTH})`, 'parent_depth_limit_exceeded', input);
  }
  return finalize('permitted', 'all governance checks passed', undefined, input);
}

function finalize(
  decision: ExecutionGovernanceDecision,
  reason: string,
  rule: SupervisorRule | undefined,
  input: SupervisorCheckInput,
): SupervisorCheckResult {
  const attribution: ExecutionGovernanceAttribution = {
    worker_id: input.worker_id,
    kind: input.kind,
    organization_id: input.organization_id,
    decision,
    reason,
    supervisor_rule_violated: rule,
    recorded_at: new Date().toISOString(),
  };
  recordAttribution(input.organization_id, attribution);
  return { decision, reason, supervisor_rule_violated: rule, attribution };
}

/** Heartbeat-time check: the worker has exceeded its envelope. */
export function evaluateEnvelopeBreach(input: {
  worker_id: string;
  kind: ExecutionWorkerKind;
  organization_id: string;
  duration_so_far_ms: number;
  max_duration_ms: number;
}): SupervisorCheckResult | null {
  if (input.duration_so_far_ms <= input.max_duration_ms) return null;
  return finalize(
    'flagged',
    `duration ${input.duration_so_far_ms}ms exceeds envelope max ${input.max_duration_ms}ms`,
    'envelope_breach_at_runtime',
    {
      worker_id: input.worker_id,
      kind: input.kind,
      organization_id: input.organization_id,
      bounded_envelope: { max_duration_ms: input.max_duration_ms, max_attempts: 1, allowed_namespaces: ['_'], parent_depth_limit: 0 },
      parent_depth: 0,
      is_isolated: false,
    },
  );
}

function recordAttribution(organization_id: string, attribution: ExecutionGovernanceAttribution): void {
  const p = ensure(organization_id);
  p.rows.push(attribution);
  if (p.rows.length > MAX_GOVERNANCE_ATTRIBUTIONS_PER_PARTITION) p.rows.shift();
  p.counts[attribution.decision]++;
  if (attribution.supervisor_rule_violated) {
    p.violations.set(attribution.supervisor_rule_violated, (p.violations.get(attribution.supervisor_rule_violated) ?? 0) + 1);
  }
}

export function buildGovernanceProfile(organization_id: string): ExecutionGovernanceProfile {
  const p = ensure(organization_id);
  const violation_counts_by_rule = {} as Record<SupervisorRule, number>;
  const allRules: SupervisorRule[] = [
    'parent_depth_limit_exceeded',
    'envelope_max_duration_invalid',
    'envelope_max_attempts_invalid',
    'envelope_namespaces_empty',
    'organization_id_missing',
    'kind_isolated',
    'envelope_breach_at_runtime',
    'lifecycle_transition_invalid',
  ];
  for (const r of allRules) violation_counts_by_rule[r] = p.violations.get(r) ?? 0;
  return {
    organization_id,
    recent_decisions: [...p.rows].reverse(),
    decision_counts: { ...p.counts },
    violation_counts_by_rule,
    built_at: new Date().toISOString(),
  };
}

export function listAttributionsForOrg(organization_id: string): ReadonlyArray<ExecutionGovernanceAttribution> {
  return [...ensure(organization_id).rows].reverse();
}

export function recentDecisionCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const rows = partitions.get(o)?.rows ?? [];
    total += rows.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetGovernanceForTests(): void {
  partitions.clear();
}
