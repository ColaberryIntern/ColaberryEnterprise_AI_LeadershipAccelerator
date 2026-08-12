/**
 * Design doc §17 AC 1 + AC 2, verified with fresh evidence rather than code
 * inspection: (a) a learner who never uploaded a resume gets an all-zero
 * placement profile with no throw (Foundation mode); (b) a resume upload that
 * DOES produce claims never moves the 4 verified bands
 * (claim/knowledge/application/judgment) or `proficiency` — only
 * `placement_score` changes. This is the single most important invariant in
 * CAPE Phase 2 (design doc §4 "one learner profile, two scores").
 */
import StudentSkillEvidence from '../../../models/StudentSkillEvidence';
import StudentArchitectureSkill from '../../../models/StudentArchitectureSkill';
import ArchitectureSkillDefinition from '../../../models/ArchitectureSkillDefinition';
import ArchitectureSkillEvidenceBandWeights from '../../../models/ArchitectureSkillEvidenceBandWeights';
import ResumeSkillClaim from '../../../models/ResumeSkillClaim';
import OnboardingProfile from '../../../models/OnboardingProfile';
import DiagnosticAttempt from '../../../models/DiagnosticAttempt';
import { recomputeStudentArchitectureSkill, getLearnerSkillProfile } from '../capeProficiencyService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/StudentSkillEvidence', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/StudentArchitectureSkill', () => ({ __esModule: true, default: { findOrCreate: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../../models/ArchitectureSkillDefinition', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/ArchitectureSkillEvidenceBandWeights', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/ResumeSkillClaim', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/OnboardingProfile', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/DiagnosticAttempt', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
// capePlacementService imports OnboardingProfile/ResumeSkillClaim via
// capeResumeClaimService, and DiagnosticAttempt via '../../models' (the
// barrel) — mock the barrel too so this end-to-end test exercises the REAL
// capePlacementService/capeResumeClaimService code (not a stubbed mock),
// proving the boundary at the actual integration seam.
jest.mock('../../../models', () => ({
  OnboardingProfile: require('../../../models/OnboardingProfile').default,
  ResumeSkillClaim: require('../../../models/ResumeSkillClaim').default,
  DiagnosticAttempt: require('../../../models/DiagnosticAttempt').default,
}));

const evidenceFindAll = StudentSkillEvidence.findAll as unknown as jest.Mock;
const archFindOrCreate = StudentArchitectureSkill.findOrCreate as unknown as jest.Mock;
const archFindAll = StudentArchitectureSkill.findAll as unknown as jest.Mock;
const defFindAll = ArchitectureSkillDefinition.findAll as unknown as jest.Mock;
const weightsFindOne = ArchitectureSkillEvidenceBandWeights.findOne as unknown as jest.Mock;
const claimFindAll = ResumeSkillClaim.findAll as unknown as jest.Mock;
const profileFindOne = OnboardingProfile.findOne as unknown as jest.Mock;
const diagnosticFindOne = DiagnosticAttempt.findOne as unknown as jest.Mock;

function makeRow(overrides: Record<string, any> = {}) {
  const state: Record<string, any> = {
    id: 'row-1', enrollment_id: 'e1', skill_id: 'agents_mcp',
    placement_score: 0, claim_score: 0, knowledge_score: 0, application_score: 0, judgment_score: 0,
    proficiency: 0, confidence: 0, evidence_count: 0, last_evidence_at: null, next_review_at: null,
    weights_version: null, computed_at: new Date(),
    ...overrides,
  };
  state.update = jest.fn(async (patch: Record<string, any>) => { Object.assign(state, patch); return state; });
  return state;
}

const CURRENT_WEIGHTS_ROW = { version: 1, claim_weight: 0.2, knowledge_weight: 0.25, application_weight: 0.35, judgment_weight: 0.2 };

beforeEach(() => {
  jest.clearAllMocks();
  weightsFindOne.mockResolvedValue(CURRENT_WEIGHTS_ROW);
  diagnosticFindOne.mockResolvedValue(null);
});

describe('no-resume path (design doc §17 AC 1)', () => {
  it('a fresh enrollment with no OnboardingProfile row and no resume_skill_claims returns all-10-zero placement, no throw', async () => {
    profileFindOne.mockResolvedValue(null); // learner never uploaded a resume
    defFindAll.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ skill_id: `skill_${i}`, name: `Skill ${i}`, axis_order: i }))
    );
    archFindAll.mockResolvedValue([]); // no cached rows -> forces recompute for all 10
    evidenceFindAll.mockResolvedValue([]);
    archFindOrCreate.mockImplementation(async ({ where }: any) => [makeRow({ skill_id: where.skill_id }), true]);

    const profile = await getLearnerSkillProfile('fresh-enrollment');

    expect(profile.skills).toHaveLength(10);
    expect(profile.skills.every((s) => s.placement === 0)).toBe(true);
    expect(profile.overall_placement).toBe(0);
    expect(claimFindAll).not.toHaveBeenCalled(); // computePlacementScore short-circuits before querying claims
  });
});

describe('two-score separation under a resume upload (design doc §17 AC 2, §4)', () => {
  it('a resume claim changes ONLY placement_score — the 4 verified bands and proficiency are untouched', async () => {
    // Learner has an existing verified Application evidence row (e.g. from a
    // completed Timeline card, Phase 0-1) AND a current-version resume claim.
    evidenceFindAll.mockResolvedValue([{ band: 'application', credit: 15, created_at: new Date('2026-01-01') }]);
    profileFindOne.mockResolvedValue({ resume_version: 1 });
    claimFindAll.mockResolvedValue([{ credit_weight: 47 }]);
    const row = makeRow();
    archFindOrCreate.mockResolvedValue([row, true]);

    const result = await recomputeStudentArchitectureSkill('e1', 'agents_mcp');

    // Placement moved (resume-driven)…
    expect(Number(result.placement_score)).toBe(47);
    // …but the verified bands reflect ONLY the ledger evidence (15 application
    // credit -> application_score 15, proficiency 0.35*15=5.25), completely
    // independent of the resume claim's value (47).
    expect(Number(result.application_score)).toBe(15);
    expect(Number(result.claim_score)).toBe(0);
    expect(Number(result.knowledge_score)).toBe(0);
    expect(Number(result.judgment_score)).toBe(0);
    expect(Number(result.proficiency)).toBeCloseTo(0.35 * 15, 5);
    expect(Number(result.application_score)).not.toBe(Number(result.placement_score));
  });
});
