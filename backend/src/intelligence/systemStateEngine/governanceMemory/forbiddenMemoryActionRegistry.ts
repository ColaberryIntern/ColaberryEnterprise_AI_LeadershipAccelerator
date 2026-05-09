/**
 * forbiddenMemoryActionRegistry — Phase 31. Defense-in-depth
 * anti-profiling registry. The largest forbidden registry yet —
 * memory carries the highest authority-creep risk in the platform.
 */

import { createHash } from 'crypto';
import type {
  ForbiddenMemoryActionKind, ForbiddenMemoryActionRegistry,
} from './governanceMemoryTypes';

const FORBIDDEN_ACTIONS: ReadonlyArray<ForbiddenMemoryActionKind> = [
  'persistent_operator_profiling',
  'behavioral_operator_prediction',
  'decision_automation',
  'operator_preference_inference',
  'adaptive_operator_steering',
  'cross_org_cognition_propagation',
  'self_evolving_governance_memory',
  'hidden_cognition_weighting',
  'operator_ranking_emission',
];

const FORBIDDEN_EXPLANATIONS: Readonly<Record<ForbiddenMemoryActionKind, string>> = {
  persistent_operator_profiling:
    'Phase 31 records WHAT happened (timestamps + actions). It MUST NEVER infer WHO the operator is or score them.',
  behavioral_operator_prediction:
    'Memory NEVER predicts what an operator is likely to do next. No predicted preferences, no behavioral ML, no inference.',
  decision_automation:
    'Memory NEVER drives or influences automated decisions. Replay-only.',
  operator_preference_inference:
    'NO derivation of operator preferences from event history. Operators stay in control.',
  adaptive_operator_steering:
    'Memory NEVER nudges operators toward particular choices based on past activity.',
  cross_org_cognition_propagation:
    'All memory partitioned per-organization. NO cross-org reads, NO cross-org learning.',
  self_evolving_governance_memory:
    'Memory templates are static. NO auto-discovery of patterns, NO self-tuning, NO drift adaptation.',
  hidden_cognition_weighting:
    'NO hidden weights, NO priority biases, NO silent compression. Every metric is fully exposed; every omission is attributed.',
  operator_ranking_emission:
    'NO per-operator effectiveness scores, NO operator leaderboards, NO ranking signals of any kind.',
};

const REGISTRY_HASH = createHash('sha256')
  .update(JSON.stringify({ FORBIDDEN_ACTIONS, FORBIDDEN_EXPLANATIONS }))
  .digest('hex')
  .slice(0, 16);

const REGISTRY: ForbiddenMemoryActionRegistry = Object.freeze({
  forbidden_actions: FORBIDDEN_ACTIONS,
  forbidden_explanations: FORBIDDEN_EXPLANATIONS,
  registry_hash: REGISTRY_HASH,
});

export function getForbiddenMemoryRegistry(): ForbiddenMemoryActionRegistry {
  return REGISTRY;
}

export function isMemoryActionForbidden(action: string): boolean {
  return (FORBIDDEN_ACTIONS as ReadonlyArray<string>).includes(action);
}

export function explainForbiddenMemory(action: ForbiddenMemoryActionKind): string {
  return FORBIDDEN_EXPLANATIONS[action] ?? '';
}
