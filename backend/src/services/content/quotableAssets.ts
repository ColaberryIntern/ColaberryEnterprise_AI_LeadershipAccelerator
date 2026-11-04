import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { findBannedCopy, bannedCopyInstruction } from './bannedCopyMatch';
import { isSafeToAdvertise } from '../explorerGrowth/drafts/draftCopyGuards';

/**
 * The marketing library an agent may quote from in an email, screened at the moment of quoting.
 *
 * WHY THIS EXISTS. Ali decided on 2026-11-02 which library Maya may quote from: Explorer Growth
 * content assets and campaign templates, explicitly NOT the marketing documents in the repo,
 * because those carry no clearance state and no owner for keeping one. This module is library A.
 * Library B (campaign templates) is deliberately absent; see WHAT THIS DOES NOT DO.
 *
 * READS ONLY. One SELECT, no writes, no mailer import, nothing here can send.
 *
 * ── WHY THE GATE IS HERE AND NOT ONLY AT GENERATION ─────────────────────────
 *
 * This text arrives from the DATABASE, not from a prompt, so a generation-time check never sees
 * it. That is not hypothetical: on 2026-10-28 the most-selected asset across all 612 shadow
 * decisions (392 of 416 content selections) was titled "Welcome to Your Free AI Preview" -
 * active, email-allowed, and advertising our own offering as free, which is the TWC 807.172(d)
 * line we hold everywhere else. The frontend copy ratchet could not see it, because the ratchet
 * scans source files and this was a row.
 *
 * Measured again on 2026-11-04: that asset is now titled "Welcome to Your AI Preview" and the
 * word is gone. The gate stays anyway. The library is 1,444 rows that Marketing edits without
 * passing through CI, so "it is clean today" is a reading, not a property.
 *
 * ── WHY `approval_status` IS NOT IN THE PREDICATE ───────────────────────────
 *
 * The obvious filter is `approval_status = 'approved'`, and it is wrong today. Measured against
 * production on 2026-11-04: the column is NULL on all 1,444 rows, no row has ever been approved,
 * and no query in the repo writes it. Filtering on it selects ZERO assets, which would ship a
 * quoting feature that can quote nothing while looking rigorous.
 *
 * Ali chose active + email-allowed + the gate, on 2026-11-04, knowing that. If an approval
 * workflow is ever built, this predicate is where it belongs - and `APPROVAL_IS_UNENFORCED`
 * below is pinned by a test, so the day a row gets approved, that test fails and sends whoever
 * did it here instead of letting the column stay decorative.
 *
 * ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
 *
 * It does not compose, draft, queue or send anything, and it does not register a tool. It hands
 * back a screened list and a digest. Wiring it into Maya's tool registry changes what an agent
 * can do and is a separate, separately-reviewable change.
 *
 * It does not include campaign templates. The decision named them, but "campaign templates" has
 * two candidate homes in this codebase - `follow_up_sequences.steps[].body_template`, which the
 * sender really uses, and `content_templates`, which has no service, controller or route
 * consumer anywhere in backend/src. Picking one by guess would be authoring a decision nobody
 * made, so library B waits for Ali to name the table.
 */

/** One asset an agent may quote: pointers and short text, never a body. */
export interface QuotableAsset {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
}

/**
 * An asset that matched the query but whose OWN text cannot be advertised.
 *
 * Reported rather than dropped. A caller that sees `quotable: []` must be able to tell "the
 * library is empty" from "the library had rows and every one of them was refused" - those are
 * different failures with different fixes, and collapsing them into an empty array is the same
 * defect as reading an absent value as zero.
 */
export interface RefusedAsset {
  id: string;
  title: string;
  /** Which banned-word rules the asset's own text breaks. Never empty; a test pins that. */
  rule_ids: string[];
}

export interface QuotableAssetSet {
  quotable: QuotableAsset[];
  refused: RefusedAsset[];
  /** Rows the query returned BEFORE screening, so a refusal rate is computable. */
  considered: number;
}

/**
 * True while nothing in the product sets `approval_status`.
 *
 * A constant rather than a comment so a test can assert it against the real column, and so the
 * claim in the docblock above cannot quietly go stale.
 */
export const APPROVAL_IS_UNENFORCED = true;

/** Default page size. The resolver next door caps at a page; an agent needs far fewer. */
export const DEFAULT_QUOTABLE_LIMIT = 25;

/** Hard ceiling, so a caller cannot ask for the whole 1,444-row library in one prompt. */
export const MAX_QUOTABLE_LIMIT = 100;

/**
 * Active, reachable by email, and inside its own date window.
 *
 * The date clauses are not decoration: an expired asset is still `active = true` in this table,
 * so omitting them would let an agent quote a cohort that has already started. Written the same
 * way as `resolveContentAssets.RESOLVE_SQL` so the two cannot drift on what "live" means.
 *
 * An untitled row is excluded at the SQL rather than later, because a quote with no title is not
 * a quote - and `isSafeToAdvertise` reading an empty title would pass it as clean.
 *
 * MEASURED AGAINST PRODUCTION, 2026-11-04, because a mock cannot tell you whether an array
 * operator works. Of 1,444 rows: 472 active, and every later clause costs nothing - 472 after
 * the email filter, 472 after both date clauses, 472 after the title check. The gate then
 * refuses 5 of those 472.
 *
 * ONE CLAUSE IS A NO-OP TODAY, AND IS KEPT ANYWAY. `'email' = ANY(allowed_channels)` excludes
 * exactly ZERO rows: the column defaults to '{email}' and nothing in the product has ever set
 * it to anything else. It stays because the column is real and the day a row is marked sms-only
 * this query must already respect it. It is recorded as a no-op rather than described as
 * protection, so nobody reads the predicate and believes a channel rule is being enforced.
 */
const QUOTABLE_SQL = `
  SELECT id, title, summary, url
    FROM explorer_content_assets
   WHERE active = true
     AND 'email' = ANY(allowed_channels)
     AND (starts_at IS NULL OR starts_at <= :as_of)
     AND (expires_at IS NULL OR expires_at > :as_of)
     AND title IS NOT NULL
     AND btrim(title) <> ''
   ORDER BY priority DESC, published_at DESC NULLS LAST, id
   LIMIT :max_rows
`;

interface AssetRow {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
}

/**
 * Why an asset was refused, as rule ids.
 *
 * Reads the SAME two fields `isSafeToAdvertise` reads. That duplication is deliberate and
 * guarded: `isSafeToAdvertise` owns the DECISION, this owns the REASON, and a test asserts a
 * refusal always carries at least one rule id. If the decision ever widens to a third field,
 * that test fails rather than this silently reporting an empty reason - which would read as
 * "refused for nothing" and be worse than either.
 */
function refusalRuleIds(asset: AssetRow): string[] {
  const hits = [
    ...findBannedCopy(asset.title ?? ''),
    ...findBannedCopy(asset.summary ?? ''),
  ];
  return Array.from(new Set(hits.map((h) => h.rule_id)));
}

/**
 * The assets an agent may quote right now, and the ones it may not, with reasons.
 *
 * `asOf` is injectable so the date window is testable without waiting for a clock.
 */
export async function listQuotableAssets(
  opts: { limit?: number; asOf?: Date } = {},
): Promise<QuotableAssetSet> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_QUOTABLE_LIMIT, 1), MAX_QUOTABLE_LIMIT);
  const rows = await sequelize.query<AssetRow>(QUOTABLE_SQL, {
    type: QueryTypes.SELECT,
    replacements: { as_of: opts.asOf ?? new Date(), max_rows: limit },
  });

  const quotable: QuotableAsset[] = [];
  const refused: RefusedAsset[] = [];
  for (const row of rows) {
    if (isSafeToAdvertise(row)) {
      quotable.push({ id: row.id, title: row.title, summary: row.summary, url: row.url });
    } else {
      refused.push({ id: row.id, title: row.title, rule_ids: refusalRuleIds(row) });
    }
  }
  return { quotable, refused, considered: rows.length };
}

/**
 * The digest handed to a model, carrying the copy rules with it.
 *
 * ## Why the instruction ships WITH the list rather than beside it
 *
 * Detection alone measured badly. `bannedCopyInstruction`'s own docblock records a live Explorer
 * render on 2026-11-01 where the guard refused 8 of 12 drafts, every one for the same banned
 * word, in prose the model wrote unprompted - a guard working exactly as specified while leaving
 * the feature unusable. Stating the rule up front makes refusal the backstop instead of the
 * normal path. Quoting is the same shape, so it gets the same treatment.
 *
 * ## Why it says what it is NOT authoritative for
 *
 * These assets are titles, summaries and links - the registry holds POINTERS, never copy. A
 * model handed a list of marketing titles will cheerfully infer a price or a start date from
 * one. Maya is never authoritative for price, cohort date, deadline or seat count, so the digest
 * repeats that where the material is, not only in the persona prompt three layers away.
 */
export function quotableAssetDigest(set: QuotableAssetSet): string {
  if (set.quotable.length === 0) {
    // The two empty cases are NOT the same sentence, for the same reason the type keeps them
    // apart. A model told "no material" when 20 rows were refused would invent copy to fill a
    // gap it was told was natural.
    return set.considered === 0
      ? 'NO MARKETING MATERIAL is available to quote. Do not describe any lesson, offer or '
        + 'resource you have not been given here.'
      : `NO MARKETING MATERIAL is available to quote: ${set.considered} asset(s) were found and `
        + 'every one was refused by the copy rules. Do not paraphrase around a refusal. Do not '
        + 'describe any lesson, offer or resource you have not been given here.';
  }

  const lines = set.quotable.map((a) => {
    const summary = a.summary && a.summary.trim() !== '' ? ` - ${a.summary.trim()}` : '';
    const url = a.url ? ` (${a.url})` : '';
    return `- ${a.title}${summary}${url}`;
  });

  return [
    'MARKETING MATERIAL YOU MAY QUOTE. These are the only assets cleared to reach this person.',
    'Quote a title and link as written. Do not invent a lesson, a module or a resource that is',
    'not on this list, and do not describe one you were not given.',
    '',
    ...lines,
    '',
    'NOT YOURS TO STATE, whatever these titles imply: a price, a cohort date, a deadline or a',
    'seat count. Those come from the system of record. An asset title is not a system of record.',
    '',
    bannedCopyInstruction(undefined, 'copy that breaks one is refused before it is quoted'),
  ].join('\n');
}
