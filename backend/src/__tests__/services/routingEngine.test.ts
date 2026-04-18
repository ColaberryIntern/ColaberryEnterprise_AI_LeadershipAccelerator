import { evaluateConditions } from '../../services/routingEngineService';

const facts = {
  source_slug: 'trustbeforeintelligence',
  entry_slug: 'get_book_modal',
  raw_payload_id: 'abc',
  lead: { id: 1, lead_score: 75, lead_temperature: 'warm' },
  normalized: {
    email: 'x@y.com',
    company_size: '100-500',
    metadata: { company_size: 250, industry: 'Finance' },
  },
};

describe('evaluateConditions', () => {
  it('returns true for empty conditions', () => {
    expect(evaluateConditions({}, facts)).toBe(true);
    expect(evaluateConditions(null, facts)).toBe(true);
  });

  it('matches equality on the resolved path', () => {
    expect(evaluateConditions({ source_slug: 'trustbeforeintelligence' }, facts)).toBe(true);
    expect(evaluateConditions({ source_slug: 'other' }, facts)).toBe(false);
  });

  it('supports dotted paths into lead and normalized', () => {
    expect(evaluateConditions({ 'lead.lead_temperature': 'warm' }, facts)).toBe(true);
    expect(evaluateConditions({ 'normalized.email': 'x@y.com' }, facts)).toBe(true);
  });

  it('supports entry_point_slug alias for entry_slug', () => {
    expect(evaluateConditions({ entry_point_slug: 'get_book_modal' }, facts)).toBe(true);
    expect(evaluateConditions({ entry_point_slug: 'other' }, facts)).toBe(false);
  });

  it('supports _in membership', () => {
    expect(evaluateConditions({ entry_slug_in: ['get_book_modal', 'demo'] }, facts)).toBe(true);
    expect(evaluateConditions({ entry_slug_in: ['demo'] }, facts)).toBe(false);
  });

  it('supports numeric comparisons on nested paths', () => {
    expect(evaluateConditions({ 'normalized.metadata.company_size_gte': 100 }, facts)).toBe(true);
    expect(evaluateConditions({ 'normalized.metadata.company_size_gte': 500 }, facts)).toBe(false);
    expect(evaluateConditions({ 'lead.lead_score_gt': 70 }, facts)).toBe(true);
    expect(evaluateConditions({ 'lead.lead_score_lt': 70 }, facts)).toBe(false);
  });

  it('supports _contains (case-insensitive substring)', () => {
    expect(evaluateConditions({ 'normalized.metadata.industry_contains': 'finance' }, facts)).toBe(true);
    expect(evaluateConditions({ 'normalized.metadata.industry_contains': 'health' }, facts)).toBe(false);
  });

  it('supports _regex', () => {
    expect(evaluateConditions({ 'normalized.metadata.industry_regex': '^Fin' }, facts)).toBe(true);
    expect(evaluateConditions({ 'normalized.metadata.industry_regex': 'z$' }, facts)).toBe(false);
  });

  it('supports _ne (not equal)', () => {
    expect(evaluateConditions({ source_slug_ne: 'advisor' }, facts)).toBe(true);
    expect(evaluateConditions({ source_slug_ne: 'trustbeforeintelligence' }, facts)).toBe(false);
  });

  it('ANDs multiple conditions', () => {
    expect(evaluateConditions({
      source_slug: 'trustbeforeintelligence',
      entry_point_slug: 'get_book_modal',
      'lead.lead_score_gte': 50,
    }, facts)).toBe(true);

    expect(evaluateConditions({
      source_slug: 'trustbeforeintelligence',
      entry_point_slug: 'get_book_modal',
      'lead.lead_score_gte': 999,
    }, facts)).toBe(false);
  });

  it('returns false when a referenced path is missing', () => {
    expect(evaluateConditions({ 'normalized.metadata.missing_eq': 'x' }, facts)).toBe(false);
  });
});
