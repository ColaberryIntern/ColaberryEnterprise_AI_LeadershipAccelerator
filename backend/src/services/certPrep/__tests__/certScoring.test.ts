/**
 * certScoring — the pure scoring core. No database, no mocks needed.
 */
import {
  toScaledScore,
  passingProportion,
  rollUpDomains,
  scoreSession,
  buildFormPlan,
  isExpired,
  SCALE_MIN,
  SCALE_MAX,
  PASSING_SCALED,
} from '../certScoring';

describe('toScaledScore', () => {
  it('happy path: maps proportion linearly onto the reported scale', () => {
    expect(toScaledScore(0, 60)).toBe(SCALE_MIN);
    expect(toScaledScore(60, 60)).toBe(SCALE_MAX);
    expect(toScaledScore(30, 60)).toBe(550); // 100 + 900 * 0.5
  });

  it('the 720 line lands near 69% correct — the documented assumption, not a hidden one', () => {
    expect(passingProportion()).toBeCloseTo(0.6889, 4);
    expect(toScaledScore(41, 60)).toBeLessThan(PASSING_SCALED);   // 68.3%
    expect(toScaledScore(42, 60)).toBeGreaterThanOrEqual(PASSING_SCALED); // 70.0%
  });

  it('boundary: an empty attempt is NOT measured, rather than scored at the floor', () => {
    expect(toScaledScore(0, 0)).toBeNull();
    expect(toScaledScore(5, 0)).toBeNull();
  });

  it('failure path: non-finite input returns null rather than NaN', () => {
    expect(toScaledScore(NaN, 60)).toBeNull();
    expect(toScaledScore(10, NaN)).toBeNull();
  });

  it('clamps a correct count that exceeds the total instead of exceeding the scale', () => {
    expect(toScaledScore(70, 60)).toBe(SCALE_MAX);
  });
});

describe('rollUpDomains', () => {
  it('groups by domain and computes proportion', () => {
    const result = rollUpDomains([
      { domain_id: 'D1', is_correct: true },
      { domain_id: 'D1', is_correct: false },
      { domain_id: 'D3', is_correct: true },
    ]);
    expect(result).toEqual([
      { domain_id: 'D1', correct: 1, total: 2, pct: 0.5 },
      { domain_id: 'D3', correct: 1, total: 1, pct: 1 },
    ]);
  });

  it('EXCLUDES unanswered items from both numerator and denominator', () => {
    const result = rollUpDomains([
      { domain_id: 'D1', is_correct: true },
      { domain_id: 'D1', is_correct: null },
    ]);
    // an unanswered question is not a wrong answer
    expect(result).toEqual([{ domain_id: 'D1', correct: 1, total: 1, pct: 1 }]);
  });

  it('boundary: no responses yields no domains, not zero-filled ones', () => {
    expect(rollUpDomains([])).toEqual([]);
  });

  it('orders domains deterministically', () => {
    const result = rollUpDomains([
      { domain_id: 'D5', is_correct: true },
      { domain_id: 'D1', is_correct: true },
      { domain_id: 'D3', is_correct: true },
    ]);
    expect(result.map((r) => r.domain_id)).toEqual(['D1', 'D3', 'D5']);
  });
});

describe('scoreSession', () => {
  it('scores out of the number SERVED, so an abandoned mock reads as the exam would', () => {
    const responses = [
      { domain_id: 'D1', is_correct: true },
      { domain_id: 'D1', is_correct: true },
    ];
    const score = scoreSession(responses, 60);
    expect(score.correct_count).toBe(2);
    expect(score.total_count).toBe(60);
    expect(score.answered_count).toBe(2);
    expect(score.scaled_score).toBe(toScaledScore(2, 60));
  });

  it('reports answered_count separately so "half wrong" and "half answered" are distinguishable', () => {
    const responses = [
      { domain_id: 'D1', is_correct: true },
      { domain_id: 'D1', is_correct: false },
      { domain_id: 'D1', is_correct: null },
    ];
    const score = scoreSession(responses, 3);
    expect(score.correct_count).toBe(1);
    expect(score.answered_count).toBe(2);
    expect(score.total_count).toBe(3);
  });

  it('boundary: an untouched session scores null, not zero', () => {
    expect(scoreSession([], 0).scaled_score).toBeNull();
  });
});

describe('buildFormPlan', () => {
  const official = [
    { domain_id: 'D1', weight_pct: 27 },
    { domain_id: 'D2', weight_pct: 18 },
    { domain_id: 'D3', weight_pct: 20 },
    { domain_id: 'D4', weight_pct: 20 },
    { domain_id: 'D5', weight_pct: 15 },
  ];

  it('happy path: a 60-item form matches the official weighting exactly', () => {
    const plan = buildFormPlan(official, 60);
    expect(plan).toEqual([
      { domain_id: 'D1', count: 16 }, // 27% of 60 = 16.2
      { domain_id: 'D2', count: 11 }, // 18% = 10.8
      { domain_id: 'D3', count: 12 }, // 20% = 12
      { domain_id: 'D4', count: 12 },
      { domain_id: 'D5', count: 9 },  // 15% = 9
    ]);
  });

  it('slots always sum to exactly the requested item count', () => {
    [10, 20, 30, 40, 53, 60, 63, 100].forEach((n) => {
      const total = buildFormPlan(official, n).reduce((s, x) => s + x.count, 0);
      expect(total).toBe(n);
    });
  });

  it('DROPS unweighted domains rather than inventing an equal share', () => {
    const partly = [
      { domain_id: 'D1', weight_pct: 27 },
      { domain_id: 'D2', weight_pct: null },
    ];
    const plan = buildFormPlan(partly, 10);
    expect(plan.map((p) => p.domain_id)).toEqual(['D1']);
    expect(plan[0].count).toBe(10);
  });

  it('boundary: no weights at all, or no items, yields an empty plan', () => {
    expect(buildFormPlan([{ domain_id: 'D1', weight_pct: null }], 10)).toEqual([]);
    expect(buildFormPlan(official, 0)).toEqual([]);
    expect(buildFormPlan([], 60)).toEqual([]);
  });

  it('a form smaller than the domain count still sums correctly', () => {
    const plan = buildFormPlan(official, 3);
    expect(plan.reduce((s, x) => s + x.count, 0)).toBe(3);
    expect(plan.every((p) => p.count > 0)).toBe(true);
  });
});

describe('isExpired', () => {
  const now = new Date('2026-09-03T12:00:00Z');

  it('an untimed session never expires', () => {
    expect(isExpired({ expires_at: null }, now)).toBe(false);
  });

  it('boundary: expiry is inclusive at the deadline', () => {
    expect(isExpired({ expires_at: new Date('2026-09-03T12:00:00Z') }, now)).toBe(true);
    expect(isExpired({ expires_at: new Date('2026-09-03T12:00:01Z') }, now)).toBe(false);
  });

  it('a completed session is never retroactively expired', () => {
    expect(isExpired(
      { expires_at: new Date('2026-09-03T11:00:00Z'), status: 'completed' },
      now,
    )).toBe(false);
  });
});
