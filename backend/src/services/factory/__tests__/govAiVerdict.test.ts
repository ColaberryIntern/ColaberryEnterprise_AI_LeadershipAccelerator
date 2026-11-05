import { coverageOf, decideVerdict } from '../govAiVerdict';

const QUOTE = 'Vendor must hold an active StateRAMP authorization at the time of submission.';
const texts = [`Mandatory: ${QUOTE} Proposals without it are rejected.`];
const caps = (have: number, none: number) => [
  ...Array.from({ length: have }, () => ({ assessment: 'have' })),
  ...Array.from({ length: none }, () => ({ assessment: 'new' })),
];
const decide = (ai: any, capabilities: any = caps(8, 2), over: any = {}) =>
  decideVerdict({ ai, capabilities, catalogSize: 5, requirementTexts: texts, ...over });

describe('coverageOf', () => {
  it('counts have and partial', () => expect(coverageOf([{ assessment: 'have' }, { assessment: 'partial' }, { assessment: 'new' }, { assessment: 'new' }])).toBe(50));
  it('is null, not zero, when nothing was assessed', () => {
    expect(coverageOf([])).toBeNull();
    expect(coverageOf(null)).toBeNull();
  });
});

describe('decideVerdict', () => {
  it('pursue with good coverage is pursue', () => expect(decide({ verdict: 'pursue', reason: 'r' }).verdict).toBe('pursue'));
  it('pursue at exactly 50 is pursue', () => expect(decide({ verdict: 'pursue' }, caps(5, 5)).verdict).toBe('pursue'));
  it('pursue at 49 is inconclusive', () => {
    const c = Array.from({ length: 100 }, (_, i) => ({ assessment: i < 49 ? 'have' : 'new' }));
    expect(decide({ verdict: 'pursue' }, c)).toMatchObject({ verdict: 'inconclusive', coveragePct: 49 });
  });
  it('pursue at 10 is inconclusive, never a star', () => expect(decide({ verdict: 'pursue' }, caps(1, 9)).verdict).toBe('inconclusive'));

  it('pass with a quote found in the requirements is pass', () => {
    expect(decide({ verdict: 'pass', reason: 'r', quote: QUOTE })).toMatchObject({ verdict: 'pass', quote: QUOTE });
  });
  it('quote matching tolerates case, curly quotes and wrapped lines', () => {
    expect(decide({ verdict: 'pass', quote: QUOTE.toUpperCase().replace(' ', '\n') }).verdict).toBe('pass');
  });
  it('pass with an invented quote and coverage 60 is inconclusive', () => {
    expect(decide({ verdict: 'pass', quote: 'The vendor must operate a fleet of forty armored cars.' }, caps(6, 4)).verdict).toBe('inconclusive');
  });
  it('a quote too short to prove anything does not count', () => {
    expect(decide({ verdict: 'pass', quote: 'Vendor must' }, caps(6, 4)).verdict).toBe('inconclusive');
  });
  it('pass with no quote and coverage under 25 is pass', () => {
    const c = Array.from({ length: 100 }, (_, i) => ({ assessment: i < 24 ? 'have' : 'new' }));
    expect(decide({ verdict: 'pass' }, c)).toMatchObject({ verdict: 'pass', quote: null, coveragePct: 24 });
  });
  it('pass with an invented quote and coverage under 25 is pass with the quote dropped', () => {
    const r = decide({ verdict: 'pass', quote: 'The vendor must operate a fleet of forty armored cars.' }, caps(1, 9));
    expect(r).toMatchObject({ verdict: 'pass', quote: null });
  });
  it('pass with no quote at exactly 25 is inconclusive', () => {
    expect(decide({ verdict: 'pass' }, caps(1, 3))).toMatchObject({ verdict: 'inconclusive', coveragePct: 25 });
  });
  it('low coverage with no AI pass never hides', () => {
    expect(decide(null, caps(0, 10)).verdict).toBe('inconclusive');
    expect(decide({ verdict: 'maybe' }, caps(0, 10)).verdict).toBe('inconclusive');
  });
  it('zero capabilities is inconclusive even with a verified quote', () => {
    expect(decide({ verdict: 'pass', quote: QUOTE }, []).verdict).toBe('inconclusive');
  });
  it('an empty catalog is inconclusive even with a verified quote', () => {
    expect(decide({ verdict: 'pass', quote: QUOTE }, caps(0, 5), { catalogSize: 0 }).verdict).toBe('inconclusive');
  });
  it('zero requirements is inconclusive', () => {
    expect(decide({ verdict: 'pursue' }, caps(5, 0), { requirementTexts: [] }).verdict).toBe('inconclusive');
  });
  it('malformed AI output is inconclusive and never throws', () => {
    for (const bad of [undefined, null, {}, { verdict: 7 }, { verdict: 'pass', quote: 42 }, { verdict: 'pursue', reason: {} }]) {
      expect(() => decide(bad)).not.toThrow();
    }
    expect(decide({ verdict: 7 }).verdict).toBe('inconclusive');
  });
  it('fills a reason when the model gave none', () => expect(decide({ verdict: 'pursue' }).reason).toBeTruthy());
});
