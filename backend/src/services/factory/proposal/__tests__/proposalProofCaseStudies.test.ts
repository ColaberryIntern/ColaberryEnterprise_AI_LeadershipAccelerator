/**
 * proposalProofCaseStudies — the drafter's proof loader. serviceEvidenceLoad is mocked; these prove the loader is
 * active-service scoped, dedupes case-study ids across links, maps metric verification, drops archived/missing
 * records, sorts newest-first, and caps the count. No real client name is ever carried (the shape has no such field).
 */
const loadTenantServices = jest.fn();
const loadLinksInto = jest.fn();
const loadCaseStudyFacts = jest.fn();
const loadHeadlineMetrics = jest.fn();

jest.mock('../../serviceEvidenceLoad', () => ({
  loadTenantServices: (...a: any[]) => loadTenantServices(...a),
  loadLinksInto: (...a: any[]) => loadLinksInto(...a),
  loadCaseStudyFacts: (...a: any[]) => loadCaseStudyFacts(...a),
  loadHeadlineMetrics: (...a: any[]) => loadHeadlineMetrics(...a),
}));

import { loadProofCaseStudies } from '../proposalProofCaseStudies';

beforeEach(() => jest.clearAllMocks());

describe('loadProofCaseStudies', () => {
  it('returns [] when the tenant has no active services (never reads links)', async () => {
    loadTenantServices.mockResolvedValue([]);
    expect(await loadProofCaseStudies('t1')).toEqual([]);
    expect(loadLinksInto).not.toHaveBeenCalled();
  });

  it('asks for ACTIVE services and CONFIRMED links only', async () => {
    loadTenantServices.mockResolvedValue([{ id: 's1' }]);
    loadLinksInto.mockResolvedValue([]);
    await loadProofCaseStudies('t1');
    expect(loadTenantServices).toHaveBeenCalledWith('t1', 'active');
    expect(loadLinksInto).toHaveBeenCalledWith(['s1'], ['confirmed']);
  });

  it('dedupes ids, maps metric verification, and drops archived/missing case studies', async () => {
    loadTenantServices.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    loadLinksInto.mockResolvedValue([
      { caseStudyId: 'c1', serviceId: 's1', state: 'confirmed' },
      { caseStudyId: 'c1', serviceId: 's2', state: 'confirmed' }, // duplicate id across two services
      { caseStudyId: 'c2', serviceId: 's1', state: 'confirmed' }, // c2 will be archived/absent from facts
    ]);
    loadCaseStudyFacts.mockResolvedValue(new Map([
      ['c1', { id: 'c1', title: 'Asset Rebuild', industry: 'Municipal', year: 2024, primaryCapability: 'Modernization' }],
    ]));
    loadHeadlineMetrics.mockResolvedValue(new Map([
      ['c1', { label: 'Cycle time', value: '-40%', verified: true }],
    ]));
    const out = await loadProofCaseStudies('t1');
    expect(out).toEqual([
      { title: 'Asset Rebuild', industry: 'Municipal', year: 2024, capability: 'Modernization', metricLabel: 'Cycle time', metricValue: '-40%', metricVerified: true },
    ]);
  });

  it('sorts newest-first and caps the result', async () => {
    loadTenantServices.mockResolvedValue([{ id: 's1' }]);
    loadLinksInto.mockResolvedValue([
      { caseStudyId: 'old', serviceId: 's1', state: 'confirmed' },
      { caseStudyId: 'new', serviceId: 's1', state: 'confirmed' },
    ]);
    loadCaseStudyFacts.mockResolvedValue(new Map([
      ['old', { id: 'old', title: 'Old', industry: null, year: 2019, primaryCapability: null }],
      ['new', { id: 'new', title: 'New', industry: null, year: 2025, primaryCapability: null }],
    ]));
    loadHeadlineMetrics.mockResolvedValue(new Map());
    const out = await loadProofCaseStudies('t1', 1);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('New');
    expect(out[0].metricLabel).toBeNull();
    expect(out[0].metricVerified).toBe(false);
  });
});
