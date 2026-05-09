/**
 * nonDelegatableActionRegistry — Phase 27. Explicit forbidden-action
 * registry that complements the bounded 5-action whitelist.
 *
 * Architectural commitment:
 *   - Defense in depth: do not rely ONLY on whitelist inclusion.
 *   - 13 explicit forbidden actions, each with an explanation.
 *   - The registry is compile-time + frozen + hash-verified.
 */

import { createHash } from 'crypto';
import type {
  NonDelegatableActionKind, NonDelegatableOperationalActionRegistry,
} from './delegatedExecutionTypes';

const FORBIDDEN_EXPLANATIONS: Record<NonDelegatableActionKind, string> = {
  mutation_execution:
    'Phase 15 mutation execution stays operator-clicked-only; no delegated authority may invoke it.',
  envelope_issuance:
    'Phase 27 itself is non-delegatable — a delegated execution may not issue another envelope (no recursion).',
  topology_creation:
    'Phase 22 topology creation is operator-clicked; delegated authority may not extend the dependency graph.',
  topology_deletion:
    'Phase 22 topology deletion would destabilize multiple partitions; operator-clicked only.',
  federation_mutation:
    'Phase 19 federation contracts are cross-organizational and may not be mutated under delegation.',
  quarantine_issuance:
    'Phase 21+23 quarantine is high-impact; operator-clicked only.',
  rollback_chain_generation:
    'Phase 23 build_rollback_execution_plan is operator-clicked plan creation; not a single-step recovery primitive.',
  recovery_plan_generation:
    'Phase 21+22 plan creation is operator-clicked; only single-step execution against existing plans is delegatable.',
  governance_calibration:
    'Phase 18 calibration is operator-approved governance evolution; not delegatable.',
  trust_mutation:
    'Phase 13/17 trust changes are governance authority shifts; not delegatable.',
  sandbox_promotion:
    'Phase 25/26 sandboxes structurally cannot promote to production; delegation may not bypass the prohibition.',
  runtime_promotion:
    'Phase 26 runtimes structurally cannot promote to production; delegation may not bypass the prohibition.',
  execution_daemon_creation:
    'No persistent worker may be created under delegated execution. v1 is synchronous-only, single-action-only.',
};

const FORBIDDEN_ACTIONS: ReadonlyArray<NonDelegatableActionKind> = Object.freeze(
  Object.keys(FORBIDDEN_EXPLANATIONS) as NonDelegatableActionKind[],
);

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const REGISTRY_HASH = deterministicHash(
  JSON.stringify(
    FORBIDDEN_ACTIONS.map(k => ({ k, e: FORBIDDEN_EXPLANATIONS[k] })),
  ),
);

const REGISTRY: NonDelegatableOperationalActionRegistry = Object.freeze({
  forbidden_actions: FORBIDDEN_ACTIONS,
  forbidden_explanations: Object.freeze({ ...FORBIDDEN_EXPLANATIONS }),
  registry_hash: REGISTRY_HASH,
});

export function getNonDelegatableRegistry(): NonDelegatableOperationalActionRegistry {
  return REGISTRY;
}

export function isActionForbidden(action_kind: string): boolean {
  return (FORBIDDEN_ACTIONS as ReadonlyArray<string>).includes(action_kind);
}

export function explainForbidden(action_kind: NonDelegatableActionKind): string {
  return FORBIDDEN_EXPLANATIONS[action_kind] ?? 'unknown forbidden action';
}

export const _FORBIDDEN_ACTION_COUNT_FOR_TESTS = FORBIDDEN_ACTIONS.length;
