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
// The workspace renders the advisory "what we offer" panel, which calls the matcher; default it to empty.
beforeEach(() => { (factoryApi.matchServicesToOpportunity as jest.Mock).mockResolvedValue({ matches: [], catalogSize: 0 }); });
const flush = async () => { await act(async () => { await Promise.resolve(); }); await act(async () => { await Promise.resolve(); }); };

describe('AdminGovQualificationPage — journey', () => {
  it('shows the advisory "what they want vs what we offer" panel with the "suggested — confirm" label and matches', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    (factoryApi.matchServicesToOpportunity as jest.Mock).mockResolvedValue({ matches: [
      { id: 'build', name: 'Enterprise AI Build & System Modernization', category: 'IT', score: 2, strength: 'moderate', reason: 'Matches on keywords: case management system', matchedKeywords: ['case management system'], categoryMatched: false, matchedNaics: [] },
    ], catalogSize: 10 });
    await renderAt(`?canonical=${CANON}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('What they want vs what we offer');
    expect(text).toContain('suggested — confirm');
    expect(text).toContain('Enterprise AI Build');
    expect(text).toContain('Matches on keywords: case management system');
    expect(factoryApi.matchServicesToOpportunity).toHaveBeenCalled();
  });

  it('the panel shows "no requirements established yet" when none are established (matches on preliminary signals)', async () => {
    const base = cleanWs();
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue({
      ...base,
      source: { ...base.source!, requirements: [] },
      qualification: { ...base.qualification!, requirements_json: { established: [] } },
    });
    await renderAt(`?canonical=${CANON}`);
    await flush();
    expect(container.textContent ?? '').toContain('No requirements established yet');
  });

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

  it('from a "Qualify" click where the proposal is NOT in the feed: names it and says so honestly (never implies a match)', async () => {
    (factoryApi.getGovOpportunityCandidates as jest.Mock).mockResolvedValue({ available: true, candidates: [{ canonicalOpportunityId: CANON, title: 'Digital Evidence', agency: 'City', noticeType: 'solicitation' }], sourceLive: true });
    await renderAt('?from=One%20(1)%20Wood%20Chipper&agency=PEI%20Dept%20of%20Finance');
    const text = container.textContent ?? '';
    expect(text).toContain("This proposal isn't in the qualification feed yet"); // honest title
    expect(text).toContain('One (1) Wood Chipper');                 // the clicked proposal is still named
    expect(text).toContain('flagged for the source team to add');   // honest explanation of the gap
    expect(text).not.toContain('Pick the matching solicitation');   // must NOT imply a match exists when it doesn't
    expect(text).toContain('Digital Evidence');                     // the feed list is still shown to try the workspace
    expect(factoryApi.getGovQualificationWorkspace as jest.Mock).not.toHaveBeenCalled();
  });

  it('from a "Qualify" click where the proposal IS in the feed: shows the match + one-click-coming framing', async () => {
    (factoryApi.getGovOpportunityCandidates as jest.Mock).mockResolvedValue({ available: true, candidates: [{ canonicalOpportunityId: CANON, title: 'RFP AI-based Interactive Voice Response Solution', agency: 'City of Fort Worth', noticeType: 'solicitation' }], sourceLive: true });
    await renderAt('?from=RFP%20AI-based%20Interactive%20Voice%20Response%20Solution&agency=City%20of%20Fort%20Worth');
    const text = container.textContent ?? '';
    expect(text).toContain('Pick the matching solicitation');       // the clicked proposal IS in the feed
    expect(text).toContain('one click straight');
    expect(text).not.toContain("isn't in the qualification feed yet");
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

  // ── Manual document review (Bonfire ZIP) ──
  const bonfireWs = (over: Partial<GovQualificationWorkspace> = {}): GovQualificationWorkspace => cleanWs({
    canApprove: false,
    coverage: { sufficient: false, reasons: ['authoritative_package_unreviewed'] },
    source: {
      ...cleanWs().source!,
      documents: { coverage: 'partial', counts: { listed: 2, downloaded: 0, parsed: 0, inaccessible: 2 }, items: [
        { docId: 'DS1', filename: 'solicitation.pdf', role: 'solicitation', retrieval: { status: 'listed_only' } },
        { docId: 'DA1', filename: 'amendment-1.pdf', role: 'amendment', retrieval: { status: 'failed' } },
      ] },
    },
    qualification: { ...cleanWs().qualification!, requirements_json: { established: [], reviewedDocuments: [] } },
    ...over,
  });

  it('manual doc review: lists the authoritative docs as "not reviewed" and offers upload', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(bonfireWs());
    await renderAt(`?canonical=${CANON}`);
    const text = container.textContent ?? '';
    expect(text).toContain('Manual document review');
    expect(text).toContain('solicitation.pdf');
    expect(text).toContain('not reviewed');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes('Upload ZIP'))).toBe(true);
  });

  it('manual doc review: uploading a ZIP attests the undownloaded authoritative docs (mode add + coveredDocIds)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(bonfireWs());
    (factoryApi.reviewGovQualificationDocuments as jest.Mock).mockResolvedValue({ qualification: { id: 'q1' } });
    await renderAt(`?canonical=${CANON}`);
    // The page now has two file inputs (extract card first, manual-review card last); target the manual-review one.
    const fileInput = (Array.from(container.querySelectorAll('input[type=file]')) as HTMLInputElement[]).pop() as HTMLInputElement;
    const file = new File(['zip-bytes'], 'pkg.zip', { type: 'application/zip' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    await clickButton('Upload ZIP');
    const call = (factoryApi.reviewGovQualificationDocuments as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(CANON);
    expect(call[1].mode).toBe('add');
    expect(call[1].coveredDocIds).toEqual(['DS1', 'DA1']);
    expect(call[1].file).toBeTruthy();
  });

  it('manual doc review: a reviewed doc shows "manual" + a Revoke control', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(bonfireWs({
      qualification: { ...cleanWs().qualification!, requirements_json: { established: [], reviewedDocuments: [{ docId: 'DS1', role: 'solicitation', method: 'manual_upload', filename: 'pkg.zip', sha256: 'x', reviewedBy: 'rev', reviewedAt: 't' }] } },
    }));
    await renderAt(`?canonical=${CANON}`);
    expect((container.textContent ?? '')).toContain('manual');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Revoke')).toBe(true);
  });

  // ── Extract requirements from the solicitation ZIP → confirm → establish ──
  const uploadExtractZip = async (name = 'solicitation.zip') => {
    const fileInput = container.querySelector('input[type=file]') as HTMLInputElement; // extract card's input is first
    const file = new File(['zip'], name, { type: 'application/zip' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    await clickButton('Extract requirements');
    await flush();
  };

  it('extract: uploading the solicitation ZIP lists requirements as CANDIDATES (suggested — confirm), establishing nothing yet', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    (factoryApi.extractGovQualificationRequirements as jest.Mock).mockResolvedValue({ fileCount: 2, candidates: [
      { id: 'RQ1', text: 'Offeror shall be registered in SAM.', sourceDocument: 'rfp.pdf', section: 'L.3', kind: 'eligibility' },
      { id: 'RQ2', text: 'Submit three past-performance references.', sourceDocument: 'rfp.pdf', section: 'M.2', kind: 'submission' },
    ] });
    await renderAt(`?canonical=${CANON}`);
    await flush();
    await uploadExtractZip();
    const text = container.textContent ?? '';
    expect(text).toContain('Offeror shall be registered in SAM.');
    expect(text).toContain('Submit three past-performance references.');
    expect(text).toContain('candidate requirement(s) detected');
    expect(text).toContain('suggested — confirm');
    // extraction is read-only: no establish/decision write fired
    expect(factoryApi.recordGovQualificationDecision).not.toHaveBeenCalled();
  });

  it('extract → Establish selected: confirms the CHECKED candidates into established requirements, merged with existing; unchecked are skipped', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 4, rationale: null, source_snapshot_version: 3, reviewer_identity_id: 'rev-1', requirements_json: { established: [{ id: 'EXIST', text: 'pre-existing', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement' }] } },
    }));
    (factoryApi.extractGovQualificationRequirements as jest.Mock).mockResolvedValue({ fileCount: 1, candidates: [
      { id: 'RQ1', text: 'Offeror shall be registered in SAM.', sourceDocument: 'rfp.pdf', section: 'L.3', kind: 'eligibility' },
      { id: 'RQ2', text: 'Submit past performance.', sourceDocument: 'rfp.pdf', section: 'M.2', kind: 'submission' },
    ] });
    (factoryApi.recordGovQualificationDecision as jest.Mock).mockResolvedValue({ qualification: { id: 'q1' } });
    await renderAt(`?canonical=${CANON}`);
    await flush();
    await uploadExtractZip();
    // Uncheck RQ2 (pre-click activation flips checkedness before React's onChange reads it).
    const rq2 = (Array.from(container.querySelectorAll('input[type=checkbox]')) as HTMLInputElement[]).find((c) => c.getAttribute('aria-label') === 'Confirm RQ2') as HTMLInputElement;
    await act(async () => { rq2.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await clickButton('Establish selected');
    await flush();
    expect((factoryApi.recordGovQualificationDecision as jest.Mock).mock.calls.length).toBe(1);
    const [canonArg, body] = (factoryApi.recordGovQualificationDecision as jest.Mock).mock.calls[0];
    expect(canonArg).toBe(CANON);
    expect(body.expectedVersion).toBe(4);
    const ids = body.establishedRequirements.map((r: any) => r.id);
    expect(ids).toContain('EXIST'); // merged with the already-established requirement
    expect(ids).toContain('RQ1');   // the checked candidate
    expect(ids).not.toContain('RQ2'); // unchecked candidate is not established
    const rq1 = body.establishedRequirements.find((r: any) => r.id === 'RQ1');
    expect(rq1.bindingStatus).toBe('binding_solicitation_requirement');
    expect(rq1.applicability).toBe('always');
    expect(rq1.dueStage).toBe('submission');
  });

  it('extract: an empty extraction shows the honest "establish manually" note and establishes nothing', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    (factoryApi.extractGovQualificationRequirements as jest.Mock).mockResolvedValue({ fileCount: 1, candidates: [] });
    await renderAt(`?canonical=${CANON}`);
    await flush();
    await uploadExtractZip('empty.zip');
    expect(container.textContent ?? '').toContain('No requirements detected');
    expect(factoryApi.recordGovQualificationDecision).not.toHaveBeenCalled();
  });

  it('extract without an opened qualification prompts to open it first (establishment stays a deliberate write)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({ qualification: null }));
    (factoryApi.extractGovQualificationRequirements as jest.Mock).mockResolvedValue({ fileCount: 1, candidates: [{ id: 'RQ1', text: 'SAM registration required.' }] });
    await renderAt(`?canonical=${CANON}`);
    await flush();
    await uploadExtractZip();
    expect(container.textContent ?? '').toContain('Open the qualification');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes('Establish selected'))).toBe(false);
  });

  // ── Decoupled (discovery-ZIP) workspace: source:null, keyed off a gws:<uuid> ──
  const GWS = 'gws:11111111-1111-4111-a111-111111111111';
  const decoupledWs = (over: Partial<GovQualificationWorkspace> = {}): GovQualificationWorkspace => ({
    canonicalOpportunityId: GWS,
    sourceLive: false,
    sourceState: 'zip_workspace',
    sourceStateLabel: 'ZIP workspace',
    sourceAvailable: false,
    sourceSnapshotVersion: null,
    snapshotRecorded: false,
    source: null,
    evaluation: { evals: [], blocking: [], deliveryObligations: [], byDueStage: { submission: [], award: [], delivery: [], unknown: [] }, canApproveBid: true },
    coverage: { sufficient: false, reasons: ['pursuit_approval_not_enabled_on_this_path'] },
    qualification: null,
    changedSource: false,
    canApprove: false,
    provenance: { title: 'RFP AI-based IVR Solution', agency: 'City of Fort Worth' },
    ...over,
  });

  it('decoupled (gws) workspace: capture UI renders on source:null — Extract card + Open-qualification enabled, no Source-facts, no "labeled sample" banner', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs());
    await renderAt(`?gws=${encodeURIComponent(GWS)}&from=${encodeURIComponent('RFP AI-based IVR Solution')}&agency=Fort%20Worth`);
    await flush();
    const text = container.textContent ?? '';
    expect(factoryApi.getGovQualificationWorkspace).toHaveBeenCalledWith(GWS, 'colaberry'); // keyed off the gws id
    expect(text).toContain('Extract requirements from the solicitation ZIP'); // capture UI renders despite source:null
    expect(text).not.toContain('labeled sample');                             // OP-only banner is absent
    expect(text).not.toContain('Server-fetched by canonical id');             // Source-facts card hidden on decoupled
    const openBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Open qualification')) as HTMLButtonElement;
    expect(openBtn).toBeTruthy();
    expect(openBtn.disabled).toBe(false);                                      // enabled even though sourceAvailable:false
  });

  it('decoupled (gws) workspace with established requirements: "what they want" lists them, requirements-by-due-stage renders, Approve is deferred (not an OP-source block)', async () => {
    const established = [{ id: 'RQ1', text: 'Offeror shall be registered in SAM.', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement' }];
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established } },
      evaluation: { evals: [{ id: 'RQ1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }], blocking: [], deliveryObligations: [], byDueStage: { submission: [{ id: 'RQ1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }], award: [], delivery: [], unknown: [] }, canApproveBid: true },
    }));
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Offeror shall be registered in SAM.'); // "what they want" lists the established requirement (not the empty-state)
    expect(text).toContain('Requirements by due stage');           // renders from evaluation on the decoupled path
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit')) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(text).toContain('Pursuit approval and evidence attestation come in a later step'); // honest deferred note, not an OP-source block
  });
});
