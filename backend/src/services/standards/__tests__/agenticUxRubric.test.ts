/**
 * The rubric's arithmetic, its gates, and the three sentences that keep it honest.
 *
 * The single most important test in this file is the one asserting that a perfect score with a
 * failed hard gate still returns BLOCK. A rubric where points can buy past a gate is a rubric
 * that will eventually be used to ship something it was written to stop.
 */
import fs from 'fs';
import path from 'path';
import {
  scoreAgenticUx,
  RubricInputError,
  RUBRIC_DIMENSIONS,
  HARD_GATES,
  AUTONOMY_TIERS,
  TOTAL_WEIGHT,
  type HardGateResult,
} from '../agenticUxRubric';

const DOC = path.resolve(__dirname, '../../../../../docs/standards/agentic-ux-trust-standard-v1.md');

/** Every dimension at one value. */
const flat = (value: number): Record<string, number> =>
  Object.fromEntries(RUBRIC_DIMENSIONS.map((d) => [d.key, value]));

/** Every gate passing, with evidence. */
const allGatesPass = (): HardGateResult[] =>
  HARD_GATES.map((g) => ({ id: g.id, passed: true, evidence: `checked: ${g.id}` }));

describe('the weights are the standard\'s weights', () => {
  it('totals exactly 100 across ten dimensions', () => {
    expect(RUBRIC_DIMENSIONS).toHaveLength(10);
    expect(TOTAL_WEIGHT).toBe(100);
  });

  it('carries the weights the document states, dimension by dimension', () => {
    // Pinned individually, not just as a sum: two dimensions could swap weights and still total
    // 100, which would silently reweight trust against accessibility.
    expect(Object.fromEntries(RUBRIC_DIMENSIONS.map((d) => [d.key, d.weight]))).toEqual({
      outcome_clarity: 12,
      visual_hierarchy: 10,
      trust_provenance: 15,
      control_approvals: 15,
      orchestration: 10,
      explainability: 10,
      accessibility: 10,
      recovery: 8,
      technical_quality: 5,
      user_validation: 5,
    });
  });

  it('names eight hard gates and five autonomy tiers', () => {
    expect(HARD_GATES).toHaveLength(8);
    expect(HARD_GATES.map((g) => g.id)).toEqual([
      'GATE-001', 'GATE-002', 'GATE-003', 'GATE-004',
      'GATE-005', 'GATE-006', 'GATE-007', 'GATE-008',
    ]);
    expect(AUTONOMY_TIERS.map((t) => t.id)).toEqual(['A0', 'A1', 'A2', 'A3', 'A4']);
  });

  it('gives every dimension passing evidence, so a score is defensible', () => {
    for (const d of RUBRIC_DIMENSIONS) {
      expect(d.passingEvidence.length).toBeGreaterThan(20);
    }
  });
});

describe('the arithmetic, from known inputs', () => {
  it('scores a perfect sheet at exactly 100', () => {
    const r = scoreAgenticUx({ scores: flat(5), hardGates: allGatesPass() });
    expect(r.weighted_total).toBe(100);
    expect(r.raw_total).toBe(500);
  });

  it('scores an all-zero sheet at exactly 0', () => {
    const r = scoreAgenticUx({ scores: flat(0), hardGates: allGatesPass() });
    expect(r.weighted_total).toBe(0);
    expect(r.raw_total).toBe(0);
  });

  it('scores a flat 3 at exactly 60, not 59.999999', () => {
    // 3 on a weight of 12 is 7.2, which has no exact binary representation. Summing ten of those
    // in floating point is how a 60 becomes a 59.99999999999999 and a threshold flips.
    const r = scoreAgenticUx({ scores: flat(3), hardGates: allGatesPass() });
    expect(r.raw_total).toBe(300);
    expect(r.weighted_total).toBe(60);
  });

  it('weights a single dimension exactly: 5 on trust_provenance alone is 15', () => {
    const scores = { ...flat(0), trust_provenance: 5 };
    const r = scoreAgenticUx({ scores, hardGates: allGatesPass() });
    expect(r.weighted_total).toBe(15);
  });

  it('weights a lesser dimension exactly: 5 on user_validation alone is 5', () => {
    const r = scoreAgenticUx({ scores: { ...flat(0), user_validation: 5 }, hardGates: allGatesPass() });
    expect(r.weighted_total).toBe(5);
  });

  it('handles a hand-computed mixed sheet', () => {
    // 5*12 + 4*10 + 5*15 + 3*15 + 4*10 + 3*10 + 2*10 + 5*8 + 4*5 + 1*5
    // = 60 + 40 + 75 + 45 + 40 + 30 + 20 + 40 + 20 + 5 = 375 raw -> 75.0
    const r = scoreAgenticUx({
      scores: {
        outcome_clarity: 5, visual_hierarchy: 4, trust_provenance: 5, control_approvals: 3,
        orchestration: 4, explainability: 3, accessibility: 2, recovery: 5,
        technical_quality: 4, user_validation: 1,
      },
      hardGates: allGatesPass(),
    });
    expect(r.raw_total).toBe(375);
    expect(r.weighted_total).toBe(75);
    expect(r.decision).toBe('REDESIGN');
  });

  it('never accepts a total as input: there is no field for one', () => {
    const r = scoreAgenticUx({
      // A caller trying to supply a total has nowhere to put it; this proves the extra key is
      // ignored rather than quietly trusted.
      scores: flat(1),
      hardGates: allGatesPass(),
      weighted_total: 99,
    } as never);
    expect(r.weighted_total).toBe(20);
  });
});

describe('a score outside 0 to 5 is REJECTED, never clamped', () => {
  it.each([[6], [-1], [100], [5.5], [0.5], [NaN], [Infinity]])('throws on %p', (bad) => {
    expect(() =>
      scoreAgenticUx({ scores: { ...flat(3), accessibility: bad as number }, hardGates: allGatesPass() }),
    ).toThrow(RubricInputError);
  });

  it.each([['a string'], [null], [undefined], [{}], [[]]])('throws on a non-number: %p', (bad) => {
    expect(() =>
      scoreAgenticUx({ scores: { ...flat(3), recovery: bad as never }, hardGates: allGatesPass() }),
    ).toThrow(RubricInputError);
  });

  it('names the dimension that was wrong, so the error is actionable', () => {
    expect(() =>
      scoreAgenticUx({ scores: { ...flat(3), explainability: 9 }, hardGates: allGatesPass() }),
    ).toThrow(/explainability/);
  });

  it('throws when a dimension is missing entirely rather than scoring it zero', () => {
    const partial = flat(4);
    delete partial.accessibility;
    expect(() => scoreAgenticUx({ scores: partial, hardGates: allGatesPass() })).toThrow(
      RubricInputError,
    );
  });

  it('throws on an unknown dimension rather than scoring nine and reporting ten', () => {
    expect(() =>
      scoreAgenticUx({ scores: { ...flat(3), vibes: 5 }, hardGates: allGatesPass() }),
    ).toThrow(/vibes/);
  });

  it('accepts every legal score, so the rejections above are not rejecting everything', () => {
    for (const v of [0, 1, 2, 3, 4, 5]) {
      expect(() => scoreAgenticUx({ scores: flat(v), hardGates: allGatesPass() })).not.toThrow();
    }
  });
});

describe('a failed hard gate BLOCKS, whatever the score', () => {
  it('blocks a PERFECT 100 when one gate fails', () => {
    // The test this whole file exists for.
    const gates = allGatesPass();
    gates[2] = { id: 'GATE-003', passed: false, evidence: 'a failed action rendered as succeeded' };
    const r = scoreAgenticUx({ scores: flat(5), hardGates: gates });
    expect(r.weighted_total).toBe(100);
    expect(r.decision).toBe('BLOCK');
    expect(r.failed_gates).toEqual(['GATE-003']);
    expect(r.rationale).toContain('GATE-003');
  });

  it.each(HARD_GATES.map((g) => g.id))('blocks a perfect score when %s alone fails', (id) => {
    const gates = allGatesPass().map((g) => (g.id === id ? { ...g, passed: false } : g));
    const r = scoreAgenticUx({ scores: flat(5), hardGates: gates });
    expect(r.decision).toBe('BLOCK');
    expect(r.failed_gates).toEqual([id]);
  });

  it('treats an UNASSESSED gate as failed, not as passed', () => {
    // Silence is not a pass. This is how a gate becomes decorative.
    const r = scoreAgenticUx({ scores: flat(5), hardGates: allGatesPass().slice(0, 7) });
    expect(r.decision).toBe('BLOCK');
    expect(r.failed_gates).toEqual(['GATE-008']);
    expect(r.hard_gates.find((g) => g.id === 'GATE-008')?.evidence).toBe('not assessed');
  });

  it('treats NO gates supplied as all eight failing', () => {
    const r = scoreAgenticUx({ scores: flat(5), hardGates: [] });
    expect(r.failed_gates).toHaveLength(8);
    expect(r.decision).toBe('BLOCK');
  });

  it('requires evidence even for a PASS, because a bare verdict is an opinion', () => {
    const gates = allGatesPass();
    gates[0] = { id: 'GATE-001', passed: true, evidence: '   ' };
    expect(() => scoreAgenticUx({ scores: flat(5), hardGates: gates })).toThrow(/evidence/);
  });

  it('rejects an unknown gate id rather than counting it', () => {
    const gates = [...allGatesPass(), { id: 'GATE-999', passed: true, evidence: 'invented' }];
    expect(() => scoreAgenticUx({ scores: flat(5), hardGates: gates })).toThrow(/GATE-999/);
  });

  it('a truthy-but-not-true `passed` does not pass', () => {
    const gates = allGatesPass();
    gates[1] = { id: 'GATE-002', passed: 'yes' as never, evidence: 'looked at it' };
    expect(scoreAgenticUx({ scores: flat(5), hardGates: gates }).decision).toBe('BLOCK');
  });

  it('and with every gate passing, a perfect score is NOT blocked, so the above is not vacuous', () => {
    expect(scoreAgenticUx({ scores: flat(5), hardGates: allGatesPass() }).decision).toBe(
      'RELEASE_CANDIDATE',
    );
  });
});

describe('the decision thresholds, at their exact boundaries', () => {
  /*
   * Sheets are built by DEDUCTING from a perfect 500, not by greedily filling up to a target.
   *
   * The first version filled dimensions in order and could not express 445 at all: it landed on
   * 442 and the test failed, which looked exactly like a threshold bug. Subtracting named units
   * from a perfect sheet can express any reachable total and, more usefully, says in the test
   * itself which dimensions were marked down.
   */
  function sheetMinus(drops: Array<[string, number]>): { scores: Record<string, number>; raw: number } {
    const scores = flat(5);
    let raw = 500;
    for (const [key, units] of drops) {
      const weight = RUBRIC_DIMENSIONS.find((d) => d.key === key)!.weight;
      scores[key] -= units;
      raw -= units * weight;
      expect(scores[key]).toBeGreaterThanOrEqual(0); // the fixture itself must stay legal
    }
    return { scores, raw };
  }

  // Each row names the markdowns rather than a magic number, so the arithmetic is readable.
  const AT_90: Array<[string, number]> = [['trust_provenance', 1], ['control_approvals', 1], ['visual_hierarchy', 1], ['orchestration', 1]]; // -50
  const AT_89: Array<[string, number]> = [...AT_90, ['user_validation', 1]]; // -55
  const AT_80: Array<[string, number]> = [['trust_provenance', 5], ['control_approvals', 1], ['visual_hierarchy', 1]]; // -100
  const AT_79: Array<[string, number]> = [...AT_80, ['user_validation', 1]]; // -105
  const AT_70: Array<[string, number]> = [['trust_provenance', 5], ['control_approvals', 5]]; // -150
  const AT_69: Array<[string, number]> = [...AT_70, ['user_validation', 1]]; // -155

  it.each([
    ['90, the release boundary', AT_90, 450, 'RELEASE_CANDIDATE'],
    ['89, one point below it', AT_89, 445, 'REWORK'],
    ['80, the rework boundary', AT_80, 400, 'REWORK'],
    ['79, one point below it', AT_79, 395, 'REDESIGN'],
    ['70, the redesign boundary', AT_70, 350, 'REDESIGN'],
    ['69, one point below it', AT_69, 345, 'REJECT'],
  ])('%s decides %s', (_label, drops, raw, expected) => {
    const sheet = sheetMinus(drops as Array<[string, number]>);
    expect(sheet.raw).toBe(raw); // the fixture computes what it claims
    const r = scoreAgenticUx({ scores: sheet.scores, hardGates: allGatesPass() });
    expect(r.raw_total).toBe(raw);
    expect(r.decision).toBe(expected);
  });

  it('an all-zero sheet rejects', () => {
    expect(scoreAgenticUx({ scores: flat(0), hardGates: allGatesPass() }).decision).toBe('REJECT');
  });

  it('90 is a release candidate and 89 is not: the boundary is inclusive at the top', () => {
    expect(scoreAgenticUx({ scores: sheetMinus(AT_90).scores, hardGates: allGatesPass() }).weighted_total).toBe(90);
    expect(scoreAgenticUx({ scores: sheetMinus(AT_89).scores, hardGates: allGatesPass() }).weighted_total).toBe(89);
  });

  it('states its reasoning in words, so a reader need not re-derive the rule', () => {
    const r = scoreAgenticUx({ scores: sheetMinus(AT_80).scores, hardGates: allGatesPass() });
    expect(r.rationale).toContain('80');
    expect(r.rationale).toContain('rework');
  });
});

describe('the document says what this is, and what it is not', () => {
  const doc = fs.readFileSync(DOC, 'utf8');

  it.each([
    ['proposed internal standard'],
    ['not an existing industry certification'],
    ['assessment'],
  ])('contains the literal phrase "%s"', (phrase) => {
    expect(doc.toLowerCase()).toContain(phrase.toLowerCase());
  });

  it('says plainly that a score is not conformance', () => {
    expect(doc.toLowerCase()).toContain('not conformance');
  });

  it('carries every dimension, gate and tier the code carries, so the two cannot drift', () => {
    for (const d of RUBRIC_DIMENSIONS) expect(doc).toContain(d.label);
    for (const g of HARD_GATES) expect(doc).toContain(g.id);
    for (const t of AUTONOMY_TIERS) expect(doc).toContain(t.label);
  });

  it('states each weight next to its dimension', () => {
    for (const d of RUBRIC_DIMENSIONS) {
      expect(doc).toMatch(new RegExp(`${d.label}[^\\n]*\\|\\s*${d.weight}\\s*\\|`));
    }
  });
});
