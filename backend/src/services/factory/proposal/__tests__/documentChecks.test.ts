/**
 * documentChecks — the deterministic checks + the pure pass rule. Table-driven. Includes the hazard-3.2 guard: a
 * build-track (scope) requirement is EXCLUDED from the coverage denominator, so it is never counted as "uncovered".
 */
import { checkCoverage, checkFormat, checkFact, passes, runDocumentChecks, type DocumentCheckInput } from '../documentChecks';
import type { CheckScores } from '../proposalReviewTypes';

const scoreAll = (n: number): CheckScores => ({ coverage: n, format: n, fact: n, evaluator: n, proof: n, clarity: n });
const base: DocumentCheckInput = { contentHtml: '<h1>x</h1>', sections: [], requirementIds: [], fileName: 'technical.pdf' };

describe('checkCoverage', () => {
  it('scores the fraction of requirements with authored content', () => {
    const r = checkCoverage({ ...base, requirementIds: ['R1', 'R2'], sections: [{ sectionKey: 'R1', contentHtml: '<p>answered</p>' }, { sectionKey: 'R2', contentHtml: '' }] });
    expect(r.score).toBe(50);
    expect(r.findings.some((f) => f.sectionKey === 'R2')).toBe(true);
  });
  it('counts a data-req anchor in the body as covered', () => {
    const r = checkCoverage({ ...base, requirementIds: ['R1'], contentHtml: '<section data-req="R1">answered inline</section>', sections: [] });
    expect(r.score).toBe(100);
  });
  it('HAZARD 3.2: a build-track requirement is excluded from the denominator (never counted uncovered)', () => {
    const r = checkCoverage({ ...base, requirementIds: ['R1', 'BUILD-1'], buildRequirementIds: ['BUILD-1'], sections: [{ sectionKey: 'R1', contentHtml: '<p>answered</p>' }] });
    expect(r.score).toBe(100); // only R1 is in the denominator, and it is covered
    expect(r.findings.find((f) => f.sectionKey === 'BUILD-1')).toBeUndefined();
  });
});

describe('checkFormat', () => {
  it('over the page limit is FATAL', () => {
    const r = checkFormat({ ...base, pageLimit: 20, pageCount: 25 });
    expect(r.findings.some((f) => f.severity === 'fatal' && /page limit/i.test(f.message))).toBe(true);
  });
  it('a currency amount in a NON-pricing document is a fatal price leak', () => {
    const r = checkFormat({ ...base, contentHtml: '<p>Our total is $2,000,000 over the base year.</p>', isPricingDoc: false });
    expect(r.findings.some((f) => f.severity === 'fatal' && /price/i.test(f.message))).toBe(true);
  });
  it('the same amount in the PRICING document is fine (no leak)', () => {
    const r = checkFormat({ ...base, contentHtml: '<p>Total $2,000,000.</p>', isPricingDoc: true });
    expect(r.findings.some((f) => /price/i.test(f.message))).toBe(false);
  });
  it('missing required forms and signatures are fatal', () => {
    const r = checkFormat({ ...base, missingRequiredForms: ['HSP'], missingRequiredSignatures: ['Execution of Offer'] });
    expect(r.findings.filter((f) => f.severity === 'fatal').length).toBe(2);
  });
});

describe('checkFact', () => {
  it('open gap → major + counted; filler + marker → fatal', () => {
    const r = checkFact({ ...base, contentHtml: '<p>[PLACEHOLDER: who signs?]</p>', gaps: [{ resolution: 'open' }, { resolution: 'filler' }] });
    expect(r.openGaps).toBe(2); // 1 open gap + 1 marker
    expect(r.findings.filter((f) => f.severity === 'fatal').length).toBe(2); // filler + marker
  });
  it('clean content scores 100 with no open gaps', () => {
    const r = checkFact({ ...base, contentHtml: '<p>complete</p>', gaps: [{ resolution: 'answered' }] });
    expect(r.score).toBe(100);
    expect(r.openGaps).toBe(0);
  });
});

describe('passes — the 95 rule', () => {
  it('passes at exactly 95 with every check >= 85, no fatal, no open gap', () => {
    expect(passes(scoreAll(95), [], 0)).toBe(true);
  });
  it('fails when any single check is below the 85 floor (even if the weighted total clears 95)', () => {
    expect(passes({ ...scoreAll(100), fact: 84 }, [], 0)).toBe(false);
  });
  it('fails on any open gap, and on any fatal finding', () => {
    expect(passes(scoreAll(100), [], 1)).toBe(false);
    expect(passes(scoreAll(100), [{ check: 'format', severity: 'fatal', message: 'x' }], 0)).toBe(false);
  });
});

describe('runDocumentChecks', () => {
  it('without AI results, the three AI checks are 0 and the version cannot pass (no fabricated green)', () => {
    const r = runDocumentChecks({ ...base, requirementIds: ['R1'], sections: [{ sectionKey: 'R1', contentHtml: '<p>a</p>' }] });
    expect(r.scores.evaluator).toBe(0);
    expect(r.passes).toBe(false);
    expect(r.findings.some((f) => /has not run/i.test(f.message))).toBe(true);
  });
  it('with passing AI results and clean deterministic checks, the version passes', () => {
    const r = runDocumentChecks(
      { ...base, requirementIds: ['R1'], sections: [{ sectionKey: 'R1', contentHtml: '<p>a</p>' }], pageLimit: 20, pageCount: 10 },
      { scores: { evaluator: 96, proof: 95, clarity: 96 }, findings: [] },
    );
    expect(r.passes).toBe(true);
    expect(r.fatal).toEqual([]);
  });
});
