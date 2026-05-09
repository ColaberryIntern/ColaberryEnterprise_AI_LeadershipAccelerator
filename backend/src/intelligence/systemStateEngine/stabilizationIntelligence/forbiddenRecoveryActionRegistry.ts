/**
 * forbiddenRecoveryActionRegistry — Phase 29. Defense-in-depth
 * anti-authority-creep registry for stabilization intelligence.
 *
 * Mirror of Phase 27 nonDelegatableActionRegistry + Phase 28
 * forbiddenEconomicsActionRegistry. These 9 actions are STRUCTURALLY
 * FORBIDDEN regardless of any future config. Adding to this registry
 * is a typed enum extension, not a runtime config change.
 */

import { createHash } from 'crypto';
import type {
  ForbiddenRecoveryActionKind, ForbiddenRecoveryActionRegistry,
} from './stabilizationIntelligenceTypes';

const FORBIDDEN_ACTIONS: ReadonlyArray<ForbiddenRecoveryActionKind> = [
  'autonomous_recovery_execution',
  'automatic_rollback_triggering',
  'dynamic_playbook_mutation',
  'cross_org_recovery_propagation',
  'probabilistic_recovery_planning',
  'runtime_self_restoration',
  'hidden_recovery_prioritization',
  'rollback_bypass',
  'playbook_self_evolution',
];

const FORBIDDEN_EXPLANATIONS: Readonly<Record<ForbiddenRecoveryActionKind, string>> = {
  autonomous_recovery_execution:
    'Phase 29 RECOMMENDS only. The engine MUST NEVER execute recovery autonomously — operator click + Phase 27 envelope is the sole path.',
  automatic_rollback_triggering:
    'Rollback chains are only invoked through Phase 27 executeDelegated under operator-issued envelopes. No auto-trigger.',
  dynamic_playbook_mutation:
    'Built-in archetypes are frozen + hash-verified. Operator-set archetypes mutate ONLY via setOperatorArchetype with full governance lineage.',
  cross_org_recovery_propagation:
    'Every archetype, sequencing, forecast, pressure profile, and trace is per-organization. No cross-org propagation.',
  probabilistic_recovery_planning:
    'Forecasting is heuristic linear extrapolation only. No ML, no probabilistic optimization, no inferred recovery desirability.',
  runtime_self_restoration:
    'Runtime cannot restore itself. Operator is the sole authority source for any recovery action.',
  hidden_recovery_prioritization:
    'Phase 29 may classify; it MUST NEVER prioritize. No queue shaping, no boost, no hidden ordering.',
  rollback_bypass:
    'Rollback coverage is a precondition for every recommended payload. Phase 29 cannot bypass Phase 27 rollback gates.',
  playbook_self_evolution:
    'Archetypes are STATIC built-in or OPERATOR-SET only. The engine MUST NEVER auto-discover or self-evolve archetypes from observation patterns.',
};

const REGISTRY_HASH = createHash('sha256')
  .update(JSON.stringify({ FORBIDDEN_ACTIONS, FORBIDDEN_EXPLANATIONS }))
  .digest('hex')
  .slice(0, 16);

const REGISTRY: ForbiddenRecoveryActionRegistry = Object.freeze({
  forbidden_actions: FORBIDDEN_ACTIONS,
  forbidden_explanations: FORBIDDEN_EXPLANATIONS,
  registry_hash: REGISTRY_HASH,
});

export function getForbiddenRecoveryRegistry(): ForbiddenRecoveryActionRegistry {
  return REGISTRY;
}

export function isRecoveryActionForbidden(action: string): boolean {
  return (FORBIDDEN_ACTIONS as ReadonlyArray<string>).includes(action);
}

export function explainForbiddenRecovery(action: ForbiddenRecoveryActionKind): string {
  return FORBIDDEN_EXPLANATIONS[action] ?? '';
}
