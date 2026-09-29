import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminGovQualificationPage from './AdminGovQualificationPage';
import * as factoryApi from '../../services/factoryApi';
import type { GovQualificationWorkspace } from '../../services/factoryApi';

// No @testing-library in this repo: render via react-dom/client + act and read container.textContent.
// useSearchParams stays REAL (requireActual) so the ?canonical= query drives the page from MemoryRouter.
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom') }));
jest.mock('../../services/factoryApi');

const CANON = 'op:gov:0000000000000000000000000000aaaa';

const cleanWs: GovQualificationWorkspace = {
  canonicalOpportunityId: CANON,
  sourceLive: false,
  sourceAvailable: true,
  source: {
    canonicalOpportunityId: CANON, sourceSnapshotVersion: 3, isFixture: true,
    notice: { noticeType: { value: 'solicitation', isBindingSolicitation: true }, procurementType: { value: 'custom_development' }, contractVehicle: null },
    publisher: { leadBuyer: { name: 'City of Dallas', jurisdiction: 'US-TX' }, officialSourceUrl: null },
    deadline: { originalText: 'Oct 23 2026 1:00 PM CDT', utc: '2026-10-23T18:00:00.000Z', utcConfidence: 'high', conflicts: [] },
    value: { published: { amountMinorUnits: 100000000, currency: 'USD', valueType: 'ceiling' }, modelEstimate: null },
    documents: { coverage: 'complete', counts: { listed: 4, downloaded: 4, parsed: 4, inaccessible: 0 } },
    requirements: [{ id: 'R1', text: 'SAM.gov', category: 'registration', applicability: 'always', responsibleParty: 'bidder', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'D1' } }],
    sourceAssessment: { legacyVerdict: null },
    legacy: { fitScore: 80, priorityScore: 79, pursuitStatus: 'none' },
  },
  evaluation: {
    evals: [{ id: 'R1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }],
    blocking: [], deliveryObligations: [],
    byDueStage: { submission: [{ id: 'R1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }], award: [], delivery: [], unknown: [] },
    canApproveBid: true,
  },
  qualification: null,
  changedSource: false,
  canApprove: true,
};

const blockingWs: GovQualificationWorkspace = {
  ...cleanWs,
  evaluation: {
    evals: [{ id: 'R1', dueStage: 'submission', applicability: 'unknown', blocking: true, reason: 'applicability_unknown' }],
    blocking: [{ id: 'R1', dueStage: 'submission', applicability: 'unknown', blocking: true, reason: 'applicability_unknown' }],
    deliveryObligations: [],
    byDueStage: { submission: [{ id: 'R1', dueStage: 'submission', applicability: 'unknown', blocking: true, reason: 'applicability_unknown' }], award: [], delivery: [], unknown: [] },
    canApproveBid: false,
  },
  canApprove: false,
};

let container: HTMLDivElement;
let root: Root;

async function renderAt(query: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={[`/admin/gov-qualification${query}`]}><AdminGovQualificationPage /></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

describe('AdminGovQualificationPage', () => {
  it('shows an empty state (no API call) when no opportunity is selected', async () => {
    await renderAt('');
    expect(container.textContent ?? '').toContain('No opportunity selected');
    expect(factoryApi.getGovQualificationWorkspace as jest.Mock).not.toHaveBeenCalled();
  });

  it('renders server source facts, labels the sample source, and enables approve when clear', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs);
    await renderAt(`?canonical=${CANON}`);
    const text = container.textContent ?? '';
    expect(text).toContain('City of Dallas');              // server-fetched source fact
    expect(text).toContain('labeled sample');              // sourceLive:false banner
    expect(text).toContain('advisory only');               // legacy scores framed as advisory
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit'));
    expect(approve).toBeTruthy();
    expect((approve as HTMLButtonElement).disabled).toBe(false);
  });

  it('DISABLES approve and shows the blocking reason when a requirement blocks', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(blockingWs);
    await renderAt(`?canonical=${CANON}`);
    const text = container.textContent ?? '';
    expect(text).toContain('Applicability unknown');        // the blocking reason is surfaced
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit'));
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(text).toContain('Blocked: unresolved requirements');
  });

  it('shows a renewed-review alert and disables approve when the source changed', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue({ ...cleanWs, changedSource: true, canApprove: false });
    await renderAt(`?canonical=${CANON}`);
    const text = container.textContent ?? '';
    expect(text).toContain('source changed since');
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit'));
    expect((approve as HTMLButtonElement).disabled).toBe(true);
  });

  it('passes the biddingEntity query through to the API', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs);
    await renderAt(`?canonical=${CANON}&biddingEntity=colaberry`);
    expect(factoryApi.getGovQualificationWorkspace as jest.Mock).toHaveBeenCalledWith(CANON, 'colaberry');
  });
});
