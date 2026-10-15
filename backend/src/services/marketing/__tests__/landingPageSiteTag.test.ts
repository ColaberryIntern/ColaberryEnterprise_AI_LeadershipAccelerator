import { siteSlugForBrand } from '../landingPageSiteTag';

/**
 * The rule was derived from production, so the tests pin it against production's shape.
 *
 * On 2026-10-15 `visitor_sessions` carried these ten site slugs and `brands` carried these eight
 * brand slugs. Every brand maps onto a live property, which is what makes the rule a rule rather
 * than a convenient guess - and if a ninth brand arrives whose slug does not map, the last test
 * here fails and somebody decides deliberately instead of shipping a page that reports into a
 * property nobody reads.
 */

/** Live properties, by session count, as measured. */
const LIVE_SITE_SLUGS = [
  'worldoftaxonomy', 'colaberry', 'ai-flotation', 'enterprise',
  'advisor', 'cpn', 'trustbeforeintelligence', 'refactored', 'training', 'unknown',
];

/** Every brand in production at the time the rule was written. */
const BRAND_SLUGS = [
  'advisor', 'ai-flotation', 'colaberry-enterprise', 'colaberry-training',
  'cpn', 'refactored', 'trustbeforeintelligence', 'worldoftaxonomy',
];

describe('the two brands whose property is not their own slug', () => {
  it.each([
    ['colaberry-training', 'training'],
    ['colaberry-enterprise', 'enterprise'],
  ])('%s reports into %s', (brand, site) => {
    expect(siteSlugForBrand(brand)).toBe(site);
  });

  it('colaberry-training is confirmed by the only page that has ever recorded a visit', () => {
    // ai-learning-platform carries site_slug 'training' and has 11 visitors; every other hosted
    // page carries null and has none. This is the one mapping proven by data rather than by rule.
    expect(siteSlugForBrand('colaberry-training')).toBe('training');
  });
});

describe('every other brand is its own property', () => {
  it.each(['advisor', 'ai-flotation', 'cpn', 'refactored', 'trustbeforeintelligence', 'worldoftaxonomy'])(
    '%s maps to itself',
    (brand) => { expect(siteSlugForBrand(brand)).toBe(brand); },
  );
});

describe('an unknown brand gets null, not a made-up property', () => {
  it.each([null, undefined, '', '   '])('%p is null', (v) => {
    expect(siteSlugForBrand(v as string | null)).toBeNull();
  });

  it('a slug that could not be a site tag is refused rather than trimmed into one', () => {
    // The value lands in a `data-site` attribute and a VARCHAR(64) column. Something that is not
    // a slug would be a page reporting into a property that cannot exist - worse than no data,
    // because it looks like data.
    expect(siteSlugForBrand('Not A Slug!')).toBeNull();
    expect(siteSlugForBrand('a'.repeat(80))).toBeNull();
  });

  it('a brand that merely starts with colaberry- still yields something usable', () => {
    // Guards the prefix strip against producing an empty string.
    expect(siteSlugForBrand('colaberry-')).toBeNull();
    expect(siteSlugForBrand('colaberry-new-thing')).toBe('new-thing');
  });
});

describe('the rule covers the estate, which is why it is a rule', () => {
  it('every brand in production maps onto a property that actually records sessions', () => {
    const unmapped = BRAND_SLUGS.filter((b) => {
      const site = siteSlugForBrand(b);
      return site === null || !LIVE_SITE_SLUGS.includes(site);
    });
    expect(unmapped).toEqual([]);
  });

  it('and the mapping is not the identity in disguise', () => {
    // Without this the test above would pass on `(b) => b`, which is wrong for the two
    // colaberry- brands and would have produced two pages reporting into nothing.
    expect(siteSlugForBrand('colaberry-training')).not.toBe('colaberry-training');
    expect(LIVE_SITE_SLUGS).not.toContain('colaberry-training');
  });
});
