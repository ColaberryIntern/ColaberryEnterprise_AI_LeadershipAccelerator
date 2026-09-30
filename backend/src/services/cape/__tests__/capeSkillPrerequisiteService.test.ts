/**
 * capeSkillPrerequisiteService + capeSkillPrerequisiteSeeds tests (design doc §13).
 */
jest.mock('../../../models/ArchitectureSkillPrerequisite', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), findOrCreate: jest.fn() },
}));

import ArchitectureSkillPrerequisite from '../../../models/ArchitectureSkillPrerequisite';
import { list, upsert, deactivate, CapeSkillPrerequisiteValidationError } from '../capeSkillPrerequisiteService';
import { seedSkillPrerequisites, SKILL_PREREQUISITE_SEEDS } from '../capeSkillPrerequisiteSeeds';

const findAll = ArchitectureSkillPrerequisite.findAll as unknown as jest.Mock;
const findOne = ArchitectureSkillPrerequisite.findOne as unknown as jest.Mock;
const create = ArchitectureSkillPrerequisite.create as unknown as jest.Mock;
const findOrCreate = ArchitectureSkillPrerequisite.findOrCreate as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('list', () => {
  it('happy path: only returns active edges, optionally filtered by skill_id', async () => {
    findAll.mockResolvedValueOnce([]);
    await list('agents_mcp');
    const [arg] = findAll.mock.calls[0];
    expect(arg.where).toEqual({ is_active: true, skill_id: 'agents_mcp' });
  });
});

describe('upsert', () => {
  it('happy path: creates a new edge when none exists for the pair', async () => {
    findOne.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: 'edge-1' });
    const result = await upsert({ skill_id: 'agents_mcp', prerequisite_skill_id: 'llm_core', min_placement: 30 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ skill_id: 'agents_mcp', prerequisite_skill_id: 'llm_core', min_placement: 30, is_active: true }));
    expect(result).toEqual({ id: 'edge-1' });
  });

  it('happy path: updates min_placement in place for an existing ACTIVE edge rather than duplicating it', async () => {
    const existing = { id: 'edge-1', min_placement: 20, created_by: null, update: jest.fn() };
    findOne.mockResolvedValueOnce(existing);
    await upsert({ skill_id: 'agents_mcp', prerequisite_skill_id: 'llm_core', min_placement: 45 });
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ min_placement: 45, is_active: true }));
    expect(create).not.toHaveBeenCalled();
  });

  it('reversibility: reactivates a previously-deactivated edge with the new min_placement instead of creating a duplicate', async () => {
    const existing = { id: 'edge-1', min_placement: 20, is_active: false, created_by: null, update: jest.fn() };
    findOne.mockResolvedValueOnce(existing);
    await upsert({ skill_id: 'agents_mcp', prerequisite_skill_id: 'llm_core', min_placement: 25 });
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ is_active: true }));
    expect(create).not.toHaveBeenCalled();
  });

  it('failure: a self-referencing edge is rejected before any DB call', async () => {
    await expect(upsert({ skill_id: 'llm_core', prerequisite_skill_id: 'llm_core', min_placement: 10 }))
      .rejects.toThrow(CapeSkillPrerequisiteValidationError);
    expect(findOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('deactivate', () => {
  it('happy path: sets is_active:false rather than deleting', async () => {
    const existing = { update: jest.fn() };
    findOne.mockResolvedValueOnce(existing);
    const result = await deactivate('agents_mcp', 'llm_core');
    expect(existing.update).toHaveBeenCalledWith({ is_active: false });
    expect(result.deactivated).toBe(true);
  });

  it('boundary: a no-op (not an error) when the edge does not exist', async () => {
    findOne.mockResolvedValueOnce(null);
    const result = await deactivate('agents_mcp', 'nonexistent');
    expect(result.deactivated).toBe(false);
  });
});

describe('SKILL_PREREQUISITE_SEEDS', () => {
  it('boundary: the seeded graph has no self-referencing edge (skill_id !== prerequisite_skill_id)', () => {
    for (const edge of SKILL_PREREQUISITE_SEEDS) {
      expect(edge.skill_id).not.toBe(edge.prerequisite_skill_id);
    }
  });

  it('boundary: no duplicate (skill_id, prerequisite_skill_id) pair in the seed list', () => {
    const pairs = SKILL_PREREQUISITE_SEEDS.map((e) => `${e.skill_id}:${e.prerequisite_skill_id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe('seedSkillPrerequisites', () => {
  it('happy path: idempotent — a duplicate seed run creates nothing new', async () => {
    findOrCreate.mockResolvedValueOnce([{}, true]);
    findOrCreate.mockResolvedValue([{}, false]); // subsequent calls in this run + re-run
    const first = await seedSkillPrerequisites();
    expect(first.created).toBe(1);
    expect(first.skipped).toBe(SKILL_PREREQUISITE_SEEDS.length - 1);

    jest.clearAllMocks();
    findOrCreate.mockResolvedValue([{}, false]);
    const second = await seedSkillPrerequisites();
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(SKILL_PREREQUISITE_SEEDS.length);
  });
});
