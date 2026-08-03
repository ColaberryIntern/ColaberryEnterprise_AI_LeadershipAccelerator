/**
 * capeWeekSkillMapSeeds — Week 0-12 target derivation + idempotent seeding tests
 * (design doc §8, the second resolution tier from §7).
 */
jest.mock('../../../models/CurriculumSkillMap', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn() },
}));
jest.mock('../../../models/CurriculumBlueprint', () => ({
  __esModule: true,
  default: { count: jest.fn() },
}));

import CurriculumSkillMap from '../../../models/CurriculumSkillMap';
import CurriculumBlueprint from '../../../models/CurriculumBlueprint';
import {
  computeAllWeekSkillMapDrafts, computeWeekSkillMapDraft, seedWeekSkillMaps, WEEK_PRIMARY_SKILLS,
} from '../capeWeekSkillMapSeeds';

const findOrCreate = CurriculumSkillMap.findOrCreate as unknown as jest.Mock;
const count = CurriculumBlueprint.count as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  findOrCreate.mockResolvedValue([{}, true]);
  count.mockResolvedValue(1);
});

describe('computeAllWeekSkillMapDrafts', () => {
  it('produces exactly 13 drafts (Weeks 0-12)', () => {
    const drafts = computeAllWeekSkillMapDrafts();
    expect(drafts.length).toBe(13);
    expect(drafts.map((d) => d.week_number).sort((a, b) => a - b)).toEqual([0,1,2,3,4,5,6,7,8,9,10,11,12]);
  });

  it('every week has weights summing to 1.0', () => {
    for (const draft of computeAllWeekSkillMapDrafts()) {
      const sum = draft.skill_impacts.reduce((s, i) => s + i.weight, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(0.002);
    }
  });

  it('Week 4 includes rag — the design doc\'s stated RAG anchor week', () => {
    const draft = computeWeekSkillMapDraft(4);
    expect(draft.skill_impacts.map((i) => i.skill_id)).toContain('rag');
  });

  it('Week 12 includes a "strongest 4" subset matching §8\'s text (System Design, Governance, Eval, Deploy & Ops)', () => {
    const draft = computeWeekSkillMapDraft(12);
    const skillIds = draft.skill_impacts.map((i) => i.skill_id).sort();
    expect(skillIds).toEqual(['deploy_ops', 'eval_guardrails', 'governance', 'system_design']);
  });

  it('Week 0 (free preview) has a low recommended_range ceiling', () => {
    const draft = computeWeekSkillMapDraft(0);
    expect(draft.recommended_range.max).toBeLessThanOrEqual(30);
  });

  it('WEEK_PRIMARY_SKILLS has no week outside 0-12', () => {
    const weeks = Object.keys(WEEK_PRIMARY_SKILLS).map(Number);
    expect(Math.min(...weeks)).toBe(0);
    expect(Math.max(...weeks)).toBe(12);
    expect(weeks.length).toBe(13);
  });
});

describe('seedWeekSkillMaps', () => {
  it('happy path: seeds exactly 13 week-scope rows, idempotent re-run is a no-op', async () => {
    const first = await seedWeekSkillMaps();
    expect(findOrCreate).toHaveBeenCalledTimes(13);
    expect(first.created).toBe(13);

    jest.clearAllMocks();
    findOrCreate.mockResolvedValue([{}, false]); // already current on 2nd run
    count.mockResolvedValue(1);
    const second = await seedWeekSkillMaps();
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(13);
  });

  it('boundary: logs (does not throw) when a week has zero matching CurriculumBlueprint rows', async () => {
    count.mockResolvedValue(0);
    const result = await seedWeekSkillMaps();
    expect(result.blueprintGapsLogged).toBe(13);
    expect(result.created).toBe(13); // the skill-map row still seeds regardless of blueprint grounding
  });

  it('failure: a blueprint-count query error is caught and logged, never thrown, and does not block the skill-map seed', async () => {
    count.mockRejectedValue(new Error('db unavailable'));
    await expect(seedWeekSkillMaps()).resolves.toBeDefined();
  });
});
