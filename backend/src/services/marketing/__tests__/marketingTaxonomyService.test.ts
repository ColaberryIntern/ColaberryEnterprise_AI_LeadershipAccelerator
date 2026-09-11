import {
  slugifySegment,
  quarterCode,
  buildCampaignSlug,
  resolveSlugCollision,
  buildUtmParams,
  isPaidMedium,
  assertSlugChangeAllowed,
  TaxonomyError,
  MAX_SLUG_LENGTH,
  MAX_SEGMENT_LENGTH,
  UTM_SOURCES,
  UTM_MEDIUMS,
} from '../marketingTaxonomyService';

/**
 * The taxonomy decides what a campaign is called for the rest of time, so these tests care
 * more about the failure modes than the happy path. A slug that comes out slightly wrong is
 * not a bug you fix later — every click already recorded under it stays recorded under it.
 */

describe('slugifySegment', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifySegment('Enterprise AI Leadership')).toBe('enterprise-ai-leadership');
  });

  it('folds diacritics instead of dropping the letter', () => {
    // Stripping rather than folding would give `fhrung`, which reads as a typo forever and
    // cannot be traced back to what was typed.
    expect(slugifySegment('Führung')).toBe('fuhrung');
    expect(slugifySegment('São Paulo')).toBe('sao-paulo');
    expect(slugifySegment('Straße')).toBe('strasse');
  });

  it('collapses runs of punctuation to a single hyphen', () => {
    expect(slugifySegment('Q3 -- Launch!!! (final)')).toBe('q3-launch-final');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugifySegment('  --hello--  ')).toBe('hello');
  });

  it('returns empty for input with no usable characters', () => {
    // Caller's job to reject; this function reports honestly rather than inventing something.
    expect(slugifySegment('!!!')).toBe('');
    expect(slugifySegment('   ')).toBe('');
  });

  it('caps a segment and never leaves a trailing hyphen after the cut', () => {
    const long = 'a'.repeat(MAX_SEGMENT_LENGTH + 20);
    expect(slugifySegment(long)).toHaveLength(MAX_SEGMENT_LENGTH);
    // A cut landing on a separator would otherwise produce `...-`
    const cutOnHyphen = `${'a'.repeat(MAX_SEGMENT_LENGTH - 1)} bbbb`;
    expect(slugifySegment(cutOnHyphen).endsWith('-')).toBe(false);
  });
});

describe('quarterCode', () => {
  it.each([
    ['2026-01-01T00:00:00Z', '2026q1'],
    ['2026-03-31T23:59:59Z', '2026q1'],
    ['2026-04-01T00:00:00Z', '2026q2'],
    ['2026-06-30T23:59:59Z', '2026q2'],
    ['2026-07-01T00:00:00Z', '2026q3'],
    ['2026-09-30T23:59:59Z', '2026q3'],
    ['2026-10-01T00:00:00Z', '2026q4'],
    ['2026-12-31T23:59:59Z', '2026q4'],
  ])('%s -> %s', (iso, expected) => {
    expect(quarterCode(new Date(iso))).toBe(expected);
  });

  it('uses UTC, so the quarter does not depend on who is looking', () => {
    // 2026-04-01T00:30Z is still 31 March in any timezone behind UTC. Using local methods
    // would put this campaign in Q1 for some readers and Q2 for others, and the slug is
    // permanent.
    expect(quarterCode(new Date('2026-04-01T00:30:00Z'))).toBe('2026q2');
    expect(quarterCode(new Date('2026-01-01T00:30:00Z'))).toBe('2026q1');
  });

  it('rejects an invalid date rather than emitting NaN', () => {
    expect(() => quarterCode(new Date('not a date'))).toThrow(TaxonomyError);
    expect(() => quarterCode(new Date('not a date'))).toThrow(/valid date/i);
  });
});

describe('buildCampaignSlug — happy path', () => {
  const base = {
    brand: 'Colaberry Enterprise',
    objective: 'Lead Gen',
    offer: 'Open House',
    audience: 'Alumni',
    date: new Date('2026-08-14T00:00:00Z'),
  };

  it('produces {brand}-{objective}-{offer}-{audience}-{yyyyq#}', () => {
    expect(buildCampaignSlug(base)).toBe(
      'colaberry-enterprise-lead-gen-open-house-alumni-2026q3',
    );
  });

  it('is deterministic for the same inputs', () => {
    expect(buildCampaignSlug(base)).toBe(buildCampaignSlug({ ...base }));
  });

  it('changes when any segment changes', () => {
    const a = buildCampaignSlug(base);
    expect(buildCampaignSlug({ ...base, audience: 'Prospects' })).not.toBe(a);
    expect(buildCampaignSlug({ ...base, date: new Date('2026-11-01T00:00:00Z') })).not.toBe(a);
  });
});

describe('buildCampaignSlug — invalid input is rejected, not degraded', () => {
  const base = {
    brand: 'b', objective: 'o', offer: 'f', audience: 'a',
    date: new Date('2026-08-14T00:00:00Z'),
  };

  it.each(['brand', 'objective', 'offer', 'audience'])('rejects an empty %s', (field) => {
    expect(() => buildCampaignSlug({ ...base, [field]: '' } as any)).toThrow(TaxonomyError);
    expect(() => buildCampaignSlug({ ...base, [field]: '   ' } as any)).toThrow(/required/i);
  });

  it('rejects a segment that slugifies to nothing', () => {
    // `--2026q3` from three punctuation inputs would be indistinguishable from another
    // campaign that did the same, and both would be permanent.
    expect(() => buildCampaignSlug({ ...base, offer: '!!!' })).toThrow(/no usable characters/i);
  });

  it('the segment cap makes an over-length slug structurally impossible', () => {
    // This started life as a "rejects an over-length slug" test and FAILED, which was the
    // useful outcome: the length check inside buildCampaignSlug is unreachable. Worst case is
    // 4 * 40 + 3 hyphens + '-yyyyqN' = 170, against a 200 limit.
    //
    // So the invariant is asserted directly instead of pretending to exercise a branch no
    // input can reach. If someone raises MAX_SEGMENT_LENGTH to 50, worst case becomes 210 and
    // THIS test fails — pointing at the real cause, rather than a truncated slug silently
    // merging two campaigns in production months later.
    const worstCase = 4 * MAX_SEGMENT_LENGTH + 3 + '-2026q3'.length;
    expect(worstCase).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });

  it('produces a slug within the column limit even at maximum input length', () => {
    const seg = 'x'.repeat(MAX_SEGMENT_LENGTH * 3); // deliberately over the segment cap
    const slug = buildCampaignSlug({
      brand: seg, objective: seg, offer: seg, audience: seg,
      date: new Date('2026-08-14T00:00:00Z'),
    });
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    // And each segment really was capped rather than the whole slug being trimmed at the end,
    // which would have merged campaigns differing only past the cut.
    expect(slug.split('-')).toHaveLength(5);
  });
});

describe('resolveSlugCollision', () => {
  it('returns the candidate untouched when free', () => {
    expect(resolveSlugCollision('a-b-c-2026q3', [])).toBe('a-b-c-2026q3');
  });

  it('appends a visible numeric suffix on collision', () => {
    // Visible rather than a hash: an operator seeing `-2` understands another campaign has
    // this name. A random suffix reads as noise and gets copied around.
    expect(resolveSlugCollision('x', ['x'])).toBe('x-2');
    expect(resolveSlugCollision('x', ['x', 'x-2', 'x-3'])).toBe('x-4');
  });

  it('accepts a Set as well as an array', () => {
    expect(resolveSlugCollision('x', new Set(['x']))).toBe('x-2');
  });

  it('throws rather than looping forever when everything is taken', () => {
    const taken = ['x', ...Array.from({ length: 60 }, (_, i) => `x-${i + 2}`)];
    expect(() => resolveSlugCollision('x', taken, 50)).toThrow(/after 50 attempts/i);
  });

  it('refuses a suffix that would exceed the column limit', () => {
    const atLimit = 'y'.repeat(MAX_SLUG_LENGTH);
    expect(() => resolveSlugCollision(atLimit, [atLimit])).toThrow(/exceed the 200/i);
  });
});

describe('buildUtmParams', () => {
  it('builds the canonical set', () => {
    expect(buildUtmParams({
      source: 'linkedin', medium: 'organic_social', campaignSlug: 'cb-lead-gen-oh-alumni-2026q3',
    })).toEqual({
      utm_source: 'linkedin',
      utm_medium: 'organic_social',
      utm_campaign: 'cb-lead-gen-oh-alumni-2026q3',
    });
  });

  it('includes utm_content and utm_term only when supplied', () => {
    const withBoth = buildUtmParams({
      source: 'facebook', medium: 'paid_social', campaignSlug: 's',
      variantCode: 'Hero Image A', term: 'Data Analyst',
    });
    expect(withBoth.utm_content).toBe('hero-image-a');
    expect(withBoth.utm_term).toBe('data-analyst');

    const neither = buildUtmParams({ source: 'facebook', medium: 'paid_social', campaignSlug: 's' });
    expect(neither).not.toHaveProperty('utm_content');
    expect(neither).not.toHaveProperty('utm_term');
  });

  it('omits rather than emits empty values for unsluggable extras', () => {
    // An empty `utm_content=` in a URL is worse than none: it looks like a real dimension
    // with a blank value and shows up as its own row in reporting.
    const p = buildUtmParams({
      source: 'x', medium: 'organic_social', campaignSlug: 's', variantCode: '!!!', term: '   ',
    });
    expect(p).not.toHaveProperty('utm_content');
    expect(p).not.toHaveProperty('utm_term');
  });

  it('rejects an unknown source or medium instead of passing it through', () => {
    // An open vocabulary is how reporting rots: facebook / Facebook / fb become three
    // channels and nobody notices until a quarterly number is wrong.
    expect(() => buildUtmParams({
      source: 'Facebook' as any, medium: 'paid_social', campaignSlug: 's',
    })).toThrow(/Unknown utm_source/);
    expect(() => buildUtmParams({
      source: 'facebook', medium: 'social' as any, campaignSlug: 's',
    })).toThrow(/Unknown utm_medium/);
  });

  it('requires a campaign slug', () => {
    expect(() => buildUtmParams({
      source: 'facebook', medium: 'paid_social', campaignSlug: '',
    })).toThrow(/requires a campaign slug/i);
  });

  it('every declared source and medium is actually accepted', () => {
    // Guards the constant against drifting from the validation that reads it.
    for (const source of UTM_SOURCES) {
      expect(() => buildUtmParams({ source, medium: 'organic_social', campaignSlug: 's' })).not.toThrow();
    }
    for (const medium of UTM_MEDIUMS) {
      expect(() => buildUtmParams({ source: 'facebook', medium, campaignSlug: 's' })).not.toThrow();
    }
  });
});

describe('isPaidMedium', () => {
  it('splits paid from organic', () => {
    expect(isPaidMedium('paid_social')).toBe(true);
    expect(isPaidMedium('cpc')).toBe(true);
    expect(isPaidMedium('organic_social')).toBe(false);
    expect(isPaidMedium('email')).toBe(false);
  });
});

describe('assertSlugChangeAllowed — a published slug is frozen', () => {
  const published = new Date('2026-08-01T00:00:00Z');

  it('allows setting a slug for the first time', () => {
    expect(assertSlugChangeAllowed({
      currentSlug: null, proposedSlug: 'a-b-c-d-2026q3', publishedAt: null,
    }).allowed).toBe(true);
  });

  it('allows an edit while nothing has been published', () => {
    expect(assertSlugChangeAllowed({
      currentSlug: 'old', proposedSlug: 'new', publishedAt: null,
    }).allowed).toBe(true);
  });

  it('allows a no-op change even after publication', () => {
    expect(assertSlugChangeAllowed({
      currentSlug: 'same', proposedSlug: 'same', publishedAt: published,
    }).allowed).toBe(true);
  });

  it('REFUSES a real change once published', () => {
    // The rule this module exists for. Editing a published slug does not rename a campaign —
    // it orphans every click already recorded under the old value.
    const r = assertSlugChangeAllowed({
      currentSlug: 'old', proposedSlug: 'new', publishedAt: published,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/orphan every click/i);
    // The message must tell the operator what to do instead, not just say no.
    expect(r.reason).toMatch(/new campaign version/i);
  });
});

describe('slugifySegment - letters NFKD does not decompose', () => {
  /**
   * Regression for a real defect found in review. An earlier version special-cased eszett
   * alone, so every other letter in its family was silently DROPPED - "AEther" became
   * "ther". That is precisely the failure the function's own docstring promises it avoids,
   * which made the comment worse than useless: it asserted the opposite of the behaviour.
   *
   * Escapes rather than literal glyphs, so the file stays ASCII and the intent survives any
   * encoding round-trip.
   */
  it.each([
    ['\u00C6ther', 'aether', 'AE ligature'],
    ['\u00E6ther', 'aether', 'ae ligature'],
    ['\u00D8resund', 'oresund', 'O with stroke'],
    ['Malm\u00F6 \u00F8st', 'malmo-ost', 'o with stroke, with a diacritic alongside'],
    ['\u00DEorsteinn', 'thorsteinn', 'thorn'],
    ['Wei\u00DFbier', 'weissbier', 'eszett'],
    ['\u0141\u00F3d\u017A', 'lodz', 'L with stroke'],
    ['\u0110akovo', 'dakovo', 'D with stroke'],
    ['\u0152uvre', 'oeuvre', 'OE ligature'],
  ])('%s -> %s (%s)', (input, expected) => {
    expect(slugifySegment(input)).toBe(expected);
  });

  it('never silently drops a letter from that family', () => {
    // The property, stated directly: each of these is a LETTER, not a decorated letter, so
    // stripping combining marks cannot reach it. If a future edit removes an entry from the
    // transliteration table, the segment collapses to empty and this fails loudly.
    const family = ['\u00C6', '\u00E6', '\u0152', '\u0153', '\u00D8', '\u00F8',
      '\u00DE', '\u00FE', '\u00D0', '\u00F0', '\u0110', '\u0111',
      '\u0141', '\u0142', '\u1E9E', '\u00DF'];
    for (const ch of family) {
      expect(slugifySegment(ch)).not.toBe('');
    }
  });
});

describe('buildUtmParams - utm_campaign must be a slug, never a display name', () => {
  /**
   * Spec section 7's strongest rule, and it was unenforced until review caught it: the module
   * rejected an off-vocabulary SOURCE at runtime while trusting the caller on the one field
   * the whole design exists to protect. A display name reaching utm_campaign means every
   * click recorded under it carries a value that changes the next time somebody renames the
   * campaign - which is exactly the history-orphaning the freeze rule elsewhere prevents.
   */
  it.each([
    'My Campaign Name!',
    'Open House 2026',
    'CB-LeadGen-2026Q3',
    'campaign_with_underscores',
    'slug with spaces',
    'slug/with/slashes',
    'slug?with=query',
  ])('rejects %p', (bad) => {
    expect(() => buildUtmParams({
      source: 'facebook', medium: 'paid_social', campaignSlug: bad,
    })).toThrow(/canonical slug/i);
  });

  it('accepts what buildCampaignSlug actually emits', () => {
    // Generator and validator must not disagree: whatever the canonical builder produces has
    // to pass the guard, or the two halves of the taxonomy contradict each other.
    const slug = buildCampaignSlug({
      brand: 'Colaberry Enterprise', objective: 'Lead Gen', offer: 'Open House',
      audience: 'Alumni', date: new Date('2026-08-14T00:00:00Z'),
    });
    expect(() => buildUtmParams({
      source: 'linkedin', medium: 'organic_social', campaignSlug: slug,
    })).not.toThrow();
  });

  it('names the fix in the error, not just the failure', () => {
    try {
      buildUtmParams({ source: 'facebook', medium: 'cpc', campaignSlug: 'My Campaign' });
      throw new Error('expected a throw');
    } catch (err: any) {
      expect(err.code).toBe('MALFORMED_CAMPAIGN_SLUG');
      expect(err.message).toMatch(/buildCampaignSlug/);
    }
  });
});
