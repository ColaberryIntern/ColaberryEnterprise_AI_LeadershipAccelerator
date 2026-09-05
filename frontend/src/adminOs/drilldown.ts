/**
 * The drill-down contract.
 *
 * "Drill-down" means a working analytical path, not a tooltip. Clicking a KPI, a
 * flow stage, a chart mark or an alert must open the exact records behind it with
 * every filter preserved — and the URL must carry that state so Back works, the
 * view is shareable, and the count can be reconciled against the headline.
 *
 * STATE LIVES IN THE URL, NOT IN COMPONENT STATE. A drill-through held in React
 * state cannot be linked, cannot survive a refresh, and breaks the browser Back
 * button — and the brief makes Back/Forward restoration a requirement. Serialising
 * here, once, also means the roster and the KPI read their filters from the same
 * parser and cannot disagree about what "this period, this site" means.
 */

export type DrilldownTargetKind =
  | 'people.roster'
  | 'revenue.transactions'
  | 'learning.learners'
  | 'growth.sessions'
  | 'operations.items';

export interface DrilldownTarget {
  kind: DrilldownTargetKind;
  /** The metric key this drill-down came from, so the roster can show its definition. */
  metricKey: string;
  /** Filters that reproduce exactly the population the metric counted. */
  filters: Readonly<Record<string, string | number | boolean | undefined>>;
}

/** Where each target kind renders. */
const TARGET_ROUTES: Record<DrilldownTargetKind, string> = {
  'people.roster': '/admin/people',
  'revenue.transactions': '/admin/revenue',
  'learning.learners': '/admin/learning',
  'growth.sessions': '/admin/growth',
  'operations.items': '/admin/operations',
};

/** Reserved keys the drill-down layer owns; a filter may not shadow them. */
const RESERVED = new Set(['view', 'metric', 'drilldown']);

/**
 * Serialise a drill-down into a URL.
 *
 * Undefined and empty filters are DROPPED rather than written as "undefined".
 * A literal `?site=undefined` reaching a query builder is how a filtered roster
 * silently returns everything, or nothing, while looking filtered.
 */
export function toDrilldownUrl(target: DrilldownTarget): string {
  const base = TARGET_ROUTES[target.kind];
  const params = new URLSearchParams();
  params.set('drilldown', '1');
  params.set('metric', target.metricKey);

  for (const [key, value] of Object.entries(target.filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (RESERVED.has(key)) continue;
    params.set(key, String(value));
  }

  return `${base}?${params.toString()}`;
}

/**
 * Read a drill-down back out of a URL.
 *
 * Returns null when the URL is not a drill-down, so a plain visit to a domain
 * route renders its dashboard rather than an empty filtered roster.
 */
export function fromDrilldownUrl(pathname: string, search: string): DrilldownTarget | null {
  const params = new URLSearchParams(search);
  if (params.get('drilldown') !== '1') return null;

  const metricKey = params.get('metric');
  if (!metricKey) return null;

  const kind = (Object.keys(TARGET_ROUTES) as DrilldownTargetKind[]).find(
    (k) => TARGET_ROUTES[k] === pathname,
  );
  if (!kind) return null;

  const filters: Record<string, string> = {};
  params.forEach((value, key) => {
    if (!RESERVED.has(key)) filters[key] = value;
  });

  return { kind, metricKey, filters };
}

/**
 * Whether a drill-down carries every filter its metric declares as required.
 *
 * The reconciliation guarantee depends on this: if a KPI counted "last 30 days,
 * crawlers excluded" and the roster opens without `includeBots`, the two disagree
 * and the reader has no way to see why. Checked rather than trusted.
 */
export function hasRequiredFilters(target: DrilldownTarget, required: readonly string[]): boolean {
  return required.every((key) => target.filters[key] !== undefined && target.filters[key] !== '');
}

/** Which filters are missing, for a diagnosable error rather than a silent wrong count. */
export function missingFilters(target: DrilldownTarget, required: readonly string[]): string[] {
  return required.filter((key) => target.filters[key] === undefined || target.filters[key] === '');
}
