import type { TrustLevel, TrustSignal } from '../../../components/admin/shell/trust';
import { PERFORMANCE_TAB_LABELS, reportsTrust, type PerformanceTab } from './performanceTabs';

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
  /**
   * What this state DESCRIBES, in the words on the tab itself.
   *
   * The badge became per-tab on 2026-10-30. Before that it was one page-level signal fed by a
   * single tab, and its summaries said page-level things — "Funnel and campaign counts are
   * live" — while the operator might be looking at neither of those. A summary that names its
   * own subject cannot make that mistake.
   */
  surface?: string;
  /**
   * True when this surface reports nothing at all.
   *
   * Distinct from "has not loaded yet", and the distinction is the point. Both are
   * `unverified` — nothing has been checked either way — but one resolves on its own and the
   * other never will. Someone waiting for a spinner that is not coming is the failure this
   * separates out.
   */
  unreported?: boolean;
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

/**
 * The badge's sentence, naming its own subject.
 *
 * EVERY BRANCH SAYS WHICH TAB IT IS ABOUT. The old wording was page-level — "Funnel and
 * campaign counts are live" — which was a true-ish statement about the page and a false one
 * about whichever tab the operator was actually reading. Now that the badge follows the active
 * tab, a summary that does not name its subject is the same overstatement in a new place.
 *
 * The stale branch says "figures" rather than "money metrics". It used to be money-specific
 * because only one tab fed the badge and its gaps were all money. The funnel tab's gaps are
 * untracked landing pages, which are not money and are not metrics, and calling them that
 * would misdescribe the one thing the operator is being asked to go and fix.
 */
function summarize(level: TrustLevel, state: MarketingDataState): string {
  const surface = state.surface ?? 'Marketing data';

  switch (level) {
    case 'error':
      return `${surface} failed to load. Figures here may be missing or out of date.`;
    case 'unverified':
      return state.unreported
        ? `${surface} does not report a trust signal, so nothing here has been checked. ` +
          'This will not resolve by waiting.'
        : `${surface} has not loaded yet. Nothing here has been verified.`;
    case 'stale': {
      const n = state.unavailable?.length ?? 0;
      return `${surface} loaded. ${n} figure${n === 1 ? '' : 's'} cannot be computed and ` +
        `${n === 1 ? 'is' : 'are'} shown as unavailable, not as zero.`;
    }
    default:
      return `${surface} loaded, and everything it reports can be computed.`;
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
        // Names the TAB, not the page. With one badge serving four panels, "marketing" told the
        // operator nothing about which of them the timestamp below belongs to.
        { label: 'Source', value: state.surface ?? 'marketing' },
        {
          label: 'Last loaded',
          value: state.unreported ? 'this tab does not report' : state.fetchedAt ?? 'never',
        },
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
          ? [
              // "Not loaded" would be a lie for a tab that reports nothing: there is no load
              // pending. Telling someone to wait for an answer that is never coming is worse
              // than telling them none exists.
              state.unreported
                ? { label: 'Not reported', value: 'This tab does not report metric status' }
                : { label: 'Not loaded', value: 'No metric status received yet' },
            ]
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

/**
 * The badge for the tab currently on screen.
 *
 * ── A FUNCTION, NOT AN INLINE TERNARY ON THE PAGE ──
 *
 * The same reason `PerformanceScopeBar` is its own component: `performanceTabs.test.ts` can
 * prove `reportsTrust()` returns the right booleans, and cannot prove anything ASKS. That was
 * the actual defect here — the rule was knowable, the page rendered one global badge anyway,
 * and no test could tell. The page is 1,400 lines with lazy panels and four live requests, so
 * the decision lives where a test can call it directly.
 *
 * `surface` is applied AFTER the reported state, so the page's label wins over anything a
 * panel supplies. One owner for the tab's name, or the badge and the tab strip drift apart the
 * first time either is renamed.
 */
export function deriveTabTrust(
  activeTab: PerformanceTab,
  tabState: Partial<Record<PerformanceTab, MarketingDataState>>,
): TrustSignal {
  const surface = PERFORMANCE_TAB_LABELS[activeTab];

  // A tab that reports nothing is `unverified` — nothing has been checked — but it says WHY,
  // because "has not loaded yet" invites someone to wait for a load that is not coming.
  if (!reportsTrust(activeTab)) {
    return deriveMarketingTrust({ surface, unreported: true });
  }

  return deriveMarketingTrust({ ...(tabState[activeTab] ?? {}), surface });
}
