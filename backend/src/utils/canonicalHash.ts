/**
 * canonicalHash — order-independent content hashing for any JSON-shaped value.
 *
 * WHY THIS EXISTS AS A UTIL RATHER THAN A SECOND COPY
 * `services/sbp/planHash.ts` has needed exactly this since the Student Build
 * Pipeline shipped: a recursive key sort followed by sha256, so that two
 * structurally identical values built in a different order cannot hash
 * differently. The Case Study OS needs the same identity function for
 * `case_study_snapshots.content_hash` (spec §30). Writing it twice would give
 * two implementations of one invariant, and the day they disagree is the day a
 * legitimate publish is rejected as tampered in one subsystem and a duplicate
 * snapshot row is written in the other. So the algorithm was extracted here,
 * unchanged, and `planHash.ts` now imports it. That extraction is
 * behaviour-preserving, and `services/sbp/__tests__/planStore.test.ts` passing
 * WITHOUT EDITS is the proof — those five `describe('planHash')` tests were
 * written against the private copy and run on every pull request.
 *
 * LEAF MODULE. It imports `crypto` and nothing else — no service, no model, no
 * type from the domain. Anything may depend on it; it depends on nothing, so it
 * can never drag a database connection into a test that does not want one.
 *
 * ── WHAT IS AND IS NOT PART OF THE IDENTITY ──────────────────────────────────
 * The rules below are `JSON.stringify`'s, not ours, and callers have to know
 * them because they decide what "the same content" means:
 *
 *   · Key ORDER is erased. That is the whole point.
 *   · A key whose value is `undefined` is DROPPED, so `{ a: 1, b: undefined }`
 *     and `{ a: 1 }` hash identically. Deliberate and relied upon: a snapshot
 *     section that is absent and a section explicitly set to `undefined` are
 *     the same statement, and CaseStudySnapshotContent's optional sections are
 *     built with that equivalence in mind.
 *   · Array ORDER is significant. Anything whose order is incidental — a set of
 *     repositories, a list of languages — must be sorted by its producer BEFORE
 *     it gets here. This function will not do it for you, because reordering an
 *     array whose order is meaningful (a timeline) would be a correctness bug.
 *   · `Date`, `Map` and `Set` collapse to `{}` — they enumerate no own keys.
 *     Never hand this function a live `Date`; convert to an ISO string first.
 *     A test below pins this so it is a documented trap rather than a surprise.
 *   · Top-level `undefined` hashes as `null`. `JSON.stringify(undefined)`
 *     returns `undefined`, which `createHash().update()` would throw on;
 *     collapsing it matches what already happens to `undefined` in every nested
 *     position, so the alternative would be inconsistent as well as noisier.
 *   · Cyclic values throw, as `JSON.stringify` does. A cycle has no canonical
 *     serialization, so failing loudly is the only honest outcome.
 */
import { createHash } from 'crypto';

/**
 * Recursively sort object keys so serialization is order-independent.
 *
 * Returns a NEW structure; the input is never mutated. Non-plain values
 * (numbers, strings, `null`, functions, class instances) are returned as-is and
 * left to `JSON.stringify` to interpret.
 */
export function canonicalize(value: unknown): unknown {
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

/** Stable JSON — the exact bytes that get hashed. See the header for the rules. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'null';
}

/** SHA-256 of the canonical form. Same content ⇒ same hash, whatever the key order. */
export function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
