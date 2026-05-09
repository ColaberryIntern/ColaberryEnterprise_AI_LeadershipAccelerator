/**
 * forbiddenHandoffActionRegistry — Phase 32. Anti-profiling +
 * anti-routing registry. Largest forbidden registry yet — multi-operator
 * continuity carries the highest risk of organizational behavioral
 * intelligence drift in the platform.
 */

import { createHash } from 'crypto';
import type {
  ForbiddenHandoffActionKind, ForbiddenHandoffActionRegistry,
} from './operatorContinuityTypes';

const FORBIDDEN_ACTIONS: ReadonlyArray<ForbiddenHandoffActionKind> = [
  'operator_ranking',
  'behavioral_operator_inference',
  'collaboration_scoring',
  'operator_trust_weighting',
  'organizational_behavioral_intelligence',
  'adaptive_operator_routing',
  'operator_capability_prediction',
  'cross_org_cognition_sharing',
  'hidden_collaboration_weighting',
  'operator_capability_inference',
  'autonomous_handoff_routing',
];

const FORBIDDEN_EXPLANATIONS: Readonly<Record<ForbiddenHandoffActionKind, string>> = {
  operator_ranking:
    'Phase 32 records WHAT happened (handoff events). It MUST NEVER rank operators by handoff success, frequency, or reliability.',
  behavioral_operator_inference:
    'Memory NEVER infers operator behavior, intent, or tendencies from handoff history. No predicted behaviors, no behavioral ML.',
  collaboration_scoring:
    'NO scoring of operator-pair collaboration quality. NO derived "good handoff" or "bad handoff" labels.',
  operator_trust_weighting:
    'Handoff history MUST NOT weight operator trust. Phase 27/28/29 gates run independently on every action regardless of handoff context.',
  organizational_behavioral_intelligence:
    'Phase 32 NEVER aggregates handoff data into organizational behavioral patterns or team dynamics models.',
  adaptive_operator_routing:
    'Engine MUST NEVER route work to operators based on past handoff patterns or inferred capability.',
  operator_capability_prediction:
    'NO prediction of operator capability from handoff history. Continuity ≠ competence.',
  cross_org_cognition_sharing:
    'All handoff data partitioned per-organization. NO cross-org propagation of handoff patterns or operator activity.',
  hidden_collaboration_weighting:
    'NO hidden weights on continuity surfaces. Every reference, every metric, every omission is fully exposed.',
  operator_capability_inference:
    'NO inference of operator capability from completed/declined/expired handoffs. The lifecycle state is data, not judgment.',
  autonomous_handoff_routing:
    'Phase 32 NEVER auto-routes handoffs or auto-detects implicit handoffs. Operator-mediated POST is the sole path.',
};

const REGISTRY_HASH = createHash('sha256')
  .update(JSON.stringify({ FORBIDDEN_ACTIONS, FORBIDDEN_EXPLANATIONS }))
  .digest('hex')
  .slice(0, 16);

const REGISTRY: ForbiddenHandoffActionRegistry = Object.freeze({
  forbidden_actions: FORBIDDEN_ACTIONS,
  forbidden_explanations: FORBIDDEN_EXPLANATIONS,
  registry_hash: REGISTRY_HASH,
});

export function getForbiddenHandoffRegistry(): ForbiddenHandoffActionRegistry {
  return REGISTRY;
}

export function isHandoffActionForbidden(action: string): boolean {
  return (FORBIDDEN_ACTIONS as ReadonlyArray<string>).includes(action);
}

export function explainForbiddenHandoff(action: ForbiddenHandoffActionKind): string {
  return FORBIDDEN_EXPLANATIONS[action] ?? '';
}
