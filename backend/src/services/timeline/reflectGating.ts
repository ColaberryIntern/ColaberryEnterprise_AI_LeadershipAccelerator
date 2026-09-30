/**
 * reflectGating — single source of truth for the reflect-section unlock chain:
 *
 *   Evaluation (the test)  → locked until the week's LEARN section is complete
 *   Survey (feedback)      → locked until the week's Evaluation is complete
 *   Reflection             → locked until the week's Survey is complete
 *
 * Consumed by three callers that must never drift from each other: the
 * createCard() auto-gate hook (timelineAdminService), the boot-time
 * reflectGatingReconciler, and the manual setReflectGating CLI script.
 */
import { UnlockPredicate } from './timelineGatingService';

export const LEARN_GATE: UnlockPredicate[] = [
  { kind: 'section_complete', bucket: 'learn', scope: 'week', label: 'the Learn section' },
];
export const EVAL_GATE: UnlockPredicate[] = [
  { kind: 'type_complete', type: 'evaluation', scope: 'week', label: 'the evaluation' },
];
export const SURVEY_GATE: UnlockPredicate[] = [
  { kind: 'type_complete', type: 'survey', scope: 'week', label: 'the feedback survey' },
];

export const REFLECT_GATED_TYPES = ['evaluation', 'survey', 'reflection'] as const;
export type ReflectGatedType = typeof REFLECT_GATED_TYPES[number];

export interface ReflectSiblingFlags {
  hasEval: boolean;
  hasSurvey: boolean;
}

/** PURE — does this week already have an evaluation / survey card (any status)? */
export function reflectSiblingFlags(cards: Array<{ type: string }>): ReflectSiblingFlags {
  return {
    hasEval: cards.some((c) => c.type === 'evaluation'),
    hasSurvey: cards.some((c) => c.type === 'survey'),
  };
}

/**
 * PURE — the reflect-chain gate for ONE card's type given its week's sibling
 * flags. Returns null for any type outside the chain (caller leaves
 * unlock_rules untouched in that case). Only gates a card when its
 * prerequisite exists that week (e.g. a lone Week-0 survey with no evaluation
 * falls back to gating on Learn instead).
 */
export function reflectGateFor(type: string, siblings: ReflectSiblingFlags): UnlockPredicate[] | null {
  if (type === 'evaluation') return LEARN_GATE;
  if (type === 'survey') return siblings.hasEval ? EVAL_GATE : LEARN_GATE;
  if (type === 'reflection') return siblings.hasSurvey ? SURVEY_GATE : siblings.hasEval ? EVAL_GATE : LEARN_GATE;
  return null;
}

/** PURE — are two normalized rule arrays equivalent? Gating always emits ONE canonical rule, so a plain deep-equal is safe (no reordering to account for). */
export function rulesEqual(a: UnlockPredicate[], b: UnlockPredicate[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
