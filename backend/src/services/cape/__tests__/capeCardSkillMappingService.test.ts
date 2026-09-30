/**
 * capeCardSkillMappingService.stampIfPublished — publish-time stamping tests
 * (design doc §7). Recursion safety is the property under test here: the stamp
 * write must go through TimelineCard's STATIC update (bulk), never an instance
 * save/update, or a model-level afterUpdate hook calling this would recurse.
 */
jest.mock('../capeCurriculumSkillMapService', () => ({
  resolveSkillMapping: jest.fn(),
}));
const mockTimelineCardUpdate = jest.fn();
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { update: (...args: any[]) => mockTimelineCardUpdate(...args) },
}));

import { resolveSkillMapping } from '../capeCurriculumSkillMapService';
import { stampIfPublished } from '../capeCardSkillMappingService';

const mockResolve = resolveSkillMapping as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockResolve.mockResolvedValue({ contract: { skill_impacts: [] }, source: 'type_default', map_id: 'm1', version: 1 });
  mockTimelineCardUpdate.mockResolvedValue([1]);
});

describe('stampIfPublished', () => {
  it('happy path: a published card resolves and stamps all 5 columns via the STATIC (bulk) update', async () => {
    await stampIfPublished({ id: 'c1', type: 'knowledge_check', week: 4, visibility: 'published' });
    expect(mockResolve).toHaveBeenCalledWith({ cardId: 'c1', typeSlug: 'knowledge_check', weekNumber: 4 });
    expect(mockTimelineCardUpdate).toHaveBeenCalledTimes(1);
    const [values, options] = mockTimelineCardUpdate.mock.calls[0];
    expect(values.skill_mapping_source).toBe('type_default');
    expect(values.skill_mapping_map_id).toBe('m1');
    expect(values.skill_mapping_version).toBe(1);
    expect(values.skill_mapping_resolved_at).toBeInstanceOf(Date);
    expect(options.where).toEqual({ id: 'c1' });
  });

  it('boundary: a draft card is left untouched — never resolves, never writes', async () => {
    await stampIfPublished({ id: 'c2', type: 'knowledge_check', week: 4, visibility: 'draft' });
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockTimelineCardUpdate).not.toHaveBeenCalled();
  });

  it('boundary: a scheduled card is left untouched', async () => {
    await stampIfPublished({ id: 'c3', type: 'knowledge_check', week: 4, visibility: 'scheduled' });
    expect(mockTimelineCardUpdate).not.toHaveBeenCalled();
  });

  it('failure: a resolution error is caught and logged, never thrown', async () => {
    mockResolve.mockRejectedValue(new Error('db unavailable'));
    await expect(stampIfPublished({ id: 'c1', type: 'knowledge_check', week: 4, visibility: 'published' })).resolves.toBeUndefined();
    expect(mockTimelineCardUpdate).not.toHaveBeenCalled();
  });

  it('failure: a write error is caught and logged, never thrown', async () => {
    mockTimelineCardUpdate.mockRejectedValue(new Error('constraint violation'));
    await expect(stampIfPublished({ id: 'c1', type: 'knowledge_check', week: 4, visibility: 'published' })).resolves.toBeUndefined();
  });

  it('idempotency: calling twice for the same card produces two identical stamp writes (safe to re-run)', async () => {
    await stampIfPublished({ id: 'c1', type: 'knowledge_check', week: 4, visibility: 'published' });
    await stampIfPublished({ id: 'c1', type: 'knowledge_check', week: 4, visibility: 'published' });
    expect(mockTimelineCardUpdate).toHaveBeenCalledTimes(2);
    const [firstValues] = mockTimelineCardUpdate.mock.calls[0];
    const [secondValues] = mockTimelineCardUpdate.mock.calls[1];
    expect(firstValues.skill_mapping_source).toBe(secondValues.skill_mapping_source);
    expect(firstValues.skill_mapping_map_id).toBe(secondValues.skill_mapping_map_id);
  });
});
