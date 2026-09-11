import type { TrustLevel, TrustSignal } from '../../../components/admin/shell/trust';

/**
 * marketingTrust — derive the Marketing page's trust badge from what the page actually knows.
 *
 * WHY THIS FILE EXISTS. The badge used to read:
 *
 *     const trust: TrustSignal = useMemo(() => ({
 *       level: 'live',
 *       updatedAt: new Date().toISOString(),
 *       ...
 *     }), []);
 *
 * Both lines were untrue in a way no test could catch, and untrue in the dangerous direction —
 * they overstated confidence rather than understating it:
 *
 *  - `level: 'live'` was a constant. It said "live" while the fetch was still in flight, after
 *    the fetch returned a 500, and while the table rendered figures the metric registry says
 *    cannot be computed at all. A badge that cannot say anything else is not a signal; it is
 *    decoration that looks like a signal, which is worse than no badge, because it actively
 *    certifies whatever happens to be on screen.
 *
 *  - `updatedAt: new Date()` inside a `useMemo(…, [])` reported the moment the COMPONENT
 *    MOUNTED, not the moment the data was fetched. It was wrong in both directions at once:
 *    refreshing the data did not move it, and failing to load any data did not stop it claiming
 *    the page had just been updated.
 *
 * `TrustLevel` and `<TrustBadge>` already support this properly, and seven admin pages already
 * derive their level from real state (AdminIngestLogsPage, AdminReportsPage, AdminTrustCenterPage
 * and others). This is Marketing joining them, not a new mechanism.
 */

/** What the page can observe about its own data. Everything optional: not-yet-known is a state. */
export interface MarketingDataState {
  /** A fetch is in flight. */
  loading?: boolean;
  /** The fetch failed. */
  error?: boolean;
  /**
   * Metrics the API says it cannot compute, with reasons. Comes from the server's registry —
   * NOT duplicated here, so the frontend cannot drift into a rosier view than the backend's.
   * `undefined` means no answer has arrived yet, which is different from "none".
   */
  unavailable?: { key: string; name: string; reason: string }[];
  /** ISO timestamp of the last SUCCESSFUL fetch. null/undefined when nothing has loaded. */
  fetchedAt?: string | null;
}

/**
 * The order matters: the worst true statement wins.
 *
 * Deliberately biased pessimistic. A page that is loading, errored AND carrying unavailable
 * metrics reports the error, because the operator's next action differs most in that case. The
 * failure mode this ordering prevents is a partial success rendering as full confidence.
 */
export function deriveMarketingTrustLevel(state: MarketingDataState): TrustLevel {
  if (state.error) return 'error';
  // Nothing has come back yet. Not an error, but nothing has been verified either.
  if (state.loading || state.unavailable === undefined || !state.fetchedAt) return 'unverified';
  // Data arrived, but the registry says parts of it cannot be computed. Showing this as 'live'
  // is precisely the overstatement this module exists to prevent.
  if (state.unavailable.length > 0) return 'stale';
  return 'live';
}

function summarize(level: TrustLevel, state: MarketingDataState): string {
  switch (level) {
    case 'error':
      return 'Marketing data failed to load. Figures on this page may be missing or out of date.';
    case 'unverified':
      return 'Marketing data has not loaded yet. Nothing on this page has been verified.';
    case 'stale': {
      const n = state.unavailable?.length ?? 0;
      return `Funnel and campaign counts are live. ${n} money metric${n === 1 ? '' : 's'} ` +
        'cannot be computed and are shown as unavailable, not as zero.';
    }
    default:
      return 'Live marketing funnel, campaign registry and outreach data.';
  }
}

/**
 * Build the page's TrustSignal.
 *
 * `updatedAt` is `state.fetchedAt ?? null` and is NEVER `new Date()`. If the page does not know
 * when its data was fetched, the honest value is null — the badge renders no timestamp rather
 * than a fresh-looking one. Claiming "just now" because the component happened to render is the
 * exact defect this replaces.
 */
export function deriveMarketingTrust(state: MarketingDataState = {}): TrustSignal {
  const level = deriveMarketingTrustLevel(state);

  const pillars = [
    {
      name: 'Freshness',
      status: level,
      evidence: [
        { label: 'Source', value: 'marketing' },
        { label: 'Last loaded', value: state.fetchedAt ?? 'never' },
      ],
    },
    {
      name: 'Completeness',
      status: (state.unavailable === undefined
        ? 'unverified'
        : state.unavailable.length > 0
          ? 'stale'
          : 'live') as TrustLevel,
      // Every unavailable metric is listed WITH its reason, so the drill-down answers
      // "why is this blank" without anyone reading the source.
      evidence:
        state.unavailable === undefined
          ? [{ label: 'Not loaded', value: 'No metric status received yet' }]
          : state.unavailable.length === 0
            ? [{ label: 'All registered metrics computable', value: 'yes' }]
            : state.unavailable.map((u) => ({ label: u.name, value: u.reason })),
    },
  ];

  return {
    level,
    source: 'marketing',
    updatedAt: state.fetchedAt ?? null,
    summary: summarize(level, state),
    href: '/admin/trust',
    pillars,
  };
}
