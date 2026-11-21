/**
 * enterpriseIntakeRoi - rank the pilot options by what they could return (v2, 2026-11-21).
 *
 * Ali: "Draft options based on potential ROI." The model estimates, per option, the share of the
 * client's stated weekly hours it could take back (a low and a high percent, 0 to 80, to be tested
 * in the pilot). The arithmetic is done here, deterministically, from THEIR hours:
 *   hours a year = hours a week x 52;  potential = hours a year x share.
 *
 * INTERNAL ONLY. These figures are estimates for Ali and the team (Basecamp, admin, Ali's brief).
 * They never reach the client: the options email keeps its no-promise rule (ruleBreaks).
 */

export interface OptionShare {
  title: string;
  share_low?: number;
  share_high?: number;
}

export interface Roi {
  share_low: number;
  share_high: number;
  /** Null when the client gave no hours. */
  hours_low: number | null;
  hours_high: number | null;
}

export const hoursPerYear = (hoursPerWeek: number | string | null | undefined): number | null => {
  const h = hoursPerWeek === null || hoursPerWeek === undefined || hoursPerWeek === '' ? NaN : Number(hoursPerWeek);
  return Number.isFinite(h) && h > 0 ? Math.round(h * 52) : null;
};

const pct = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(80, Math.max(0, n)) : 0;
};

export function roiOf(o: OptionShare, hoursPerWeek: number | string | null | undefined): Roi {
  let lo = pct(o.share_low);
  let hi = pct(o.share_high);
  if (lo > hi) [lo, hi] = [hi, lo];
  const year = hoursPerYear(hoursPerWeek);
  return {
    share_low: lo,
    share_high: hi,
    hours_low: year === null ? null : Math.round((year * lo) / 100),
    hours_high: year === null ? null : Math.round((year * hi) / 100),
  };
}

/** Options with their ROI, highest potential first (by hours, else by share). Stable on ties. */
export function rankByRoi<T extends OptionShare>(options: T[], hoursPerWeek: number | string | null | undefined): Array<T & { roi: Roi }> {
  return options
    .map((o, n) => ({ o: { ...o, roi: roiOf(o, hoursPerWeek) }, n }))
    .sort((a, b) =>
      (b.o.roi.hours_high ?? b.o.roi.share_high) - (a.o.roi.hours_high ?? a.o.roi.share_high)
      || (b.o.roi.hours_low ?? b.o.roi.share_low) - (a.o.roi.hours_low ?? a.o.roi.share_low)
      || a.n - b.n)
    .map((x) => x.o);
}

/** "about 300 to 500 hours a year (30-50% of 1,040)", or the share alone when no hours were given. */
export function roiLabel(r: Roi | undefined | null): string {
  if (!r) return 'not estimated';
  const share = `${r.share_low}-${r.share_high}%`;
  if (r.hours_high === null || r.hours_low === null) return `${share} of the work (no hours given)`;
  const f = (n: number) => n.toLocaleString('en-US');
  return `about ${f(r.hours_low)} to ${f(r.hours_high)} hours a year (${share} of the stated hours)`;
}

/**
 * True when client copy states an ROI-style figure: a percent, or a number of hours. The ROI
 * estimates are internal; the options email must not carry them (checked when the AI drafts it
 * and again when anyone sends it).
 */
const ROI_FIGURE_PATTERNS: readonly RegExp[] = [
  /\d\s?%/,
  /\bper ?cent\b/i,
  /\b\d[\d,.]*\s*(hours?|hrs?)\b/i,
];

export function statesRoiFigure(text: string): boolean {
  return ROI_FIGURE_PATTERNS.some((re) => re.test(text));
}
