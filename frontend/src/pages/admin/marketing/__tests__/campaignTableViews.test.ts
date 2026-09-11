import {
  ALL_COLUMNS,
  DEFAULT_COLUMNS,
  loadViews,
  rankCampaigns,
  saveViews,
  upsertView,
  type ResolvedRanking,
} from '../campaignTableViews';

/**
 * Not every campaign ranked on likes.
 *
 * The acceptance criterion: an engagement-objective campaign ranks on governed engagement, an
 * acquisition-objective campaign ranks on CPL/ROAS. Today CPL and ROAS are unavailable, so the
 * server resolves acquisition to a stated FALLBACK on leads - and this suite uses that real
 * resolution rather than one where spend data magically exists. The property that matters
 * survives either way: two objectives, two different sort keys, and the reason shown.
 */

/** What the server returns today, with the real registry. */
const RANKING: Record<string, ResolvedRanking> = {
  consideration: {
    objective: 'consideration',
    rung: { metricKey: 'marketing.campaign_engagement', column: 'engagement_count', direction: 'desc', label: 'Engagement' },
    fallback: false,
    reason: 'Ranked by engagement, the primary measure for a consideration campaign.',
  },
  conversion: {
    objective: 'conversion',
    rung: { metricKey: 'marketing.campaign_leads', column: 'leads_count', direction: 'desc', label: 'Leads' },
    fallback: true,
    reason: 'Ranked by leads instead of cost per lead (no ad-spend source) or roas (no ad-spend or revenue source).',
  },
  awareness: {
    objective: 'awareness',
    rung: null,
    fallback: true,
    reason: 'An awareness campaign cannot be ranked honestly yet. Shown in arrival order.',
  },
  unset: {
    objective: 'unset',
    rung: { metricKey: 'marketing.campaign_leads', column: 'leads_count', direction: 'desc', label: 'Leads' },
    fallback: false,
    reason: 'No funnel stage is set, so campaigns are ranked by leads as a general default.',
  },
};

const row = (id: string, funnel_stage: string | null, leads_count: number, engagement_count: number) => ({
  campaign_id: id, funnel_stage, leads_count, engagement_count,
});

describe('rankCampaigns ranks each objective on ITS OWN metric', () => {
  it('an engagement campaign group is ordered by engagement, not by leads', () => {
    const groups = rankCampaigns(
      [row('e-low', 'consideration', 900, 5), row('e-high', 'consideration', 10, 500)],
      RANKING,
    );
    const eng = groups.find((g) => g.objective === 'consideration')!;
    // e-low has FAR more leads. If the table ranked on leads it would be first. It is not.
    expect(eng.campaigns.map((c) => c.campaign_id)).toEqual(['e-high', 'e-low']);
  });

  it('an acquisition campaign group is ordered by leads, not by engagement', () => {
    const groups = rankCampaigns(
      [row('a-low', 'conversion', 5, 900), row('a-high', 'conversion', 500, 10)],
      RANKING,
    );
    const acq = groups.find((g) => g.objective === 'conversion')!;
    expect(acq.campaigns.map((c) => c.campaign_id)).toEqual(['a-high', 'a-low']);
  });

  it('the two groups use DIFFERENT sort keys - nothing is ranked on one number for everyone', () => {
    const groups = rankCampaigns(
      [row('e', 'consideration', 1, 1), row('a', 'conversion', 1, 1)],
      RANKING,
    );
    const keys = groups.map((g) => g.ranking.rung?.column);
    expect(new Set(keys).size).toBe(2);
  });

  it('carries the fallback and its reason to the group so the table can show it', () => {
    const groups = rankCampaigns([row('a', 'conversion', 1, 1)], RANKING);
    const acq = groups.find((g) => g.objective === 'conversion')!;
    expect(acq.ranking.fallback).toBe(true);
    expect(acq.ranking.reason).toMatch(/instead of cost per lead/);
  });

  it('leaves an unrankable objective in ARRIVAL order rather than inventing a sort', () => {
    const groups = rankCampaigns(
      [row('w1', 'awareness', 1, 900), row('w2', 'awareness', 900, 1)],
      RANKING,
    );
    const aw = groups.find((g) => g.objective === 'awareness')!;
    expect(aw.ranking.rung).toBeNull();
    expect(aw.campaigns.map((c) => c.campaign_id)).toEqual(['w1', 'w2']);
  });

  it('a campaign with no stage lands in the unset group, not in someone else\'s', () => {
    const groups = rankCampaigns([row('x', null, 1, 1), row('y', 'bogus', 1, 1)], RANKING);
    expect(groups.map((g) => g.objective)).toEqual(['unset']);
    expect(groups[0].campaigns).toHaveLength(2);
  });

  it('sorts a row MISSING the metric last, whatever the direction', () => {
    // NaN comparisons can put an unknown above every known value. An unknown has no claim to
    // a rank, so it goes to the bottom.
    const groups = rankCampaigns(
      [{ campaign_id: 'missing', funnel_stage: 'conversion' }, row('known', 'conversion', 3, 0)],
      RANKING,
    );
    expect(groups[0].campaigns.map((c) => c.campaign_id)).toEqual(['known', 'missing']);
  });

  it('does not mutate the input', () => {
    const input = [row('b', 'conversion', 1, 0), row('a', 'conversion', 9, 0)];
    rankCampaigns(input, RANKING);
    expect(input.map((c) => c.campaign_id)).toEqual(['b', 'a']);
  });
});

describe('columns', () => {
  it('the engagement column is on by default - the ranked-by column must be visible', () => {
    // Ranking a group on a column the operator cannot see would be a sort they cannot check.
    expect(DEFAULT_COLUMNS).toContain('engagement_count');
    expect(DEFAULT_COLUMNS).toContain('leads_count');
  });

  it('every default column exists in the catalogue', () => {
    const keys = new Set(ALL_COLUMNS.map((c) => c.key));
    for (const k of DEFAULT_COLUMNS) expect(keys.has(k)).toBe(true);
  });
});

describe('saved views survive a hostile storage', () => {
  const mem = () => {
    const store = new Map<string, string>();
    return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  };

  it('round-trips a view', () => {
    const s = mem();
    saveViews(s, [{ name: 'Acquisition focus', columns: ['leads_count', 'enrollments_count'] }]);
    expect(loadViews(s)).toEqual([{ name: 'Acquisition focus', columns: ['leads_count', 'enrollments_count'] }]);
  });

  it('returns an empty list when storage is absent, throws, or holds garbage', () => {
    expect(loadViews(null)).toEqual([]);
    expect(loadViews({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
    expect(loadViews({ getItem: () => 'not json' })).toEqual([]);
    expect(loadViews({ getItem: () => JSON.stringify({ not: 'an array' }) })).toEqual([]);
  });

  it('drops malformed entries rather than letting one poison the list', () => {
    const raw = JSON.stringify([
      { name: 'good', columns: ['a'] },
      { name: 42, columns: ['a'] },
      { name: 'bad-cols', columns: [1, 2] },
      'not an object',
    ]);
    expect(loadViews({ getItem: () => raw })).toEqual([{ name: 'good', columns: ['a'] }]);
  });

  it('reports a failed save instead of throwing into the table', () => {
    expect(saveViews({ setItem: () => { throw new Error('quota'); } }, [])).toBe(false);
  });

  it('upsert replaces by name rather than duplicating', () => {
    const views = upsertView([{ name: 'v', columns: ['a'] }], { name: 'v', columns: ['b'] });
    expect(views).toEqual([{ name: 'v', columns: ['b'] }]);
  });
});
