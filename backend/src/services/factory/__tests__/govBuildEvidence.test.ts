/**
 * govBuildEvidence — a student's completion hand-in. The non-negotiable: a submission is ALWAYS recorded
 * `submitted`, NEVER self-verified (verification is a separate reviewer-only act). Required fields are enforced;
 * list is total.
 */
const evCreate = jest.fn();
const evFindAll = jest.fn();
const evFindOne = jest.fn();
jest.mock('../../../models/GovBuildStoryEvidence', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => evCreate(...a), findAll: (...a: any[]) => evFindAll(...a), findOne: (...a: any[]) => evFindOne(...a) },
}));

import { submitBuildStoryEvidence, listBuildStoryEvidence, verifyBuildStoryEvidence, EvidenceInputError, EvidenceVerifyError } from '../govBuildEvidence';

const input = (over: any = {}) => ({
  deliveryProjectId: 'dp-1', storyId: 'STORY-R1', canonicalReqId: 'R1',
  description: 'Built the search; screenshot attached.', artifactRef: 'https://repo/pr/9',
  submittedByIdentityId: 'student-1', ...over,
});
// create() returns a model instance; our service calls row.get({plain:true}).
const rowFrom = (v: any) => ({ get: () => ({ id: 'ev-1', submitted_at: new Date('2026-10-07T00:00:00Z'), reviewed_by_identity_id: null, reviewed_at: null, ...v }) });

beforeEach(() => { jest.clearAllMocks(); });

describe('submitBuildStoryEvidence', () => {
  it('records the hand-in as `submitted` — NEVER self-verified — with the description, artifact and submitter', async () => {
    evCreate.mockImplementation(async (v: any) => rowFrom(v));
    const r = await submitBuildStoryEvidence(input());
    expect(evCreate).toHaveBeenCalledTimes(1);
    const created = evCreate.mock.calls[0][0];
    expect(created.status).toBe('submitted');                 // the rail: a hand-in is a claim, never verified
    expect(created.reviewed_by_identity_id).toBeNull();
    expect(created.delivery_project_id).toBe('dp-1');
    expect(created.story_id).toBe('STORY-R1');
    expect(created.submitted_by_identity_id).toBe('student-1');
    expect(r.status).toBe('submitted');
    expect(r.artifactRef).toBe('https://repo/pr/9');
  });

  it('rejects a missing description (EvidenceInputError, nothing created)', async () => {
    await expect(submitBuildStoryEvidence(input({ description: '   ' }))).rejects.toBeInstanceOf(EvidenceInputError);
    expect(evCreate).not.toHaveBeenCalled();
  });

  it('rejects missing story/project identifiers and a missing submitter', async () => {
    await expect(submitBuildStoryEvidence(input({ canonicalReqId: '' }))).rejects.toBeInstanceOf(EvidenceInputError);
    await expect(submitBuildStoryEvidence(input({ submittedByIdentityId: '' }))).rejects.toBeInstanceOf(EvidenceInputError);
  });
});

describe('listBuildStoryEvidence', () => {
  it('maps rows to the safe view (no identity fields) and is total on empty input', async () => {
    expect(await listBuildStoryEvidence('')).toEqual([]);
    evFindAll.mockResolvedValue([rowFrom({ story_id: 'STORY-R1', canonical_req_id: 'R1', description: 'done', artifact_ref: null, status: 'submitted', submitted_by_identity_id: 'secret-id' })]);
    const list = await listBuildStoryEvidence('dp-1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ storyId: 'STORY-R1', canonicalReqId: 'R1', status: 'submitted' });
    expect(JSON.stringify(list)).not.toContain('secret-id'); // the submitter identity is not in the safe view
  });
});

describe('verifyBuildStoryEvidence — reviewer decision + separation of duties', () => {
  // A mock row: get() returns the current plain state; update() mutates it for the re-read.
  const mockRow = (over: any = {}) => {
    const state: any = { id: 'ev-1', delivery_project_id: 'dp-1', story_id: 'STORY-R1', canonical_req_id: 'R1', description: 'done', artifact_ref: null, status: 'submitted', submitted_by_identity_id: 'student-1', submitted_at: new Date('2026-10-07T00:00:00Z'), reviewed_by_identity_id: null, reviewed_at: null, ...over };
    return { get: () => ({ ...state }), update: jest.fn(async (patch: any) => { Object.assign(state, patch); }) };
  };
  const verifyInput = (over: any = {}) => ({ evidenceId: 'ev-1', deliveryProjectId: 'dp-1', reviewerIdentityId: 'reviewer-9', decision: 'verified' as const, ...over });

  it('verifies a submitted hand-in: sets status + reviewer, returns the decided view', async () => {
    const row = mockRow();
    evFindOne.mockResolvedValue(row);
    const r = await verifyBuildStoryEvidence(verifyInput());
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'verified', reviewed_by_identity_id: 'reviewer-9' }));
    expect(r.status).toBe('verified');
  });

  it('SEPARATION OF DUTIES: a reviewer cannot verify evidence THEY submitted (self_review, nothing updated)', async () => {
    const row = mockRow({ submitted_by_identity_id: 'reviewer-9' }); // same identity as the reviewer
    evFindOne.mockResolvedValue(row);
    await expect(verifyBuildStoryEvidence(verifyInput({ reviewerIdentityId: 'reviewer-9' }))).rejects.toMatchObject({ reason: 'self_review' });
    expect(row.update).not.toHaveBeenCalled();
  });

  it('refuses to re-decide an already-reviewed hand-in (already_reviewed)', async () => {
    const row = mockRow({ status: 'verified', reviewed_by_identity_id: 'someone' });
    evFindOne.mockResolvedValue(row);
    await expect(verifyBuildStoryEvidence(verifyInput())).rejects.toMatchObject({ reason: 'already_reviewed' });
    expect(row.update).not.toHaveBeenCalled();
  });

  it('refuses a cross-project / missing row (not_found) and a bad decision', async () => {
    evFindOne.mockResolvedValue(null);
    await expect(verifyBuildStoryEvidence(verifyInput())).rejects.toMatchObject({ reason: 'not_found' });
    await expect(verifyBuildStoryEvidence(verifyInput({ decision: 'approved' }))).rejects.toBeInstanceOf(EvidenceVerifyError);
  });
});
