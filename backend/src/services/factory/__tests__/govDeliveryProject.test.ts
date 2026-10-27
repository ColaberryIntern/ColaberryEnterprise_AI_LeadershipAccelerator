/**
 * Gov step 6 — the two-track delivery project created on approval. Pure helpers are tested directly; the DB
 * orchestration is tested with the models + container + transaction MOCKED (so it runs in CI, which has no
 * database). Asserts: one project per opportunity (idempotent), both tracks, requirements mapped honestly
 * (evidence_state unassessed, never a build authorization), the qualification linked, and fail-closed on no container.
 */
const txRun = jest.fn(async (fn: any) => fn({}));
jest.mock('../../../config/database', () => ({ sequelize: { transaction: (fn: any) => txRun(fn) } }));

const lookupGovContractsContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: (...a: any[]) => lookupGovContractsContainer(...a) }));

const dpFindOne = jest.fn();
const dpCreate = jest.fn();
jest.mock('../../../models/DeliveryProject', () => ({ __esModule: true, default: { findOne: (...a: any[]) => dpFindOne(...a), create: (...a: any[]) => dpCreate(...a) } }));
const ctFindOrCreate = jest.fn();
const ctUpdate = jest.fn();
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { findOrCreate: (...a: any[]) => ctFindOrCreate(...a), update: (...a: any[]) => ctUpdate(...a) } }));
const crFindOne = jest.fn();
const crCreate = jest.fn();
const crUpdate = jest.fn();
jest.mock('../../../models/ContractRequirement', () => ({ __esModule: true, default: {
  findOne: (...a: any[]) => crFindOne(...a), create: (...a: any[]) => crCreate(...a), update: (...a: any[]) => crUpdate(...a),
} }));
const gqUpdate = jest.fn();
jest.mock('../../../models/GovQualification', () => ({ __esModule: true, default: { update: (...a: any[]) => gqUpdate(...a) } }));
// linkGovBuildToStudentProject dynamically imports these; stub the models (no sequelize.define in CI) and the bridge.
jest.mock('../../../models/Project', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/DeliveryProjectSourceLink', () => ({ __esModule: true, default: {} }));
const linkStudentProject = jest.fn();
jest.mock('../../delivery/projectSourceLink', () => ({ linkStudentProject: (...a: any[]) => linkStudentProject(...a) }));
// PR 3a: grantApproverReviewer resolves the approver + writes a reviewer membership via these (dynamic imports).
const dpmFindOne = jest.fn();
const dpmCreate = jest.fn();
jest.mock('../../../models/DeliveryProjectMember', () => ({ __esModule: true, default: { findOne: (...a: any[]) => dpmFindOne(...a), create: (...a: any[]) => dpmCreate(...a) } }));
const piFindOne = jest.fn();
jest.mock('../../../models/PlatformIdentity', () => ({ __esModule: true, default: { findOne: (...a: any[]) => piFindOne(...a) } }));
jest.mock('../../../modules/identity/platformIdentityService', () => ({ normalizeEmail: (e: string) => (e || '').trim().toLowerCase() }));

import { ensureGovTwoTrackProject, grantApproverReviewer, govProjectSlug, toContractRequirementRow, classifyRequirementTracks, selectsSolutionBuild, linkGovBuildToStudentProject, GovContainerUnavailableError } from '../govDeliveryProject';

const GWS = 'gws:04ac1711-c3f6-418a-9d9b-c5e6211295ec';

describe('grantApproverReviewer (best-effort, non-destructive)', () => {
  const UUID = '22222222-2222-4222-8222-222222222222';
  beforeEach(() => {
    jest.clearAllMocks();
    dpmFindOne.mockResolvedValue(null);
    dpmCreate.mockResolvedValue({});
    piFindOne.mockResolvedValue({ id: 'pid-1' });
  });
  it('resolves the approver from their email and grants qa_reviewer', async () => {
    await grantApproverReviewer('dp-1', 'Ali@Colaberry.com');
    expect(piFindOne).toHaveBeenCalledWith({ where: { primary_email: 'ali@colaberry.com' } });
    expect(dpmCreate).toHaveBeenCalledTimes(1);
    expect(dpmCreate.mock.calls[0][0]).toMatchObject({ delivery_project_id: 'dp-1', platform_identity_id: 'pid-1', delivery_role: 'qa_reviewer' });
  });
  it('accepts a uuid approver directly, with no identity lookup', async () => {
    await grantApproverReviewer('dp-1', UUID);
    expect(piFindOne).not.toHaveBeenCalled();
    expect(dpmCreate.mock.calls[0][0]).toMatchObject({ platform_identity_id: UUID, delivery_role: 'qa_reviewer' });
  });
  it('never alters an existing membership (no silent promote or demote)', async () => {
    dpmFindOne.mockResolvedValue({ id: 'm-1', delivery_role: 'associate_builder' });
    await grantApproverReviewer('dp-1', UUID);
    expect(dpmCreate).not.toHaveBeenCalled();
  });
  it('is a no-op when there is no approver, and when the email does not resolve', async () => {
    await grantApproverReviewer('dp-1', null);
    piFindOne.mockResolvedValue(null);
    await grantApproverReviewer('dp-1', 'ghost@nowhere.com');
    expect(dpmCreate).not.toHaveBeenCalled();
  });
  it('never throws when the membership write fails (best-effort)', async () => {
    dpmCreate.mockRejectedValue(new Error('db down'));
    await expect(grantApproverReviewer('dp-1', UUID)).resolves.toBeUndefined();
  });
});

describe('govProjectSlug (pure, deterministic)', () => {
  it('maps a gws key to gov-<uuid> (lowercased)', () => {
    expect(govProjectSlug('gws:04AC1711-c3f6-418a-9d9b-c5e6211295ec')).toBe('gov-04ac1711-c3f6-418a-9d9b-c5e6211295ec');
  });
  it('sanitizes any other canonical key', () => {
    expect(govProjectSlug('op:gov:ABC_123')).toBe('gov-op-gov-abc-123');
  });
});

describe('toContractRequirementRow (pure) — honest mapping, never fabricates evidence', () => {
  it('maps the fields and keeps evidence_state unassessed, both tracks for a technical req, deterministic id', () => {
    const r1 = toContractRequirementRow('dp-1', { id: 'REQ-001', text: 'The system shall provide a claims search database', bindingStatus: 'binding_solicitation_requirement', section: 'L.3', sourceDocument: 'rfp.pdf' });
    expect(r1).toMatchObject({
      delivery_project_id: 'dp-1', canonical_req_id: 'REQ-001', statement: 'The system shall provide a claims search database',
      priority: 'must', tracks: ['proposal', 'solution_build'], evidence_state: 'unassessed',
      human_confirmed: true, section: 'L.3', source_document: 'rfp.pdf',
    });
    const r2 = toContractRequirementRow('dp-1', { id: 'REQ-001', text: 'different text now' });
    expect(r2!.id).toBe(r1!.id); // deterministic per (project, canonical_req_id)
  });
  it('non-binding -> priority should; a requirement with no id -> null (skipped)', () => {
    expect(toContractRequirementRow('dp', { id: 'R', text: 't' })!.priority).toBe('should');
    expect(toContractRequirementRow('dp', { text: 'no id' })).toBeNull();
  });
});

describe('classifyRequirementTracks (pure) — admin forms never reach the build track', () => {
  it('every requirement maps to proposal', () => {
    for (const t of ['The system shall provide a search database', 'Submit the pricing schedule', 'anything at all'])
      expect(classifyRequirementTracks({ text: t })).toContain('proposal');
  });
  it('a technical/solution requirement ALSO maps to solution_build', () => {
    expect(classifyRequirementTracks({ text: 'The system shall provide a claims search database' })).toEqual(['proposal', 'solution_build']);
    expect(classifyRequirementTracks({ text: 'Provide a data migration and reporting dashboard' })).toContain('solution_build');
    expect(classifyRequirementTracks({ text: 'generic', section: 'Technical Requirements' })).toContain('solution_build');
  });
  it('an ADMINISTRATIVE requirement is proposal-ONLY (no build story generated)', () => {
    for (const t of ['Complete the Execution of Offer form and sign it', 'Submit the Pricing Schedule', 'Offeror shall be registered in SAM.gov', 'Provide a certification of insurance', 'Complete the Exceptions Schedule', 'Texas Family Code schedule', 'Submit three references'])
      expect(classifyRequirementTracks({ text: t })).toEqual(['proposal']);
  });
  it('is total on empty/garbage input (still proposal)', () => {
    expect(classifyRequirementTracks({})).toEqual(['proposal']);
    expect(classifyRequirementTracks(null)).toEqual(['proposal']);
  });
});

describe('selectsSolutionBuild (pure) — the gate that keeps bid-submission rules out of the build', () => {
  it('a build/solution requirement is selected', () => {
    expect(selectsSolutionBuild({ text: 'The platform shall provide a reporting dashboard and API integration' })).toBe(true);
    expect(selectsSolutionBuild({ text: 'Develop and implement the video streaming system' })).toBe(true);
  });
  it('a bid-submission / administrative requirement is NOT selected (it is a proposal response, not software)', () => {
    for (const t of [
      'A claimant MUST submit a redacted and non-redacted version of their proposal.',
      'A claim must include a concise statement of reasons supporting the claim.',
      'Offeror shall be registered in SAM.gov',
      'Complete the Execution of Offer form and sign it',
    ]) expect(selectsSolutionBuild({ text: t })).toBe(false);
  });
  it('prefers the established `tracks` when present (reviewer category wins over text)', () => {
    // No build keyword in the text, but the reviewer established it as a build (scope) requirement.
    expect(selectsSolutionBuild({ text: 'Closed captioning on every broadcast', tracks: ['proposal', 'solution_build'] })).toBe(true);
    // Has a build-ish word in text, but the reviewer established it proposal-only — honor the stored tracks.
    expect(selectsSolutionBuild({ text: 'Describe your platform approach', tracks: ['proposal'] })).toBe(false);
  });
  it('is total on empty/garbage input (not a build requirement)', () => {
    expect(selectsSolutionBuild({})).toBe(false);
    expect(selectsSolutionBuild(null)).toBe(false);
  });
});

describe('ensureGovTwoTrackProject (orchestration, mocked models)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lookupGovContractsContainer.mockResolvedValue({ tenant: { id: 'ten-1' }, org: { id: 'org-1' }, engagement: { id: 'eng-1' } });
    dpCreate.mockResolvedValue({ id: 'dp-1' });
    ctFindOrCreate.mockResolvedValue([{}, true]);   // default: track created
    crFindOne.mockResolvedValue(null);              // default: requirement absent -> created
    crCreate.mockResolvedValue({});
    crUpdate.mockResolvedValue([1]);
    gqUpdate.mockResolvedValue([1]);
  });

  it('happy path: creates the project + both tracks + maps requirements + links the qualification', async () => {
    dpFindOne.mockResolvedValue(null);
    const res = await ensureGovTwoTrackProject({
      qualificationId: 'q-1', canonicalOpportunityId: GWS,
      established: [{ id: 'REQ-001', text: 'Register in SAM.gov', bindingStatus: 'binding_solicitation_requirement' }, { id: 'REQ-002', text: 'Provide a plan' }],
      provenance: { title: 'RFP IVR', agency: 'Fort Worth' }, approverIdentityId: '11111111-1111-4111-8111-111111111111',
    });
    expect(res).toMatchObject({ deliveryProjectId: 'dp-1', created: true, tracks: 2, requirements: 2 });
    expect(dpCreate).toHaveBeenCalledTimes(1);
    expect(dpCreate.mock.calls[0][0]).toMatchObject({
      slug: 'gov-04ac1711-c3f6-418a-9d9b-c5e6211295ec', project_class: 'government_public_sector',
      tenant_id: 'ten-1', organization_id: 'org-1', engagement_id: 'eng-1', name: 'RFP IVR', created_by_identity_id: '11111111-1111-4111-8111-111111111111', status: 'discovery',
    });
    expect(ctFindOrCreate.mock.calls.map((c) => c[0].defaults.track_type).sort()).toEqual(['proposal', 'solution_build']);
    expect(crCreate).toHaveBeenCalledTimes(2);
    expect(gqUpdate).toHaveBeenCalledWith({ delivery_project_id: 'dp-1' }, expect.objectContaining({ where: { id: 'q-1' } }));
  });

  it('a SERVICES pursuit creates the proposal track ONLY (no solution_build) — a consulting bid has no phantom build', async () => {
    dpFindOne.mockResolvedValue(null);
    const res = await ensureGovTwoTrackProject({
      qualificationId: 'q-s', canonicalOpportunityId: GWS, established: [], provenance: null,
      approverIdentityId: '11111111-1111-4111-8111-111111111111', pursuitKind: 'services',
    });
    expect(res.tracks).toBe(1);
    expect(ctFindOrCreate.mock.calls.map((c) => c[0].defaults.track_type)).toEqual(['proposal']); // NOT solution_build
  });

  it('a SOFTWARE pursuit (and the default/unset) still creates BOTH tracks', async () => {
    dpFindOne.mockResolvedValue(null);
    const res = await ensureGovTwoTrackProject({ qualificationId: 'q-w', canonicalOpportunityId: GWS, established: [], provenance: null, pursuitKind: 'software' });
    expect(res.tracks).toBe(2);
    expect(ctFindOrCreate.mock.calls.map((c) => c[0].defaults.track_type).sort()).toEqual(['proposal', 'solution_build']);
  });

  it('guards created_by_identity_id: a non-uuid approver (the admin EMAIL) becomes null — the create no longer 500s on a uuid column', async () => {
    dpFindOne.mockResolvedValue(null);
    await ensureGovTwoTrackProject({ qualificationId: 'q-9', canonicalOpportunityId: GWS, established: [], provenance: null, approverIdentityId: 'ali@colaberry.com' });
    expect(dpCreate).toHaveBeenCalledTimes(1);
    expect(dpCreate.mock.calls[0][0].created_by_identity_id).toBeNull();
  });

  it('idempotent: reuses an existing project (no create), still upserts the tracks', async () => {
    dpFindOne.mockResolvedValue({ id: 'dp-existing' });
    const res = await ensureGovTwoTrackProject({ qualificationId: 'q-2', canonicalOpportunityId: GWS, established: [], provenance: null });
    expect(res).toMatchObject({ deliveryProjectId: 'dp-existing', created: false, tracks: 2, requirements: 0 });
    expect(dpCreate).not.toHaveBeenCalled();
    expect(ctFindOrCreate).toHaveBeenCalledTimes(2);
  });

  it('fails CLOSED (GovContainerUnavailableError) when the gov container is not configured — writes nothing', async () => {
    lookupGovContractsContainer.mockResolvedValue(null);
    await expect(ensureGovTwoTrackProject({ qualificationId: 'q', canonicalOpportunityId: GWS, established: [] }))
      .rejects.toBeInstanceOf(GovContainerUnavailableError);
    expect(dpFindOne).not.toHaveBeenCalled();
    expect(dpCreate).not.toHaveBeenCalled();
  });

  it('skips an id-less requirement and never sets a build link or a fabricated evidence state', async () => {
    dpFindOne.mockResolvedValue({ id: 'dp-3' });
    const res = await ensureGovTwoTrackProject({ qualificationId: 'q-3', canonicalOpportunityId: 'op:gov:abc', established: [{ text: 'no id here' }, { id: 'REQ-9', text: 'ok' }] });
    expect(res.requirements).toBe(1);
    for (const c of ctFindOrCreate.mock.calls) expect(c[0].defaults.solution_student_project_id).toBeNull(); // no build student link
    expect(crCreate.mock.calls[0][0].evidence_state).toBe('unassessed');
  });

  // ── Replay safety (the production-live data-loss fix) ──────────────────────
  it('REPLAY-SAFE: an EXISTING requirement is updated on descriptive fields ONLY — evidence assessment is never overwritten', async () => {
    dpFindOne.mockResolvedValue({ id: 'dp-r' });
    // The requirement already exists AND a reviewer has assessed its evidence.
    crFindOne.mockResolvedValue({ id: 'r', evidence_state: 'verified', source_evidence: [{ docId: 'D1' }], human_confirmed: true });
    await ensureGovTwoTrackProject({ qualificationId: 'q', canonicalOpportunityId: GWS, established: [{ id: 'REQ-1', text: 'updated statement' }] });
    expect(crCreate).not.toHaveBeenCalled();     // existing -> not recreated
    expect(crUpdate).toHaveBeenCalledTimes(1);
    const patch = crUpdate.mock.calls[0][0];
    expect(patch).toHaveProperty('statement');   // descriptive fields ARE refreshed
    expect(patch.statement).toBe('updated statement');
    // The guard: the evidence assessment is NEVER in the update patch (reverting to a blind upsert fails this).
    expect(patch).not.toHaveProperty('evidence_state');
    expect(patch).not.toHaveProperty('source_evidence');
    expect(patch).not.toHaveProperty('human_confirmed');
  });

  it('REPLAY-SAFE: tracks are create-if-absent — an existing track is not re-written with null owner/link/status', async () => {
    dpFindOne.mockResolvedValue({ id: 'dp-e' });
    // Both tracks already exist with an owner + a student-build link set after first creation.
    ctFindOrCreate.mockResolvedValue([{ id: 't', owner_identity_id: 'owner-9', solution_student_project_id: 'sp-9', status: 'in_progress' }, false]);
    await ensureGovTwoTrackProject({ qualificationId: 'q', canonicalOpportunityId: GWS, established: [] });
    expect(ctFindOrCreate).toHaveBeenCalledTimes(2);
    for (const c of ctFindOrCreate.mock.calls) {
      expect(c[0]).toHaveProperty('where');                        // keyed by deterministic id
      // owner/link/status live ONLY in `defaults` (applied on create), never as an unconditional write.
      expect(c[0].defaults.owner_identity_id).toBeNull();
      expect(c[0].defaults.solution_student_project_id).toBeNull();
    }
  });

  it('idempotent: a second identical run writes the same end state (no duplicate create, no error)', async () => {
    dpFindOne.mockResolvedValue({ id: 'dp-i' });
    ctFindOrCreate.mockResolvedValue([{}, false]);
    crFindOne.mockResolvedValue({ id: 'r' }); // already present
    const res = await ensureGovTwoTrackProject({ qualificationId: 'q', canonicalOpportunityId: GWS, established: [{ id: 'REQ-1', text: 't' }] });
    expect(res).toMatchObject({ created: false, tracks: 2, requirements: 1 });
    expect(dpCreate).not.toHaveBeenCalled();
    expect(crCreate).not.toHaveBeenCalled();
  });
});

describe('linkGovBuildToStudentProject — sets the build link ONLY on a real, existence-checked link', () => {
  beforeEach(() => jest.clearAllMocks());

  it('happy path: creates the bridge, then wires ONLY the solution_build track', async () => {
    linkStudentProject.mockResolvedValue({ ok: true, linkId: 'L1', created: true });
    ctUpdate.mockResolvedValue([1]);
    const res = await linkGovBuildToStudentProject({ deliveryProjectId: 'dp', studentProjectId: 'sp', reason: 'intern build' });
    expect(res).toEqual({ ok: true, linkId: 'L1', created: true });
    expect(linkStudentProject).toHaveBeenCalledWith(expect.objectContaining({ deliveryProjectId: 'dp', studentProjectId: 'sp', reason: 'intern build' }));
    expect(ctUpdate).toHaveBeenCalledTimes(1);
    expect(ctUpdate.mock.calls[0][0]).toEqual({ solution_student_project_id: 'sp' });     // the column it sets
    expect(ctUpdate.mock.calls[0][1].where).toEqual({ delivery_project_id: 'dp', track_type: 'solution_build' }); // proposal track untouched
  });

  it('refusal (no such student project) -> wires NOTHING (never fabricates a link)', async () => {
    linkStudentProject.mockResolvedValue({ ok: false, reason: 'no_such_student_project', message: 'x' });
    const res = await linkGovBuildToStudentProject({ deliveryProjectId: 'dp', studentProjectId: 'nope', reason: 'r' });
    expect(res).toMatchObject({ ok: false, reason: 'no_such_student_project' });
    expect(ctUpdate).not.toHaveBeenCalled();
  });

  it('idempotent: re-linking returns created:false and still wires the track', async () => {
    linkStudentProject.mockResolvedValue({ ok: true, linkId: 'L1', created: false });
    ctUpdate.mockResolvedValue([1]);
    const res = await linkGovBuildToStudentProject({ deliveryProjectId: 'dp', studentProjectId: 'sp', reason: 'r' });
    expect(res).toMatchObject({ ok: true, created: false });
    expect(ctUpdate).toHaveBeenCalledTimes(1);
  });

  it('guards actorIdentityId: a non-uuid actor (the admin EMAIL) becomes null — the source-link write no longer 500s on linked_by_identity_id (a uuid column)', async () => {
    linkStudentProject.mockResolvedValue({ ok: true, linkId: 'L1', created: true });
    ctUpdate.mockResolvedValue([1]);
    await linkGovBuildToStudentProject({ deliveryProjectId: 'dp', studentProjectId: 'sp', reason: 'r', actorIdentityId: 'ali@colaberry.com' });
    // Reverting the guard to `?? null` lets the email through and fails here — this is the materialize 500 reproduced.
    expect(linkStudentProject.mock.calls[0][0].actorIdentityId).toBeNull();
  });

  it('passes a real uuid actor through unchanged — attribution is preserved when the actor resolves to an identity', async () => {
    linkStudentProject.mockResolvedValue({ ok: true, linkId: 'L1', created: true });
    ctUpdate.mockResolvedValue([1]);
    await linkGovBuildToStudentProject({ deliveryProjectId: 'dp', studentProjectId: 'sp', reason: 'r', actorIdentityId: '11111111-1111-4111-8111-111111111111' });
    expect(linkStudentProject.mock.calls[0][0].actorIdentityId).toBe('11111111-1111-4111-8111-111111111111');
  });
});
