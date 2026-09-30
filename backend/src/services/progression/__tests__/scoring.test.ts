import {
  computeConfidence, computeReadiness, aggregateXp, evaluatePromotion,
  CONFIDENCE_HALF_SATURATION, LevelGate, PromotionInput,
} from '../scoring';

describe('computeConfidence', () => {
  it('is 0 with no evidence', () => {
    expect(computeConfidence(0)).toBe(0);
    expect(computeConfidence(-5)).toBe(0);
  });
  it('is 0.5 at the half-saturation weight', () => {
    expect(computeConfidence(CONFIDENCE_HALF_SATURATION)).toBeCloseTo(0.5, 6);
  });
  it('approaches but never exceeds 1', () => {
    expect(computeConfidence(1000)).toBeGreaterThan(0.99);
    expect(computeConfidence(1e9)).toBeLessThanOrEqual(1);
  });
  it('is monotonic in evidence weight', () => {
    let prev = -1;
    for (const w of [0, 1, 2, 3, 5, 10, 50]) {
      const c = computeConfidence(w);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
});

describe('computeReadiness', () => {
  it('is 0 with no domains', () => {
    expect(computeReadiness([])).toBe(0);
  });
  it('is a weight-normalized mean', () => {
    const r = computeReadiness([
      { domain_id: 'a', confidence: 1, weight: 3 },
      { domain_id: 'b', confidence: 0, weight: 1 },
    ]);
    expect(r).toBeCloseTo(0.75, 6);
  });
  it('is 1 when all domains are fully mastered', () => {
    expect(computeReadiness([
      { domain_id: 'a', confidence: 1, weight: 1 },
      { domain_id: 'b', confidence: 1, weight: 2 },
    ])).toBe(1);
  });
});

describe('aggregateXp', () => {
  it('sums per stream and ignores unknown streams', () => {
    const t = aggregateXp([
      { stream: 'learning', amount: 10 },
      { stream: 'learning', amount: 5 },
      { stream: 'builder', amount: 80 },
      { stream: 'community', amount: 20 },
      { stream: 'mystery', amount: 999 },
    ]);
    expect(t).toEqual({ learning: 15, builder: 80, community: 20 });
  });
});

describe('evaluatePromotion', () => {
  const gate: LevelGate = {
    slug: 'practitioner',
    required_competencies: [
      { domain_id: 'prompt_engineering', min_confidence: 0.6 },
      { domain_id: 'architecture', min_confidence: 0.5 },
    ],
    min_evidence: 5, min_artifacts: 2, min_github: 3,
    min_evaluations: 1, min_implementation: 2, min_attendance: 3,
    requires_ai_approval: true,
  };

  const passing: PromotionInput = {
    competencies: [
      { domain_id: 'prompt_engineering', confidence: 0.8 },
      { domain_id: 'architecture', confidence: 0.6 },
    ],
    evidence_count: 6, artifact_count: 2, github_count: 4,
    evaluation_count: 1, implementation_count: 2, attendance_count: 5,
    ai_approved: true,
  };

  it('is eligible when every gate is cleared', () => {
    const v = evaluatePromotion(passing, gate);
    expect(v.eligible).toBe(true);
    expect(v.gaps).toHaveLength(0);
  });

  it('NEVER promotes on volume alone when competency is short', () => {
    const v = evaluatePromotion(
      { ...passing, competencies: [{ domain_id: 'prompt_engineering', confidence: 0.2 }] },
      gate
    );
    expect(v.eligible).toBe(false);
    expect(v.gaps.some((g) => g.includes('prompt_engineering'))).toBe(true);
    expect(v.gaps.some((g) => g.includes('architecture'))).toBe(true);
  });

  it('blocks on any missing count gate', () => {
    const v = evaluatePromotion({ ...passing, github_count: 0, artifact_count: 0 }, gate);
    expect(v.eligible).toBe(false);
    expect(v.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('github'),
      expect.stringContaining('artifacts'),
    ]));
  });

  it('blocks when AI approval is required but pending', () => {
    const v = evaluatePromotion({ ...passing, ai_approved: false }, gate);
    expect(v.eligible).toBe(false);
    expect(v.gaps).toContain('ai_approval: pending');
  });

  it('ignores AI approval when the level does not require it', () => {
    const v = evaluatePromotion({ ...passing, ai_approved: false }, { ...gate, requires_ai_approval: false });
    expect(v.eligible).toBe(true);
  });
});
