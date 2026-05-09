/**
 * forbiddenForesightActionRegistry — Phase 30. Defense-in-depth
 * anti-decision-authority-creep registry.
 *
 * Mirror of Phase 27/28/29 forbidden registries. These 9 actions are
 * STRUCTURALLY FORBIDDEN regardless of any future config. Adding to
 * this registry is a typed enum extension, not a runtime config change.
 */

import { createHash } from 'crypto';
import type {
  ForbiddenForesightActionKind, ForbiddenForesightActionRegistry,
} from './recoveryForesightTypes';

const FORBIDDEN_ACTIONS: ReadonlyArray<ForbiddenForesightActionKind> = [
  'autonomous_recovery_selection',
  'automatic_archetype_ranking',
  'probabilistic_stabilization_weighting',
  'dynamic_recovery_prioritization',
  'cross_org_decision_propagation',
  'self_evolving_decision_guidance',
  'hidden_recovery_weighting',
  'operator_replacing_stabilization_logic',
  'decision_optimization',
];

const FORBIDDEN_EXPLANATIONS: Readonly<Record<ForbiddenForesightActionKind, string>> = {
  autonomous_recovery_selection:
    'Phase 30 COMPARES; it MUST NEVER select an archetype. The operator selects via Phase 29 sequencing → Phase 27 envelope.',
  automatic_archetype_ranking:
    'No engine-side ranking. NO `selected_archetype`, NO `recommended_archetype`, NO `aggregate_score`, NO `composite_priority`. Operators sort their UI side; the engine never ranks.',
  probabilistic_stabilization_weighting:
    'Tradeoffs are heuristic deterministic comparisons. No ML, no probabilistic weighting, no inferred desirability.',
  dynamic_recovery_prioritization:
    'Phase 30 may classify; it MUST NEVER prioritize. No queue shaping, no boost, no hidden ordering.',
  cross_org_decision_propagation:
    'Every comparison, walkthrough, archaeology bundle is per-organization. No cross-org propagation.',
  self_evolving_decision_guidance:
    'Comparison templates are static. No auto-evolution from observation patterns.',
  hidden_recovery_weighting:
    'Every metric in a comparison row is fully exposed and individually citable. No hidden weighting layer.',
  operator_replacing_stabilization_logic:
    'Phase 30 NEVER replaces operator judgment. Operator-mediation is the design contract.',
  decision_optimization:
    'Catch-all for any "best choice" semantics. The comparison engine remains structurally neutral.',
};

const REGISTRY_HASH = createHash('sha256')
  .update(JSON.stringify({ FORBIDDEN_ACTIONS, FORBIDDEN_EXPLANATIONS }))
  .digest('hex')
  .slice(0, 16);

const REGISTRY: ForbiddenForesightActionRegistry = Object.freeze({
  forbidden_actions: FORBIDDEN_ACTIONS,
  forbidden_explanations: FORBIDDEN_EXPLANATIONS,
  registry_hash: REGISTRY_HASH,
});

export function getForbiddenForesightRegistry(): ForbiddenForesightActionRegistry {
  return REGISTRY;
}

export function isForesightActionForbidden(action: string): boolean {
  return (FORBIDDEN_ACTIONS as ReadonlyArray<string>).includes(action);
}

export function explainForbiddenForesight(action: ForbiddenForesightActionKind): string {
  return FORBIDDEN_EXPLANATIONS[action] ?? '';
}
