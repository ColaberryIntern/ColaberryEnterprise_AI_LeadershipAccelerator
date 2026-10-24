import { provenanceTagsFor } from '../ghlProvenanceTags';

/**
 * What a reader in GoHighLevel can tell about where a contact came from.
 *
 * Before this, nothing: of 121 leads from the first paid campaign, we held the campaign for 117
 * and pushed none of it. The test that matters most is the real ad lead below, because that is
 * the case Kes asked about and the one the backfill depends on.
 */

const AD_LEAD = { source: 'free_signup', utm_source: 'fb', utm_campaign: '52708443249234' };

describe('a real lead from the October ads', () => {
  it('carries its brand, its source, its platform and its campaign', () => {
    expect(provenanceTagsFor(AD_LEAD)).toEqual([
      'brand-training_colaberry',
      'src-free_signup',
      'utm-fb',
      'camp-52708443249234',
    ]);
  });

  it('distinguishes the Instagram placement from the Facebook one', () => {
    const ig = provenanceTagsFor({ ...AD_LEAD, utm_source: 'ig' });
    expect(ig).toContain('utm-ig');
    expect(ig).not.toContain('utm-fb');
    // Same campaign either way, which is what lets the two be compared.
    expect(ig).toContain('camp-52708443249234');
  });

  it('puts another brand in another bucket', () => {
    const tags = provenanceTagsFor({ source: 'ai-flotation', utm_source: null, utm_campaign: null });
    expect(tags).toContain('src-ai-flotation');
    expect(tags).not.toContain('brand-training_colaberry');
  });
});

describe('it never invents provenance', () => {
  it('omits a tag rather than saying unknown', () => {
    // A reader filtering on `camp-unknown` would be filtering on our ignorance, not on anything
    // the person did.
    const tags = provenanceTagsFor({ source: 'free_signup', utm_source: null, utm_campaign: null });
    expect(tags.some((t) => t.startsWith('camp-'))).toBe(false);
    expect(tags.some((t) => t.startsWith('utm-'))).toBe(false);
    expect(tags).toContain('src-free_signup');
  });

  it('says nothing at all about a lead that says nothing', () => {
    expect(provenanceTagsFor({})).toEqual([]);
    expect(provenanceTagsFor({ source: '', utm_source: '  ', utm_campaign: null })).toEqual([]);
  });
});

describe('the tag values are safe to send', () => {
  it('lower-cases, so one value is not two tags', () => {
    const a = provenanceTagsFor({ source: 'Free_Signup', utm_source: 'FB' });
    const b = provenanceTagsFor({ source: 'free_signup', utm_source: 'fb' });
    expect(a).toEqual(b);
  });

  it('strips characters that could read as syntax', () => {
    const tags = provenanceTagsFor({ utm_campaign: 'spring sale!! (2026)' });
    expect(tags).toContain('camp-spring-sale-2026');
  });

  it('caps a runaway value instead of sending it whole', () => {
    const tags = provenanceTagsFor({ utm_campaign: 'x'.repeat(500) });
    const camp = tags.find((t) => t.startsWith('camp-'))!;
    expect(camp.length).toBeLessThanOrEqual(53);
  });

  it('never emits an empty or dangling tag', () => {
    const tags = provenanceTagsFor({ source: '---', utm_source: '!!!', utm_campaign: '-' });
    expect(tags.every((t) => !/-$/.test(t))).toBe(true);
    expect(tags).not.toContain('utm-');
    expect(tags).not.toContain('camp-');
  });

  it('does not repeat a tag', () => {
    const tags = provenanceTagsFor({ source: 'fb', utm_source: 'fb' });
    expect(new Set(tags).size).toBe(tags.length);
  });
});
