/**
 * govRelationship is ADVISORY and DETERMINISTIC: it finds prior pursuits of the SAME agency (normalized exact
 * match), excludes the current opportunity, dedupes by opportunity keeping the newest, caps + orders newest-first,
 * and reads the agency from decoupled provenance OR the OP snapshot. Empty agency / no overlap -> []. It writes
 * nothing and gates nothing. getAgencyRelationship skips the DB entirely when the agency is empty.
 */
const findAll = jest.fn();
jest.mock('../../../models/GovQualification', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => findAll(...a) },
}));

import { normalizeAgency, matchPriorPursuits, rowFromQualification, getAgencyRelationship, type PriorPursuitRow } from '../govRelationship';

beforeEach(() => jest.clearAllMocks());

const row = (o: Partial<PriorPursuitRow> = {}): PriorPursuitRow => ({
  canonicalOpportunityId: 'gws:a', title: 'T', agency: 'Harris County', decision: 'no_bid', date: '2026-01-01T00:00:00.000Z', ...o,
});

describe('normalizeAgency', () => {
  it('lowercases, strips punctuation, and collapses whitespace so variants match', () => {
    expect(normalizeAgency('Harris County')).toBe('harris county');
    expect(normalizeAgency('  HARRIS   county.  ')).toBe(normalizeAgency('Harris County'));
    expect(normalizeAgency('City of Detroit')).toBe(normalizeAgency('city-of-detroit'));
  });
  it('is empty for null/blank', () => {
    expect(normalizeAgency(null)).toBe('');
    expect(normalizeAgency('   ')).toBe('');
  });
});

describe('matchPriorPursuits (PURE)', () => {
  it('returns rows whose agency matches (normalized), excluding the current opportunity', () => {
    const rows = [
      row({ canonicalOpportunityId: 'gws:self' }),
      row({ canonicalOpportunityId: 'gws:prior1', agency: 'harris county' }),
      row({ canonicalOpportunityId: 'gws:other', agency: 'City of Dallas' }),
    ];
    const out = matchPriorPursuits('Harris County', rows, 'gws:self');
    expect(out.map((p) => p.canonicalOpportunityId)).toEqual(['gws:prior1']); // self + non-matching agency dropped
  });

  it('dedupes by opportunity id, keeping the newest-dated row, newest first', () => {
    const rows = [
      row({ canonicalOpportunityId: 'gws:x', date: '2026-01-01T00:00:00.000Z', decision: 'needs_evidence' }),
      row({ canonicalOpportunityId: 'gws:x', date: '2026-03-01T00:00:00.000Z', decision: 'no_bid' }),
      row({ canonicalOpportunityId: 'gws:y', date: '2026-02-01T00:00:00.000Z' }),
    ];
    const out = matchPriorPursuits('Harris County', rows, 'gws:self');
    expect(out.map((p) => p.canonicalOpportunityId)).toEqual(['gws:x', 'gws:y']); // x (Mar) before y (Feb)
    expect(out[0].decision).toBe('no_bid'); // kept the newer row's decision
  });

  it('empty agency -> [] (never a blanket match)', () => {
    expect(matchPriorPursuits('', [row()], 'gws:self')).toEqual([]);
    expect(matchPriorPursuits(null, [row()], 'gws:self')).toEqual([]);
  });

  it('no overlap -> []', () => {
    expect(matchPriorPursuits('City of Austin', [row({ agency: 'Harris County' })], 'gws:self')).toEqual([]);
  });

  it('caps at 10 prior pursuits', () => {
    const rows = Array.from({ length: 25 }, (_, i) => row({ canonicalOpportunityId: `gws:${i}`, date: `2026-01-${String((i % 27) + 1).padStart(2, '0')}T00:00:00.000Z` }));
    expect(matchPriorPursuits('Harris County', rows, 'gws:self')).toHaveLength(10);
  });

  it('is total on garbage input', () => {
    expect(matchPriorPursuits('Harris County', null as any, 'gws:self')).toEqual([]);
    expect(matchPriorPursuits('Harris County', [null as any, { } as any], 'gws:self')).toEqual([]);
  });
});

describe('rowFromQualification', () => {
  it('reads agency/title from decoupled provenance', () => {
    const r = rowFromQualification({ canonical_opportunity_id: 'gws:a', decision: 'no_bid', created_at: '2026-05-01T00:00:00.000Z', requirements_json: { provenance: { title: 'SLCC RFP', agency: 'U3P Utah' } } });
    expect(r).toMatchObject({ canonicalOpportunityId: 'gws:a', title: 'SLCC RFP', agency: 'U3P Utah', decision: 'no_bid', date: '2026-05-01T00:00:00.000Z' });
  });
  it('falls back to the OP source snapshot when there is no provenance', () => {
    const r = rowFromQualification({ canonical_opportunity_id: 'canon:1', decision: 'approved_bid_pursuit', source_snapshot: { title: 'DOL RFP', agency: 'US DOL' }, requirements_json: {} });
    expect(r).toMatchObject({ title: 'DOL RFP', agency: 'US DOL', decision: 'approved_bid_pursuit' });
  });
  it('defaults decision to pending_review and date to null when absent; unwraps a Sequelize instance', () => {
    const r = rowFromQualification({ get: () => ({ canonical_opportunity_id: 'gws:b', requirements_json: {} }) });
    expect(r).toMatchObject({ canonicalOpportunityId: 'gws:b', agency: null, title: null, decision: 'pending_review', date: null });
  });
});

describe('getAgencyRelationship', () => {
  it('skips the DB and returns empty when the agency is blank', async () => {
    const out = await getAgencyRelationship('t', 'gws:self', '  ');
    expect(out).toEqual({ agency: '  ', priorCount: 0, pursuits: [] });
    expect(findAll).not.toHaveBeenCalled();
  });

  it('loads active tenant records and returns matched prior pursuits (excluding self)', async () => {
    findAll.mockResolvedValue([
      { get: () => ({ canonical_opportunity_id: 'gws:self', decision: 'pending_review', requirements_json: { provenance: { agency: 'Harris County', title: 'This one' } }, created_at: '2026-06-01T00:00:00.000Z' }) },
      { get: () => ({ canonical_opportunity_id: 'gws:prior', decision: 'no_bid', requirements_json: { provenance: { agency: 'Harris County', title: 'Prior RFP' } }, created_at: '2026-04-01T00:00:00.000Z' }) },
      { get: () => ({ canonical_opportunity_id: 'gws:dallas', decision: 'no_bid', requirements_json: { provenance: { agency: 'City of Dallas', title: 'Other' } }, created_at: '2026-04-01T00:00:00.000Z' }) },
    ]);
    const out = await getAgencyRelationship('t', 'gws:self', 'Harris County');
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 't', status: 'active' }) }));
    expect(out.priorCount).toBe(1);
    expect(out.pursuits[0]).toMatchObject({ canonicalOpportunityId: 'gws:prior', title: 'Prior RFP', decision: 'no_bid' });
  });
});
