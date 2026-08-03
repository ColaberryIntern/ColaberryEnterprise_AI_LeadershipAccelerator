import ArchitectureSkillDefinition from '../../../models/ArchitectureSkillDefinition';
import ArchitectureSkillEvidenceBandWeights from '../../../models/ArchitectureSkillEvidenceBandWeights';
import {
  seedArchitectureSkillDefinitions, seedEvidenceBandWeights, seedCapeConfig,
  ARCHITECTURE_SKILL_DEFINITION_SEEDS, DEFAULT_EVIDENCE_BAND_WEIGHTS,
} from '../capeSeeders';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/ArchitectureSkillDefinition', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn() },
}));
jest.mock('../../../models/ArchitectureSkillEvidenceBandWeights', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));

const defFindOrCreate = ArchitectureSkillDefinition.findOrCreate as unknown as jest.Mock;
const weightsFindOne = ArchitectureSkillEvidenceBandWeights.findOne as unknown as jest.Mock;
const weightsCreate = ArchitectureSkillEvidenceBandWeights.create as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('seedArchitectureSkillDefinitions', () => {
  it('happy path: seeds exactly the 10 canonical skill_ids, no typos or dupes, in §3 axis order', async () => {
    defFindOrCreate.mockResolvedValue([{}, true]);
    const n = await seedArchitectureSkillDefinitions();
    expect(n).toBe(10);
    expect(defFindOrCreate).toHaveBeenCalledTimes(10);

    const ids = ARCHITECTURE_SKILL_DEFINITION_SEEDS.map((s) => s.skill_id);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toEqual([
      'llm_core', 'prompting', 'rag', 'vectors', 'agents_mcp',
      'eval_guardrails', 'system_design', 'context_engineering', 'governance', 'deploy_ops',
    ]);
    // axis_order is 0..9, monotonic, matching array position
    ARCHITECTURE_SKILL_DEFINITION_SEEDS.forEach((s, i) => expect(s.axis_order).toBe(i));
  });

  it('idempotency: a second call where every skill_id already has a current row creates zero new rows', async () => {
    defFindOrCreate.mockResolvedValue([{}, false]);
    const n = await seedArchitectureSkillDefinitions();
    expect(n).toBe(0);
    expect(defFindOrCreate).toHaveBeenCalledTimes(10);
  });

  it('boundary: every seed has a non-empty crosswalk_competencies array', () => {
    for (const s of ARCHITECTURE_SKILL_DEFINITION_SEEDS) {
      expect(Array.isArray(s.crosswalk_competencies)).toBe(true);
      expect(s.crosswalk_competencies.length).toBeGreaterThan(0);
    }
  });
});

describe('seedEvidenceBandWeights', () => {
  it('happy path: seeds version 1 at 20/25/35/20 when no current row exists', async () => {
    weightsFindOne.mockResolvedValue(null);
    weightsCreate.mockResolvedValue({});
    const n = await seedEvidenceBandWeights();
    expect(n).toBe(1);
    expect(weightsCreate).toHaveBeenCalledWith(expect.objectContaining({
      version: 1, is_current: true, ...DEFAULT_EVIDENCE_BAND_WEIGHTS,
    }));
    const sum = Object.values(DEFAULT_EVIDENCE_BAND_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('idempotency: a current row already existing is a no-op', async () => {
    weightsFindOne.mockResolvedValue({ id: 'w1', version: 1 });
    const n = await seedEvidenceBandWeights();
    expect(n).toBe(0);
    expect(weightsCreate).not.toHaveBeenCalled();
  });
});

describe('seedCapeConfig', () => {
  it('happy path: composes both seeders and reports counts', async () => {
    defFindOrCreate.mockResolvedValue([{}, true]);
    weightsFindOne.mockResolvedValue(null);
    weightsCreate.mockResolvedValue({});
    const result = await seedCapeConfig();
    expect(result).toEqual({ skillDefinitions: 10, weights: 1 });
  });
});
