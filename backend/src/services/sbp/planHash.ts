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
 */
import { createHash } from 'crypto';
import { BuildPlan } from './planContract';

/** Recursively sort object keys so serialization is order-independent. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Stable JSON for a plan — the exact bytes that get hashed. */
export function canonicalPlanJson(plan: BuildPlan): string {
  return JSON.stringify(canonicalize(plan));
}

/** SHA-256 of the canonical form. Same plan ⇒ same hash, whatever the key order. */
export function hashPlan(plan: BuildPlan): string {
  return createHash('sha256').update(canonicalPlanJson(plan), 'utf8').digest('hex');
}
