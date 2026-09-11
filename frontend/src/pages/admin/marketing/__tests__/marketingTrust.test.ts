import { deriveMarketingTrust, deriveMarketingTrustLevel } from '../marketingTrust';

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

  it('says how many metrics are missing rather than implying none are', () => {
    const signal = deriveMarketingTrust({ fetchedAt: 'now', unavailable });
    expect(signal.summary).toContain('2 money metrics');
    expect(signal.summary).toContain('not as zero');
  });

  it('never claims live while any metric is uncomputable', () => {
    expect(deriveMarketingTrust({ fetchedAt: 'now', unavailable }).level).not.toBe('live');
  });
});
