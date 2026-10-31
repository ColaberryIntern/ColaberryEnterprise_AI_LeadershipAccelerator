import {
  deriveMarketingTrust,
  deriveMarketingTrustLevel,
  deriveTabTrust,
} from '../marketingTrust';
import { PERFORMANCE_TABS, PERFORMANCE_TAB_LABELS } from '../performanceTabs';

/**
 * The Marketing trust badge must be DERIVED from observed state, never asserted.
 *
 * What it used to be, verbatim:
 *
 *     const trust: TrustSignal = useMemo(() => ({
 *       level: 'live',
 *       updatedAt: new Date().toISOString(),
 *       ...
 *     }), []);
 *
 * Neither line could ever say anything else. Across the admin surface 35 pages carry that same
 * literal and not one of them ever renders a different level, so the chip is decoration shaped
 * like a signal — and it fails in the direction that matters, certifying data as live when the
 * fetch 500'd or when the figures on screen cannot be computed at all.
 *
 * These tests exist to make the badge falsifiable. If someone reverts to a literal, the
 * "responds to state" tests below fail, because a constant cannot produce four different
 * answers for four different inputs.
 */

describe('deriveMarketingTrustLevel', () => {
  it('is unverified before anything loads', () => {
    // Not an error - but nothing has been checked, and saying "live" here is the original bug.
    expect(deriveMarketingTrustLevel({})).toBe('unverified');
    expect(deriveMarketingTrustLevel({ loading: true })).toBe('unverified');
  });

  it('is error when the fetch failed', () => {
    expect(deriveMarketingTrustLevel({ error: true, fetchedAt: null })).toBe('error');
  });

  it('reports the error even when stale data is still on screen', () => {
    // The dangerous case: a refresh fails while the previous render is still displayed. The
    // page keeps showing numbers, so the badge is the only thing that can tell the operator
    // they are looking at something that just failed to update.
    expect(
      deriveMarketingTrustLevel({
        error: true,
        fetchedAt: '2026-09-10T10:00:00.000Z',
        unavailable: [],
      }),
    ).toBe('error');
  });

  it('is stale - NOT live - when the server reports uncomputable metrics', () => {
    expect(
      deriveMarketingTrustLevel({
        fetchedAt: '2026-09-10T10:00:00.000Z',
        unavailable: [{ key: 'marketing.roas', name: 'ROAS', reason: 'no spend data' }],
      }),
    ).toBe('stale');
  });

  it('is live only when data loaded AND nothing is uncomputable', () => {
    expect(
      deriveMarketingTrustLevel({ fetchedAt: '2026-09-10T10:00:00.000Z', unavailable: [] }),
    ).toBe('live');
  });

  it('does not treat "loaded" as enough on its own', () => {
    // unavailable === undefined means no answer arrived, which is NOT the same as "none".
    // Conflating the two is how a missing field becomes an implicit all-clear.
    expect(deriveMarketingTrustLevel({ fetchedAt: '2026-09-10T10:00:00.000Z' })).toBe('unverified');
  });

  it('responds to state - a literal could not produce these four answers', () => {
    const levels = [
      deriveMarketingTrustLevel({}),
      deriveMarketingTrustLevel({ error: true }),
      deriveMarketingTrustLevel({ fetchedAt: 'x', unavailable: [{ key: 'k', name: 'n', reason: 'r' }] }),
      deriveMarketingTrustLevel({ fetchedAt: 'x', unavailable: [] }),
    ];
    expect(new Set(levels).size).toBe(4);
  });
});

describe('deriveMarketingTrust — the updatedAt regression', () => {
  it('is null when nothing has been fetched, and never a fresh timestamp', () => {
    // THE original defect: `updatedAt: new Date().toISOString()` in a useMemo with an empty
    // dependency array reported the component's mount time as the data's freshness. It claimed
    // the page had just updated when no request had been made at all.
    expect(deriveMarketingTrust({}).updatedAt).toBeNull();
    expect(deriveMarketingTrust({ error: true }).updatedAt).toBeNull();
  });

  it('reports the fetch time it was given, not the current time', () => {
    const fetchedAt = '2020-01-01T00:00:00.000Z';
    const signal = deriveMarketingTrust({ fetchedAt, unavailable: [] });
    expect(signal.updatedAt).toBe(fetchedAt);
    // A `new Date()` implementation would return today and fail this outright.
    expect(signal.updatedAt).not.toContain('2026');
  });

  it('is pure - the same input twice gives the same timestamp', () => {
    // `new Date()` returns a different value on every call, so this is the property that
    // distinguishes a reported timestamp from a manufactured one.
    const a = deriveMarketingTrust({});
    const b = deriveMarketingTrust({});
    expect(a.updatedAt).toBe(b.updatedAt);
  });
});

describe('deriveMarketingTrust — the unavailable metrics are explained, not hidden', () => {
  const unavailable = [
    { key: 'marketing.roas', name: 'Return on ad spend', reason: 'No ad spend source exists.' },
    { key: 'marketing.ad_spend', name: 'Ad spend', reason: 'No ad-platform integration.' },
  ];

  it('surfaces every reason as drill-down evidence', () => {
    const signal = deriveMarketingTrust({ fetchedAt: 'now', unavailable });
    const completeness = signal.pillars?.find((p) => p.name === 'Completeness');
    expect(completeness?.status).toBe('stale');
    expect(completeness?.evidence).toHaveLength(2);
    expect(completeness?.evidence?.map((e) => e.value)).toEqual([
      'No ad spend source exists.',
      'No ad-platform integration.',
    ]);
  });

  it('says how many figures are missing rather than implying none are', () => {
    const signal = deriveMarketingTrust({ fetchedAt: 'now', unavailable });
    // "2 money metrics" until 2026-10-30. Changed because the badge's SUBJECT changed, not to
    // loosen the assertion: it is per-tab now, and the funnel tab's gaps are untracked landing
    // pages, which are neither money nor metrics. Calling them that would misdescribe the one
    // thing the operator is being sent to fix. The count and "not as zero" still hold.
    expect(signal.summary).toContain('2 figures');
    expect(signal.summary).toContain('not as zero');
  });

  it('gets the singular right, so one gap does not read as a template bug', () => {
    const one = deriveMarketingTrust({ fetchedAt: 'now', unavailable: [unavailable[0]] });
    expect(one.summary).toContain('1 figure cannot be computed');
    expect(one.summary).not.toContain('1 figures');
  });

  it('never claims live while any metric is uncomputable', () => {
    expect(deriveMarketingTrust({ fetchedAt: 'now', unavailable }).level).not.toBe('live');
  });
});

describe('the badge names the tab it is describing', () => {
  it('puts the surface in every summary', () => {
    // One badge serves four panels. A summary that does not name its subject is how the old
    // one said "Funnel and campaign counts are live" while the operator read a third thing.
    const surface = 'Campaign performance';
    const states = [
      { surface, error: true },
      { surface },
      { surface, fetchedAt: 'now', unavailable: [{ key: 'k', name: 'n', reason: 'r' }] },
      { surface, fetchedAt: 'now', unavailable: [] },
    ];

    for (const state of states) {
      expect(deriveMarketingTrust(state).summary).toContain(surface);
    }
  });

  it('names the tab as the freshness source, not the whole section', () => {
    const signal = deriveMarketingTrust({ surface: 'Marketing funnel', fetchedAt: 'now', unavailable: [] });
    const freshness = signal.pillars?.find((p) => p.name === 'Freshness');

    // "marketing" told the operator nothing about WHICH panel the timestamp belonged to.
    expect(freshness?.evidence?.find((e) => e.label === 'Source')?.value).toBe('Marketing funnel');
  });

  it('still works with no surface given, so other callers are unaffected', () => {
    expect(deriveMarketingTrust({}).summary).toContain('Marketing data');
  });
});

describe('deriveTabTrust — the badge describes the tab in front of you', () => {
  const funnelLoaded = { fetchedAt: '2026-10-30T10:00:00.000Z', unavailable: [] };
  const revenueStale = {
    fetchedAt: '2026-10-30T11:00:00.000Z',
    unavailable: [{ key: 'marketing.roas', name: 'ROAS', reason: 'No ad spend source.' }],
  };

  it('reports the ACTIVE tab, not whichever tab happened to report last', () => {
    // THE DEFECT THIS REPLACES. One badge, four panels, and exactly one of them fed it. Open
    // the campaign-performance tab once and the badge kept showing ITS state while the
    // operator read the funnel.
    const state = { funnel: funnelLoaded, revenue: revenueStale };

    expect(deriveTabTrust('funnel', state).level).toBe('live');
    expect(deriveTabTrust('revenue', state).level).toBe('stale');
  });

  it('does not report "unverified" over a tab that loaded perfectly', () => {
    // The literal symptom: the funnel had loaded, and the badge above it said Unverified
    // because `dataState` was still the `{}` it started as.
    expect(deriveTabTrust('funnel', { funnel: funnelLoaded }).level).not.toBe('unverified');
  });

  it('names the active tab, using the tab strip\'s own label', () => {
    const signal = deriveTabTrust('revenue', { revenue: revenueStale });

    expect(signal.summary).toContain(PERFORMANCE_TAB_LABELS.revenue);
    expect(signal.summary).not.toContain('Revenue');
  });

  it('says a non-reporting tab does not report, rather than borrowing a sibling\'s verdict', () => {
    const signal = deriveTabTrust('outreach', { funnel: funnelLoaded, revenue: revenueStale });

    expect(signal.level).toBe('unverified');
    expect(signal.summary).toContain('does not report');
    // The sibling's state is RIGHT THERE in the map. Reading it would be the old bug.
    expect(signal.summary).not.toContain('cannot be computed');
  });

  it('treats a reporting tab with no entry yet as not-yet-loaded, not as unreported', () => {
    const signal = deriveTabTrust('registry', {});

    expect(signal.level).toBe('unverified');
    expect(signal.summary).toContain('has not loaded yet');
    expect(signal.summary).not.toContain('does not report');
  });

  it('gives every tab a signal, so a new one cannot render a blank badge', () => {
    for (const tab of PERFORMANCE_TABS) {
      const signal = deriveTabTrust(tab, {});
      expect(signal.level).toBeTruthy();
      // `summary` is optional on TrustSignal, so this asserts it is PRESENT as well as
      // non-empty — `signal.summary!.length` would have asserted neither.
      expect(typeof signal.summary).toBe('string');
      expect(signal.summary).not.toHaveLength(0);
    }
  });

  it('carries the active tab\'s OWN timestamp', () => {
    const state = { funnel: funnelLoaded, revenue: revenueStale };

    expect(deriveTabTrust('funnel', state).updatedAt).toBe(funnelLoaded.fetchedAt);
    expect(deriveTabTrust('revenue', state).updatedAt).toBe(revenueStale.fetchedAt);
  });

  it('lets the page label win over anything a panel reports as its surface', () => {
    const signal = deriveTabTrust('funnel', {
      funnel: { ...funnelLoaded, surface: 'something a panel made up' },
    });

    expect(signal.summary).toContain(PERFORMANCE_TAB_LABELS.funnel);
    expect(signal.summary).not.toContain('something a panel made up');
  });
});

describe('a tab that reports nothing says so, rather than looking like it is loading', () => {
  const unreported = { surface: 'AI outreach', unreported: true };

  it('is unverified, because nothing has been checked either way', () => {
    expect(deriveMarketingTrust(unreported).level).toBe('unverified');
  });

  it('says it will not resolve by waiting', () => {
    const summary = deriveMarketingTrust(unreported).summary;

    // Both states are `unverified`, but one resolves on its own and the other never will.
    // Leaving someone watching for a spinner that is not coming is its own small failure.
    expect(summary).toContain('does not report');
    expect(summary).toContain('will not resolve by waiting');
    expect(summary).not.toContain('has not loaded yet');
  });

  it('reads DIFFERENTLY from a tab that genuinely has not loaded', () => {
    const loading = deriveMarketingTrust({ surface: 'AI outreach', loading: true });

    expect(deriveMarketingTrust(unreported).summary).not.toBe(loading.summary);
    expect(loading.summary).toContain('has not loaded yet');
  });

  it('does not claim a load is pending in its evidence', () => {
    const signal = deriveMarketingTrust(unreported);
    const freshness = signal.pillars?.find((p) => p.name === 'Freshness');
    const completeness = signal.pillars?.find((p) => p.name === 'Completeness');

    expect(freshness?.evidence?.find((e) => e.label === 'Last loaded')?.value)
      .toBe('this tab does not report');
    expect(completeness?.evidence?.[0]?.label).toBe('Not reported');
  });

  it('reports no timestamp, because there is nothing to timestamp', () => {
    expect(deriveMarketingTrust(unreported).updatedAt).toBeNull();
  });
});
