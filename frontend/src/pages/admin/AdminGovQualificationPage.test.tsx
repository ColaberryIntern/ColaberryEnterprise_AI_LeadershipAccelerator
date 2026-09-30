import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminGovQualificationPage from './AdminGovQualificationPage';
import * as factoryApi from '../../services/factoryApi';
import type { GovQualificationWorkspace } from '../../services/factoryApi';

// No @testing-library: render via react-dom/client + act, read container. useSearchParams stays REAL so the
// ?canonical= query drives the page from MemoryRouter; useNavigate is stubbed.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));
jest.mock('../../services/factoryApi');

const CANON = 'op:gov:0000000000000000000000000000aaaa';

const cleanWs = (over: Partial<GovQualificationWorkspace> = {}): GovQualificationWorkspace => ({
  canonicalOpportunityId: CANON,
  sourceLive: false,
  sourceState: 'available',
  sourceStateLabel: 'available',
  sourceAvailable: true,
  sourceSnapshotVersion: 3,
  snapshotRecorded: true,
  source: {
    canonicalOpportunityId: CANON, sourceSnapshotVersion: 3, isFixture: true,
    notice: { noticeType: { value: 'solicitation', isBindingSolicitation: true }, procurementType: { value: 'custom_development' }, contractVehicle: null },
    publisher: { leadBuyer: { name: 'City of Dallas', jurisdiction: 'US-TX' }, officialSourceUrl: null },
    deadline: { originalText: 'Oct 23 2026', utc: null, utcConfidence: 'high', conflicts: [] },
    value: { published: null, modelEstimate: null },
    documents: { coverage: 'complete', counts: { listed: 1, downloaded: 1, parsed: 1, inaccessible: 0 }, items: [{ docId: 'D1', filename: 's.pdf', role: 'solicitation', retrieval: { status: 'downloaded' } }] },
    requirements: [{ id: 'R1', text: 'SAM', category: 'registration', applicability: 'always', responsibleParty: 'bidder', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'D1' } }],
    sourceAssessment: { legacyVerdict: null },
    legacy: { fitScore: 80, priorityScore: 79, pursuitStatus: 'none' },
  },
  evaluation: { evals: [{ id: 'R1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }], blocking: [], deliveryObligations: [], byDueStage: { submission: [{ id: 'R1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }], award: [], delivery: [], unknown: [] }, canApproveBid: true },
  coverage: { sufficient: true, reasons: [] },
  qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'pending_review', version: 1, rationale: null, source_snapshot_version: 3, reviewer_identity_id: 'rev-1', requirements_json: { established: [] } },
  changedSource: false,
  canApprove: true,
  ...over,
});

let container: HTMLDivElement; let root: Root;
async function renderAt(query: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={[`/admin/gov-qualification${query}`]}><AdminGovQualificationPage /></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
}
const clickButton = async (label: string) => {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
  await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
  return btn;
};
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

describe('AdminGovQualificationPage — journey', () => {
  it('no canonical + v2 unavailable → surfaces the canonical-mapping GAP, no start, no title-derived id', async () => {
    (factoryApi.getGovOpportunityCandidates as jest.Mock).mockResolvedValue({ available: false, reason: 'not_configured', candidates: [], sourceLive: false });
    await renderAt('');
    expect(container.textContent ?? '').toContain('trusted canonical mapping is not available');
    expect(factoryApi.getGovQualificationWorkspace as jest.Mock).not.toHaveBeenCalled();
  });

  it('no canonical + v2 available → lists candidates carrying canonical ids', async () => {
    (factoryApi.getGovOpportunityCandidates as jest.Mock).mockResolvedValue({ available: true, candidates: [{ canonicalOpportunityId: CANON, title: 'Digital Evidence', agency: 'City', noticeType: 'solicitation' }], sourceLive: true });
    await renderAt('');
    expect(container.textContent ?? '').toContain('Digital Evidence');
  });

  it('clean workspace → source facts render and Approve is enabled', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    await renderAt(`?canonical=${CANON}`);
    expect(container.textContent ?? '').toContain('City of Dallas');
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit')) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
  });

  it('422 coverage/blocking → Approve disabled and the reason is shown', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({
      canApprove: false,
      coverage: { sufficient: false, reasons: ['no_requirements_established'] },
      evaluation: { evals: [], blocking: [], deliveryObligations: [], byDueStage: { submission: [], award: [], delivery: [], unknown: [] }, canApproveBid: true },
    }));
    await renderAt(`?canonical=${CANON}`);
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit')) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(container.textContent ?? '').toContain('No applicable requirements have been established');
  });

  it('changed source → review-changes prompt and Approve disabled', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({ changedSource: true, canApprove: false }));
    await renderAt(`?canonical=${CANON}`);
    expect(container.textContent ?? '').toContain('source changed since');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes('Review changes'))).toBe(true);
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit')) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
  });

  it('source unavailable → surfaces it and does not offer a usable approval', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({ sourceState: 'unavailable', sourceStateLabel: 'source unavailable', sourceAvailable: false, source: null, evaluation: null, coverage: null, canApprove: false }));
    await renderAt(`?canonical=${CANON}`);
    expect(container.textContent ?? '').toContain('Source evidence is unavailable');
    // The record still exists, so the Approve control renders — but it must be DISABLED (no usable approval).
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit')) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
  });

  it('a separate build-authorization control is present (distinct from pursuit approval)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    await renderAt(`?canonical=${CANON}`);
    const text = container.textContent ?? '';
    expect(text).toContain('Authorize a build (separate)');
    expect(text).toContain('does not run any build');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes('Authorize build'))).toBe(true);
  });

  it('maps a 422 approve error to a recoverable reason banner', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    (factoryApi.approveGovQualification as jest.Mock).mockRejectedValue({ response: { status: 422, data: { error: 'blocked', reasons: ['R1:applicability_unknown'] } } });
    await renderAt(`?canonical=${CANON}`);
    await clickButton('Approve bid pursuit');
    expect(container.textContent ?? '').toContain('Blocked (422)');
  });

  it('duplicate clicks do not fire two creates (in-flight guard)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({ qualification: null }));
    let resolve: (v: any) => void = () => {};
    (factoryApi.createGovQualification as jest.Mock).mockReturnValue(new Promise((r) => { resolve = r; }));
    await renderAt(`?canonical=${CANON}`);
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Open qualification')) as HTMLButtonElement;
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); // same tick, before the first resolves
      await Promise.resolve();
    });
    expect((factoryApi.createGovQualification as jest.Mock).mock.calls.length).toBe(1);
    await act(async () => { resolve({ qualification: { id: 'q1' } }); await Promise.resolve(); });
  });
});
