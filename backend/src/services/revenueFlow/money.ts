/**
 * The money vocabulary of the Revenue Room: the shape of a figure, and the only three ways
 * to make one.
 *
 * ── WHY THIS IS ITS OWN LEAF MODULE ──────────────────────────────────────────────────────
 *
 * It lived in `revenueFlowTypes.ts` until R12, which pushed that file past the 500-line hard
 * ceiling and so required a split before anything new landed. Of everything in there this is
 * the cleanest thing to lift: three runtime FUNCTIONS in a module whose job is types were
 * always slightly the wrong shape, and `Money` belongs beside its own constructors.
 *
 * It imports nothing, which is the point. Every stream builder needs to make a figure, so a
 * leaf here means none of them can create a cycle by reaching for one. `revenueFlowTypes`
 * re-exports all four names, so no existing caller changed.
 */

/**
 * A money figure, carried as cents AND as a formatted string.
 *
 * Both, deliberately. `cents` is what arithmetic and tests use; `display` is what the page
 * shows. Letting the frontend format would mean two places deciding whether $72,816 rounds
 * to "$72.8K", and a headline that disagrees with its own drill-down by a rounding step is
 * the kind of thing that costs a reader's trust in everything else on the page.
 *
 * `cents: null` means the figure is genuinely not knowable, and `display` then says why in
 * words rather than printing a zero. A zero and an unknown are different answers.
 */
export interface Money {
  cents: number | null;
  display: string;
  /** Where this figure came from, in one sentence a reader can act on. */
  provenance: string;
}

/** Format cents as a figure a reader can quote. Whole dollars: cents are noise at this scale. */
export function formatCents(cents: number, currency = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** A knowable figure. */
export function money(cents: number, provenance: string, currency = 'USD'): Money {
  return { cents, display: formatCents(cents, currency), provenance };
}

/**
 * An unknowable figure, which says so in the place a number would have been.
 *
 * The `display` is words, not "—", because a dash on a revenue dashboard gets read as zero
 * by anyone scanning quickly, and the difference between "nobody has priced this" and
 * "this is worth nothing" is the difference between a task and a conclusion.
 */
export function noMoney(display: string, provenance: string): Money {
  return { cents: null, display, provenance };
}

