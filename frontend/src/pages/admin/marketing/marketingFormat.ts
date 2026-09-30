/**
 * marketingFormat — money formatters that refuse to invent a number.
 *
 * WHY THIS IS A MODULE AND NOT AN INLINE TERNARY. The backend was changed so that revenue,
 * ROI and cost-per-lead return `null` when they cannot be computed, instead of a figure
 * derived from a hardcoded $4,500 price. Four call sites needed updating. Three were. The
 * fourth was this:
 *
 *     { label: 'Revenue', value: fmt$(roi.revenue || 0) }
 *
 * `null || 0` is `0`, so the campaign detail modal rendered a confident **$0** for a value the
 * system had just been taught it cannot know — the precise defect the change existed to
 * remove, on the same page. It survived a typecheck because the state was `useState<any>`,
 * and it survived the test suite because those tests grepped the SOURCE for a deleted constant
 * rather than exercising the rendering.
 *
 * The lesson is the one the repo already had written down: a producer changed without its
 * consumers is the defect, and `|| 0` is how "unknown" silently becomes "nothing". Putting the
 * decision in one pure, tested function is what stops the next call site getting its own
 * private opinion about what null means.
 */

export interface FormattedMoney {
  /** What to display. Never "$0" for an unknown value. */
  text: string;
  /** True when the value could not be computed — callers style and caption on this. */
  unavailable: boolean;
}

function currency(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Money that may be unknowable.
 *
 * `null` and `undefined` both mean "not computable" and render as "Unavailable". A real `0`
 * renders as `$0`, because a measured zero is a fact and must stay distinguishable from an
 * absent one — that distinction is the entire point.
 */
export function formatMoneyOrUnavailable(n: number | null | undefined): FormattedMoney {
  if (n === null || n === undefined || Number.isNaN(n)) {
    return { text: 'Unavailable', unavailable: true };
  }
  return { text: currency(n), unavailable: false };
}

/**
 * Spend, which is a special case: the column exists and nothing ever writes it.
 *
 * `campaigns.budget_spent` is set to `0` at creation and never incremented anywhere in the
 * codebase — it is not in `updateCampaign`'s allowlist and no ad-platform connector exists. So
 * a displayed `$0` is not a measurement of zero spend, it is the creation default being read
 * as one, and an operator comparing "spend" against "revenue" would be comparing two absences.
 *
 * Zero is therefore reported as untracked rather than as a number. If a real spend figure is
 * ever written — by hand or by a connector — it displays normally, so this narrows itself
 * automatically rather than needing to be undone.
 */
export function formatSpend(n: number | null | undefined): FormattedMoney {
  if (n === null || n === undefined || Number.isNaN(n) || Number(n) === 0) {
    return { text: 'Not tracked', unavailable: true };
  }
  return { text: currency(Number(n)), unavailable: false };
}

/**
 * A ratio such as ROI, which is null when either side of it is unknown.
 *
 * Kept here rather than inline so ROI cannot drift into rendering `0%` the way revenue drifted
 * into `$0` — the same mistake wearing a percent sign.
 */
export function formatRatioOrUnavailable(n: number | null | undefined): FormattedMoney {
  if (n === null || n === undefined || Number.isNaN(n)) {
    return { text: 'Unavailable', unavailable: true };
  }
  return { text: `${n > 0 ? '+' : ''}${(n * 100).toFixed(0)}%`, unavailable: false };
}
