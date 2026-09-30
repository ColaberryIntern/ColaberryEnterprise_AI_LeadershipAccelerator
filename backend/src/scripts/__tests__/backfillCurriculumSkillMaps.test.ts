/**
 * backfillCurriculumSkillMaps — idempotent, resolution-reusing backfill tests
 * (design doc §16 Phase 3 "Backfill current published cards with reviewed
 * mappings"). `backfillCards()` takes an already-loaded card list (same testable
 * shape as `backfillTimelineVideoDurations.test.ts`), so these tests exercise the
 * full decision logic without mocking `TimelineCard.findAll`.
 */
jest.mock('../../services/cape/capeCurriculumSkillMapService', () => ({
  resolveSkillMapping: jest.fn(),
}));

import { resolveSkillMapping } from '../../services/cape/capeCurriculumSkillMapService';
import { needsBackfill, backfillCards } from '../backfillCurriculumSkillMaps';

const mockResolve = resolveSkillMapping as unknown as jest.Mock;

function card(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    type: 'knowledge_check',
    week: 4,
    visibility: 'published',
    skill_mapping: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolve.mockResolvedValue({ contract: { skill_impacts: [{ skill_id: 'agents_mcp', weight: 1 }] }, source: 'type_default', map_id: 'm1', version: 1 });
});

describe('needsBackfill', () => {
  it('is true for a published card with no stamped skill_mapping', () => {
    expect(needsBackfill({ visibility: 'published', skill_mapping: null })).toBe(true);
  });
  it('is false once a skill_mapping is already stamped (idempotency guard)', () => {
    expect(needsBackfill({ visibility: 'published', skill_mapping: { skill_impacts: [] } })).toBe(false);
  });
  it('is false for a draft/scheduled/archived card, even with no stamp', () => {
    expect(needsBackfill({ visibility: 'draft', skill_mapping: null })).toBe(false);
    expect(needsBackfill({ visibility: 'scheduled', skill_mapping: null })).toBe(false);
    expect(needsBackfill({ visibility: 'archived', skill_mapping: null })).toBe(false);
  });
});

describe('backfillCards', () => {
  it('happy path: resolves and writes the stamp for an unstamped published card', async () => {
    const c = card('c1');
    const summary = await backfillCards([c], true, () => {});
    expect(summary.stamped).toBe(1);
    expect(summary.errors).toBe(0);
    expect(mockResolve).toHaveBeenCalledWith({ cardId: 'c1', typeSlug: 'knowledge_check', weekNumber: 4 });
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({
      skill_mapping_source: 'type_default', skill_mapping_map_id: 'm1', skill_mapping_version: 1,
    }));
  });

  it('dry run: computes the stamp but never calls card.update', async () => {
    const c = card('c1');
    const summary = await backfillCards([c], false, () => {});
    expect(summary.stamped).toBe(1);
    expect(c.update).not.toHaveBeenCalled();
  });

  it('idempotency: an already-stamped card is skipped with ZERO resolution calls', async () => {
    const c = card('c1', { skill_mapping: { skill_impacts: [] } });
    const summary = await backfillCards([c], true, () => {});
    expect(summary.skipped_already_done).toBe(1);
    expect(summary.stamped).toBe(0);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(c.update).not.toHaveBeenCalled();
  });

  it('re-running twice against the same (now-stamped) data set is a total no-op the second time', async () => {
    const c1 = card('c1');
    await backfillCards([c1], true, () => {});
    // Simulate the DB now reflecting the write (what a real re-run would load).
    jest.clearAllMocks();
    const c1Reloaded = card('c1', { skill_mapping: { skill_impacts: [{ skill_id: 'agents_mcp', weight: 1 }] } });
    const summary2 = await backfillCards([c1Reloaded], true, () => {});
    expect(summary2.skipped_already_done).toBe(1);
    expect(summary2.stamped).toBe(0);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('boundary: a card whose type/week resolves to source:"none" is logged and left unstamped, not crashed on', async () => {
    mockResolve.mockResolvedValue({ contract: { skill_impacts: [] }, source: 'none', map_id: null, version: null });
    const logs: string[] = [];
    const c = card('c1', { type: 'not_a_real_type' });
    const summary = await backfillCards([c], true, (m) => logs.push(m));
    expect(summary.skipped_unresolved).toBe(1);
    expect(summary.stamped).toBe(0);
    expect(c.update).not.toHaveBeenCalled();
    expect(logs.some((l) => l.includes('backfill_unresolved_card'))).toBe(true);
  });

  it('failure: a resolution error on one card is caught, counted, and does not crash the batch', async () => {
    mockResolve.mockRejectedValueOnce(new Error('db unavailable')).mockResolvedValueOnce({ contract: { skill_impacts: [] }, source: 'type_default', map_id: 'm2', version: 1 });
    const cards = [card('broken'), card('ok')];
    const summary = await backfillCards(cards, true, () => {});
    expect(summary.errors).toBe(1);
    expect(summary.stamped).toBe(1);
  });

  it('boundary: an empty card list returns a zeroed summary without error', async () => {
    const summary = await backfillCards([], true, () => {});
    expect(summary).toEqual({ total: 0, stamped: 0, skipped_already_done: 0, skipped_unresolved: 0, errors: 0 });
  });
});
