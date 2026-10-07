import { usableForAPost } from '../composer/AdminContentComposerPage';

/**
 * Which campaigns the Composer may offer for a social post.
 *
 * Ali, 2026-10-07: "This list are not campaigns that exist so I'm confused." They existed - the
 * dropdown was every row in `campaigns` filtered by brand alone, so it offered forty-odd EMAIL
 * sequences, most of them paused months earlier, as destinations for a LinkedIn post. The types
 * below are the real ones from production.
 */

const row = (over: Record<string, unknown>) => ({
  id: 'c-1', name: 'A campaign', status: 'active', type: 'marketing', ...over,
});

describe('email and lifecycle campaigns are not offered for a post', () => {
  it.each([
    'warm_nurture', 'cold_outbound', 'executive_outreach', 'behavioral_trigger',
    're_engagement', 'alumni_re_engagement', 'payment_readiness', 'alumni_referral',
    'enterprise_pipeline', 'advisory_pipeline', 'workforce_designer_entry',
  ])('hides a %s campaign', (type) => {
    expect(usableForAPost([row({ type })])).toEqual([]);
  });

  it('hides them even when they are active, because the type is the point', () => {
    expect(usableForAPost([row({ type: 'warm_nurture', status: 'active' })])).toEqual([]);
  });
});

describe('marketing campaigns are offered', () => {
  it.each(['marketing', 'paid_social', 'organic_social', 'content', 'launch'])('keeps a %s campaign', (type) => {
    expect(usableForAPost([row({ type })])).toHaveLength(1);
  });

  it('keeps a campaign with no type at all, which is what the Campaigns screen makes by default', () => {
    // Hiding a row somebody just created would be a worse bug than showing one too many.
    expect(usableForAPost([row({ type: null })])).toHaveLength(1);
    expect(usableForAPost([row({ type: '' })])).toHaveLength(1);
    expect(usableForAPost([{ id: 'c-2', name: 'No type key', status: 'active' }])).toHaveLength(1);
  });

  it('is case-insensitive, so a differently-cased row is not silently dropped', () => {
    expect(usableForAPost([row({ type: 'Marketing', status: 'Active' })])).toHaveLength(1);
  });
});

describe('finished campaigns are not destinations for new posts', () => {
  it.each(['completed', 'archived', 'cancelled'])('hides a %s campaign', (status) => {
    expect(usableForAPost([row({ status })])).toEqual([]);
  });

  it('KEEPS paused and draft, which are a normal state for a campaign being prepared', () => {
    expect(usableForAPost([row({ status: 'paused' })])).toHaveLength(1);
    expect(usableForAPost([row({ status: 'draft' })])).toHaveLength(1);
  });
});

describe('a campaign with no UTM slug is still offered', () => {
  it('keeps it, because the composer can mint one and the label already flags it', () => {
    // Hiding these would turn a fixable gap into an invisible one: the operator would wonder
    // where their campaign went instead of seeing "- no UTM slug" and fixing it.
    const out = usableForAPost([row({ utm_campaign_slug: null })]);
    expect(out).toHaveLength(1);
  });
});

describe('the real production mix', () => {
  it('cuts the list down to the marketing ones and leaves the rest alone', () => {
    const production = [
      row({ id: '1', type: 'warm_nurture', status: 'paused' }),
      row({ id: '2', type: 'cold_outbound', status: 'paused' }),
      row({ id: '3', type: 'behavioral_trigger', status: 'draft' }),
      row({ id: '4', type: 'marketing', status: 'paused' }),
      row({ id: '5', type: 'alumni_re_engagement', status: 'active' }),
      row({ id: '6', type: null, status: 'draft' }),
    ];
    expect(usableForAPost(production).map((c) => c.id)).toEqual(['4', '6']);
  });

  it('an empty list stays empty rather than throwing', () => {
    expect(usableForAPost([])).toEqual([]);
  });
});
