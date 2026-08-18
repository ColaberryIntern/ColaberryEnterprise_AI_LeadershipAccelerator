/**
 * Stable dedup key for department-strategy-architect initiatives/tickets.
 *
 * Root cause fixed here (see directives/register-ticket-creating-agent.md Step 1 and
 * `.loop-architect/runs/20260818T000000Z-architects-audit/execution-contract.md` for the full
 * grounding): `departmentInitiativeEngine.ts`'s `createStrategicInitiative()` and
 * `strategyArchitectAgent.ts`'s pre-filter both used to dedup on EXACT TITLE TEXT. The
 * rule-based opportunity titles are static (safe), but the LLM-generated path (GPT-4o,
 * confirmed live in production) free-text-paraphrases the same underlying finding every
 * 6h cron cycle ("AI-Driven Predictive Analytics for Student Retention" -> "...Enhancement"
 * -> "...Activation" -> "...Pilot Execution", confirmed via a live production query — every
 * title distinct, every count=1), so the exact-match dedup never fires and a brand-new
 * `Initiative` row (and ticket) is created every cycle, forever — the same root-cause SHAPE
 * as PR #1495 (CoryBrain) and PR #1554 (cory-engine), just a full-paraphrase variant rather
 * than a single embedded number.
 *
 * Fix: dedup on the PROBLEM TYPE (a small, bounded, stable enum), never on free text. This
 * module is pure (no I/O) so it's unit-testable in isolation, per this repo's contract-
 * enforcement rules.
 */

/** The same 5 opportunity types `identifyOpportunities()` (departmentInitiativeEngine.ts)
 * already produces for the rule-based path, plus 'other' for an LLM-sourced opportunity that
 * doesn't cleanly map to any of the 5 — never trust LLM free text as the key itself, only as
 * a hint that gets validated against this fixed set. */
export const OPPORTUNITY_TYPES = [
  'health_gap',
  'innovation_gap',
  'stale_initiative',
  'no_active_work',
  'cross_dept',
  'other',
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** Prefix stamped into the `Initiative.tags` JSONB array so `createStrategicInitiative()` can
 * find an existing initiative by dedup key via a JSONB containment query, with zero schema
 * migration (mirrors `artifactService.ts`'s existing `Op.contains` usage on a JSONB array
 * column in this same codebase). */
const DEDUP_KEY_TAG_PREFIX = 'dedup_key:';

/**
 * Normalizes an untrusted, possibly-LLM-supplied opportunity type string against the fixed
 * enum. Never throws; unrecognized input always resolves to 'other' rather than being used
 * verbatim (an LLM emitting a novel string every cycle for "other" would just re-explode the
 * exact same bug one level up, so 'other' must ALSO be a bounded, stable bucket, not a raw
 * passthrough of whatever the LLM said this time).
 */
export function normalizeOpportunityType(rawType: unknown): OpportunityType {
  if (typeof rawType !== 'string') return 'other';
  const trimmed = rawType.trim().toLowerCase();
  const match = OPPORTUNITY_TYPES.find((t) => t === trimmed);
  return match ?? 'other';
}

/**
 * Derives the stable dedup key for a given opportunity. `cross_dept` opportunities are keyed
 * per PARTNER department (`crossDeptPartnerId`) deliberately — collaborating with Finance and
 * collaborating with Admissions are genuinely different findings, not duplicates of each
 * other, so partner-distinctness is intentional and must not be collapsed away. Every other
 * type is keyed once per department (the caller already scopes the dedup query by
 * `department_id`, so this key does not need to repeat it).
 */
export function deriveOpportunityDedupKey(
  opportunityType: unknown,
  crossDeptPartnerId?: string | null,
): string {
  const type = normalizeOpportunityType(opportunityType);
  if (type === 'cross_dept' && crossDeptPartnerId) {
    return `opportunity_type:cross_dept:${crossDeptPartnerId}`;
  }
  return `opportunity_type:${type}`;
}

/** Renders a dedup key as the literal tag string stored in `Initiative.tags`. */
export function toDedupKeyTag(dedupKey: string): string {
  return `${DEDUP_KEY_TAG_PREFIX}${dedupKey}`;
}

/** True if `tags` already carries the given dedup key's tag — used by the read side
 * (`strategyArchitectAgent.ts`'s pre-filter) to avoid even attempting to create a duplicate,
 * as a cheap in-memory check ahead of `createStrategicInitiative()`'s own authoritative DB
 * dedup query (defense in depth, not a replacement for it — the DB query is still the source
 * of truth against races). */
export function hasDedupKeyTag(tags: readonly string[] | null | undefined, dedupKey: string): boolean {
  if (!tags) return false;
  const target = toDedupKeyTag(dedupKey);
  return tags.includes(target);
}
