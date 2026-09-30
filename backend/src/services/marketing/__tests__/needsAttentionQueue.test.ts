import {
  buildNeedsAttentionQueue,
  UNATTRIBUTED_SHARE_THRESHOLD,
  type NeedsAttentionCounts,
  type TrustOracle,
} from '../needsAttentionQueue';

/**
 * An untrusted signal is EXCLUDED from the queue, never shown as zero.
 *
 * Three outcomes exist per candidate and this suite exists to keep them apart:
 *
 *   untrusted metric            -> in `excluded`, with the registry's reason, NOT an item
 *   trusted, count below threshold -> nothing at all (a zero is fine)
 *   trusted, count at threshold    -> an item
 *
 * The defect these guard is collapsing the first into the second. "0 unmapped spend lines"
 * and "we cannot compute unmapped spend" are opposite statements: one is an all-clear and the
 * other is an admission. An empty queue built on a metric with no data source reads as the
 * all-clear, which is exactly the failure the metric registry was created to prevent.
 */

const ZERO: NeedsAttentionCounts = {
  pendingApprovals: 0,
  failedJobs: 0,
  lateJobs: 0,
  deadLetteredJobs: 0,
  brokenLinks: 0,
  unmappedSpendItems: 0,
  unattributedVisitorShare: 0,
};

/** Everything trusted. The "ideal registry" - only used to isolate threshold behaviour. */
const ALL_TRUSTED: TrustOracle = {
  mayCompute: () => true,
  reasonFor: () => '',
};

/** Mirrors the REAL registry's current opinion: spend unavailable, attribution partial. */
const REALISTIC: TrustOracle = {
  mayCompute: (key) => !['marketing.ad_spend', 'growth.source_attribution'].includes(key),
  reasonFor: (key) =>
    key === 'marketing.ad_spend'
      ? 'There is NO ad-platform integration in this system.'
      : key === 'growth.source_attribution'
        ? 'Referrer capture shipped 2026-09-04 and cannot be backfilled.'
        : '',
};

describe('an empty queue is genuinely empty', () => {
  it('yields no items when every trusted count is zero', () => {
    const q = buildNeedsAttentionQueue(ZERO, ALL_TRUSTED);
    expect(q.items).toEqual([]);
  });

  it('a trusted zero is NOT an exclusion - it is simply fine', () => {
    // The inverse mistake: treating every quiet signal as "could not compute" would turn
    // a healthy system into a page full of caveats.
    const q = buildNeedsAttentionQueue(ZERO, ALL_TRUSTED);
    expect(q.excluded).toEqual([]);
  });
});

describe('an untrusted metric is excluded, never rendered as zero', () => {
  it('drops the spend signal and says why, in the registry\'s own words', () => {
    // Even with a NON-ZERO input, the item must not appear: the number is not trustworthy.
    const q = buildNeedsAttentionQueue({ ...ZERO, unmappedSpendItems: 7 }, REALISTIC);
    expect(q.items.find((i) => i.key === 'unmapped_spend')).toBeUndefined();
    const ex = q.excluded.find((e) => e.key === 'unmapped_spend');
    expect(ex).toBeDefined();
    expect(ex!.reason).toMatch(/NO ad-platform integration/);
  });

  it('drops unattributed traffic even when the share is alarming', () => {
    // 90% unattributed would be the loudest possible warning - and it is built on a partial
    // metric, so raising it would be an alarm about a number we cannot stand behind.
    const q = buildNeedsAttentionQueue({ ...ZERO, unattributedVisitorShare: 0.9 }, REALISTIC);
    expect(q.items.find((i) => i.key === 'unattributed_traffic')).toBeUndefined();
    expect(q.excluded.map((e) => e.key)).toContain('unattributed_traffic');
  });

  it('never produces an item with count 0 for an untrusted metric', () => {
    // The precise shape of the defect: an item that exists and reads "0 spend lines unmapped".
    const q = buildNeedsAttentionQueue(ZERO, REALISTIC);
    for (const item of q.items) {
      expect(item.count).toBeGreaterThan(0);
    }
  });

  it('the exclusion is VISIBLE - the queue is not just silently shorter', () => {
    const trusted = buildNeedsAttentionQueue(ZERO, ALL_TRUSTED);
    const realistic = buildNeedsAttentionQueue(ZERO, REALISTIC);
    // Same items (none), but the realistic one carries an explanation for what is missing.
    expect(trusted.items).toEqual(realistic.items);
    expect(realistic.excluded.length).toBeGreaterThan(trusted.excluded.length);
  });

  it('works for ANY key the oracle distrusts, not only the two it distrusts today', () => {
    // Proves the mechanism is registry-driven rather than a hardcoded list of two names. When
    // a metric flips to trusted or a trusted one degrades, the queue follows without an edit.
    const distrustApprovals: TrustOracle = {
      mayCompute: (k) => k !== 'marketing.pending_approvals',
      reasonFor: () => 'approval workflow not yet live',
    };
    const q = buildNeedsAttentionQueue({ ...ZERO, pendingApprovals: 5 }, distrustApprovals);
    expect(q.items.find((i) => i.key === 'pending_approvals')).toBeUndefined();
    expect(q.excluded.find((e) => e.key === 'pending_approvals')!.reason).toBe('approval workflow not yet live');
  });

  it('reports one exclusion per METRIC, not one per candidate sharing it', () => {
    // failed_jobs and late_jobs both depend on marketing.failed_publishing_jobs. If that is
    // untrusted the operator should read the reason once, not twice.
    const distrustJobs: TrustOracle = {
      mayCompute: (k) => k !== 'marketing.failed_publishing_jobs',
      reasonFor: () => 'no worker yet',
    };
    const q = buildNeedsAttentionQueue(ZERO, distrustJobs);
    const jobExclusions = q.excluded.filter((e) => e.reason === 'no worker yet');
    expect(jobExclusions).toHaveLength(1);
  });
});

describe('a trusted metric with a missing input is a gathering failure, not a zero', () => {
  it('excludes rather than silently skipping', () => {
    // If the query behind a trusted count failed and returned null, the honest outcome is
    // "could not gather", not "nothing to do".
    const q = buildNeedsAttentionQueue({ ...ZERO, unmappedSpendItems: null }, ALL_TRUSTED);
    const ex = q.excluded.find((e) => e.key === 'unmapped_spend');
    expect(ex).toBeDefined();
    expect(ex!.reason).toMatch(/could not be gathered/);
    expect(q.items.find((i) => i.key === 'unmapped_spend')).toBeUndefined();
  });
});

describe('trusted signals raise at their thresholds', () => {
  it('raises pending approvals with the count in the title', () => {
    const q = buildNeedsAttentionQueue({ ...ZERO, pendingApprovals: 3 }, ALL_TRUSTED);
    const item = q.items.find((i) => i.key === 'pending_approvals')!;
    expect(item.count).toBe(3);
    expect(item.title).toBe('3 content items awaiting approval');
    expect(item.severity).toBe('action');
  });

  it('folds dead-lettered jobs into the failed count', () => {
    const q = buildNeedsAttentionQueue({ ...ZERO, failedJobs: 2, deadLetteredJobs: 1 }, ALL_TRUSTED);
    expect(q.items.find((i) => i.key === 'failed_jobs')!.count).toBe(3);
  });

  it('does not raise unattributed traffic below the threshold', () => {
    const q = buildNeedsAttentionQueue(
      { ...ZERO, unattributedVisitorShare: UNATTRIBUTED_SHARE_THRESHOLD - 0.01 },
      ALL_TRUSTED,
    );
    expect(q.items.find((i) => i.key === 'unattributed_traffic')).toBeUndefined();
  });

  it('raises unattributed traffic AT the threshold, as a percentage', () => {
    const q = buildNeedsAttentionQueue(
      { ...ZERO, unattributedVisitorShare: UNATTRIBUTED_SHARE_THRESHOLD },
      ALL_TRUSTED,
    );
    const item = q.items.find((i) => i.key === 'unattributed_traffic')!;
    expect(item.title).toMatch(/40% of visitors/);
  });

  it('orders actions before warnings, larger counts first', () => {
    const q = buildNeedsAttentionQueue(
      { ...ZERO, pendingApprovals: 1, brokenLinks: 5, lateJobs: 9 },
      ALL_TRUSTED,
    );
    expect(q.items.map((i) => i.key)).toEqual(['broken_links', 'pending_approvals', 'late_jobs']);
  });

  it('pluralises correctly at one', () => {
    const q = buildNeedsAttentionQueue({ ...ZERO, pendingApprovals: 1, lateJobs: 1 }, ALL_TRUSTED);
    expect(q.items.find((i) => i.key === 'pending_approvals')!.title).toBe('1 content item awaiting approval');
    expect(q.items.find((i) => i.key === 'late_jobs')!.title).toMatch(/1 scheduled post is overdue/);
  });
});
describe('every item is a door OUT of the page the queue renders on', () => {
  // The queue renders on the Marketing Overview at /admin/marketing. Until 2026-09-18 three
  // items linked to that bare path, which was correct while it was the analytics dashboard and
  // became a link to itself the day the Overview took the address. The fix points them at
  // Performance, but the property worth pinning is the general one: no item may send the
  // operator back to where they already are.
  const EVERYTHING_RAISED: NeedsAttentionCounts = {
    pendingApprovals: 1,
    failedJobs: 1,
    lateJobs: 1,
    deadLetteredJobs: 1,
    brokenLinks: 1,
    unmappedSpendItems: 1,
    unattributedVisitorShare: 1,
  };
  const items = buildNeedsAttentionQueue(EVERYTHING_RAISED, ALL_TRUSTED).items;

  it('raises every candidate, so the assertions below cover all of them', () => {
    // Exact, not "at least": a rule added later must show up here and be looked at, rather than
    // ride along uncovered. Failed and dead-lettered jobs share one item, hence six from seven counts.
    expect(items.map((i) => i.key).sort()).toEqual([
      'broken_links', 'failed_jobs', 'late_jobs', 'pending_approvals',
      'unattributed_traffic', 'unmapped_spend',
    ]);
  });

  it.each(items.map((i) => [i.key, i.href]))('%s links somewhere other than the Overview (%s)', (_key, href) => {
    const path = String(href).split(/[?#]/)[0];
    expect(path).not.toBe('/admin/marketing');
    expect(path).not.toBe('/admin/marketing/');
  });

  it('the analytics items open the tab they are about', () => {
    const href = (key: string) => items.find((i) => i.key === key)!.href;
    expect(href('broken_links')).toBe('/admin/marketing/performance?tab=registry');
    expect(href('unmapped_spend')).toBe('/admin/marketing/performance?tab=revenue');
    expect(href('unattributed_traffic')).toBe('/admin/marketing/performance?tab=revenue');
  });
});
