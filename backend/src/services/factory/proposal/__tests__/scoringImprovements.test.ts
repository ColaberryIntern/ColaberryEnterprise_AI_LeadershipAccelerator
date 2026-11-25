import {
  nonEmptyImprovements,
  isBelowTarget,
  weightedScore,
  lowestCheck,
} from '../scoringImprovements';
import type { CheckScores, CheckFinding } from '../proposalReviewTypes';

const PASSING: CheckScores = { coverage: 100, evaluator: 100, proof: 100, clarity: 100, format: 100, fact: 100 };
const scores = (over: Partial<CheckScores> = {}): CheckScores => ({ ...PASSING, ...over });
const finding = (over: Partial<CheckFinding> = {}): CheckFinding => ({ check: 'coverage', severity: 'major', message: 'm', ...over });

describe('scoringImprovements (M4-T3)', () => {
  it('weightedScore and isBelowTarget use the real thresholds', () => {
    expect(weightedScore(PASSING)).toBe(100);
    expect(isBelowTarget({ scores: PASSING })).toBe(false);
    // a single check below the 85 floor fails even with a high weighted total
    expect(isBelowTarget({ scores: scores({ fact: 80 }) })).toBe(true);
    // a fatal finding fails regardless of score
    expect(isBelowTarget({ scores: PASSING, fatal: [finding({ severity: 'fatal' })] })).toBe(true);
  });

  it('GUARANTEE: a below-target document with NO usable findings still yields >= 1 improvement', () => {
    const out = nonEmptyImprovements({ scores: scores({ coverage: 40 }), findings: [] });
    expect(out.length).toBeGreaterThanOrEqual(1);
  });

  it('GUARANTEE holds even when findings are present but empty-texted (the loop "ran out" case)', () => {
    const out = nonEmptyImprovements({
      scores: scores({ proof: 50 }),
      findings: [finding({ fixHint: '', message: '' }), finding({ fixHint: '   ' })],
    });
    expect(out.length).toBeGreaterThanOrEqual(1);
  });

  it('synthesizes the improvement from the WEAKEST check', () => {
    const out = nonEmptyImprovements({ scores: scores({ format: 30 }), findings: [] });
    expect(lowestCheck(scores({ format: 30 }))).toBe('format');
    expect(out[0].toLowerCase()).toContain('format');
  });

  it('passes concrete finding fixes through when they exist', () => {
    const out = nonEmptyImprovements({
      scores: scores({ clarity: 60 }),
      findings: [finding({ check: 'clarity', fixHint: 'Shorten section 3.' })],
    });
    expect(out).toContain('Shorten section 3.');
  });

  it('a passing document is not forced to have improvements (may be empty)', () => {
    expect(nonEmptyImprovements({ scores: PASSING, findings: [] })).toEqual([]);
  });

  it('never returns empty across a sweep of below-target score profiles', () => {
    for (const k of ['coverage', 'evaluator', 'proof', 'clarity', 'format', 'fact'] as const) {
      const out = nonEmptyImprovements({ scores: scores({ [k]: 10 } as Partial<CheckScores>), findings: [] });
      expect(out.length).toBeGreaterThanOrEqual(1);
    }
  });
});
