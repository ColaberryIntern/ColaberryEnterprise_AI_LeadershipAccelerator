/**
 * Design doc §17 AC 6, verified with the REAL, unmocked service chain
 * (capeTimelineEvidenceBridge -> capeEvidenceLedgerService -> capeProficiencyService)
 * rather than asserting the seed numbers "look plausible" in isolation. Only the
 * Sequelize model statics are mocked, as an in-memory store — the actual arithmetic
 * (`sumBand`, the proficiency formula, `expandContractToWrites`) all runs for real.
 *
 * The specific §6 credit-speed brackets this test checks (design doc "Credit speed
 * by source" table):
 *   Classroom lab or artifact (evidence_required + github/instructor validation) ->
 *     "10-20" credit, "Fast Application growth" -> this test's `implementation_task`
 *     type resolves to `credit_strength:'capstone'`/`'high'` via
 *     `capeTypeSkillMapSeeds.tierFor()` (evidence_required + github_required +
 *     instructor_review -> the 25-total-credit capstone tier).
 *   Completed Timeline video/article/podcast -> "1-2" credit, "Slow Knowledge
 *     growth" -> this test's `blog` type resolves to `credit_strength:'low'` via the
 *     same tier function's default branch (no evidence_required/ai_evaluation flags
 *     -> the 2-total-credit tier).
 * A real lab must grow the SAME skill's proficiency materially faster (>=3x) than a
 * real passive reading, using the REAL seeded weights from T005, not mocked ones.
 */
jest.mock('../../../models/StudentSkillEvidence', () => ({ __esModule: true, default: { findOrCreate: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../../models/StudentArchitectureSkill', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
jest.mock('../../../models/ArchitectureSkillEvidenceBandWeights', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
// Both test cards are always pre-stamped (skill_mapping present), so the bridge's
// live-fallback branch (resolveSkillMapping) is never actually invoked here — mocked
// only to keep capeCurriculumSkillMapService's own CurriculumSkillMap model import
// from initializing against the real config/database at module-load time.
jest.mock('../capeCurriculumSkillMapService', () => ({ resolveSkillMapping: jest.fn() }));
// capeTypeSkillMapSeeds.ts (imported for real below, for its pure
// computeTypeSkillMapDraft) also imports CurriculumSkillMap directly (for its own
// seeder, never called here) — mock it too so nothing in this test's import graph
// initializes a real Sequelize model.
jest.mock('../../../models/CurriculumSkillMap', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
// recomputeStudentArchitectureSkill (real, unmocked) pulls in capePlacementService.ts,
// which reads DiagnosticAttempt via the models BARREL (`../../models`) rather than a
// direct model import — the barrel itself registers every Sequelize association
// (TimelineCard.hasMany(...), etc.) at import time, which would blow up against our
// minimal TimelineCard mock. Mock the barrel to just the one export actually used,
// same pattern as capeResumePlacementBoundary.test.ts.
// computePlacementScore (also real, unmocked, called unconditionally by
// recomputeStudentArchitectureSkill) additionally reads OnboardingProfile +
// ResumeSkillClaim via capeResumeClaimService.getCurrentResumeSkillClaims — all
// three barrel exports need an inert mock, or placement scoring (irrelevant to
// this test's actual assertions, which only check the 4 verified bands) would
// crash on an undefined model.
jest.mock('../../../models', () => ({
  DiagnosticAttempt: { findOne: jest.fn().mockResolvedValue(null) },
  OnboardingProfile: { findOne: jest.fn().mockResolvedValue(null) },
  ResumeSkillClaim: { findAll: jest.fn().mockResolvedValue([]) },
}));

import StudentSkillEvidence from '../../../models/StudentSkillEvidence';
import StudentArchitectureSkill from '../../../models/StudentArchitectureSkill';
import ArchitectureSkillEvidenceBandWeights from '../../../models/ArchitectureSkillEvidenceBandWeights';
import TimelineCard from '../../../models/TimelineCard';
import { computeTypeSkillMapDraft } from '../capeTypeSkillMapSeeds';
import { allTypes } from '../../timeline/typeRegistry';
import { recordCapeEvidenceForCompletedCard } from '../capeTimelineEvidenceBridge';

const findOrCreateEvidence = StudentSkillEvidence.findOrCreate as unknown as jest.Mock;
const findAllEvidence = StudentSkillEvidence.findAll as unknown as jest.Mock;
const findOrCreateArch = StudentArchitectureSkill.findOrCreate as unknown as jest.Mock;
const weightsFindOne = ArchitectureSkillEvidenceBandWeights.findOne as unknown as jest.Mock;
const findByPkCard = TimelineCard.findByPk as unknown as jest.Mock;

// In-memory evidence store + arch-skill row store, shared across the two learners in
// this test so recomputeStudentArchitectureSkill's "read 100% of this enrollment+
// skill's evidence" behavior runs for real.
let evidenceStore: any[];
let archRows: Record<string, any>;

const CURRENT_WEIGHTS_ROW = { version: 1, claim_weight: 0.2, knowledge_weight: 0.25, application_weight: 0.35, judgment_weight: 0.2 };
const TARGET_SKILL = 'system_design'; // shared skill for a controlled, apples-to-apples comparison

beforeEach(() => {
  jest.clearAllMocks();
  evidenceStore = [];
  archRows = {};
  weightsFindOne.mockResolvedValue(CURRENT_WEIGHTS_ROW);

  findOrCreateEvidence.mockImplementation(async ({ where, defaults }: any) => {
    const existing = evidenceStore.find((r) => r.idempotency_key === where.idempotency_key);
    if (existing) return [existing, false];
    const row = { ...defaults, created_at: new Date() };
    evidenceStore.push(row);
    return [row, true];
  });
  findAllEvidence.mockImplementation(async ({ where }: any) => {
    return evidenceStore.filter((r) => r.enrollment_id === where.enrollment_id && r.skill_id === where.skill_id);
  });
  findOrCreateArch.mockImplementation(async ({ where }: any) => {
    const key = `${where.enrollment_id}:${where.skill_id}`;
    if (!archRows[key]) {
      archRows[key] = { enrollment_id: where.enrollment_id, skill_id: where.skill_id, proficiency: 0, update: jest.fn(async (patch: any) => Object.assign(archRows[key], patch)) };
    }
    return [archRows[key], true];
  });
});

/** Takes the REAL T005-computed FIRST skill impact for the given type and retargets
 * it onto TARGET_SKILL (a single-impact contract), so both learners' evidence lands
 * on the same axis — isolating credit_strength/max_credit as the only variable under
 * test (the design doc's own "one skill" framing). Using only the first impact (not
 * remapping every impact onto the same skill) avoids an idempotency-key collision:
 * expandContractToWrites keys on skill_id, so multiple impacts sharing one skill_id
 * would collapse into a single write and silently undercount. */
function stampedContractFor(typeSlug: string) {
  const def = allTypes().find((t) => t.slug === typeSlug)!;
  const draft = computeTypeSkillMapDraft(def);
  const firstImpact = { ...draft.skill_impacts[0], skill_id: TARGET_SKILL, weight: 1 };
  return { skill_impacts: [firstImpact], prerequisite_skills: [], recommended_range: draft.recommended_range, freshness_days: draft.freshness_days, reviewable: true };
}

describe('design doc §17.6 — a validated lab grows a skill materially faster than a passive reading', () => {
  it('implementation_task (real T005 capstone/high tier) produces >=3x the application_score of blog (real T005 low tier), same skill, same weights', async () => {
    const labContract = stampedContractFor('implementation_task');
    const readingContract = stampedContractFor('blog');

    // Sanity: confirm the REAL seed data actually differs in credit_strength before
    // asserting anything about the derived proficiency — a same-tier fixture would
    // make this test meaningless.
    expect(labContract.skill_impacts[0].credit_strength).not.toBe(readingContract.skill_impacts[0].credit_strength);
    expect(labContract.skill_impacts[0].max_credit).toBeGreaterThan(readingContract.skill_impacts[0].max_credit);

    findByPkCard.mockResolvedValueOnce({ id: 'lab-card', type: 'implementation_task', week: 6, skill_mapping: labContract, skill_mapping_version: 1 });
    await recordCapeEvidenceForCompletedCard('learner-lab', { id: 'lab-card', type: 'implementation_task' });

    findByPkCard.mockResolvedValueOnce({ id: 'reading-card', type: 'blog', week: 1, skill_mapping: readingContract, skill_mapping_version: 1 });
    await recordCapeEvidenceForCompletedCard('learner-reading', { id: 'reading-card', type: 'blog' });

    const labRow = archRows[`learner-lab:${TARGET_SKILL}`];
    const readingRow = archRows[`learner-reading:${TARGET_SKILL}`];

    expect(labRow).toBeDefined();
    expect(readingRow).toBeDefined();
    expect(Number(labRow.proficiency)).toBeGreaterThan(0);
    expect(Number(readingRow.proficiency)).toBeGreaterThan(0);
    // §6 bracket check: labs (10-20, here 25 capstone-tier / N skills) vs light
    // exposure (1-2) is at minimum a 5x raw-credit ratio; require >=3x on the
    // DERIVED proficiency (post-weighting) as the acceptance bar per plan.md T012.
    expect(Number(labRow.proficiency)).toBeGreaterThanOrEqual(Number(readingRow.proficiency) * 3);
  });
});
