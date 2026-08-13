import { getSkillEvidenceHistory } from '../capeSkillEvidenceHistoryService';
import { getLearnerSkillProfile } from '../capeProficiencyService';
import { StudentSkillEvidence } from '../../../models';
import CurriculumSkillMap from '../../../models/CurriculumSkillMap';

jest.mock('../capeProficiencyService', () => ({ getLearnerSkillProfile: jest.fn() }));
jest.mock('../../../models', () => ({ StudentSkillEvidence: { findAll: jest.fn() } }));
jest.mock('../../../models/CurriculumSkillMap', () => ({ __esModule: true, default: { findAll: jest.fn() } }));

const mockProfile = getLearnerSkillProfile as unknown as jest.Mock;
const mockEvidenceFindAll = StudentSkillEvidence.findAll as unknown as jest.Mock;
const mockMapFindAll = CurriculumSkillMap.findAll as unknown as jest.Mock;

function skillEntry(overrides: Record<string, any> = {}) {
  return { skill_id: 'rag', name: 'RAG', axis_order: 2, placement: 0, claim: 0, knowledge: 0, application: 0, judgment: 0, proficiency: 0, confidence: 0, next_review_at: null, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMapFindAll.mockResolvedValue([]);
});

describe('getSkillEvidenceHistory — happy path', () => {
  it('returns placement/verified from the profile and evidence rows newest-first, capped, learner-facing fields only', async () => {
    mockProfile.mockResolvedValue({ skills: [skillEntry({ placement: 40, proficiency: 25, next_review_at: '2026-08-10T00:00:00.000Z' })], overall_placement: 40, overall_proficiency: 25, weights_version: 1 });
    mockEvidenceFindAll.mockResolvedValue([
      { band: 'application', credit: 15, source: 'timeline', created_at: new Date('2026-08-01T00:00:00.000Z') },
    ]);

    const result = await getSkillEvidenceHistory('enr-1', 'rag');
    expect(result.placement).toBe(40);
    expect(result.verified).toBe(25);
    expect(result.next_review_at).toBe('2026-08-10T00:00:00.000Z');
    expect(result.evidence).toEqual([{ band: 'application', credit: 15, source: 'timeline', created_at: '2026-08-01T00:00:00.000Z' }]);
    expect(mockEvidenceFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { enrollment_id: 'enr-1', skill_id: 'rag' },
      order: [['created_at', 'DESC']],
      limit: 50,
      attributes: ['band', 'credit', 'source', 'created_at'],
    }));
  });

  it('next_recommended_proof: finds the first type-default mapping with an application band for this skill', async () => {
    mockProfile.mockResolvedValue({ skills: [skillEntry()], overall_placement: 0, overall_proficiency: 0, weights_version: 1 });
    mockEvidenceFindAll.mockResolvedValue([]);
    mockMapFindAll.mockResolvedValue([
      { type_slug: 'implementation_task', skill_impacts: [{ skill_id: 'rag', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 }] },
    ]);

    const result = await getSkillEvidenceHistory('enr-1', 'rag');
    expect(result.next_recommended_proof).toMatch(/Build Artifact/i); // implementation_task's student_label
  });
});

describe('getSkillEvidenceHistory — boundary: zero-evidence learner (brand-new)', () => {
  it('evidence: [], no throw; next_recommended_proof still computed independently of evidence', async () => {
    mockProfile.mockResolvedValue({ skills: [skillEntry()], overall_placement: 0, overall_proficiency: 0, weights_version: 1 });
    mockEvidenceFindAll.mockResolvedValue([]);
    mockMapFindAll.mockResolvedValue([
      { type_slug: 'prompt_lab', skill_impacts: [{ skill_id: 'rag', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 }] },
    ]);

    const result = await getSkillEvidenceHistory('enr-new', 'rag');
    expect(result.evidence).toEqual([]);
    expect(result.placement).toBe(0);
    expect(result.verified).toBe(0);
    expect(result.next_recommended_proof).not.toBeNull();
  });

  it('no qualifying mapping at all -> next_recommended_proof: null, never throws', async () => {
    mockProfile.mockResolvedValue({ skills: [skillEntry()], overall_placement: 0, overall_proficiency: 0, weights_version: 1 });
    mockEvidenceFindAll.mockResolvedValue([]);
    mockMapFindAll.mockResolvedValue([]);
    const result = await getSkillEvidenceHistory('enr-1', 'rag');
    expect(result.next_recommended_proof).toBeNull();
  });
});

describe('getSkillEvidenceHistory — failure paths fail soft', () => {
  it('an evidence query error returns evidence: [] rather than throwing', async () => {
    mockProfile.mockResolvedValue({ skills: [skillEntry()], overall_placement: 0, overall_proficiency: 0, weights_version: 1 });
    mockEvidenceFindAll.mockRejectedValue(new Error('db down'));
    const result = await getSkillEvidenceHistory('enr-1', 'rag');
    expect(result.evidence).toEqual([]);
  });

  it('a mapping-lookup error returns next_recommended_proof: null rather than throwing', async () => {
    mockProfile.mockResolvedValue({ skills: [skillEntry()], overall_placement: 0, overall_proficiency: 0, weights_version: 1 });
    mockEvidenceFindAll.mockResolvedValue([]);
    mockMapFindAll.mockRejectedValue(new Error('db down'));
    const result = await getSkillEvidenceHistory('enr-1', 'rag');
    expect(result.next_recommended_proof).toBeNull();
  });
});
