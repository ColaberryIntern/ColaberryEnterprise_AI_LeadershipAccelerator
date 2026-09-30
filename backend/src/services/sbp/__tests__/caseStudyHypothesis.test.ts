import {
  CASE_STUDY_MATURITIES,
  HYPOTHESIS_MATURITY,
  buildCaseStudyHypothesis,
  hypothesisCoverage,
} from '../caseStudyHypothesis';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';

/**
 * A case-study hypothesis is what a story COULD say before anything has
 * happened. The tests that matter are the ones proving it cannot say more.
 */

const item = (over: Partial<UnderstandingItem> = {}): UnderstandingItem => ({
  dimension: 'problem',
  value: 'A tool that checks invoices against purchase orders.',
  classification: 'FACT',
  provenance: 'source_message',
  source_quote: 'A tool that checks invoices against purchase orders.',
  ...over,
});

const rich = [
  item({ dimension: 'actors', value: 'Two people in accounts payable.' }),
  item({ dimension: 'current_workflow', value: 'Invoices arrive by email and are checked by hand.' }),
  item({ dimension: 'pain_points', value: 'Mismatches get paid before anyone notices.' }),
  item({ dimension: 'desired_outcome', value: 'Nothing mismatched gets paid.' }),
  item({ dimension: 'outputs', value: 'A flagged invoice appears in a review queue.' }),
  item({ dimension: 'success_definition', value: 'Zero mismatched payments in a month.' }),
];

describe('what it refuses to claim', () => {
  it('is always a story_hypothesis, whatever it is given', () => {
    expect(buildCaseStudyHypothesis({ items: rich }).maturity).toBe('story_hypothesis');
    expect(buildCaseStudyHypothesis({ items: [] }).maturity).toBe('story_hypothesis');
    // The constant itself is the bottom rung and nothing above it.
    expect(CASE_STUDY_MATURITIES[0]).toBe(HYPOTHESIS_MATURITY);
  });

  it('has no field for achieved results, testimonials, usage or impact', () => {
    // Absent from the TYPE, not empty. A consumer cannot render a results block
    // over a placeholder and call it a case study.
    const h = buildCaseStudyHypothesis({ items: rich }) as unknown as Record<string, unknown>;
    for (const forbidden of ['achievedResults', 'results', 'testimonials', 'quotes', 'productionUsage', 'businessImpact', 'impact']) {
      expect(h).not.toHaveProperty(forbidden);
    }
  });

  it('never infers a publication preference', () => {
    // A preference to be named is a consent decision a person records on
    // purpose. Nothing said in an interview implies one.
    expect(buildCaseStudyHypothesis({ items: rich }).publicationPreference).toBe('undecided');
  });

  it('builds on nothing the system merely inferred', () => {
    const guessed = item({
      dimension: 'actors', value: 'Probably the finance team.',
      classification: 'ASSUMPTION', provenance: 'ai_inferred', source_quote: undefined,
    });
    expect(buildCaseStudyHypothesis({ items: [guessed] }).beneficiary).toBeNull();
  });

  it('opens its limitations by saying nothing has happened yet', () => {
    const h = buildCaseStudyHypothesis({ items: rich });
    expect(h.limitations[0]).toMatch(/Nothing here has been built, run, measured or used/);
  });
});

describe('what it says, only from what was said', () => {
  it('fills each field from the matching dimension, in the student\'s words', () => {
    const h = buildCaseStudyHypothesis({ items: rich, truthRevision: 3 });
    expect(h).toMatchObject({
      truthRevision: 3,
      beneficiary: 'Two people in accounts payable.',
      beforeState: 'Invoices arrive by email and are checked by hand.',
      stakes: 'Mismatches get paid before anyone notices.',
      intendedTransformation: 'Nothing mismatched gets paid.',
      demonstrationScenario: 'A flagged invoice appears in a review queue.',
      successDefinition: 'Zero mismatched payments in a month.',
    });
  });

  it('prefers a confirmed statement over a merely heard one', () => {
    const h = buildCaseStudyHypothesis({ items: [
      item({ dimension: 'actors', value: 'Priya.', provenance: 'source_message' }),
      item({ dimension: 'actors', value: 'Priyanka.', provenance: 'client_confirmed' }),
    ] });
    expect(h.beneficiary).toBe('Priyanka.');
  });

  it('takes planned capability from the plan, not from hopes in the interview', () => {
    const withPlan = buildCaseStudyHypothesis({
      items: rich, plan: { descriptor: 'An invoice reconciliation assistant.', requirements: [] },
    });
    expect(withPlan.plannedCapability).toBe('An invoice reconciliation assistant.');
    expect(buildCaseStudyHypothesis({ items: rich }).plannedCapability).toBeNull();
  });

  it('records a stated baseline as known, and none as none', () => {
    expect(buildCaseStudyHypothesis({ items: rich }).knownBaselines)
      .toEqual(['Zero mismatched payments in a month.']);
    expect(buildCaseStudyHypothesis({ items: [item()] }).knownBaselines).toEqual([]);
  });

  it('leaves a field null rather than filling it with something plausible', () => {
    const h = buildCaseStudyHypothesis({ items: [item()] });
    expect(h.beneficiary).toBeNull();
    expect(h.beforeState).toBeNull();
    expect(h.demonstrationScenario).toBeNull();
  });
});

describe('the gaps are visible, not hidden', () => {
  it('lists every unanswered angle in plain language', () => {
    const h = buildCaseStudyHypothesis({ items: [item()] });
    expect(h.unknowns).toContain('no baseline was stated, so nothing can be measured against it');
    expect(h.unknowns).toContain('who will actually use this is not recorded');
  });

  it('adds a limitation when success was never defined', () => {
    const h = buildCaseStudyHypothesis({ items: [item()] });
    expect(h.limitations).toContain(
      'No definition of success was given, so no outcome can be claimed later without one.',
    );
  });

  it('drops the success limitation once success is defined', () => {
    const h = buildCaseStudyHypothesis({ items: rich });
    expect(h.limitations.join(' ')).not.toContain('No definition of success was given');
  });

  it('is deterministic, so it can be recomputed from truth rather than stored', () => {
    // The whole reason it is a projection: recomputing gives the same answer,
    // so nothing has to be persisted where it could drift from the truth.
    expect(buildCaseStudyHypothesis({ items: rich, truthRevision: 2 }))
      .toEqual(buildCaseStudyHypothesis({ items: rich, truthRevision: 2 }));
  });
});

describe('coverage is advisory', () => {
  it('counts filled fields against the total a story needs', () => {
    expect(hypothesisCoverage(buildCaseStudyHypothesis({ items: [] }))).toEqual({ filled: 0, total: 7 });
    expect(hypothesisCoverage(buildCaseStudyHypothesis({
      items: rich, plan: { descriptor: 'x', requirements: [] },
    }))).toEqual({ filled: 7, total: 7 });
  });

  it('full coverage is still only a hypothesis', () => {
    const h = buildCaseStudyHypothesis({ items: rich, plan: { descriptor: 'x', requirements: [] } });
    expect(hypothesisCoverage(h).filled).toBe(7);
    expect(h.maturity).toBe('story_hypothesis');
  });
});
