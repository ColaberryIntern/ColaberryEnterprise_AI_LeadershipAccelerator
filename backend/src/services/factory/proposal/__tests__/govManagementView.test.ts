/**
 * govManagementView (M5) - the live management view is COMPOSED from existing pieces and is honest: R2 is shown as
 * parked (read via isReleaseParked, M5 is its first reader), the potential-win shows a value ONLY when a human priced
 * the bid (else value-pending), and every tributary is fail-soft.
 */
const getGovBuildSummary = jest.fn();
jest.mock('../../govBuildSummary', () => ({ __esModule: true, getGovBuildSummary: (...a: any[]) => getGovBuildSummary(...a) }));
const findByPk = jest.fn();
jest.mock('../../../../models/Project', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => findByPk(...a) } }));
const getSubmission = jest.fn();
jest.mock('../../govSubmission', () => ({ __esModule: true, getSubmission: (...a: any[]) => getSubmission(...a) }));
const getGovDossier = jest.fn();
jest.mock('../govDossier', () => ({ __esModule: true, getGovDossier: (...a: any[]) => getGovDossier(...a) }));
const buildSharathCollectionForm = jest.fn();
jest.mock('../collectionForm', () => ({ __esModule: true, buildSharathCollectionForm: (...a: any[]) => buildSharathCollectionForm(...a) }));
const getLiveBidValues = jest.fn();
jest.mock('../../../revenueFlow/govBidValueService', () => ({ __esModule: true, getLiveBidValues: (...a: any[]) => getLiveBidValues(...a) }));

import { getGovManagementView } from '../govManagementView';

const subView = (over: any = {}) => ({
  status: 'exported', outcome: 'pending', exportManifest: null, exportedAt: '2026-02-01T00:00:00Z', externalRef: null,
  externallySubmittedAt: null, acknowledgedRef: null, acknowledgedAt: null, outcomeNote: null, outcomeRecordedAt: null,
  closeDate: null, caseStudyCandidate: null, serviceCapabilityCandidate: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  getGovBuildSummary.mockResolvedValue({
    studentProjectId: 'build-1',
    releases: [
      { key: 'r0', name: 'Foundation', status: 'complete', stories: [] },
      { key: 'r1', name: 'Proposal', status: 'in_progress', stories: [] },
      { key: 'r2', name: 'Full build-out', status: 'not_started', stories: [] },
    ],
    rollup: { total: 8, verified: 3, complete: 3, inProgress: 2, blocked: 0, notStarted: 3, pct: 38 },
  });
  findByPk.mockResolvedValue({ project_variables: { gov_parked_releases: ['r2'] } });
  getSubmission.mockResolvedValue(subView());
  getGovDossier.mockResolvedValue({ tenantId: 't-1', facts: ['a', 'b'], references: ['r'], personnel: [] });
  buildSharathCollectionForm.mockResolvedValue({ html: '', needs: [], needCount: 3 });
  getLiveBidValues.mockResolvedValue([]);
});

describe('getGovManagementView - parked R2', () => {
  it('marks R2 parked (via isReleaseParked) and leaves R0/R1 active', async () => {
    const v = await getGovManagementView('dp-1');
    const byKey = Object.fromEntries(v.releases.map((r) => [r.key, r.parked]));
    expect(byKey).toEqual({ r0: false, r1: false, r2: true });
    expect(v.studentProjectId).toBe('build-1');
  });
});

describe('getGovManagementView - honest potential-win', () => {
  it('a submitted UNPRICED bid shows its close date, value-pending (no amount fabricated)', async () => {
    getSubmission.mockResolvedValue(subView({ status: 'externally_submitted', externallySubmittedAt: '2026-02-02T00:00:00Z', closeDate: '2026-05-01' }));
    getLiveBidValues.mockResolvedValue([]); // nobody priced it
    const v = await getGovManagementView('dp-1');
    expect(v.potentialWin).toEqual({ submitted: true, closeDate: '2026-05-01', valueCents: null, priced: false });
  });

  it('a submitted PRICED bid shows the human-recorded amount AND the close date', async () => {
    getSubmission.mockResolvedValue(subView({ status: 'externally_submitted', externallySubmittedAt: '2026-02-02T00:00:00Z', closeDate: '2026-04-01' }));
    getLiveBidValues.mockResolvedValue([{ deliveryProjectId: 'dp-1', proposalValueCents: 7_500_000 }]);
    const v = await getGovManagementView('dp-1');
    expect(v.potentialWin).toEqual({ submitted: true, closeDate: '2026-04-01', valueCents: 7_500_000, priced: true });
  });

  it('a not-yet-submitted bid is not a potential-win', async () => {
    const v = await getGovManagementView('dp-1');
    expect(v.potentialWin.submitted).toBe(false);
    expect(v.potentialWin.closeDate).toBeNull();
  });
});

describe('getGovManagementView - composition + fail-soft', () => {
  it('summarizes the dossier, open-need count, and export readiness', async () => {
    const v = await getGovManagementView('dp-1');
    expect(v.dossier).toEqual({ tenantId: 't-1', factCount: 2, referenceCount: 1, personnelCount: 0 });
    expect(v.openNeedCount).toBe(3);
    expect(v.exportReady).toBe(true); // status 'exported' != 'preparing'
  });

  it('a failing dossier / form source leaves safe defaults, not a thrown view', async () => {
    getGovDossier.mockRejectedValue(new Error('dossier down'));
    buildSharathCollectionForm.mockRejectedValue(new Error('needs down'));
    const v = await getGovManagementView('dp-1');
    expect(v.dossier).toEqual({ tenantId: null, factCount: 0, referenceCount: 0, personnelCount: 0 });
    expect(v.openNeedCount).toBe(0);
    // releases + submission still resolve
    expect(v.releases).toHaveLength(3);
  });

  it('no linked build project -> empty releases, nothing parked, still returns', async () => {
    getGovBuildSummary.mockResolvedValue(null);
    const v = await getGovManagementView('dp-1');
    expect(v.releases).toEqual([]);
    expect(v.studentProjectId).toBeNull();
    expect(findByPk).not.toHaveBeenCalled();
  });
});
