/**
 * Contract tests for the Trust Before Intelligence vocabulary.
 *
 * These pin the book's definitions against drift. The failure mode they guard is not a
 * crash — it is Colaberry's platform quietly scoring INPACT out of 5 or averaging GOALS,
 * and diverging from the framework it sells.
 */
import {
  GOALS_DIMENSIONS,
  GOALS_MAX_SCORE,
  GOALS_MAX_TOTAL,
  GOALS_MATURITY,
  INPACT_DIMENSIONS,
  INPACT_MAX_SCORE,
  INPACT_MAX_TOTAL,
  TRUST_LAYERS,
  TRUST_LAYER_NAMES,
  findInpactOrderingViolations,
  goalsGateFailures,
  goalsTotal,
  inpactHeadlineScore,
  inpactPhase,
  isValidGoalsScore,
  isValidInpactScore,
  trustLayerNumber,
  unscoredInpactDimensions,
  type InpactDimension,
  type InpactScores,
} from '../inpact';

const ALL_SIX = (score: number): InpactScores =>
  Object.fromEntries(INPACT_DIMENSIONS.map((d) => [d, score])) as InpactScores;

describe('INPACT is six dimensions scored 1-6', () => {
  it('has exactly the book’s six needs', () => {
    expect([...INPACT_DIMENSIONS]).toEqual([
      'instant',
      'natural',
      'permitted',
      'adaptive',
      'contextual',
      'transparent',
    ]);
  });

  it('maximum is 36, not 30 — the scale is 1-6, not 1-5', () => {
    // The specific drift this test exists to catch: reusing GOALS's 1-5 ladder here.
    expect(INPACT_MAX_SCORE).toBe(6);
    expect(INPACT_MAX_TOTAL).toBe(36);
  });

  it.each([
    [0, false],
    [1, true],
    [6, true],
    [7, false],
    [3.5, false],
    ['4', false],
    [null, false],
  ])('score %p valid: %p', (score, expected) => {
    expect(isValidInpactScore(score)).toBe(expected);
  });
});

describe('the 100-point headline', () => {
  it('all sixes is 100', () => {
    expect(inpactHeadlineScore(ALL_SIX(6))).toBe(100);
  });

  it('all ones is 17 (6/36)', () => {
    expect(inpactHeadlineScore(ALL_SIX(1))).toBe(17);
  });

  it('is null unless EVERY dimension is scored', () => {
    // A partial assessment reported as a number invites comparison with a complete one.
    const partial: InpactScores = { instant: 5, natural: 4 };
    expect(inpactHeadlineScore(partial)).toBeNull();
  });

  it('is null when one dimension is out of range', () => {
    expect(inpactHeadlineScore({ ...ALL_SIX(4), transparent: 9 })).toBeNull();
  });

  it('names the dimensions still unscored', () => {
    expect(unscoredInpactDimensions({ instant: 5 }).sort()).toEqual(
      ['natural', 'permitted', 'adaptive', 'contextual', 'transparent'].sort(),
    );
  });
});

describe('INPACT dependency order is a build constraint', () => {
  it('assigns the book’s four phases', () => {
    expect(inpactPhase('instant')).toBe(1);
    expect(inpactPhase('natural')).toBe(2);
    expect(inpactPhase('permitted')).toBe(2);
    expect(inpactPhase('contextual')).toBe(3);
    expect(inpactPhase('adaptive')).toBe(4);
    expect(inpactPhase('transparent')).toBe(4);
  });

  it('accepts a correctly ordered plan', () => {
    const order: InpactDimension[] = [
      'instant',
      'natural',
      'permitted',
      'contextual',
      'adaptive',
      'transparent',
    ];
    expect(findInpactOrderingViolations(order)).toEqual([]);
  });

  it('REJECTS Adaptive before Instant', () => {
    // From the book: "Adaptive systems cannot learn from batch updates." A plan that
    // schedules this is not ambitious, it is invalid.
    const violations = findInpactOrderingViolations(['adaptive', 'instant']);
    expect(violations).toHaveLength(1);
    expect(violations[0].dimension).toBe('adaptive');
    expect(violations[0].requiresFirst).toContain('instant');
  });

  it('REJECTS Permitted before Instant', () => {
    // "Authorization cannot evaluate stale data."
    const violations = findInpactOrderingViolations(['permitted', 'instant']);
    expect(violations[0].requiresFirst).toContain('instant');
  });

  it('reports every violation, not just the first', () => {
    const violations = findInpactOrderingViolations(['transparent', 'adaptive', 'instant']);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it('an empty plan violates nothing', () => {
    expect(findInpactOrderingViolations([])).toEqual([]);
  });
});

describe('the 7 layers use the book’s canonical names', () => {
  it('is seven layers, orchestration last', () => {
    expect(TRUST_LAYERS).toHaveLength(7);
    expect(TRUST_LAYERS[6]).toBe('orchestration');
  });

  it('layer 1 is Multi-Modal Storage and layer 2 is Real-Time Data', () => {
    // The master plan's shorthand ("Storage", "Real-Time") reads as a discrepancy to a
    // client who has read the book.
    expect(trustLayerNumber('multi_modal_storage')).toBe(1);
    expect(TRUST_LAYER_NAMES.multi_modal_storage).toBe('Layer 1: Multi-Modal Storage');
    expect(TRUST_LAYER_NAMES.real_time_data).toBe('Layer 2: Real-Time Data');
  });

  it('governance is layer 5, observability 6', () => {
    expect(trustLayerNumber('governance')).toBe(5);
    expect(trustLayerNumber('observability')).toBe(6);
  });
});

describe('GOALS is five dimensions scored 1-5', () => {
  it('has exactly the book’s five dimensions', () => {
    expect([...GOALS_DIMENSIONS]).toEqual([
      'governance',
      'observability',
      'availability',
      'lexicon',
      'solid',
    ]);
  });

  it('maximum is 25, on a 1-5 ladder', () => {
    expect(GOALS_MAX_SCORE).toBe(5);
    expect(GOALS_MAX_TOTAL).toBe(25);
  });

  it('names every rung of the maturity ladder', () => {
    expect(GOALS_MATURITY[1]).toMatch(/Absent/);
    expect(GOALS_MATURITY[5]).toMatch(/Advanced/);
  });

  it.each([
    [0, false],
    [1, true],
    [5, true],
    [6, false],
  ])('score %p valid: %p', (score, expected) => {
    expect(isValidGoalsScore(score)).toBe(expected);
  });

  it('totals to 25 at full marks', () => {
    const all5 = Object.fromEntries(GOALS_DIMENSIONS.map((d) => [d, 5]));
    expect(goalsTotal(all5)).toBe(25);
  });

  it('is null unless every dimension is scored', () => {
    expect(goalsTotal({ governance: 5 })).toBeNull();
  });
});

describe('GOALS gates per dimension, never on an average', () => {
  it('a single collapsed dimension fails even when the total looks healthy', () => {
    // The whole point. 5+5+5+5+1 = 21/25 "looks fine" averaged, but Solid at 1/5 means
    // the data is wrong, and the book's interdependence principle says that cascades.
    const scores = { governance: 5, observability: 5, availability: 5, lexicon: 5, solid: 1 };
    expect(goalsTotal(scores)).toBe(21);

    const failures = goalsGateFailures(scores, { minimumAll: 4 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ dimension: 'solid', required: 4, actual: 1 });
  });

  it('applies a per-dimension override above the general minimum', () => {
    // The book's healthcare rule: 4/5 everywhere, 5/5 in Governance for clinical AI.
    const scores = { governance: 4, observability: 4, availability: 4, lexicon: 4, solid: 4 };
    const failures = goalsGateFailures(scores, {
      minimumAll: 4,
      overrides: { governance: 5 },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ dimension: 'governance', required: 5, actual: 4 });
  });

  it('an UNSCORED dimension is a failure, not a pass', () => {
    // "not scored" is not "meets the bar".
    const failures = goalsGateFailures({ governance: 5 }, { minimumAll: 3 });
    expect(failures).toHaveLength(4);
    failures.forEach((f) => expect(f.actual).toBeNull());
  });

  it('a fully compliant assessment produces no failures', () => {
    const scores = { governance: 5, observability: 4, availability: 4, lexicon: 4, solid: 4 };
    expect(goalsGateFailures(scores, { minimumAll: 4, overrides: { governance: 5 } })).toEqual([]);
  });
});
