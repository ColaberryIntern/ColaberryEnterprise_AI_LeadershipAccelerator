/**
 * capeCurriculumSkillMapService — resolution hierarchy (card -> week -> type) +
 * versioned write-path tests (design doc §7).
 */
jest.mock('../../../models/CurriculumSkillMap', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
  },
}));

import CurriculumSkillMap from '../../../models/CurriculumSkillMap';
import {
  resolveSkillMapping, createOrVersionMapping, listPendingAiDrafts, CapeCurriculumSkillMapValidationError,
} from '../capeCurriculumSkillMapService';

const findOne = CurriculumSkillMap.findOne as unknown as jest.Mock;
const findAll = CurriculumSkillMap.findAll as unknown as jest.Mock;
const create = CurriculumSkillMap.create as unknown as jest.Mock;

const validImpacts = [{ skill_id: 'agents_mcp', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 15 }];

function mockRow(overrides: Record<string, any>) {
  return {
    id: overrides.id ?? 'map-1',
    version: overrides.version ?? 1,
    skill_impacts: overrides.skill_impacts ?? validImpacts,
    prerequisite_skills: overrides.prerequisite_skills ?? [],
    recommended_range: overrides.recommended_range ?? { min: 20, max: 70 },
    freshness_days: overrides.freshness_days ?? null,
    reviewable: overrides.reviewable ?? true,
    update: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveSkillMapping', () => {
  it('happy path: a card override wins over a week mapping and a type default', async () => {
    findOne.mockResolvedValueOnce(mockRow({ id: 'card-map', version: 2 })); // card lookup
    const result = await resolveSkillMapping({ cardId: 'c1', typeSlug: 'knowledge_check', weekNumber: 4 });
    expect(result.source).toBe('card_override');
    expect(result.map_id).toBe('card-map');
    // only the card lookup should have run — week/type lookups short-circuit
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('happy path: a week mapping wins over a type default when no card override exists (no cardId passed, so the card branch never queries — the week lookup is the first and only findOne call)', async () => {
    findOne.mockResolvedValueOnce(mockRow({ id: 'week-map', version: 1 })); // week lookup (first call, since cardId is absent)
    const result = await resolveSkillMapping({ typeSlug: 'knowledge_check', weekNumber: 4 });
    expect(result.source).toBe('week_blueprint');
    expect(result.map_id).toBe('week-map');
    expect(findOne).toHaveBeenCalledTimes(1); // type lookup never runs — week already resolved
  });

  it('happy path: falls back to the type default when neither card nor week resolves', async () => {
    findOne
      .mockResolvedValueOnce(null) // week
      .mockResolvedValueOnce(mockRow({ id: 'type-map', version: 3 })); // type
    const result = await resolveSkillMapping({ typeSlug: 'knowledge_check', weekNumber: 4 });
    expect(result.source).toBe('type_default');
    expect(result.map_id).toBe('type-map');
  });

  it('boundary: returns source "none" (never throws) when nothing resolves', async () => {
    findOne.mockResolvedValue(null);
    const result = await resolveSkillMapping({ typeSlug: 'nonexistent_type' });
    expect(result.source).toBe('none');
    expect(result.map_id).toBeNull();
    expect(result.contract.skill_impacts).toEqual([]);
  });

  it('failure/anti-gaming: an unapproved AI-suggested draft never resolves — resolveSkillMapping only queries approved:true rows', async () => {
    await resolveSkillMapping({ typeSlug: 'knowledge_check' });
    const [whereArg] = findOne.mock.calls[0];
    expect(whereArg.where.approved).toBe(true);
  });
});

describe('createOrVersionMapping', () => {
  it('happy path: creates version 1 when no current mapping exists for the scope key', async () => {
    findOne.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce(mockRow({ version: 1 }));
    const result = await createOrVersionMapping({
      scope_type: 'type', type_slug: 'knowledge_check',
      skill_impacts: validImpacts as any, prerequisite_skills: [], recommended_range: { min: 20, max: 70 },
      reviewable: true, source: 'human',
    } as any);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 1, is_current: true, approved: true }));
    expect(result.version).toBe(1);
  });

  it('happy path: editing an existing mapping flips the old row is_current=false and inserts version+1, never mutating the old row\'s content', async () => {
    const oldRow = mockRow({ id: 'old', version: 1 });
    findOne.mockResolvedValueOnce(oldRow);
    create.mockResolvedValueOnce(mockRow({ id: 'new', version: 2 }));

    const result = await createOrVersionMapping({
      scope_type: 'type', type_slug: 'knowledge_check',
      skill_impacts: validImpacts as any, prerequisite_skills: [], recommended_range: { min: 20, max: 70 },
      reviewable: true, source: 'human',
    } as any);

    expect(oldRow.update).toHaveBeenCalledWith({ is_current: false });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 2, is_current: true }));
    expect(result.version).toBe(2);
    // the old row's own skill_impacts/etc were never touched by an update call other than is_current
    expect(oldRow.update).toHaveBeenCalledTimes(1);
  });

  it('anti-gaming: an ai_suggested source is always forced to approved:false regardless of what the caller passes', async () => {
    findOne.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce(mockRow({ version: 1 }));
    await createOrVersionMapping({
      scope_type: 'type', type_slug: 'knowledge_check',
      skill_impacts: validImpacts as any, prerequisite_skills: [], recommended_range: { min: 20, max: 70 },
      reviewable: true, source: 'ai_suggested',
    } as any);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ approved: false }));
  });

  it('failure: invalid input (weights not summing to 1.0) is rejected before any DB write', async () => {
    await expect(createOrVersionMapping({
      scope_type: 'type', type_slug: 'knowledge_check',
      skill_impacts: [{ ...validImpacts[0], weight: 0.4 }] as any,
      prerequisite_skills: [], recommended_range: { min: 20, max: 70 }, reviewable: true, source: 'human',
    } as any)).rejects.toThrow(CapeCurriculumSkillMapValidationError);
    expect(create).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe('listPendingAiDrafts', () => {
  it('happy path: only queries source:ai_suggested, approved:false, is_current:true rows', async () => {
    findAll.mockResolvedValueOnce([]);
    await listPendingAiDrafts();
    const [arg] = findAll.mock.calls[0];
    expect(arg.where).toEqual({ source: 'ai_suggested', approved: false, is_current: true });
  });
});
