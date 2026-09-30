/**
 * The contract's job is to refuse a plausible lie.
 *
 * §16 says "do not merge assumptions into facts". These tests exist because that sentence
 * is only worth anything if something enforces it on the path where a model is producing
 * the data - which is every path here. A confident hallucination arrives looking exactly
 * like a fact; the only thing separating them is whether a human is on the record, and
 * that is what provenance encodes.
 */

import {
  parseUnderstanding,
  findIntegrityViolations,
  summarizeForWow,
  openQuestions,
  decisionsForCustomer,
  confidenceProfile,
  itemsFor,
  UnderstandingContractError,
  UNDERSTANDING_DIMENSIONS,
  type ProjectUnderstanding,
} from '../projectUnderstanding';

const item = (over: Partial<ProjectUnderstanding['items'][number]> = {}) => ({
  dimension: 'problem' as const,
  value: 'Invoices are re-keyed by hand every morning',
  classification: 'FACT' as const,
  provenance: 'voice_transcript' as const,
  source_quote: 'we re-key every invoice by hand every morning',
  ...over,
});

const understanding = (items: any[], over: Partial<ProjectUnderstanding> = {}): any => ({
  title: 'Property Operations AI',
  proposed_surfaces: ['Operations Command Center'],
  items,
  ...over,
});

describe('parseUnderstanding — shape', () => {
  it('accepts a well-formed understanding', () => {
    const u = parseUnderstanding(understanding([item()]));
    expect(u.title).toBe('Property Operations AI');
    expect(u.items).toHaveLength(1);
  });

  it('defaults proposed_surfaces rather than demanding it', () => {
    const u = parseUnderstanding({ title: 'Thing', items: [item()] });
    expect(u.proposed_surfaces).toEqual([]);
  });

  it('rejects an unknown dimension instead of dropping it', () => {
    expect(() => parseUnderstanding(understanding([item({ dimension: 'vibes' as any })]))).toThrow(
      UnderstandingContractError,
    );
  });

  it('rejects an empty title, which is what an empty model response looks like', () => {
    expect(() => parseUnderstanding(understanding([item()], { title: '   ' }))).toThrow(UnderstandingContractError);
  });

  it('names every violation rather than only the first', () => {
    try {
      parseUnderstanding(understanding([item({ dimension: 'nope' as any }), item({ classification: 'VIBE' as any })]));
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(UnderstandingContractError);
      expect(err.violations.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('the assumption/fact firewall', () => {
  it('refuses an ai_inferred item classified as FACT', () => {
    const violations = findIntegrityViolations(
      understanding([item({ provenance: 'ai_inferred', classification: 'FACT', source_quote: undefined })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('cannot support one');
  });

  it('allows the same item as an ASSUMPTION', () => {
    const violations = findIntegrityViolations(
      understanding([item({ provenance: 'ai_inferred', classification: 'ASSUMPTION', source_quote: undefined })]),
    );
    expect(violations).toEqual([]);
  });

  it.each(['assumptions', 'unknowns'] as const)('refuses a FACT filed under "%s"', (dimension) => {
    const violations = findIntegrityViolations(understanding([item({ dimension })]));
    expect(violations.some((v) => v.includes('cannot hold a FACT'))).toBe(true);
  });

  it('throws on the way in, so an invalid understanding never reaches a consumer', () => {
    expect(() =>
      parseUnderstanding(understanding([item({ provenance: 'ai_inferred', classification: 'FACT', source_quote: undefined })])),
    ).toThrow(/cannot support one/);
  });
});

describe('quotes make a sourced claim checkable', () => {
  it('requires a source_quote on a voice_transcript item', () => {
    const violations = findIntegrityViolations(understanding([item({ source_quote: undefined })]));
    expect(violations.some((v) => v.includes('requires a source_quote'))).toBe(true);
  });

  it('requires one on a source_document item too', () => {
    const violations = findIntegrityViolations(
      understanding([item({ provenance: 'source_document', source_quote: undefined })]),
    );
    expect(violations.some((v) => v.includes('requires a source_quote'))).toBe(true);
  });

  it('refuses an ai_inferred item that carries a quote — it is a misfiled sourced item', () => {
    const violations = findIntegrityViolations(
      understanding([item({ provenance: 'ai_inferred', classification: 'ASSUMPTION', source_quote: 'they said this' })]),
    );
    expect(violations.some((v) => v.includes('cannot carry a source_quote'))).toBe(true);
  });
});

describe('reading an understanding', () => {
  const populated = parseUnderstanding(
    understanding([
      item({ dimension: 'actors', value: 'Property manager' }),
      item({ dimension: 'actors', value: 'Tenant' }),
      item({ dimension: 'current_workflow', value: 'Maintenance request intake' }),
      item({ dimension: 'ai_opportunities', value: 'Triage inbound requests', classification: 'RECOMMENDATION' }),
      item({
        dimension: 'human_only_decisions',
        value: 'Approving spend over $500',
        classification: 'DECISION',
      }),
      item({
        dimension: 'integrations',
        value: 'Which accounting system holds the invoices?',
        classification: 'QUESTION',
      }),
    ]),
  );

  it('counts the wow screen from the dimensions the plan names', () => {
    expect(summarizeForWow(populated)).toEqual({
      title: 'Property Operations AI',
      primary_users: 2,
      core_workflows: 1,
      ai_opportunities: 1,
      human_decision_points: 1,
      proposed_surfaces: ['Operations Command Center'],
    });
  });

  it('separates what is still open from what belongs to the customer', () => {
    expect(openQuestions(populated).map((i) => i.value)).toEqual(['Which accounting system holds the invoices?']);
    expect(decisionsForCustomer(populated).map((i) => i.value)).toEqual(['Approving spend over $500']);
  });

  it('slices by dimension', () => {
    expect(itemsFor(populated, 'actors')).toHaveLength(2);
    expect(itemsFor(populated, 'data')).toEqual([]);
  });
});

describe('confidenceProfile — is this understanding, or a model talking to itself', () => {
  it('reports the fact ratio and what was never covered', () => {
    const u = parseUnderstanding(
      understanding([
        item(),
        item({ dimension: 'inputs', provenance: 'ai_inferred', classification: 'ASSUMPTION', source_quote: undefined }),
      ]),
    );

    const profile = confidenceProfile(u);
    expect(profile).toMatchObject({ total: 2, facts: 1, inferred: 1, fact_ratio: 0.5, dimensions_covered: 2 });
    expect(profile.dimensions_missing).toHaveLength(UNDERSTANDING_DIMENSIONS.length - 2);
    expect(profile.dimensions_missing).toContain('success_definition');
  });

  it('does not divide by zero on an empty understanding', () => {
    const profile = confidenceProfile(parseUnderstanding(understanding([])));
    expect(profile.fact_ratio).toBe(0);
    expect(profile.dimensions_missing).toHaveLength(UNDERSTANDING_DIMENSIONS.length);
  });
});
