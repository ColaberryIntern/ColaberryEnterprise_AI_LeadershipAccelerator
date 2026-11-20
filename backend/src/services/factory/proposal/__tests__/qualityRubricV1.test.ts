/**
 * qualityRubricV1 — the immutable internal rubric + evidence-based scorer. Proves the weights sum to 100, an UNKNOWN
 * dimension scores 0 and cannot be dropped to inflate the total, a hard-gate block forces a PROVISIONAL score that can
 * never read as a final >=92, and a fully-evidenced, unblocked proposal can legitimately meet the target.
 */
import { RUBRIC_V1, RUBRIC_TARGET, rubricWeightTotal, computeRubricScore, type RubricDimensionKey, type DimensionEvidence } from '../qualityRubricV1';

const all = (score: number): Partial<Record<RubricDimensionKey, DimensionEvidence>> =>
  Object.fromEntries(RUBRIC_V1.map((d) => [d.key, { score, confidence: 'high' } as DimensionEvidence])) as any;

describe('qualityRubricV1', () => {
  it('the eight dimension weights sum to exactly 100', () => {
    expect(rubricWeightTotal()).toBe(100);
    expect(RUBRIC_V1).toHaveLength(8);
  });

  it('a fully-evidenced, unblocked proposal at 95 across the board scores 95 and meets the target', () => {
    const r = computeRubricScore(all(95), { provisional: false });
    expect(r.weightedScore).toBe(95);
    expect(r.provisional).toBe(false);
    expect(r.meetsTarget).toBe(true);
  });

  it('a hard-gate block forces PROVISIONAL and the score can never read as meeting the target', () => {
    const r = computeRubricScore(all(99), { provisional: true });
    expect(r.weightedScore).toBe(99);
    expect(r.provisional).toBe(true);
    expect(r.meetsTarget).toBe(false); // provisional >=92 is NOT a pass
  });

  it('an UNKNOWN dimension scores 0 and stays in the denominator (you cannot inflate by omitting it)', () => {
    const ev = all(100);
    ev.pricing_commercial = { score: null, confidence: 'low', unknown: true }; // weight 10
    const r = computeRubricScore(ev, { provisional: false });
    expect(r.weightedScore).toBe(90); // 100 across all but the 10-weight pricing dimension, which contributes 0
    expect(r.dimensions.find((d) => d.key === 'pricing_commercial')?.unknown).toBe(true);
    expect(r.meetsTarget).toBe(false); // 90 < 92
  });

  it('a missing dimension (no evidence at all) also scores 0, never skipped', () => {
    const ev = all(100);
    delete ev.evidence_past_performance; // weight 15
    const r = computeRubricScore(ev, { provisional: false });
    expect(r.weightedScore).toBe(85);
    expect(r.dimensions.find((d) => d.key === 'evidence_past_performance')?.score).toBe(0);
  });

  it('exposes the target as 92', () => {
    expect(RUBRIC_TARGET).toBe(92);
  });
});
