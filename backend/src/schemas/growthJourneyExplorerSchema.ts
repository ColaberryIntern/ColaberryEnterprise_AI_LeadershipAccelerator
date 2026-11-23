import { z } from 'zod';

/**
 * The scope half of a brand-scoped Explorer read.
 *
 * ─── WHY THIS IS A SEPARATE SCHEMA AND NOT AN EXTENSION ─────────────────────
 *
 * Every query schema in `explorerGrowthSchema.ts` is `.strict()` and ends in a
 * `.transform()`, so `?brand_id=` would be rejected as an unknown key and the
 * result is a `ZodEffects` with no `.extend()` to add one. The three ways out
 * were: loosen Explorer's schemas (changes Explorer's contract, which this build
 * promises not to), re-declare each one with the scope keys folded in
 * (duplicates `scoreParam`'s bounds, the pagination cap and the day format - two
 * copies of a bound is one refactor from being one copy), or split the query in
 * two and validate each half with the schema that owns it.
 *
 * The third. `splitScope` lifts exactly this schema's keys out of `req.query`; the
 * REST goes to Explorer's own schema, verbatim, so a brand-scoped read enforces
 * byte-identical input rules to the Explorer route it mirrors. That is what
 * makes "the same page, by brand" true at the contract level rather than as an
 * intention.
 *
 * An unknown key still 400s, which is the property worth checking: it is not in
 * this schema's keys, so it stays in the remainder, and the remainder goes
 * to a `.strict()` schema.
 */

export const explorerScopeQuerySchema = z
  .object({
    tenant_id: z.string().uuid().optional(),
    /**
     * A SCOPE REQUEST, not a filter the caller controls. `scopedContext` grants
     * it only against a real membership and refuses rather than widening.
     */
    brand_id: z.string().uuid().optional(),
  })
  .strict();

/*
 * ─── THERE IS NO `program_id` HERE, AND THAT IS THE CORRECTION ──────────────
 *
 * The first version accepted one and echoed it back in the response envelope
 * while nothing read it: `scopedContext` takes `{ tenant_id, brand_id }` only,
 * and the reads receive a brand and nothing else. So
 * `?brand_id=...&program_id=<any uuid>` answered 200 with an envelope asserting
 * a programme the rows were never filtered by - a caller believing it got
 * something it did not, which is the exact failure `noQuerySchema` further down
 * the controller exists to prevent. An independent review caught it, and T5 was
 * specified to type its client off that envelope, so the inert field would have
 * become a frontend contract.
 *
 * It is dropped rather than enforced because there is nothing to enforce:
 * Explorer Growth IS one programme. `?program_id=` is now a 400. The envelope
 * still carries `program_id: null`, matching its sibling reads and following
 * `shadowRunsRead`'s rule - echoing a filter that never ran would claim one.
 */

export type ExplorerScopeQuery = z.infer<typeof explorerScopeQuerySchema>;

/** The scope keys, named once so the split and the schema cannot disagree. */
export const SCOPE_KEYS = ['tenant_id', 'brand_id'] as const;

/**
 * Split a request's query into the scope keys and everything else.
 *
 * Returns the two halves unvalidated; the caller validates each with its own
 * schema. Deliberately dumb: a split that also parsed would be a third place
 * input rules live.
 */
export function splitScope(query: Record<string, unknown>): {
  scope: Record<string, unknown>;
  rest: Record<string, unknown>;
} {
  const scope: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if ((SCOPE_KEYS as readonly string[]).includes(key)) scope[key] = value;
    else rest[key] = value;
  }
  return { scope, rest };
}
