import {
  computeBand, hasBuildPromotion, BANDS, POINTS_SUBLEVELS, RANK_TO_BAND,
} from '../bandLadder';

describe('BANDS / POINTS_SUBLEVELS definition', () => {
  it('is the ordered 5-band vocabulary; aware/enabled free, builder/architect paid', () => {
    expect(BANDS.map((b) => b.slug)).toEqual(['aware', 'enabled', 'builder', 'architect', 'organization']);
    expect(BANDS.find((b) => b.slug === 'aware')!.access).toBe('free');
    expect(BANDS.find((b) => b.slug === 'enabled')!.access).toBe('free');
    expect(BANDS.find((b) => b.slug === 'builder')!.access).toBe('paid');
    expect(BANDS.find((b) => b.slug === 'architect')!.access).toBe('paid');
    // organization is org-level — NOT an individual band
    expect(BANDS.find((b) => b.slug === 'organization')!.individual).toBe(false);
    expect(BANDS.filter((b) => b.isBuildBand).map((b) => b.slug)).toEqual(['builder', 'architect']);
  });

  it('reuses ladder A thresholds 0/150/400/900 for the free sublevels (no new numbers)', () => {
    expect(POINTS_SUBLEVELS.map((s) => s.min)).toEqual([0, 150, 400, 900]);
    // free sublevels never reference a build band
    expect(POINTS_SUBLEVELS.every((s) => s.bandSlug === 'aware' || s.bandSlug === 'enabled')).toBe(true);
  });
});

describe('computeBand — free bands from points (no build promotion)', () => {
  const noPromo = { builderLevelSlug: 'builder', builderRank: 0 };

  const boundaries: Array<[number, string, string]> = [
    [0,   'aware',   'AI Aware I'],
    [149, 'aware',   'AI Aware I'],
    [150, 'aware',   'AI Aware II'],
    [399, 'aware',   'AI Aware II'],
    [400, 'enabled', 'AI Enabled I'],
    [899, 'enabled', 'AI Enabled I'],
    [900, 'enabled', 'AI Enabled II'],
  ];
  it.each(boundaries)('points=%i → band %s / rung %s', (pts, bandSlug, rungName) => {
    const r = computeBand({ pointsTotal: pts, ...noPromo });
    expect(r.bandSlug).toBe(bandSlug);
    expect(r.rungName).toBe(rungName);
    expect(r.isBuildBand).toBe(false);
    expect(r.cappedByPointsOnly).toBe(true);
  });

  it('ANTI-CHEAT: astronomically high points with NO promotion still cap at AI Enabled II — never a build band', () => {
    const r = computeBand({ pointsTotal: 10_000_000, ...noPromo });
    expect(r.bandSlug).toBe('enabled');
    expect(r.rungName).toBe('AI Enabled II');
    expect(r.isBuildBand).toBe(false);
    expect(r.bandSlug).not.toBe('builder');
    expect(r.bandSlug).not.toBe('architect');
    // the next step forward is structurally PAID, not more points
    expect(r.nextBand).toBe('AI Builder');
    expect(r.nextRequirement).toMatch(/paid/i);
  });

  it('a never-promoted learner (null/undefined level) also derives from points', () => {
    const r = computeBand({ pointsTotal: 500, builderLevelSlug: null, builderRank: null });
    expect(r.bandSlug).toBe('enabled');
    expect(r.rungName).toBe('AI Enabled I');
    expect(r.cappedByPointsOnly).toBe(true);
  });

  it('nextBand walks the free ladder aware → enabled → builder', () => {
    expect(computeBand({ pointsTotal: 0, ...noPromo }).nextBand).toBe('AI Enabled');   // Aware I
    expect(computeBand({ pointsTotal: 400, ...noPromo }).nextBand).toBe('AI Builder'); // Enabled I
  });

  it('nextRequirement counts points to the next rung below the ceiling', () => {
    const r = computeBand({ pointsTotal: 100, ...noPromo }); // 100 → next is Aware II at 150
    expect(r.nextRequirement).toContain('50 more points');
    expect(r.nextRequirement).toContain('AI Aware II');
  });
});

describe('computeBand — build bands from the competency promotion (overrides points)', () => {
  it('promoted to a builder rank → AI Builder regardless of points (even 0)', () => {
    const r = computeBand({ pointsTotal: 0, builderLevelSlug: 'practitioner', builderRank: 2 });
    expect(r.bandSlug).toBe('builder');
    expect(r.bandName).toBe('AI Builder');
    expect(r.rungName).toBe('AI Builder II');
    expect(r.isBuildBand).toBe(true);
    expect(r.cappedByPointsOnly).toBe(false);
  });

  it('a build promotion overrides even huge points (points are ignored once promoted)', () => {
    const r = computeBand({ pointsTotal: 10_000_000, builderLevelSlug: 'junior_builder', builderRank: 1 });
    expect(r.bandSlug).toBe('builder');
    expect(r.rungName).toBe('AI Builder I');
  });

  it('promoted to architect_candidate (rank 7) → AI Architect (entry seniority)', () => {
    const r = computeBand({ pointsTotal: 0, builderLevelSlug: 'architect_candidate', builderRank: 7 });
    expect(r.bandSlug).toBe('architect');
    expect(r.bandName).toBe('AI Architect');
    expect(r.rungName).toBe('AI Architect');
    expect(r.isBuildBand).toBe(true);
    expect(r.nextBand).toBeNull(); // architect is the top INDIVIDUAL band
    expect(r.nextRequirement).toContain('Senior AI Architect'); // next rung within the band
  });

  it('promoted to architect (rank 8) → AI Architect + Senior seniority rung, top of ladder', () => {
    const r = computeBand({ pointsTotal: 0, builderLevelSlug: 'architect', builderRank: 8 });
    expect(r.bandSlug).toBe('architect');
    expect(r.rungName).toBe('Senior AI Architect');
    expect(r.nextBand).toBeNull();
    expect(r.nextRequirement).toMatch(/org-level|Organization/i);
  });

  it('maps every one of the 8 promoted ranks (1-8) to a build band, never a free band', () => {
    for (const [slug, def] of Object.entries(RANK_TO_BAND)) {
      const r = computeBand({ pointsTotal: 0, builderLevelSlug: slug, builderRank: def.rank });
      expect(r.isBuildBand).toBe(true);
      expect(['builder', 'architect']).toContain(r.bandSlug);
      expect(r.cappedByPointsOnly).toBe(false);
    }
  });

  it('rank 0 / slug "builder" is the entry default — NOT a promotion; derives from points', () => {
    expect(hasBuildPromotion(0, 'builder')).toBe(false);
    const r = computeBand({ pointsTotal: 200, builderLevelSlug: 'builder', builderRank: 0 });
    expect(r.isBuildBand).toBe(false);
    expect(r.bandSlug).toBe('aware'); // 200 pts → Aware II
    expect(r.rungName).toBe('AI Aware II');
  });

  it('nextBand crosses AI Builder → AI Architect at the top builder rung', () => {
    const r = computeBand({ pointsTotal: 0, builderLevelSlug: 'senior_engineer', builderRank: 6 });
    expect(r.bandSlug).toBe('builder');
    expect(r.rungName).toBe('AI Builder VI');
    expect(r.nextBand).toBe('AI Architect');
    expect(r.nextRequirement).toContain('AI Architect'); // next rung is architect_candidate → "AI Architect"
  });

  it('rank-only fallback resolves a build rung when the slug is unknown', () => {
    // slug not in RANK_TO_BAND, but rank 5 → highest rung with rank <= 5 = AI Builder V
    const r = computeBand({ pointsTotal: 0, builderLevelSlug: 'legacy_unknown', builderRank: 5 });
    expect(r.bandSlug).toBe('builder');
    expect(r.rungName).toBe('AI Builder V');
  });
});

describe('hasBuildPromotion', () => {
  it('true when rank >= 1 or a mapped non-entry slug is present', () => {
    expect(hasBuildPromotion(1, 'junior_builder')).toBe(true);
    expect(hasBuildPromotion(0, 'junior_builder')).toBe(true); // slug fallback (rank stale/0)
    expect(hasBuildPromotion(8, 'architect')).toBe(true);
  });
  it('false for the entry default and for missing data', () => {
    expect(hasBuildPromotion(0, 'builder')).toBe(false);
    expect(hasBuildPromotion(null, null)).toBe(false);
    expect(hasBuildPromotion(undefined, undefined)).toBe(false);
    expect(hasBuildPromotion(0, 'unknown_slug')).toBe(false);
  });
});
