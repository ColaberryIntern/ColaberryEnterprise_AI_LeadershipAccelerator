import { scoreServiceEvidence, evidenceTier, freshnessPoints } from '../serviceEvidenceScore';

const NOW = 2026;
const base = { insideCount: 0, outsideCount: 0, newestEvidenceYear: null as number | null, distinctIndustries: 0, currentYear: NOW };

describe('evidenceTier', () => {
  it.each([[0, 'none'], [1, 'thin'], [39, 'thin'], [40, 'emerging'], [69, 'emerging'], [70, 'proven'], [100, 'proven']])('%i -> %s', (s, t) => {
    expect(evidenceTier(s as number)).toBe(t);
  });
  it('treats garbage as none', () => { expect(evidenceTier(NaN)).toBe('none'); expect(evidenceTier(-5)).toBe('none'); });
});

describe('freshnessPoints', () => {
  it.each([[NOW, 20], [NOW - 1, 20], [NOW - 2, 8], [NOW - 3, 0], [NOW + 1, 20], [null, 0]])('year %p -> %i', (y, p) => {
    expect(freshnessPoints(y as number | null, NOW)).toBe(p);
  });
});

describe('scoreServiceEvidence', () => {
  it('is 0 / none with no confirmed links, even with industries and a fresh year', () => {
    expect(scoreServiceEvidence({ ...base, distinctIndustries: 5, newestEvidenceYear: NOW })).toEqual({ score: 0, tier: 'none', freshness: 0 });
  });

  it('applies the formula exactly: 18*inside + 11*outside + freshness + 4*industries', () => {
    // 18*1 + 11*1 + 20 + 4*2 = 57
    expect(scoreServiceEvidence({ ...base, insideCount: 1, outsideCount: 1, newestEvidenceYear: NOW - 1, distinctIndustries: 2 }))
      .toEqual({ score: 57, tier: 'emerging', freshness: 20 });
    // one outside, unknown year, no industry: 11 -> thin
    expect(scoreServiceEvidence({ ...base, outsideCount: 1 })).toEqual({ score: 11, tier: 'thin', freshness: 0 });
    // two years old: 18*2 + 8 + 4 = 48
    expect(scoreServiceEvidence({ ...base, insideCount: 2, newestEvidenceYear: NOW - 2, distinctIndustries: 1 }).score).toBe(48);
  });

  it('weights an inside case study above an outside one', () => {
    expect(scoreServiceEvidence({ ...base, insideCount: 1 }).score).toBeGreaterThan(scoreServiceEvidence({ ...base, outsideCount: 1 }).score);
  });

  it('caps at 100 and crosses into proven at 70', () => {
    expect(scoreServiceEvidence({ ...base, insideCount: 10, outsideCount: 10, newestEvidenceYear: NOW, distinctIndustries: 9 }).score).toBe(100);
    // 18*2 + 11*1 + 20 + 4*1 = 71
    expect(scoreServiceEvidence({ ...base, insideCount: 2, outsideCount: 1, newestEvidenceYear: NOW, distinctIndustries: 1 }).tier).toBe('proven');
  });

  it('is total on malformed input: negatives, fractions and non-numbers never raise a score', () => {
    expect(scoreServiceEvidence({ ...base, insideCount: -3, outsideCount: NaN })).toEqual({ score: 0, tier: 'none', freshness: 0 });
    expect(scoreServiceEvidence({ ...base, insideCount: 1.9, distinctIndustries: -2 }).score).toBe(18);
    expect(scoreServiceEvidence(undefined as never)).toEqual({ score: 0, tier: 'none', freshness: 0 });
  });

  it('is deterministic: the same input twice gives the same result', () => {
    const i = { ...base, insideCount: 3, outsideCount: 2, newestEvidenceYear: NOW - 2, distinctIndustries: 3 };
    expect(scoreServiceEvidence(i)).toEqual(scoreServiceEvidence({ ...i }));
  });
});
