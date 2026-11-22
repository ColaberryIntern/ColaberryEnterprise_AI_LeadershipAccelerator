/**
 * documentChecks — the deterministic checks + the pure pass rule. Table-driven. Includes the hazard-3.2 guard: a
 * build-track (scope) requirement is EXCLUDED from the coverage denominator, so it is never counted as "uncovered".
 */
import { checkCoverage, checkLocationCoverage, checkFormat, checkFact, passes, runDocumentChecks, isSubstantiveAnswer, isBoilerplateAnswer, isSubmissionInstructionRequirement, isNonTechnicalAdministrativeRequirement, extractRequirementSections, hydrateSectionAnswers, type DocumentCheckInput } from '../documentChecks';
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

describe('extractRequirementSections / hydrateSectionAnswers (coverage crediting)', () => {
  // A whole-document draft with the new per-requirement heading anchor; each answer names specifics (substantive).
  const DOC = [
    '<h3>REQ-001: Overview</h3><p>Our approach to the work order management workflow: ' + 'detail '.repeat(30) + 'with GIS integration and a 2-week migration of records.</p>',
    '<h3>REQ-002: Work orders</h3><p>The intake-to-dispatch workflow: ' + 'steps '.repeat(30) + 'an SLA dashboard, role-based access, and an acceptance test.</p>',
  ].join('');

  it('splits a whole-document draft into per-requirement slices by the heading anchor', () => {
    const m = extractRequirementSections(DOC, ['REQ-001', 'REQ-002']);
    expect(m.get('REQ-001')).toMatch(/REQ-001/);
    expect(m.get('REQ-002')).toMatch(/REQ-002/);
    expect(m.get('REQ-001')).not.toMatch(/REQ-002/); // the slice boundary is respected
  });

  it('also recognizes the legacy "responds to requirement REQ-x" phrasing in already-stored drafts', () => {
    const legacy = '<p>This section responds to requirement REQ-010. We propose an API integration workflow: ' + 'detail '.repeat(30) + 'with SSO and encryption.</p>';
    const m = extractRequirementSections(legacy, ['REQ-010']);
    expect(m.get('REQ-010')).toMatch(/REQ-010/);
  });

  it('a boundary anchor never matches a longer id (REQ-1 does not match REQ-10)', () => {
    const doc = '<h3>REQ-10: Ten</h3><p>' + 'detail '.repeat(30) + 'GIS integration.</p>';
    const m = extractRequirementSections(doc, ['REQ-1']);
    expect(m.has('REQ-1')).toBe(false);
  });

  it('hydrates empty sections so checkCoverage credits an answer written inside the single content blob', () => {
    const sections = [{ sectionKey: 'REQ-001' }, { sectionKey: 'REQ-002' }];
    const hydrated = hydrateSectionAnswers(sections, DOC, ['REQ-001', 'REQ-002']);
    const cov = checkCoverage({ ...base, requirementIds: ['REQ-001', 'REQ-002'], contentHtml: DOC, sections: hydrated });
    expect(cov.score).toBe(100); // the headline fix: a substantive whole-document draft no longer scores coverage 0
  });

  it('leaves an already-authored section untouched and omits an unanchored requirement', () => {
    const sections = [{ sectionKey: 'REQ-001', contentHtml: SUBSTANTIVE }, { sectionKey: 'REQ-999' }];
    const hydrated = hydrateSectionAnswers(sections, DOC, ['REQ-001', 'REQ-999']);
    expect(hydrated.find((s) => s.sectionKey === 'REQ-001')!.contentHtml).toBe(SUBSTANTIVE); // author's content wins
    expect(hydrated.find((s) => s.sectionKey === 'REQ-999')!.contentHtml).toBeUndefined();   // no anchor -> stays empty
  });

  it('no anchors at all -> sections returned unchanged (fail-soft, no regression)', () => {
    const sections = [{ sectionKey: 'REQ-001' }];
    const out = hydrateSectionAnswers(sections, '<p>no markers anywhere here</p>', ['REQ-001']);
    expect(out).toEqual(sections);
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
