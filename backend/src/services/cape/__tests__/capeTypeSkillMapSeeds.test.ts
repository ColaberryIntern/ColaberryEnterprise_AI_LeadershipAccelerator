/**
 * capeTypeSkillMapSeeds — type-default derivation + idempotent seeding tests
 * (design doc §7, §17 AC 4). The core regression this task exists to prove:
 * `knowledge_check` (and its empty-`competencies` siblings) now get a real,
 * non-empty skill mapping at the data layer, closing the exact Phase 0-1 gap named
 * in the request.
 */
jest.mock('../../../models/CurriculumSkillMap', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn() },
}));

import { allTypes } from '../../timeline/typeRegistry';
import CurriculumSkillMap from '../../../models/CurriculumSkillMap';
import {
  computeAllTypeSkillMapDrafts, computeTypeSkillMapDraft, seedTypeSkillMaps, POLICY_GROUPS,
} from '../capeTypeSkillMapSeeds';

const findOrCreate = CurriculumSkillMap.findOrCreate as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  findOrCreate.mockResolvedValue([{}, true]);
});

describe('computeAllTypeSkillMapDrafts', () => {
  const drafts = computeAllTypeSkillMapDrafts();
  const realSlugs = allTypes().map((t) => t.slug);

  it('produces exactly one draft per registered type — zero missing, zero duplicated', () => {
    expect(drafts.length).toBe(realSlugs.length);
    expect(drafts.length).toBe(50);
    const draftSlugs = drafts.map((d) => d.type_slug).sort();
    expect(draftSlugs).toEqual([...realSlugs].sort());
    expect(new Set(draftSlugs).size).toBe(draftSlugs.length); // no duplicates
  });

  it('every POLICY_GROUPS slug is a real registered type and every real type is in exactly one group', () => {
    const grouped = Object.values(POLICY_GROUPS).flat();
    expect(grouped.sort()).toEqual([...realSlugs].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('system/community/delivery-event types get an EXPLICIT zero-credit row (skill_impacts:[], not merely absent)', () => {
    for (const slug of [...POLICY_GROUPS.system, ...POLICY_GROUPS.community, ...POLICY_GROUPS.delivery_events]) {
      const draft = drafts.find((d) => d.type_slug === slug);
      expect(draft).toBeDefined();
      expect(draft!.skill_impacts).toEqual([]);
    }
  });

  it('THE Phase 0-1 gap regression: knowledge_check now has a non-empty skill_impacts array', () => {
    const draft = drafts.find((d) => d.type_slug === 'knowledge_check');
    expect(draft!.skill_impacts.length).toBeGreaterThan(0);
    expect(draft!.skill_impacts.every((i) => i.bands.includes('knowledge') || i.bands.includes('judgment'))).toBe(true);
  });

  it('every non-empty skill_impacts array has weights summing to 1.0 (±0.001)', () => {
    for (const draft of drafts) {
      if (draft.skill_impacts.length === 0) continue;
      const sum = draft.skill_impacts.reduce((s, i) => s + i.weight, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(0.002);
    }
  });

  it('the judgment/communication policy group always includes the judgment band', () => {
    for (const slug of POLICY_GROUPS.judgment) {
      const draft = drafts.find((d) => d.type_slug === slug);
      for (const impact of draft!.skill_impacts) {
        expect(impact.bands).toContain('judgment');
      }
    }
  });

  it('the intelligence/AI-Pulse policy group sets freshness_days (currentness expiry)', () => {
    for (const slug of POLICY_GROUPS.intelligence) {
      const draft = drafts.find((d) => d.type_slug === slug);
      expect(draft!.freshness_days).toBe(21);
    }
  });

  it('no draft is silently missing — every real type produces a defined draft object', () => {
    for (const slug of realSlugs) {
      expect(drafts.find((d) => d.type_slug === slug)).toBeDefined();
    }
  });
});

describe('computeTypeSkillMapDraft (single-type unit checks)', () => {
  it('prompt_lab (evidence_required + ai_evaluation, no github/instructor) resolves to prompting + context_engineering, medium application credit', () => {
    const def = allTypes().find((t) => t.slug === 'prompt_lab')!;
    const draft = computeTypeSkillMapDraft(def);
    const skillIds = draft.skill_impacts.map((i) => i.skill_id).sort();
    expect(skillIds).toEqual(['context_engineering', 'prompting']);
    expect(draft.skill_impacts.every((i) => i.credit_strength === 'medium' && i.bands.includes('application'))).toBe(true);
  });

  it('project_task (evidence_required + github_required + instructor_review) resolves to capstone credit', () => {
    const def = allTypes().find((t) => t.slug === 'project_task')!;
    const draft = computeTypeSkillMapDraft(def);
    expect(draft.skill_impacts.every((i) => i.credit_strength === 'capstone')).toBe(true);
  });

  it('milestone (system group) is explicit zero-credit with no freshness_days', () => {
    const def = allTypes().find((t) => t.slug === 'milestone')!;
    const draft = computeTypeSkillMapDraft(def);
    expect(draft.skill_impacts).toEqual([]);
    expect(draft.freshness_days).toBeNull();
  });
});

describe('seedTypeSkillMaps', () => {
  it('happy path: calls findOrCreate once per registered type, scoped to type + is_current', async () => {
    const result = await seedTypeSkillMaps();
    expect(findOrCreate).toHaveBeenCalledTimes(50);
    expect(result.created).toBe(50);
    const [firstCallArg] = findOrCreate.mock.calls[0];
    expect(firstCallArg.where.scope_type).toBe('type');
    expect(firstCallArg.where.is_current).toBe(true);
    expect(firstCallArg.defaults.source).toBe('human');
    expect(firstCallArg.defaults.approved).toBe(true);
    expect(firstCallArg.defaults.version).toBe(1);
  });

  it('idempotency: re-running when every type already has a current row creates nothing new', async () => {
    findOrCreate.mockResolvedValue([{}, false]); // findOrCreate returns wasCreated:false every time
    const result = await seedTypeSkillMaps();
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(50);
  });
});
