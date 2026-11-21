/**
 * documentChecks — the deterministic checks + the pure pass rule. Table-driven. Includes the hazard-3.2 guard: a
 * build-track (scope) requirement is EXCLUDED from the coverage denominator, so it is never counted as "uncovered".
 */
import { checkCoverage, checkLocationCoverage, checkFormat, checkFact, passes, runDocumentChecks, isSubstantiveAnswer, isBoilerplateAnswer, isSubmissionInstructionRequirement, isNonTechnicalAdministrativeRequirement, type DocumentCheckInput } from '../documentChecks';
import type { CheckScores } from '../proposalReviewTypes';

const scoreAll = (n: number): CheckScores => ({ coverage: n, format: n, fact: n, evaluator: n, proof: n, clarity: n });
const base: DocumentCheckInput = { contentHtml: '<h1>x</h1>', sections: [], requirementIds: [], fileName: 'technical.pdf' };
// A real, concrete answer: past the minimum informative length AND naming specifics (numbers + method/tech nouns).
const SUBSTANTIVE = '<p>We deliver a GIS-integrated work order management workflow: role-based intake, a 2-week migration of 12,000 historical work orders, SSO via SAML, weekly acceptance testing against the city uptime SLA, and a 3-phase training plan for 40 staff.</p>';
// A truthful but generic compliance sentence — no method, no specifics.
const BOILERPLATE = '<p>We comply with this requirement and the firm understands its obligations as required.</p>';

describe('isSubstantiveAnswer / isBoilerplateAnswer', () => {
  it('a long, concrete answer is substantive and not boilerplate', () => {
    expect(isSubstantiveAnswer(SUBSTANTIVE)).toBe(true);
    expect(isBoilerplateAnswer(SUBSTANTIVE)).toBe(false);
  });
  it('a generic "we comply" sentence is boilerplate and NOT substantive', () => {
    expect(isSubstantiveAnswer(BOILERPLATE)).toBe(false);
    expect(isBoilerplateAnswer(BOILERPLATE)).toBe(true);
  });
  it('a bare anchor / tiny text is not substantive', () => {
    expect(isSubstantiveAnswer('<p>answered</p>')).toBe(false);
  });
});

describe('isSubmissionInstructionRequirement', () => {
  it('flags pure submission logistics (the independent-review failure: these were written up as technical strategy)', () => {
    expect(isSubmissionInstructionRequirement('One (1) electronic (PDF) copy of responses shall be submitted by email to Herriman City.')).toBe(true);
    expect(isSubmissionInstructionRequirement('Proposals must be submitted no later than 5:00 p.m. MDT on November 30, 2026.')).toBe(true);
    expect(isSubmissionInstructionRequirement('Responses are limited to a 25 page limit, 11pt font.')).toBe(true);
  });
  it('does NOT flag a technical/functional requirement as submission logistics', () => {
    expect(isSubmissionInstructionRequirement('The system shall provide two-way GIS synchronization with ArcGIS, including conflict handling.')).toBe(false);
    expect(isSubmissionInstructionRequirement('Provide a work order management workflow with preventive maintenance scheduling.')).toBe(false);
  });
  it('a requirement that mentions submission BUT also names a technical capability is NOT submission-only', () => {
    expect(isSubmissionInstructionRequirement('Responses shall be submitted via the Bonfire portal and the solution must support offline field data capture.')).toBe(false);
  });
});

describe('isNonTechnicalAdministrativeRequirement (R3)', () => {
  it('flags the City evaluation process, procurement/contractual mechanics, and packaging/format rules', () => {
    // These appeared as technical answers in the R2 export and must not (plan T02/T03).
    expect(isNonTechnicalAdministrativeRequirement('All Proposals received will be reviewed by a Review Panel.')).toBe(true);
    expect(isNonTechnicalAdministrativeRequirement('The average of all reviews will be taken as the final score.')).toBe(true);
    expect(isNonTechnicalAdministrativeRequirement('No late response, modification, or amendment will be accepted.')).toBe(true);
    expect(isNonTechnicalAdministrativeRequirement('No responses via facsimile or telegraphic will be accepted.')).toBe(true);
    expect(isNonTechnicalAdministrativeRequirement('The successful Proposer will be required to enter into a written agreement with the City.')).toBe(true);
    expect(isNonTechnicalAdministrativeRequirement('An introductory letter should be addressed to the City contact.')).toBe(true);
  });
  it('does NOT flag a genuine proposer-facing narrative ask or a functional requirement', () => {
    expect(isNonTechnicalAdministrativeRequirement("Describe, in sufficient detail, the Proposer's understanding of the proposed project and the services provided.")).toBe(false);
    expect(isNonTechnicalAdministrativeRequirement('The system must provide a configurable review workflow where a supervisor approves a work order before dispatch.')).toBe(false);
    expect(isNonTechnicalAdministrativeRequirement('System must support bidirectional GIS integration to autofill work order fields.')).toBe(false);
  });
});

describe('checkCoverage (SUBSTANTIVE)', () => {
  it('scores the fraction of requirements with a substantive answer', () => {
    const r = checkCoverage({ ...base, requirementIds: ['R1', 'R2'], sections: [{ sectionKey: 'R1', contentHtml: SUBSTANTIVE }, { sectionKey: 'R2', contentHtml: '' }] });
    expect(r.score).toBe(50);
    expect(r.findings.some((f) => f.sectionKey === 'R2')).toBe(true);
  });
  it('T04: a generic "we comply" section WITH a correct data-req anchor is NOT substantively covered', () => {
    const r = checkCoverage({ ...base, requirementIds: ['R1'], contentHtml: '<section data-req="R1">We comply.</section>', sections: [{ sectionKey: 'R1', contentHtml: BOILERPLATE }] });
    expect(r.score).toBe(0);
    expect(r.findings.some((f) => f.sectionKey === 'R1' && /boilerplate|thin/i.test(f.message))).toBe(true);
  });
  it('a bare data-req anchor no longer earns substantive coverage (location only)', () => {
    const r = checkCoverage({ ...base, requirementIds: ['R1'], contentHtml: '<section data-req="R1">answered inline</section>', sections: [] });
    expect(r.score).toBe(0);
  });
  it('HAZARD 3.2: a build-track requirement is excluded from the denominator (never counted uncovered)', () => {
    const r = checkCoverage({ ...base, requirementIds: ['R1', 'BUILD-1'], buildRequirementIds: ['BUILD-1'], sections: [{ sectionKey: 'R1', contentHtml: SUBSTANTIVE }] });
    expect(r.score).toBe(100); // only R1 is in the denominator, and it is substantively covered
    expect(r.findings.find((f) => f.sectionKey === 'BUILD-1')).toBeUndefined();
  });
});

describe('checkLocationCoverage (STRUCTURAL, independent of substance)', () => {
  it('a bare data-req anchor IS located (100), even though it is not substantively covered', () => {
    const r = checkLocationCoverage({ ...base, requirementIds: ['R1'], contentHtml: '<section data-req="R1">answered inline</section>', sections: [] });
    expect(r.score).toBe(100);
  });
  it('the generic-boilerplate case is 100% located but 0% substantively covered — the two never conflate', () => {
    const input = { ...base, requirementIds: ['R1'], contentHtml: '<section data-req="R1">x</section>', sections: [{ sectionKey: 'R1', contentHtml: BOILERPLATE }] };
    expect(checkLocationCoverage(input).score).toBe(100);
    expect(checkCoverage(input).score).toBe(0);
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
      { ...base, requirementIds: ['R1'], sections: [{ sectionKey: 'R1', contentHtml: SUBSTANTIVE }], pageLimit: 20, pageCount: 10 },
      { scores: { evaluator: 96, proof: 95, clarity: 96 }, findings: [] },
    );
    expect(r.passes).toBe(true);
    expect(r.fatal).toEqual([]);
    expect(r.locationCoverage).toBe(100); // structural signal reported alongside
  });
  it('a generic answer cannot pass even with passing AI results (substantive coverage fails the floor)', () => {
    const r = runDocumentChecks(
      { ...base, requirementIds: ['R1'], sections: [{ sectionKey: 'R1', contentHtml: BOILERPLATE }], pageLimit: 20, pageCount: 10 },
      { scores: { evaluator: 96, proof: 95, clarity: 96 }, findings: [] },
    );
    expect(r.scores.coverage).toBe(0);
    expect(r.passes).toBe(false); // the headline fix: boilerplate no longer rides passing AI scores to a green
  });
});
