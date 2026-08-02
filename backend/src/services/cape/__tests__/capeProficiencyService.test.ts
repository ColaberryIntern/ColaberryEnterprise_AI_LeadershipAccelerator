import StudentSkillEvidence from '../../../models/StudentSkillEvidence';
import StudentArchitectureSkill from '../../../models/StudentArchitectureSkill';
import ArchitectureSkillDefinition from '../../../models/ArchitectureSkillDefinition';
import ArchitectureSkillEvidenceBandWeights from '../../../models/ArchitectureSkillEvidenceBandWeights';
import { recomputeStudentArchitectureSkill, getCurrentWeights, getLearnerSkillProfile } from '../capeProficiencyService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/StudentSkillEvidence', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/StudentArchitectureSkill', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn(), findAll: jest.fn() },
}));
jest.mock('../../../models/ArchitectureSkillDefinition', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/ArchitectureSkillEvidenceBandWeights', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

const evidenceFindAll = StudentSkillEvidence.findAll as unknown as jest.Mock;
const archFindOrCreate = StudentArchitectureSkill.findOrCreate as unknown as jest.Mock;
const archFindAll = StudentArchitectureSkill.findAll as unknown as jest.Mock;
const defFindAll = ArchitectureSkillDefinition.findAll as unknown as jest.Mock;
const weightsFindOne = ArchitectureSkillEvidenceBandWeights.findOne as unknown as jest.Mock;

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

const CURRENT_WEIGHTS_ROW = {
  version: 1, claim_weight: 0.2, knowledge_weight: 0.25, application_weight: 0.35, judgment_weight: 0.2,
};

beforeEach(() => {
  jest.clearAllMocks();
  weightsFindOne.mockResolvedValue(CURRENT_WEIGHTS_ROW);
});

describe('getCurrentWeights', () => {
  it('happy path: reads the current row', async () => {
    const w = await getCurrentWeights();
    expect(w).toEqual({ version: 1, claim: 0.2, knowledge: 0.25, application: 0.35, judgment: 0.2 });
  });

  it('boundary: falls back to the design-doc default (20/25/35/20) when no current row exists', async () => {
    weightsFindOne.mockResolvedValue(null);
    const w = await getCurrentWeights();
    expect(w).toEqual({ version: 0, claim: 0.2, knowledge: 0.25, application: 0.35, judgment: 0.2 });
  });
});

describe('recomputeStudentArchitectureSkill', () => {
  it('happy path: applies the exact §6 weighted formula (0.2·40+0.25·60+0.35·80+0.2·50=61)', async () => {
    evidenceFindAll.mockResolvedValue([
      { band: 'claim', credit: 40, created_at: new Date('2026-01-01') },
      { band: 'knowledge', credit: 60, created_at: new Date('2026-01-02') },
      { band: 'application', credit: 80, created_at: new Date('2026-01-03') },
      { band: 'judgment', credit: 50, created_at: new Date('2026-01-04') },
    ]);
    const row = makeRow();
    archFindOrCreate.mockResolvedValue([row, true]);

    const result = await recomputeStudentArchitectureSkill('e1', 'agents_mcp');
    expect(Number(result.proficiency)).toBeCloseTo(61, 5);
    expect(Number(result.claim_score)).toBe(40);
    expect(Number(result.knowledge_score)).toBe(60);
    expect(Number(result.application_score)).toBe(80);
    expect(Number(result.judgment_score)).toBe(50);
    expect(result.weights_version).toBe(1);
  });

  it('zero-evidence boundary: no ledger rows yields all-zero scores, no NaN, no throw', async () => {
    evidenceFindAll.mockResolvedValue([]);
    const row = makeRow();
    archFindOrCreate.mockResolvedValue([row, true]);

    const result = await recomputeStudentArchitectureSkill('e1', 'agents_mcp');
    expect(Number(result.proficiency)).toBe(0);
    expect(Number.isNaN(Number(result.proficiency))).toBe(false);
    expect(result.evidence_count).toBe(0);
    expect(result.last_evidence_at).toBeNull();
    expect(result.next_review_at).toBeNull();
  });

  it('idempotency: recomputing twice against an unchanged ledger produces identical output', async () => {
    evidenceFindAll.mockResolvedValue([
      { band: 'application', credit: 15, created_at: new Date('2026-01-01') },
    ]);
    const row = makeRow();
    archFindOrCreate.mockResolvedValue([row, true]);

    const first = await recomputeStudentArchitectureSkill('e1', 'agents_mcp');
    const firstSnapshot = { ...first };
    const second = await recomputeStudentArchitectureSkill('e1', 'agents_mcp');

    expect(Number(second.proficiency)).toBeCloseTo(Number(firstSnapshot.proficiency), 10);
    expect(Number(second.application_score)).toBe(Number(firstSnapshot.application_score));
    expect(second.evidence_count).toBe(firstSnapshot.evidence_count);
  });

  it('weights-version correctness: a later recompute picks up a NEW current weights version, not a stale one', async () => {
    evidenceFindAll.mockResolvedValue([
      { band: 'application', credit: 100, created_at: new Date('2026-01-01') },
    ]);
    const row = makeRow();
    archFindOrCreate.mockResolvedValue([row, true]);

    weightsFindOne.mockResolvedValueOnce(CURRENT_WEIGHTS_ROW);
    const before = await recomputeStudentArchitectureSkill('e1', 'agents_mcp');
    expect(Number(before.proficiency)).toBeCloseTo(35, 5); // 0.35 * 100

    weightsFindOne.mockResolvedValueOnce({
      version: 2, claim_weight: 0.1, knowledge_weight: 0.1, application_weight: 0.7, judgment_weight: 0.1,
    });
    const after = await recomputeStudentArchitectureSkill('e1', 'agents_mcp');
    expect(Number(after.proficiency)).toBeCloseTo(70, 5); // 0.7 * 100
    expect(after.weights_version).toBe(2);
  });
});

describe('getLearnerSkillProfile', () => {
  it('happy path: returns all 10 (mocked as 2 here) current skills ordered by axis_order, with overall_proficiency averaged', async () => {
    defFindAll.mockResolvedValue([
      { skill_id: 'llm_core', name: 'LLM Core', axis_order: 0 },
      { skill_id: 'prompting', name: 'Prompting', axis_order: 1 },
    ]);
    archFindAll.mockResolvedValue([
      makeRow({ skill_id: 'llm_core', proficiency: 40, weights_version: 1 }),
      makeRow({ skill_id: 'prompting', proficiency: 60, weights_version: 1 }),
    ]);

    const profile = await getLearnerSkillProfile('e1');
    expect(profile.skills.map((s) => s.skill_id)).toEqual(['llm_core', 'prompting']);
    expect(profile.overall_proficiency).toBeCloseTo(50, 5);
    expect(profile.overall_placement).toBe(0);
    expect(evidenceFindAll).not.toHaveBeenCalled(); // no recompute needed — cached rows are current
  });

  it('boundary: recomputes on read when a skill has no cached row yet', async () => {
    defFindAll.mockResolvedValue([{ skill_id: 'llm_core', name: 'LLM Core', axis_order: 0 }]);
    archFindAll.mockResolvedValue([]); // no cached row
    evidenceFindAll.mockResolvedValue([]);
    archFindOrCreate.mockResolvedValue([makeRow({ skill_id: 'llm_core', weights_version: 1 }), true]);

    const profile = await getLearnerSkillProfile('e1');
    expect(profile.skills).toHaveLength(1);
    expect(evidenceFindAll).toHaveBeenCalled(); // recompute-on-read fired
  });
});
