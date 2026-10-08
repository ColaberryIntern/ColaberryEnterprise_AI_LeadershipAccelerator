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
beforeEach(() => {
  (factoryApi.matchServicesToOpportunity as jest.Mock).mockResolvedValue({ matches: [], catalogSize: 0 });
  // The decoupled workspace fetches the discovery detail by uuid; default to "not in the feed" so unrelated tests don't throw.
  (factoryApi.getGovOpportunityDetail as jest.Mock).mockResolvedValue({ opportunity: null, source: 'snapshot', snapshotDate: null });
});
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
    await clickButton('Extract & attest');
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
    coverage: { sufficient: false, reasons: ['no_requirements_established'] },
    zipAttestation: null,
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
    expect(text).toContain('Upload the solicitation ZIP'); // capture UI renders despite source:null
    expect(text).not.toContain('labeled sample');                             // OP-only banner is absent
    expect(text).not.toContain('Server-fetched by canonical id');             // Source-facts card hidden on decoupled
    const openBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Open qualification')) as HTMLButtonElement;
    expect(openBtn).toBeTruthy();
    expect(openBtn.disabled).toBe(false);                                      // enabled even though sourceAvailable:false
  });

  it('Phase 3 journey strip: renders the pipeline and marks the current stage (Requirements, on an empty record)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 1, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established: [] } },
    }));
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Where this is in the journey');
    expect(text).toContain('Discovered');
    expect(text).toContain('Requirements established');
    expect(text).toContain('Build authorized');
    const current = container.querySelector('[aria-current="step"]');
    expect(current?.textContent ?? '').toContain('Requirements established'); // first not-done stage is current
  });

  it('Phase 3 relationship panel: lists prior pursuits for the same agency with their decision', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established: [{ id: 'RQ1', text: 'x', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement' }] } },
      evaluation: { evals: [{ id: 'RQ1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }], blocking: [], deliveryObligations: [], byDueStage: { submission: [{ id: 'RQ1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }], award: [], delivery: [], unknown: [] }, canApproveBid: true },
      relationship: { agency: 'City of Fort Worth', priorCount: 1, pursuits: [{ canonicalOpportunityId: 'gws:prior-1', title: 'Prior 311 System RFP', agency: 'City of Fort Worth', decision: 'no_bid', date: '2026-02-01T00:00:00.000Z' }] },
    }));
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Have we pursued this agency before?');
    expect(text).toContain('Prior 311 System RFP');
    expect(text).toContain('no bid'); // decision badge (underscores replaced)
  });

  it('Phase 3 relationship panel: honest empty-state when there is no prior work with the agency', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      relationship: { agency: 'City of Fort Worth', priorCount: 0, pursuits: [] },
    }));
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    expect(container.textContent ?? '').toContain('No prior pursuits recorded for');
  });

  it('Next-step banner: 0 established requirements -> tells the reviewer to capture the requirements', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs());
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    expect(container.textContent ?? '').toContain('Next: capture the requirements');
  });

  it('decoupled (gws) workspace with established requirements: "what they want" lists them, requirements-by-due-stage renders, Approve is deferred (not an OP-source block)', async () => {
    const established = [{ id: 'RQ1', text: 'Offeror shall be registered in SAM.', applicability: 'always' as const, dueStage: 'submission' as const, bindingStatus: 'binding_solicitation_requirement' }];
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established } },
      evaluation: { evals: [{ id: 'RQ1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }], blocking: [], deliveryObligations: [], byDueStage: { submission: [{ id: 'RQ1', dueStage: 'submission', applicability: 'always', blocking: false, reason: null }], award: [], delivery: [], unknown: [] }, canApproveBid: true },
      coverage: { sufficient: false, reasons: ['no_zip_attested'] }, // established, but the ZIP isn't attested yet
    }));
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Offeror shall be registered in SAM.'); // "what they want" lists the established requirement (not the empty-state)
    expect(text).toContain('Requirements by due stage');           // renders from evaluation on the decoupled path
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit')) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(text).toContain('solicitation ZIP has not been attested yet'); // honest coverage reason, not an OP-source block
  });

  it('Requirements by due stage caps a long list to a few and expands on "Show all"', async () => {
    const mk = (n: number) => ({ id: `REQ-${String(n).padStart(3, '0')}`, dueStage: 'submission' as const, applicability: 'always' as const, blocking: true, reason: 'submission_prerequisite_no_evidence' });
    const evals = Array.from({ length: 8 }, (_, i) => mk(i + 1));
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      evaluation: { evals, blocking: evals, deliveryObligations: [], byDueStage: { submission: evals, award: [], delivery: [], unknown: [] }, canApproveBid: false },
    }));
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    let text = container.textContent ?? '';
    expect(text).toContain('REQ-006');                 // first 6 shown
    expect(text).not.toContain('REQ-008');             // 7th/8th hidden behind the toggle
    expect(text).toContain('Show all 8 (2 more)');
    const moreBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Show all 8')) as HTMLButtonElement;
    expect(moreBtn).toBeTruthy();
    await act(async () => { moreBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    text = container.textContent ?? '';
    expect(text).toContain('REQ-008');                 // now visible after expand
    expect(text).toContain('Show fewer');
  });

  it('Bid decision panel: renders a scored recommendation + band once requirements are established (decoupled)', async () => {
    const evalRow = { id: 'E1', dueStage: 'submission', applicability: 'always', blocking: true, reason: 'submission_prerequisite_no_evidence' };
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established: [{ id: 'E1', text: 'Offeror must be registered in SAM.gov.', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement' }] } },
      evaluation: { evals: [evalRow], blocking: [evalRow], pursuitBlocking: [], openSubmissionRequirements: [evalRow], deliveryObligations: [], byDueStage: { submission: [evalRow], award: [], delivery: [], unknown: [] }, canApproveBid: false, canApprovePursuit: true },
    }));
    (factoryApi.getGovOpportunityDetail as jest.Mock).mockResolvedValue({ opportunity: { uuid: '11111111-1111-4111-a111-111111111111', title: 'IVR', agency: 'FW', closeDate: '2099-12-31', fitScore: null, priorityScore: null, estimatedValue: 500000, valueBasis: null, sourceUrl: null, preliminarySummary: null }, source: 'live', snapshotDate: null });
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Bid decision — should we pursue this?');
    expect(text).toMatch(/Strong fit|Worth pursuing|Caution|Lean no-bid/);  // a band rendered
    expect(text).toContain('/100');                                          // the score
  });

  // ── Discovery details card + Source link + Gaps panel (decoupled only) ──
  it('decoupled workspace shows the Discovery details card (why-surfaced + overview + Source link)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs());
    (factoryApi.getGovOpportunityDetail as jest.Mock).mockResolvedValue({ opportunity: { uuid: '11111111-1111-4111-a111-111111111111', title: 'IVR', agency: 'Fort Worth', closeDate: '2026-10-22', fitScore: 75, priorityScore: 81, estimatedValue: 500000, valueBasis: null, sourceUrl: 'https://bonfire.example/op', preliminarySummary: 'AI IVR solution for Fort Worth.' }, source: 'live', snapshotDate: null });
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Discovery details');
    expect(text).toContain('$500K');                                // est value (fmtValue)
    expect(text).toContain('AI IVR solution for Fort Worth.');      // project overview
    const srcLink = Array.from(container.querySelectorAll('a')).find((a) => a.getAttribute('href') === 'https://bonfire.example/op');
    expect(srcLink).toBeTruthy();                                   // the Source link to Bonfire
  });

  it('decoupled workspace: a not-found detail shows the honest "no longer in the live discovery feed" note', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs());
    (factoryApi.getGovOpportunityDetail as jest.Mock).mockResolvedValue({ opportunity: null, source: 'snapshot', snapshotDate: null });
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    expect(container.textContent ?? '').toContain('no longer in the live discovery feed');
  });

  it('Deadline card: a live days countdown + the close date + the honest date-only caveat (decoupled)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs());
    (factoryApi.getGovOpportunityDetail as jest.Mock).mockResolvedValue({ opportunity: { uuid: '11111111-1111-4111-a111-111111111111', title: 'IVR', agency: 'Fort Worth', closeDate: '2099-12-31', fitScore: null, priorityScore: null, estimatedValue: null, valueBasis: null, sourceUrl: null, preliminarySummary: null }, source: 'live', snapshotDate: null });
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Submission deadline');
    expect(text).toContain('days left');            // a far-future date is always a positive countdown
    expect(text).toContain('Dec 31, 2099');         // the absolute close date (UTC, en-US)
    expect(text).toContain('the daily Bonfire sync'); // the honest date-only caveat
  });

  it('Deadline card: honest empty state when no close date is captured (decoupled)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs());
    (factoryApi.getGovOpportunityDetail as jest.Mock).mockResolvedValue({ opportunity: { uuid: '11111111-1111-4111-a111-111111111111', title: 'IVR', agency: 'Fort Worth', closeDate: null, fitScore: null, priorityScore: null, estimatedValue: null, valueBasis: null, sourceUrl: null, preliminarySummary: null }, source: 'live', snapshotDate: null });
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    expect(container.textContent ?? '').toContain('No submission deadline captured yet');
  });

  it('Gaps panel: advisory banner + a flagged eligibility gap (SAM registration, no evidence, no matching capability)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established: [{ id: 'E1', text: 'Offeror must be registered in SAM.gov.', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement' }] } },
      evaluation: { evals: [], blocking: [], deliveryObligations: [], byDueStage: { submission: [], award: [], delivery: [], unknown: [] }, canApproveBid: true },
    }));
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Gaps / potential disqualifiers');
    expect(text).toContain('Advisory only');                       // the unmissable advisory banner
    expect(text).toContain('registered in SAM.gov');               // the flagged eligibility requirement
    expect(text).toContain('no evidence attached');                // the honest basis
  });

  it('Gaps panel: honest no_requirements empty state when nothing is established', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs()); // qualification null -> established []
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    expect(container.textContent ?? '').toContain('No requirements established yet — establish the cited requirements above to surface potential disqualifiers');
  });

  it('canonical workspace renders NEITHER new card (Discovery details / Gaps panel are decoupled-only)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    await renderAt(`?canonical=${CANON}`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).not.toContain('Discovery details');
    expect(text).not.toContain('Gaps / potential disqualifiers');
    expect(factoryApi.getGovOpportunityDetail).not.toHaveBeenCalled(); // canonical path never fetches the discovery detail
  });

  // ── Step 4: attest the ZIP + enable pursuit approval on the decoupled path ──
  it('decoupled: the "Evidence of record" card shows guidance (no second upload) when not attested — only ONE file input on the page', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established: [] } },
      zipAttestation: null,
    }));
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    expect(container.textContent ?? '').toContain('Evidence of record (attested ZIP)');
    expect(container.textContent ?? '').toContain('recorded automatically when you'); // points to Extract & attest above
    expect(container.querySelectorAll('input[type=file]').length).toBe(1);             // ONE upload now, not two
  });

  it('decoupled: one "Extract & attest" upload runs BOTH extraction and attestation', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established: [] } },
      zipAttestation: null,
    }));
    (factoryApi.extractGovQualificationRequirements as jest.Mock).mockResolvedValue({ fileCount: 1, candidates: [{ id: 'RQ1', text: 'SAM registration required.' }] });
    (factoryApi.attestSolicitationZip as jest.Mock).mockResolvedValue({ qualification: { id: 'q1' } });
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    const extractInput = container.querySelector('input[type=file]') as HTMLInputElement; // the extract card's input is first
    const file = new File(['zip'], 'sol.zip', { type: 'application/zip' });
    Object.defineProperty(extractInput, 'files', { value: [file], configurable: true });
    await act(async () => { extractInput.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    await clickButton('Extract & attest');
    await flush();
    expect(factoryApi.extractGovQualificationRequirements).toHaveBeenCalled();  // extracted the candidates
    expect(factoryApi.attestSolicitationZip).toHaveBeenCalled();                // AND attested the same ZIP
    expect((factoryApi.attestSolicitationZip as jest.Mock).mock.calls[0][1].mode).toBe('add');
    expect(container.textContent ?? '').toContain('SAM registration required.'); // candidates shown
  });

  it('decoupled: when the server says canApprove (requirements + attested ZIP), Approve is ENABLED and calls approveGovQualification', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established: [{ id: 'RQ1', text: 'x', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'D1' } }] } },
      evaluation: { evals: [], blocking: [], deliveryObligations: [], byDueStage: { submission: [], award: [], delivery: [], unknown: [] }, canApproveBid: true },
      coverage: { sufficient: true, reasons: [] },
      zipAttestation: { sha256: 'f'.repeat(64), filename: 'sol.zip', reviewedBy: 'rev', reviewedAt: 't' },
      canApprove: true,
    }));
    (factoryApi.approveGovQualification as jest.Mock).mockResolvedValue({ qualification: { id: 'q2' } });
    await renderAt(`?gws=${encodeURIComponent(GWS)}`);
    await flush();
    expect(container.textContent ?? '').toContain('Attested'); // the attested badge replaces the upload
    const approve = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve bid pursuit')) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    await clickButton('Approve bid pursuit');
    const call = (factoryApi.approveGovQualification as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(GWS);
    expect(call[1].decision).toBe('approved_bid_pursuit');
  });

  // ── P2-T4: the 7-tab shared workspace shell ──
  const navTabs = () => Array.from(container.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
  const tabByLabel = (label: string) => navTabs().find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

  it('7-tab shell: renders all seven workspace tabs with Overview active by default', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    await renderAt(`?canonical=${CANON}`);
    await flush();
    const labels = navTabs().map((b) => (b.textContent ?? '').trim());
    for (const t of ['Overview', 'Proposal', 'Build', 'Documents', 'Dates & Messages', 'Complete Your Submission', 'Outcome & Case Study']) {
      expect(labels.some((l) => l.includes(t))).toBe(true);
    }
    expect(tabByLabel('Overview').getAttribute('aria-selected')).toBe('true');
    expect(tabByLabel('Proposal').getAttribute('aria-selected')).toBe('false');
  });

  it('7-tab shell: the active tab is restored from the URL (?tab=) so a reload keeps your place', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    await renderAt(`?canonical=${CANON}&tab=build`);
    await flush();
    expect(tabByLabel('Build').getAttribute('aria-selected')).toBe('true');
    expect(tabByLabel('Overview').getAttribute('aria-selected')).toBe('false');
  });

  it('7-tab shell: clicking a tab activates it', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs());
    await renderAt(`?canonical=${CANON}`);
    await flush();
    await act(async () => { tabByLabel('Documents').dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(tabByLabel('Documents').getAttribute('aria-selected')).toBe('true');
    expect(tabByLabel('Overview').getAttribute('aria-selected')).toBe('false');
  });

  it('Proposal tab: renders the response checklist from responseSlots, each citing its requirement source', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({
      responseSlots: [
        { requirementId: 'R1', statement: 'Offeror shall register in SAM.', sourceRef: 'SOLICITATION', status: 'unanswered' },
      ],
    }));
    await renderAt(`?canonical=${CANON}&tab=proposal`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Response checklist');
    expect(text).toContain('Offeror shall register in SAM.');
    expect(text).toContain('cites SOLICITATION');   // the citation anchor is shown
    expect(text).toContain('unanswered');            // honest status, never a fabricated "done"
  });

  it('Dates tab dossier: shows a system-tagged NIGP code and flags a stated time with no zone as "verify tz"', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(decoupledWs({
      qualification: { id: 'q1', bidding_entity: 'colaberry', decision: 'needs_evidence', version: 2, rationale: null, source_snapshot_version: null, reviewer_identity_id: 'rev', requirements_json: { established: [] } },
      dossier: {
        contacts: [], naics: ['541512'],
        codes: [{ system: 'nigp', code: '920-05', sourceDocument: 'rfp.pdf' }, { system: 'naics', code: '541512', sourceDocument: 'rfp.pdf' }],
        meetings: [],
        keyDates: [{ text: 'Proposals are due.', date: '03/15/2026', time: '2:00 PM', timezone: null, sourceDocument: 'rfp.pdf' }],
      },
    }));
    await renderAt(`?gws=${encodeURIComponent(GWS)}&tab=dates`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('nigp');          // the system tag (lowercased in the badge, uppercased via CSS)
    expect(text).toContain('920-05');        // the normalised NIGP code
    expect(text).toContain('2:00 PM');       // the captured time
    expect(text).toContain('verify tz');     // a stated time with no zone is flagged, never assumed local
  });

  // ── P3-T1: the Build tab renders the release/story/prompt plan ──
  it('Build tab: renders the release + story (cited, unassigned) and reveals the prompt on demand', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({
      build: {
        buildStoryCount: 1,
        releases: [{ key: 'r0', name: 'Release 0 — initial build', storyIds: ['STORY-B1'] }],
        stories: [{
          id: 'STORY-B1', requirementId: 'B1', title: 'Claims search database', release: 'r0', status: 'unassigned',
          statement: 'The vendor shall provide a claims search database.',
          acceptance: ['The solution demonstrably satisfies: The vendor shall provide a claims search database.'],
          prompt: '# STORY-B1\nThe vendor shall provide a claims search database.\ntraced back to B1',
        }],
      },
    }));
    await renderAt(`?canonical=${CANON}&tab=build`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('STORY-B1');
    expect(text).toContain('from B1');                                   // traced to its requirement
    expect(text).toContain('The vendor shall provide a claims search database.');
    expect(text).toContain('unassigned');                               // honest status
    expect(text).not.toContain('traced back to B1');                    // the prompt body is hidden until revealed
    const promptBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('student build prompt')) as HTMLButtonElement;
    expect(promptBtn).toBeTruthy();
    await act(async () => { promptBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(container.textContent ?? '').toContain('traced back to B1'); // prompt revealed on click
  });

  it('Build tab: honest empty state when the requirements are all administrative (no build stories)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({
      build: { buildStoryCount: 0, releases: [], stories: [] },
    }));
    await renderAt(`?canonical=${CANON}&tab=build`);
    await flush();
    expect(container.textContent ?? '').toContain('No build stories');
  });

  // ── P3-T2: assign a story to a builder; show the assignee; surface preserved orphans ──
  it('Build tab: assigns an unassigned story to a builder, shows the assignee for an assigned one, and surfaces preserved orphans', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(cleanWs({
      build: {
        buildStoryCount: 2,
        deliveryProjectId: 'dp-1',
        assignableBuilders: [{ identityId: 'bld-1', email: 'builder@colaberry.com', roles: ['associate_builder'] }],
        releases: [{ key: 'r0', name: 'Release 0 — initial build', storyIds: ['STORY-B1', 'STORY-B2'] }],
        stories: [
          { id: 'STORY-B1', requirementId: 'B1', title: 'Claims search', release: 'r0', status: 'unassigned', statement: 'A claims search database.', acceptance: [], prompt: 'p1' },
          { id: 'STORY-B2', requirementId: 'B2', title: 'Reporting', release: 'r0', status: 'assigned', assigneeIdentityId: 'bld-1', assignedAt: null, statement: 'A reporting dashboard.', acceptance: [], prompt: 'p2' },
        ],
        orphanedStories: [
          { id: 'STORY-GONE', requirementId: 'GONE', title: 'orphan', release: 'orphaned', status: 'assigned', assigneeIdentityId: 'bld-1', orphaned: true, statement: '', acceptance: [], prompt: 'p3' },
        ],
      },
    }));
    (factoryApi.assignGovBuildStory as jest.Mock).mockResolvedValue({ id: 'as-1', storyId: 'STORY-B1', requirementId: 'B1', title: 'Claims search', statement: '', release: 'r0', acceptance: [], status: 'assigned', assigneeIdentityId: 'bld-1' });
    await renderAt(`?canonical=${CANON}&tab=build`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Assigned to builder@colaberry.com');          // the assigned story shows its assignee (B2)
    expect(text).toContain('Needs attention');                            // the preserved-orphan section header (P3-T4)
    expect(text).toContain('STORY-GONE');                                 // the orphan is surfaced, not dropped
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Unassign')).toBe(true);
    // Pick the builder in B1's assign control and click Assign → calls the API with the story + builder.
    const select = container.querySelector('select[aria-label="Assign STORY-B1 to a builder"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const setVal = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => { setVal.call(select, 'bld-1'); select.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    const assignBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Assign') as HTMLButtonElement;
    await act(async () => { assignBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(factoryApi.assignGovBuildStory).toHaveBeenCalledWith(CANON, 'STORY-B1', 'bld-1');
  });

  // ── P4: proposal response authoring + the amendment inbox ──
  const withProject = (over: Partial<GovQualificationWorkspace> = {}): GovQualificationWorkspace => cleanWs({
    build: { buildStoryCount: 0, releases: [], stories: [], deliveryProjectId: 'dp-1', assignableBuilders: [] },
    ...over,
  });

  it('Proposal tab authoring: a draft response shows the editor + Save + Mark reviewed; Save calls the API with the content', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(withProject({
      responseSlots: [{ requirementId: 'R1', statement: 'Offeror shall register in SAM.', sourceRef: 'D1', status: 'draft', content: 'We are SAM-registered.' }],
    }));
    (factoryApi.saveGovProposalResponse as jest.Mock).mockResolvedValue({ requirementId: 'R1', statement: '', sourceRef: null, status: 'draft', content: 'We are SAM-registered.' });
    await renderAt(`?canonical=${CANON}&tab=proposal`);
    await flush();
    const ta = container.querySelector('textarea[aria-label="Response to R1"]') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.value).toBe('We are SAM-registered.');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Mark reviewed')).toBe(true); // the legal next step for a draft
    await clickButton('Save draft');
    expect(factoryApi.saveGovProposalResponse).toHaveBeenCalledWith(CANON, 'R1', 'We are SAM-registered.');
  });

  it('Proposal tab authoring: a reviewed response offers Approve, and clicking it advances via the API', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(withProject({
      responseSlots: [{ requirementId: 'R1', statement: 'x', sourceRef: null, status: 'reviewed', content: 'done' }],
    }));
    (factoryApi.reviewGovProposalResponse as jest.Mock).mockResolvedValue({ requirementId: 'R1', statement: '', sourceRef: null, status: 'approved', content: 'done' });
    await renderAt(`?canonical=${CANON}&tab=proposal`);
    await flush();
    // Exact match: "Approve bid pursuit" (Overview tab, CSS-hidden but in the DOM) also contains "Approve".
    const approveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Approve') as HTMLButtonElement;
    expect(approveBtn).toBeTruthy();
    await act(async () => { approveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(factoryApi.reviewGovProposalResponse).toHaveBeenCalledWith(CANON, 'R1', 'approved');
  });

  it('Dates tab inbox: lists a recorded amendment with its reopened-count + provenance, and records a new entry', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(withProject({
      responseSlots: [{ requirementId: 'R1', statement: 'x', sourceRef: null, status: 'approved', content: 'done' }],
      amendments: [{ id: 'am-1', amendmentKey: 'Addendum 2', kind: 'amendment', summary: 'Scope expanded to include hosting.', affects: ['R1'], provenance: 'portal/add-2', observedAt: null, invalidatedCount: 2, createdAt: null }],
    }));
    (factoryApi.recordGovProposalAmendment as jest.Mock).mockResolvedValue({ id: 'am-2', amendmentKey: 'Q-1', kind: 'message', summary: 's', affects: [], provenance: null, observedAt: null, invalidatedCount: 0, createdAt: null });
    await renderAt(`?canonical=${CANON}&tab=dates`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Scope expanded to include hosting.');
    expect(text).toContain('reopened 2 responses');   // the invalidation effect is surfaced
    expect(text).toContain('portal/add-2');            // provenance shown
    // Record a new entry.
    const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    const keyInput = container.querySelector('input[aria-label="Entry key"]') as HTMLInputElement;
    const taSummary = container.querySelector('textarea[aria-label="Entry summary"]') as HTMLTextAreaElement;
    const setTa = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { setVal.call(keyInput, 'Addendum 3'); keyInput.dispatchEvent(new Event('input', { bubbles: true })); setTa.call(taSummary, 'Deadline moved.'); taSummary.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); });
    await clickButton('Record entry');
    expect(factoryApi.recordGovProposalAmendment).toHaveBeenCalledWith(CANON, expect.objectContaining({ amendmentKey: 'Addendum 3', summary: 'Deadline moved.' }));
  });

  // ── P5: submission package + outcome ──
  const sub = (over: any = {}): any => ({
    status: 'preparing', outcome: 'pending', exportManifest: null, exportedAt: null, externalRef: null,
    externallySubmittedAt: null, acknowledgedRef: null, acknowledgedAt: null, outcomeNote: null,
    outcomeRecordedAt: null, caseStudyCandidate: null, serviceCapabilityCandidate: null, ...over,
  });

  it('Submission tab: when ready, Export is enabled and clicking it calls the API', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(withProject({
      responseSlots: [{ requirementId: 'R1', statement: 'x', sourceRef: null, status: 'approved', content: 'c' }],
      submission: sub(), submissionReadiness: { ready: true, blocking: [] },
    }));
    (factoryApi.exportGovSubmission as jest.Mock).mockResolvedValue(sub({ status: 'exported' }));
    await renderAt(`?canonical=${CANON}&tab=submission`);
    await flush();
    const exportBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Export package')) as HTMLButtonElement;
    expect(exportBtn).toBeTruthy();
    expect(exportBtn.disabled).toBe(false);
    await act(async () => { exportBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(factoryApi.exportGovSubmission).toHaveBeenCalledWith(CANON);
  });

  it('Submission tab: when NOT ready, Export is disabled and the blocking reasons are shown', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(withProject({
      responseSlots: [{ requirementId: 'R1', statement: 'x', sourceRef: null, status: 'draft', content: 'c' }],
      submission: sub(), submissionReadiness: { ready: false, blocking: ['responses_not_approved:R1', 'coverage_insufficient'] },
    }));
    await renderAt(`?canonical=${CANON}&tab=submission`);
    await flush();
    const exportBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Export package')) as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
    const text = container.textContent ?? '';
    expect(text).toContain('Some responses are not yet approved');
    expect(text).toContain('coverage is not sufficient');
  });

  it('Submission tab: once exported, a receipt can be recorded (exported ≠ submitted)', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(withProject({
      responseSlots: [{ requirementId: 'R1', statement: 'x', sourceRef: null, status: 'approved', content: 'c' }],
      submission: sub({ status: 'exported', exportedAt: '2026-10-08T00:00:00Z' }), submissionReadiness: { ready: true, blocking: [] },
    }));
    (factoryApi.recordGovSubmissionReceipt as jest.Mock).mockResolvedValue(sub({ status: 'externally_submitted', externalRef: 'CONF-9' }));
    await renderAt(`?canonical=${CANON}&tab=submission`);
    await flush();
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes('Download package'))).toBe(true);
    const refInput = container.querySelector('input[aria-label="External submission ref"]') as HTMLInputElement;
    const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setVal.call(refInput, 'CONF-9'); refInput.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); });
    await clickButton('Record submission');
    expect(factoryApi.recordGovSubmissionReceipt).toHaveBeenCalledWith(CANON, 'CONF-9');
  });

  it('Outcome tab: records won and shows the PRIVATE case-study + service-capability candidates', async () => {
    (factoryApi.getGovQualificationWorkspace as jest.Mock).mockResolvedValue(withProject({
      submission: sub({ outcome: 'won', caseStudyCandidate: { title: 'TxDOT — won', summary: 'A private draft.', status: 'candidate', published: false }, serviceCapabilityCandidate: { name: 'Capability from: TxDOT', rationale: 'Suggested from a won pursuit.', state: 'suggested' } }),
    }));
    (factoryApi.recordGovOutcome as jest.Mock).mockResolvedValue(sub({ outcome: 'won' }));
    await renderAt(`?canonical=${CANON}&tab=outcome`);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Case-study candidate');
    expect(text).toContain('private — not published');       // the agent never publishes
    expect(text).toContain('Service-capability candidate');
    await clickButton('Record outcome');
    expect(factoryApi.recordGovOutcome).toHaveBeenCalledWith(CANON, 'won', null);
  });
});
