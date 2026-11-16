/**
 * proposalProofBacking — the proof judge's backing is the SAME dossier proof the drafter grounds on. The company
 * library loaders, the case-study loader and GovQualification are mocked; these prove collectProofBacking resolves
 * the tenant from the delivery project's latest qualification, flattens facts + references + personnel + case studies
 * into backing lines, is best-effort per source (one failing loader never drops the others), and returns [] (never
 * throws) when there is no tenant or the lookup fails — so scoring degrades to the old no-backing behavior, never
 * crashes.
 */
const findOne = jest.fn();
const approvedGroundingFacts = jest.fn();
const approvedReferences = jest.fn();
const approvedPersonnel = jest.fn();
const loadProofCaseStudies = jest.fn();

jest.mock('../../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => findOne(...a) } }));
jest.mock('../govCompanyLibrary', () => ({
  approvedGroundingFacts: (...a: any[]) => approvedGroundingFacts(...a),
  approvedReferences: (...a: any[]) => approvedReferences(...a),
  approvedPersonnel: (...a: any[]) => approvedPersonnel(...a),
}));
jest.mock('../proposalProofCaseStudies', () => ({ loadProofCaseStudies: (...a: any[]) => loadProofCaseStudies(...a) }));

import { collectProofBacking } from '../proposalProofBacking';

beforeEach(() => {
  jest.clearAllMocks();
  approvedGroundingFacts.mockResolvedValue([]);
  approvedReferences.mockResolvedValue([]);
  approvedPersonnel.mockResolvedValue([]);
  loadProofCaseStudies.mockResolvedValue([]);
});

describe('collectProofBacking', () => {
  it('returns [] and reads no proof when the project has no qualification tenant', async () => {
    findOne.mockResolvedValue(null);
    expect(await collectProofBacking('p1')).toEqual([]);
    expect(approvedGroundingFacts).not.toHaveBeenCalled();
    expect(loadProofCaseStudies).not.toHaveBeenCalled();
  });

  it('resolves the tenant from the latest qualification and loads proof scoped to it', async () => {
    findOne.mockResolvedValue({ tenant_id: 't-9' });
    approvedGroundingFacts.mockResolvedValue(['SAM UEI: ABC123']);
    await collectProofBacking('p1');
    expect(findOne).toHaveBeenCalledWith({ where: { delivery_project_id: 'p1' }, order: [['version', 'DESC']] });
    expect(approvedGroundingFacts).toHaveBeenCalledWith('t-9');
    expect(approvedReferences).toHaveBeenCalledWith('t-9');
    expect(approvedPersonnel).toHaveBeenCalledWith('t-9');
    expect(loadProofCaseStudies).toHaveBeenCalledWith('t-9');
  });

  it('flattens facts, references, case studies and personnel into backing lines', async () => {
    findOne.mockResolvedValue({ tenant_id: 't-9' });
    approvedGroundingFacts.mockResolvedValue(['SAM UEI: ABC123']);
    approvedReferences.mockResolvedValue([{ client: 'City of Plano', scope: 'Permitting portal', contractValue: '$1.2M', dates: '2023-2025', contact: null }]);
    approvedPersonnel.mockResolvedValue([{ name: 'Ada Lovelace', role: 'Lead', summary: null }]);
    loadProofCaseStudies.mockResolvedValue([{ title: 'Asset Rebuild', industry: 'Municipal', year: 2024, capability: 'Modernization', metricLabel: 'Cycle time', metricValue: '-40%', metricVerified: true }]);
    const out = await collectProofBacking('p1');
    expect(out).toContain('SAM UEI: ABC123');
    expect(out.some((l) => l.startsWith('Past-performance reference: City of Plano'))).toBe(true);
    expect(out.some((l) => l.includes('Case study (anonymized): Asset Rebuild') && l.includes('(verified)'))).toBe(true);
    expect(out).toContain('Key personnel: Ada Lovelace, Lead');
  });

  it('is best-effort per source: one failing loader never drops the proof the others loaded', async () => {
    findOne.mockResolvedValue({ tenant_id: 't-9' });
    approvedGroundingFacts.mockResolvedValue(['SAM UEI: ABC123']);
    approvedReferences.mockRejectedValue(new Error('db down'));
    loadProofCaseStudies.mockRejectedValue(new Error('evidence down'));
    const out = await collectProofBacking('p1');
    expect(out).toEqual(['SAM UEI: ABC123']);
  });

  it('never throws: a qualification lookup failure degrades to no backing', async () => {
    findOne.mockRejectedValue(new Error('boom'));
    expect(await collectProofBacking('p1')).toEqual([]);
  });
});
