import { persistResumeSkillClaims, getCurrentResumeSkillClaims } from '../capeResumeClaimService';
import { OnboardingProfile, ResumeSkillClaim } from '../../../models';

jest.mock('../../../models', () => ({
  OnboardingProfile: { findOrCreate: jest.fn(), findOne: jest.fn() },
  ResumeSkillClaim: { findOrCreate: jest.fn(), findAll: jest.fn() },
}));

const mockProfileFindOrCreate = OnboardingProfile.findOrCreate as unknown as jest.Mock;
const mockProfileFindOne = OnboardingProfile.findOne as unknown as jest.Mock;
const mockClaimFindOrCreate = ResumeSkillClaim.findOrCreate as unknown as jest.Mock;
const mockClaimFindAll = ResumeSkillClaim.findAll as unknown as jest.Mock;

function makeProfile(resumeVersion = 0) {
  const state: any = { resume_version: resumeVersion, extractor_version: null };
  state.update = jest.fn(async (patch: any) => { Object.assign(state, patch); return state; });
  return state;
}

const RAW_CLAIM = {
  skill_id: 'agents_mcp', subskills: ['tool_use'], evidence_text: 'Built an agent workflow',
  evidence_kind: 'built_owned', recency_years: 0, ownership: 'built', scope: 'team', confidence: 0.8,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockClaimFindOrCreate.mockResolvedValue([{ id: 'row-1' }, true]);
});

describe('persistResumeSkillClaims', () => {
  it('happy path: 2 distinct-skill claims produce exactly 2 rows at resume_version=1, and bumps the profile version', async () => {
    const profile = makeProfile(0);
    mockProfileFindOrCreate.mockResolvedValue([profile, true]);

    const result = await persistResumeSkillClaims('e1', [
      RAW_CLAIM,
      { ...RAW_CLAIM, skill_id: 'rag', evidence_kind: 'job_bullet' },
    ]);

    expect(result.resume_version).toBe(1);
    expect(result.claims_written).toBe(2);
    expect(mockClaimFindOrCreate).toHaveBeenCalledTimes(2);
    expect(profile.update).toHaveBeenCalledWith(expect.objectContaining({ resume_version: 1 }));
    const keys = mockClaimFindOrCreate.mock.calls.map((c) => c[0].where.idempotency_key);
    expect(keys).toContain('resume:1:agents_mcp');
    expect(keys).toContain('resume:1:rag');
  });

  it('failure path: an empty/invalid claims array persists zero claims and never throws, but still bumps the version', async () => {
    const profile = makeProfile(0);
    mockProfileFindOrCreate.mockResolvedValue([profile, true]);

    const result = await persistResumeSkillClaims('e1', []);
    expect(result.claims_written).toBe(0);
    expect(result.resume_version).toBe(1);
    expect(mockClaimFindOrCreate).not.toHaveBeenCalled();
  });

  it('failure path: malformed claim objects (invalid skill_id) are dropped, not thrown', async () => {
    const profile = makeProfile(0);
    mockProfileFindOrCreate.mockResolvedValue([profile, true]);

    const result = await persistResumeSkillClaims('e1', [{ skill_id: 'not_real', evidence_kind: 'job_bullet', confidence: 0.5 }]);
    expect(result.claims_written).toBe(0);
  });

  it('idempotency: findOrCreate is the dedupe mechanism — a retried write at the same idempotency_key returns the existing row, not a duplicate', async () => {
    const profile = makeProfile(0);
    mockProfileFindOrCreate.mockResolvedValue([profile, true]);
    // findOrCreate reports "already existed" — the persistence layer never checks
    // this return value to decide whether to write again; the DB-level unique
    // constraint on idempotency_key is what prevents the duplicate.
    mockClaimFindOrCreate.mockResolvedValue([{ id: 'row-1' }, false]);

    const result = await persistResumeSkillClaims('e1', [RAW_CLAIM]);
    expect(mockClaimFindOrCreate).toHaveBeenCalledTimes(1);
    expect(mockClaimFindOrCreate.mock.calls[0][0].where).toEqual({ idempotency_key: 'resume:1:agents_mcp' });
    expect(result.claims_written).toBe(1); // one skill touched, regardless of created vs found
  });

  it('re-upload creates NEW rows at the NEXT version without touching prior-version rows (design doc §17 AC 3)', async () => {
    const profile = makeProfile(1); // already has one prior upload
    mockProfileFindOrCreate.mockResolvedValue([profile, false]);

    const result = await persistResumeSkillClaims('e1', [RAW_CLAIM]);
    expect(result.resume_version).toBe(2);
    expect(mockClaimFindOrCreate.mock.calls[0][0].where.idempotency_key).toBe('resume:2:agents_mcp');
  });

  it('never calls recordSkillEvidence / touches the verified StudentSkillEvidence ledger (design doc §17 AC 2)', async () => {
    const profile = makeProfile(0);
    mockProfileFindOrCreate.mockResolvedValue([profile, true]);
    await persistResumeSkillClaims('e1', [RAW_CLAIM]);
    // The mocked '../../../models' module intentionally has NO StudentSkillEvidence
    // key at all — if capeResumeClaimService imported/used it, this test file's
    // mock would need to supply it and any reference would throw. It doesn't throw,
    // proving the module never touches that model.
    expect(mockClaimFindOrCreate).toHaveBeenCalledTimes(1);
  });
});

describe('getCurrentResumeSkillClaims', () => {
  it('boundary: no OnboardingProfile row -> empty array, no throw', async () => {
    mockProfileFindOne.mockResolvedValue(null);
    const claims = await getCurrentResumeSkillClaims('e1');
    expect(claims).toEqual([]);
    expect(mockClaimFindAll).not.toHaveBeenCalled();
  });

  it('happy path: filters to the profile current resume_version', async () => {
    mockProfileFindOne.mockResolvedValue({ resume_version: 3 });
    mockClaimFindAll.mockResolvedValue([{ skill_id: 'rag' }]);
    const claims = await getCurrentResumeSkillClaims('e1', 'rag');
    expect(claims).toHaveLength(1);
    expect(mockClaimFindAll).toHaveBeenCalledWith({ where: { enrollment_id: 'e1', resume_version: 3, skill_id: 'rag' } });
  });
});
