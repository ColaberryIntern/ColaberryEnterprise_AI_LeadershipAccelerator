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
const ctUpsert = jest.fn();
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { upsert: (...a: any[]) => ctUpsert(...a) } }));
const crUpsert = jest.fn();
jest.mock('../../../models/ContractRequirement', () => ({ __esModule: true, default: { upsert: (...a: any[]) => crUpsert(...a) } }));
const gqUpdate = jest.fn();
jest.mock('../../../models/GovQualification', () => ({ __esModule: true, default: { update: (...a: any[]) => gqUpdate(...a) } }));

import { ensureGovTwoTrackProject, govProjectSlug, toContractRequirementRow, GovContainerUnavailableError } from '../govDeliveryProject';

const GWS = 'gws:04ac1711-c3f6-418a-9d9b-c5e6211295ec';

describe('govProjectSlug (pure, deterministic)', () => {
  it('maps a gws key to gov-<uuid> (lowercased)', () => {
    expect(govProjectSlug('gws:04AC1711-c3f6-418a-9d9b-c5e6211295ec')).toBe('gov-04ac1711-c3f6-418a-9d9b-c5e6211295ec');
  });
  it('sanitizes any other canonical key', () => {
    expect(govProjectSlug('op:gov:ABC_123')).toBe('gov-op-gov-abc-123');
  });
});

describe('toContractRequirementRow (pure) — honest mapping, never fabricates evidence', () => {
  it('maps the fields and keeps evidence_state unassessed, both tracks, deterministic id', () => {
    const r1 = toContractRequirementRow('dp-1', { id: 'REQ-001', text: 'Register in SAM.gov', bindingStatus: 'binding_solicitation_requirement', section: 'L.3', sourceDocument: 'rfp.pdf' });
    expect(r1).toMatchObject({
      delivery_project_id: 'dp-1', canonical_req_id: 'REQ-001', statement: 'Register in SAM.gov',
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

describe('ensureGovTwoTrackProject (orchestration, mocked models)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lookupGovContractsContainer.mockResolvedValue({ tenant: { id: 'ten-1' }, org: { id: 'org-1' }, engagement: { id: 'eng-1' } });
    dpCreate.mockResolvedValue({ id: 'dp-1' });
    ctUpsert.mockResolvedValue([{}, true]);
    crUpsert.mockResolvedValue([{}, true]);
    gqUpdate.mockResolvedValue([1]);
  });

  it('happy path: creates the project + both tracks + maps requirements + links the qualification', async () => {
    dpFindOne.mockResolvedValue(null);
    const res = await ensureGovTwoTrackProject({
      qualificationId: 'q-1', canonicalOpportunityId: GWS,
      established: [{ id: 'REQ-001', text: 'Register in SAM.gov', bindingStatus: 'binding_solicitation_requirement' }, { id: 'REQ-002', text: 'Provide a plan' }],
      provenance: { title: 'RFP IVR', agency: 'Fort Worth' }, approverIdentityId: 'approver-1',
    });
    expect(res).toMatchObject({ deliveryProjectId: 'dp-1', created: true, tracks: 2, requirements: 2 });
    expect(dpCreate).toHaveBeenCalledTimes(1);
    expect(dpCreate.mock.calls[0][0]).toMatchObject({
      slug: 'gov-04ac1711-c3f6-418a-9d9b-c5e6211295ec', project_class: 'government_public_sector',
      tenant_id: 'ten-1', organization_id: 'org-1', engagement_id: 'eng-1', name: 'RFP IVR', created_by_identity_id: 'approver-1', status: 'discovery',
    });
    expect(ctUpsert.mock.calls.map((c) => c[0].track_type).sort()).toEqual(['proposal', 'solution_build']);
    expect(crUpsert).toHaveBeenCalledTimes(2);
    expect(gqUpdate).toHaveBeenCalledWith({ delivery_project_id: 'dp-1' }, expect.objectContaining({ where: { id: 'q-1' } }));
  });

  it('idempotent: reuses an existing project (no create), still upserts the tracks', async () => {
    dpFindOne.mockResolvedValue({ id: 'dp-existing' });
    const res = await ensureGovTwoTrackProject({ qualificationId: 'q-2', canonicalOpportunityId: GWS, established: [], provenance: null });
    expect(res).toMatchObject({ deliveryProjectId: 'dp-existing', created: false, tracks: 2, requirements: 0 });
    expect(dpCreate).not.toHaveBeenCalled();
    expect(ctUpsert).toHaveBeenCalledTimes(2);
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
    for (const c of ctUpsert.mock.calls) expect(c[0].solution_student_project_id).toBeNull(); // no build student link
    expect(crUpsert.mock.calls[0][0].evidence_state).toBe('unassessed');
  });
});
