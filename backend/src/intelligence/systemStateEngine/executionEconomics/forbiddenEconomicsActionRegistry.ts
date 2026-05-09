/**
 * forbiddenEconomicsActionRegistry — Phase 28. Defense-in-depth
 * anti-authority-creep. Mirror of Phase 27's nonDelegatableActionRegistry.
 *
 * These 8 actions are STRUCTURALLY FORBIDDEN regardless of any future
 * gate config. Adding to this registry is a typed enum extension, not
 * a runtime config change.
 */

import { createHash } from 'crypto';
import type {
  ForbiddenEconomicsActionKind, ForbiddenEconomicsActionRegistry,
} from './executionEconomicsTypes';

const FORBIDDEN_ACTIONS: ReadonlyArray<ForbiddenEconomicsActionKind> = [
  'auto_quota_expansion',
  'auto_topology_rebalancing',
  'cross_org_resource_pooling',
  'hidden_execution_prioritization',
  'probabilistic_quota_allocation',
  'dynamic_authority_expansion',
  'runtime_self_governance',
  'economic_authority_escalation',
];

const FORBIDDEN_EXPLANATIONS: Readonly<Record<ForbiddenEconomicsActionKind, string>> = {
  auto_quota_expansion:
    'Quotas are STATIC OPERATOR-SET. The engine MUST NEVER widen a cap from runtime observations.',
  auto_topology_rebalancing:
    'Topology load distribution is RECOMMENDATION-ONLY. The engine MUST NEVER auto-migrate execution.',
  cross_org_resource_pooling:
    'All quotas, pressure, forecasts, and replays are per-organization. No cross-org pooling.',
  hidden_execution_prioritization:
    'Phase 28 may classify; it MUST NEVER prioritize. No queue shaping, no boosting.',
  probabilistic_quota_allocation:
    'Quotas are deterministic enforcement. No probabilistic allocation, no statistical assignment.',
  dynamic_authority_expansion:
    'Phase 28 cannot expand any execution authority. It only forecasts/budgets/classifies/constrains existing primitives.',
  runtime_self_governance:
    'Runtime cannot govern itself. Operator is the sole quota authority source.',
  economic_authority_escalation:
    'Pressure signals MUST NOT trigger authority escalation. They are observability only.',
};

const REGISTRY_HASH = createHash('sha256')
  .update(JSON.stringify({ FORBIDDEN_ACTIONS, FORBIDDEN_EXPLANATIONS }))
  .digest('hex')
  .slice(0, 16);

const REGISTRY: ForbiddenEconomicsActionRegistry = Object.freeze({
  forbidden_actions: FORBIDDEN_ACTIONS,
  forbidden_explanations: FORBIDDEN_EXPLANATIONS,
  registry_hash: REGISTRY_HASH,
});

export function getForbiddenEconomicsRegistry(): ForbiddenEconomicsActionRegistry {
  return REGISTRY;
}

export function isEconomicsActionForbidden(action: string): boolean {
  return (FORBIDDEN_ACTIONS as ReadonlyArray<string>).includes(action);
}

export function explainForbiddenEconomics(action: ForbiddenEconomicsActionKind): string {
  return FORBIDDEN_EXPLANATIONS[action] ?? '';
}
