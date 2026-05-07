/**
 * mutationTrustCalibrator — Phase 15. Per-intent-class trust evolution
 * + autonomy recommendation (which intent class is currently safest
 * to fire autonomously).
 *
 * Mirrors the Phase 13 `autonomyTrustState` shape but keyed on the 7
 * MutationIntent classes. Trust score formula:
 *
 *   base = 100 * success / (success + rollback + 0.5 * verification_failure)
 *   adjusted = base - 5 * containment_penalty
 *
 * Per-class containment freezes (set by `mutationContainmentEngine`)
 * subtract the floor: a frozen class returns trust 0 regardless of the
 * raw counters.
 */

import type {
  MutationIntent,
  MutationTrustEntry,
  MutationTrustProfile,
} from './mutationTypes';
import { MUTATION_INTENT_CLASSES } from './mutationTypes';

interface InternalCounters {
  success: number;
  rollback: number;
  contained: number;
  verification_failure: number;
  last_updated_at: number;
}

const states = new Map<string, Map<MutationIntent, InternalCounters>>();
const frozenIntents = new Map<string, Set<MutationIntent>>();   // project → frozen set

function getProjectMap(project_id: string): Map<MutationIntent, InternalCounters> {
  let m = states.get(project_id);
  if (!m) {
    m = new Map();
    for (const intent of MUTATION_INTENT_CLASSES) {
      m.set(intent, { success: 0, rollback: 0, contained: 0, verification_failure: 0, last_updated_at: 0 });
    }
    states.set(project_id, m);
  }
  return m;
}

function getFrozenSet(project_id: string): Set<MutationIntent> {
  let s = frozenIntents.get(project_id);
  if (!s) {
    s = new Set();
    frozenIntents.set(project_id, s);
  }
  return s;
}

export function recordMutationSuccess(project_id: string, intent: MutationIntent): void {
  const m = getProjectMap(project_id).get(intent)!;
  m.success++;
  m.last_updated_at = Date.now();
}

export function recordMutationRollback(project_id: string, intent: MutationIntent): void {
  const m = getProjectMap(project_id).get(intent)!;
  m.rollback++;
  m.last_updated_at = Date.now();
}

export function recordMutationContainment(project_id: string, intent: MutationIntent): void {
  const m = getProjectMap(project_id).get(intent)!;
  m.contained++;
  m.last_updated_at = Date.now();
}

export function recordMutationVerificationFailure(project_id: string, intent: MutationIntent): void {
  const m = getProjectMap(project_id).get(intent)!;
  m.verification_failure++;
  m.last_updated_at = Date.now();
}

export function freezeIntentClass(project_id: string, intent: MutationIntent): void {
  getFrozenSet(project_id).add(intent);
}

export function unfreezeIntentClass(project_id: string, intent: MutationIntent): void {
  getFrozenSet(project_id).delete(intent);
}

export function isIntentFrozen(project_id: string, intent: MutationIntent): boolean {
  return getFrozenSet(project_id).has(intent);
}

export function getFrozenIntents(project_id: string): ReadonlyArray<MutationIntent> {
  return Array.from(getFrozenSet(project_id));
}

function computeTrustScore(intent: MutationIntent, counters: InternalCounters, frozen: boolean): number {
  if (frozen) return 0;
  const total = counters.success + counters.rollback + 0.5 * counters.verification_failure;
  if (total === 0) return 70;     // cold-start: moderate trust, not a free pass
  const base = (counters.success / total) * 100;
  const adjusted = base - 5 * counters.contained;
  return Math.max(0, Math.min(100, Math.round(adjusted)));
}

function buildEntry(intent: MutationIntent, counters: InternalCounters, frozen: boolean): MutationTrustEntry {
  return {
    intent_class: intent,
    trust_score: computeTrustScore(intent, counters, frozen),
    success_count: counters.success,
    rollback_count: counters.rollback,
    contained_count: counters.contained,
    verification_failure_count: counters.verification_failure,
    last_updated_at: counters.last_updated_at,
  };
}

export function readMutationTrustProfile(project_id: string): MutationTrustProfile {
  const m = getProjectMap(project_id);
  const frozen = getFrozenSet(project_id);
  const profiles_by_intent = {} as Record<MutationIntent, MutationTrustEntry>;
  for (const intent of MUTATION_INTENT_CLASSES) {
    profiles_by_intent[intent] = buildEntry(intent, m.get(intent)!, frozen.has(intent));
  }
  // Recommend the highest-trust non-frozen class with at least one success.
  let best: MutationIntent | null = null;
  let bestScore = -1;
  for (const intent of MUTATION_INTENT_CLASSES) {
    if (frozen.has(intent)) continue;
    const e = profiles_by_intent[intent];
    if (e.success_count === 0 && e.rollback_count === 0) continue;     // never tried; not yet recommended
    if (e.trust_score > bestScore) {
      bestScore = e.trust_score;
      best = intent;
    }
  }
  return {
    project_id,
    profiles_by_intent,
    autonomy_recommended_intent: best,
  };
}

/** Trust score for a single intent class. */
export function mutationTrustScore(project_id: string, intent: MutationIntent): number {
  const counters = getProjectMap(project_id).get(intent)!;
  return computeTrustScore(intent, counters, getFrozenSet(project_id).has(intent));
}

/** Average trust across all non-frozen intents — used by the engine summary block. */
export function avgMutationTrust(project_id: string): number {
  const m = getProjectMap(project_id);
  const frozen = getFrozenSet(project_id);
  const liveIntents = MUTATION_INTENT_CLASSES.filter(i => !frozen.has(i));
  if (liveIntents.length === 0) return 0;
  const total = liveIntents.reduce(
    (sum, i) => sum + computeTrustScore(i, m.get(i)!, false),
    0,
  );
  return Math.round(total / liveIntents.length);
}

export function _resetMutationTrustState(): void {
  states.clear();
  frozenIntents.clear();
}
