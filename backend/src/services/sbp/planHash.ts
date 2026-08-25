/**
 * planHash — canonical hashing for a BuildPlan. PURE.
 *
 * The identity function for a plan. `savePlanDraft` records this hash and
 * `publishPlan` re-checks it, which is what makes "the plan you reviewed is the
 * plan that shipped" a checkable claim rather than an intention.
 *
 * Canonical means key order cannot change the hash: `JSON.stringify` preserves
 * insertion order, so two structurally identical plans built in a different
 * order would otherwise hash differently and a legitimate publish would be
 * rejected as tampered.
 *
 * THE ALGORITHM NOW LIVES IN `utils/canonicalHash.ts`. It used to be a private
 * `canonicalize()` in this file; the Case Study OS needs the identical function
 * for `case_study_snapshots.content_hash` (spec §30), and two copies of one
 * invariant eventually disagree. This file keeps its own names and its own
 * `BuildPlan` narrowing — callers see no change, and the plan-hash tests in
 * `__tests__/planStore.test.ts` pass unedited, which is the proof of that.
 */
import { canonicalJson, hashCanonical } from '../../utils/canonicalHash';
import { BuildPlan } from './planContract';

/** Stable JSON for a plan — the exact bytes that get hashed. */
export function canonicalPlanJson(plan: BuildPlan): string {
  return canonicalJson(plan);
}

/** SHA-256 of the canonical form. Same plan ⇒ same hash, whatever the key order. */
export function hashPlan(plan: BuildPlan): string {
  return hashCanonical(plan);
}
