import { forBrand, missingSlug, toMarketingCampaigns, type MarketingCampaign } from '../marketingCampaigns';

/**
 * The marketing/email split and the brand rule, now that TWO screens read them.
 *
 * `usableForAPost` itself is pinned by composerCampaignFilter.test.ts, including the real
 * production rows. What is new here is that brand setup's Campaigns tab counts the same rows the
 * composer's picker offers, so these tests are about the shared contract rather than the filter:
 * a tab reading "2" above a dropdown offering 3 is the disagreement this module exists to stop.
 */

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'c-1', name: 'October class', status: 'active', type: 'marketing', brand_id: 'b-1', utm_campaign_slug: 'ct-oct', ...over,
});

describe('forBrand - whose campaign is it', () => {
  it('shows a campaign with NO brand to every brand, because campaigns predate brands', () => {
    const list = toMarketingCampaigns([row({ id: 'shared', brand_id: null })]);
    expect(forBrand(list, 'b-1').map((c) => c.id)).toEqual(['shared']);
    expect(forBrand(list, 'b-2').map((c) => c.id)).toEqual(['shared']);
  });

  it('shows a branded campaign only to its own brand', () => {
    const list = toMarketingCampaigns([row({ id: 'mine', brand_id: 'b-1' })]);
    expect(forBrand(list, 'b-1').map((c) => c.id)).toEqual(['mine']);
    expect(forBrand(list, 'b-2')).toEqual([]);
  });

  it('narrows nothing when no brand is selected', () => {
    const list = toMarketingCampaigns([row({ id: 'a', brand_id: 'b-1' }), row({ id: 'b', brand_id: 'b-2' })]);
    expect(forBrand(list, null).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('does not treat an empty-string brand as a real brand', () => {
    // `values.brand_id` is '' in the composer before a brand is picked, which must not filter
    // every campaign out - the caller passes `|| null`, and this pins the behaviour it relies on.
    const list = toMarketingCampaigns([row({ brand_id: 'b-1' })]);
    expect(forBrand(list, '')).toHaveLength(1);
  });
});

describe('toMarketingCampaigns - one reading of the row, for both screens', () => {
  it('drops email lifecycle campaigns, so neither screen can offer one', () => {
    const rows = [row({ id: 'keep' }), row({ id: 'drop', type: 'warm_nurture' })];
    expect(toMarketingCampaigns(rows).map((c) => c.id)).toEqual(['keep']);
  });

  it('keeps a campaign with no slug, because the gap is fixable and must stay visible', () => {
    const [c] = toMarketingCampaigns([row({ utm_campaign_slug: null })]);
    expect(c.utm_campaign_slug).toBeNull();
  });

  it('reads the slug off utm_campaign_slug and nothing else', () => {
    // A second screen reading `utm_slug` instead would show every campaign as unslugged.
    const [c] = toMarketingCampaigns([{ id: 'c-9', name: 'n', status: 'active', utm_slug: 'wrong', utm_campaign_slug: 'right' }]);
    expect(c.utm_campaign_slug).toBe('right');
  });

  it('survives a row with no name or brand rather than rendering "undefined"', () => {
    const [c] = toMarketingCampaigns([{ id: 'c-2', status: 'active' }]);
    expect(c).toEqual({ id: 'c-2', name: '', brand_id: null, utm_campaign_slug: null });
  });
});

describe('missingSlug - what cannot be attributed', () => {
  const list: MarketingCampaign[] = [
    { id: 'a', name: 'A', brand_id: null, utm_campaign_slug: 'a-slug' },
    { id: 'b', name: 'B', brand_id: null, utm_campaign_slug: null },
    { id: 'c', name: 'C', brand_id: null, utm_campaign_slug: '' },
  ];

  it('names the campaigns whose clicks arrive unattributed', () => {
    expect(missingSlug(list).map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('counts an empty-string slug as missing, not as a slug', () => {
    expect(missingSlug([list[2]])).toHaveLength(1);
  });

  it('is empty when every campaign can be attributed', () => {
    expect(missingSlug([list[0]])).toEqual([]);
  });
});
