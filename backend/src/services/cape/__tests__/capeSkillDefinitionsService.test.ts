import ArchitectureSkillDefinition from '../../../models/ArchitectureSkillDefinition';
import { listCurrentSkillDefinitions, getSkillDefinitionHistory, updateSkillDefinition, SkillDefinitionNotFoundError } from '../capeSkillDefinitionsService';

jest.mock('../../../config/database', () => ({
  sequelize: { transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({})) },
}));
jest.mock('../../../models/ArchitectureSkillDefinition', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));

const findAll = ArchitectureSkillDefinition.findAll as unknown as jest.Mock;
const findOne = ArchitectureSkillDefinition.findOne as unknown as jest.Mock;
const create = ArchitectureSkillDefinition.create as unknown as jest.Mock;

function makeCurrentRow(overrides: Record<string, any> = {}) {
  const state: Record<string, any> = {
    id: 'd1', skill_id: 'prompting', version: 1, name: 'Prompting', description: 'old desc',
    axis_order: 1, crosswalk_competencies: ['prompt_engineering'], is_current: true, is_active: true,
    ...overrides,
  };
  state.update = jest.fn(async (patch: Record<string, any>) => { Object.assign(state, patch); return state; });
  return state;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listCurrentSkillDefinitions / getSkillDefinitionHistory', () => {
  it('happy path: lists current defs ordered by axis_order', async () => {
    findAll.mockResolvedValue([{ skill_id: 'llm_core' }]);
    const result = await listCurrentSkillDefinitions();
    expect(result).toEqual([{ skill_id: 'llm_core' }]);
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { is_current: true } }));
  });

  it('happy path: history returns all versions ordered ascending', async () => {
    findAll.mockResolvedValue([{ version: 1 }, { version: 2 }]);
    const result = await getSkillDefinitionHistory('prompting');
    expect(result).toHaveLength(2);
  });
});

describe('updateSkillDefinition', () => {
  it('happy path: a real edit inserts version+1 and flips is_current on the old row', async () => {
    const current = makeCurrentRow();
    findOne.mockResolvedValue(current);
    create.mockResolvedValue({ skill_id: 'prompting', version: 2, name: 'Prompting v2' });

    const result = await updateSkillDefinition('prompting', { name: 'Prompting v2' }, 'admin-1');
    expect(result.versioned).toBe(true);
    expect(current.update).toHaveBeenCalledWith({ is_current: false }, expect.anything());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 2, name: 'Prompting v2' }), expect.anything());
  });

  it('idempotency: a PUT identical to current values is a no-op — no new version, no update call', async () => {
    const current = makeCurrentRow();
    findOne.mockResolvedValue(current);

    const result = await updateSkillDefinition('prompting', { name: 'Prompting', description: 'old desc', axis_order: 1 }, 'admin-1');
    expect(result.versioned).toBe(false);
    expect(result.definition).toBe(current);
    expect(create).not.toHaveBeenCalled();
    expect(current.update).not.toHaveBeenCalled();
  });

  it('failure/boundary: unknown skillId throws SkillDefinitionNotFoundError (404-mapped) before any write', async () => {
    findOne.mockResolvedValue(null);
    await expect(updateSkillDefinition('not_a_skill', { name: 'x' })).rejects.toThrow(SkillDefinitionNotFoundError);
    expect(create).not.toHaveBeenCalled();
  });
});
