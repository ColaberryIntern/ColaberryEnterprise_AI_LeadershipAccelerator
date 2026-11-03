/**
 * primaryCta — the ONE place the site's primary call to action is declared.
 *
 * ## Why this file exists
 *
 * C5.12 found that the single most-rendered instance of the banned word on the whole site
 * was the primary CTA label, and that it sat outside the scope of the thing that counts the
 * word. Two separate problems were tangled there, and this file untangles the second one:
 *
 *   1. The label itself still advertises the word. That is a COPY decision reserved for Ali
 *      (see "The label is deliberately unchanged here" below), not something to settle in a
 *      refactor.
 *   2. The label had no single owner. `PRIMARY_CTA` was declared in `constants/index.ts`,
 *      while `components/membership/personaContent.ts` declared a DIFFERENT constant under
 *      the very same name, and `config/v2Pricing.ts` carried three more CTA strings of its
 *      own. Changing "the call to action" therefore meant finding five strings in three
 *      files and hoping none was missed.
 *
 * This module fixes (2) so that (1) becomes a one-line edit instead of an audit.
 *
 * ## Why it lives in `config/` and not `constants/`
 *
 * Because `config/` is now inside the frontend copy lint's scope (`BASELINE_SCOPE.roots` in
 * `backend/src/services/content/frontendCopyBaseline.ts`). Declaring the label here means the
 * ratchet COUNTS it. Under the old arrangement the most-rendered instance of the word was
 * invisible to the counter, which is the specific gap C5.12 was raised to close: a lint that
 * cannot see the worst instance reports a number that is better than the truth.
 *
 * `constants/index.ts` re-exports `PRIMARY_CTA` from here, so every existing importer is
 * untouched and there is still exactly one declaration.
 *
 * ## The label is deliberately unchanged here
 *
 * This file does NOT replace the banned word. Two reasons, both deliberate:
 *
 *   - The replacement is Ali's call. "No card needed" is a reassurance, not a verb, so a
 *     button cannot simply be relabelled with it. The proposal on the ticket is a verb plus
 *     the reassurance carried separately — button "Start now", with "no card needed" as
 *     supporting text — which keeps the promise without advertising the word. Until that is
 *     confirmed, changing it would be inventing copy.
 *   - C10.1 is currently measuring checkout conversion (October ran 2 of 14 against 19 of 37
 *     in July). Changing the primary CTA site-wide mid-measurement would make it impossible
 *     to attribute the movement, so the conversion series would have to be marked broken at
 *     that date. Landing the structure now and the wording later costs nothing and keeps the
 *     series readable.
 *
 * When the decision lands, edit `label` below and nothing else.
 *
 * ## Keep this file dependency-free
 *
 * Its value is that anything may import it, including the pricing config. An import that
 * reaches a component, a route table or the claims registry would recreate the cycle this
 * replaced.
 */

/** A call to action: where it goes, what the button says, and what reassures the reader. */
export interface CallToAction {
  readonly path: string;
  readonly label: string;
  /**
   * Shown beside or beneath the button, never inside it. This is where a reassurance such as
   * "no card needed" belongs — it is not a verb, so it cannot be the label. Empty means the
   * surface renders the button alone.
   */
  readonly supportingText: string;
}

/**
 * The approved phrasings for the thing this CTA offers, per 40 TAC 807.172(d).
 *
 * Duplicated from `FREE_WORD_RULE.approvedAlternatives` by VALUE rather than by import,
 * because that rule lives in the backend tree and this file must stay importable from the
 * frontend bundle. `primaryCta.test.ts` asserts the two lists agree, so the duplication is
 * checked rather than hoped about.
 */
export const APPROVED_OFFER_PHRASINGS: readonly string[] = ['$0 to start', 'No card needed'];

/**
 * The site's primary call to action. One declaration, re-exported by `constants/index.ts`.
 *
 * `label` still carries the banned word. That is a known, tracked breach — it is counted by
 * the frontend copy lint against this file's baseline entry — and not an oversight. See the
 * header.
 */
export const PRIMARY_CTA: CallToAction = {
  path: '/try',
  label: 'Start free',
  supportingText: '',
};

/** The soft secondary invitation. Carries no offer claim, so no phrasing constraint applies. */
export const SECONDARY_CTA: CallToAction = {
  path: '/contact',
  label: 'Book a walkthrough',
  supportingText: '',
};
