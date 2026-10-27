import type {
  FunnelStage, FunnelCampaignRow, FunnelPageRow,
} from '../acquisitionFunnelApi';

/**
 * Every derived number on the Marketing Performance report, in one place, with no React in it.
 *
 * ── WHY A SEPARATE MODULE ──
 *
 * The figures this page shows are close enough to be confused for one another - 38 page loads from
 * 16 visitors across 24 sessions is three true numbers for one page - and the rates are ratios
 * BETWEEN those numbers. A ratio computed inline in JSX is a ratio nobody can test, and the one
 * failure mode that matters here is silent: a denominator of zero yielding `Infinity` or `NaN` and
 * rendering as `Infinity%` on an executive's screen. So the arithmetic lives here and is tested,
 * and the components only format what comes back.
 *
 * ── THE RULE EVERY RATE OBEYS ──
 *
 * A rate with no denominator is `null`, never `0`. Zero is a measurement; null is the absence of
 * one, and they must not print the same way. `null` renders as an em dash.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──
 *
 * It does not change a single backend calculation. `count` for each stage, and every column of the
 * campaign and page rows, arrive from `/api/admin/marketing/funnel/acquisition` exactly as they do
 * today; this module only divides, orders and labels them. The redesign is presentation.
 */

/** Stage keys as the backend emits them (`backend/src/services/marketing/acquisitionFunnel.ts`). */
export const STAGE = {
  adClicks: 'ad_clicks',
  visitors: 'visitors',
  engaged: 'engaged',
  cta: 'cta',
  signups: 'signups',
  accounts: 'accounts',
  inCrm: 'in_crm',
  returned: 'returned',
} as const;

export function countOf(stages: FunnelStage[], key: string): number {
  const hit = stages.find((s) => s.key === key);
  return hit ? hit.count : 0;
}

/**
 * The single guard this module exists for. Returns null - not 0, not Infinity, not NaN - whenever
 * the denominator cannot support a ratio, which includes a missing stage (count 0) and a negative
 * value that could only come from a malformed payload.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export const EM_DASH = '—';

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return value.toLocaleString('en-US');
}

/** Rates print with one decimal on the KPI cards and none in the tables, per the spec. */
export function formatPct(value: number | null, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return `${(value * 100).toFixed(decimals)}%`;
}

export interface FunnelStep extends FunnelStage {
  /** Share of the FIRST stage, which is the top of the funnel rather than the largest stage. */
  ofTop: number | null;
  /** Share of the stage immediately above. Null for the first stage and when that stage is 0. */
  vsPrior: number | null;
  /** Absolute fall from the stage above. Negative when this stage is larger - see `grew`. */
  drop: number;
  /** True when this stage is bigger than the one above it, which is a finding, not an error. */
  grew: boolean;
}

/**
 * The stages in the order the backend returned them.
 *
 * NOT SORTED, and that is deliberate: the payload carries no `order` field, so array position IS
 * the funnel order. Sorting by count would manufacture the tidy descending shape that this data
 * specifically contradicts.
 */
export function funnelSteps(stages: FunnelStage[]): FunnelStep[] {
  const top = stages.length ? stages[0].count : 0;
  return stages.map((stage, i) => {
    const prior = i > 0 ? stages[i - 1] : null;
    const vsPrior = prior ? rate(stage.count, prior.count) : null;
    return {
      ...stage,
      ofTop: rate(stage.count, top),
      vsPrior,
      drop: prior ? prior.count - stage.count : 0,
      grew: vsPrior != null && vsPrior > 1,
    };
  });
}

/**
 * The key of the stage with the largest absolute fall, which the chart paints red.
 *
 * Largest ABSOLUTE fall, not the worst ratio: a 40% fall from 10,000 loses more people than a 90%
 * fall from 50, and the point of the colour is to say where the people went. Returns null when
 * nothing fell, so a healthy funnel gets no red bar rather than an arbitrary one.
 */
export function worstDropKey(steps: FunnelStep[]): string | null {
  let worst: FunnelStep | null = null;
  for (const step of steps) {
    if (step.drop > 0 && (worst === null || step.drop > worst.drop)) worst = step;
  }
  return worst ? worst.key : null;
}

export interface HeadlineRates {
  adToSignup: number | null;
  crmSync: number | null;
  returnRate: number | null;
}

export function headlineRates(stages: FunnelStage[]): HeadlineRates {
  const signups = countOf(stages, STAGE.signups);
  return {
    adToSignup: rate(signups, countOf(stages, STAGE.adClicks)),
    crmSync: rate(countOf(stages, STAGE.inCrm), signups),
    returnRate: rate(countOf(stages, STAGE.returned), signups),
  };
}

/** Raw utm codes are what links and filters use; these are only for display. */
const SOURCE_LABELS: Record<string, string> = {
  fb: 'Facebook',
  ig: 'Instagram',
  untagged: 'Untagged',
};

export function sourceLabel(raw: string | null): string {
  if (!raw) return 'Untagged';
  return SOURCE_LABELS[raw.toLowerCase()] ?? raw;
}

export interface SourceSlice {
  /** The raw utm code, kept so a slice can still address a link or filter. */
  source: string | null;
  label: string;
  signups: number;
}

/**
 * Signups per source for the donut.
 *
 * AGGREGATION IS REQUIRED HERE and the reference design did not need it: the endpoint returns one
 * row per (source, campaign) pair, so a source running four campaigns appears four times. Feeding
 * those rows straight to a pie would draw four slices of one colour for one source and a centre
 * total that happens to be right for the wrong reason.
 *
 * Zero-signup sources are dropped rather than drawn as a slice of nothing.
 */
export function signupsBySource(campaigns: FunnelCampaignRow[]): SourceSlice[] {
  const bucket = new Map<string, SourceSlice>();
  for (const row of campaigns) {
    const key = row.utm_source ?? '\u0000untagged';
    const existing = bucket.get(key);
    if (existing) existing.signups += row.signups;
    else {
      bucket.set(key, {
        source: row.utm_source,
        label: sourceLabel(row.utm_source),
        signups: row.signups,
      });
    }
  }
  return [...bucket.values()]
    .filter((slice) => slice.signups > 0)
    .sort((a, b) => b.signups - a.signups);
}

/** Of the people a campaign signed up, the share that reached the CRM. */
export function crmSyncRate(row: FunnelCampaignRow): number | null {
  return rate(row.in_crm, row.signups);
}

/** The spec's threshold: at or above 99% reads as healthy, anything less is worth a look. */
export function isCrmSyncHealthy(value: number | null): boolean {
  return value != null && value >= 0.99;
}

/**
 * Pages busiest first.
 *
 * Copies before sorting: `Array.prototype.sort` mutates, and the array handed in belongs to the
 * component's state. Sorting it in place is how a list silently reorders under a render that did
 * not ask it to.
 */
export function pagesByTraffic(pages: FunnelPageRow[]): FunnelPageRow[] {
  return [...pages].sort((a, b) => b.visitors - a.visitors);
}

/** A page with no tracker reports zeros that mean "unknown", not "none". */
export function isMeasurable(page: FunnelPageRow): boolean {
  return page.site_slug !== null;
}

/**
 * Bar width as a percentage of the widest value in the set.
 *
 * Against the WIDEST stage rather than the first, because a later stage can legitimately exceed an
 * earlier one here; scaling to the first would push those bars past the end of the track. Floors
 * at a hair above zero so a real-but-tiny value still draws something a reader can see.
 */
export function barWidthPct(value: number, widest: number): number {
  if (widest <= 0 || value <= 0) return 0;
  return Math.max(0.6, (value / widest) * 100);
}

export function widestCount(steps: { count: number }[]): number {
  return steps.reduce((max, s) => (s.count > max ? s.count : max), 0);
}

/**
 * The one-sentence summary above the cards.
 *
 * Built from the figures rather than written, and it CHANGES ITS CLAIM with them: the stock
 * sentence asserts that nearly everyone reached the CRM and few came back, which is true of
 * today's numbers and would be a lie the moment the CRM sync broke. The spec asks for one sentence
 * of facts, so each clause is chosen against its own threshold.
 */
export function takeawaySentence(stages: FunnelStage[]): string {
  const adSessions = countOf(stages, STAGE.adClicks);
  const signups = countOf(stages, STAGE.signups);
  const rates = headlineRates(stages);

  if (adSessions === 0 && signups === 0) {
    return 'No ad sessions or signups were recorded in this window.';
  }

  const lead = `Ads drove ${formatCount(adSessions)} sessions and ${formatCount(signups)} signups`
    + (rates.adToSignup == null ? '' : `, a ${formatPct(rates.adToSignup)} conversion`);

  if (rates.crmSync == null) return `${lead}.`;

  const crmClause = rates.crmSync >= 0.95
    ? 'Nearly all reached the CRM'
    : `Only ${formatPct(rates.crmSync)} reached the CRM`;

  if (rates.returnRate == null) return `${lead}. ${crmClause}.`;

  const returnClause = rates.returnRate > 0.2
    ? `and ${formatPct(rates.returnRate)} came back on a later day`
    : `but only ${formatPct(rates.returnRate)} came back on a later day`;

  const tail = rates.returnRate > 0.2 ? '' : ' — re-engagement is the weak link';
  return `${lead}. ${crmClause}, ${returnClause}${tail}.`;
}
