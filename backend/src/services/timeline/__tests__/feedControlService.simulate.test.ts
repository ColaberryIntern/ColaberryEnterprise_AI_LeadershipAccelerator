/**
 * CAPE Phase 4 T009 — Feed Control simulator extension (design doc §17 AC 9:
 * "Feed Control can simulate a specific learner and explain every inclusion,
 * exclusion, score, and rerank"). Tests the NEW `useCapeRanker` path added to
 * `simulate()` and confirms the pre-existing legacy path is unchanged.
 */
// NOTE: `config/database` is intentionally NOT wholesale-mocked here.
// `feedControlService.ts` transitively loads several real Sequelize models
// (SystemSetting via settingsService, CurriculumTypeDefinition, TimelineCard,
// Enrollment) that call `Model.init(..., { sequelize })` at module load —
// replacing the whole `sequelize` export with a bare `{query}` stub breaks
// EVERY one of those inits, not just this file's own queries. `sequelize.query`
// is spied on instead (same pattern as todayFeedComposer.capeFlagOn.test.ts).
import { sequelize } from '../../../config/database';
jest.spyOn(sequelize, 'query').mockResolvedValue([] as any);
jest.mock('../timelineService', () => ({ getFeed: jest.fn() }));
jest.mock('../feedConfigService', () => ({
  getFeedPolicy: jest.fn(),
  setFeedPolicy: jest.fn(),
  DEFAULT_FEED_POLICY: { todayCadence: 2, ambientProviders: ['blog'], defaultFrequencyCap: 0, defaultCooldownDays: 0, recencyHalfLifeDays: 21, explorationPct: 0.15, priorityWeight: 0.02 },
}));
jest.mock('../feedRanker', () => ({ rankCandidates: jest.fn() }));
jest.mock('../../cape/capeLearningValueRanker', () => ({ rankLearningValue: jest.fn() }));
jest.mock('../typeRegistry', () => ({
  resolve: jest.fn((slug: string) => ({ slug, home_surface: 'class', today_eligible: true, feed_mode: 'anchored', student_label: slug })),
  register: jest.fn(),
  allTypes: jest.fn(() => []),
}));
jest.mock('../../../config/env', () => {
  const actual = jest.requireActual('../../../config/env');
  return { env: { ...actual.env, capeLearningValueRankerEnabled: false, feedControlEnabled: false } };
});

import { simulate } from '../feedControlService';
import { getFeed } from '../timelineService';
import { getFeedPolicy } from '../feedConfigService';
import { rankCandidates } from '../feedRanker';
import { rankLearningValue } from '../../cape/capeLearningValueRanker';

const mockGetFeed = getFeed as unknown as jest.Mock;
const mockGetFeedPolicy = getFeedPolicy as unknown as jest.Mock;
const mockRankCandidates = rankCandidates as unknown as jest.Mock;
const mockRankLearningValue = rankLearningValue as unknown as jest.Mock;

const POLICY = { todayCadence: 2, ambientProviders: ['blog'], defaultFrequencyCap: 0, defaultCooldownDays: 0, recencyHalfLifeDays: 21, explorationPct: 0.15, priorityWeight: 0.02 };

const FEED_CARDS = [
  { id: 'card-1', type: 'implementation_task', title: 'MCP Lab', render_band: 'task', status: null, week: 5, created_at: new Date(), priority: 0 },
  { id: 'card-2', type: 'implementation_task', title: 'Advanced MCP', render_band: 'task', status: null, week: 6, created_at: new Date(), priority: 0 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFeedPolicy.mockResolvedValue(POLICY);
  mockGetFeed.mockResolvedValue({ cards: FEED_CARDS, is_explorer: false });
});

describe('simulate — legacy path unchanged when useCapeRanker is not requested and the flag is off', () => {
  it('uses rankCandidates (feedRanker), never touches rankLearningValue, and returns ranker: "legacy"', async () => {
    mockRankCandidates.mockReturnValue([
      { ref: 'card:card-1', type: 'implementation_task', surface: 'class', card_id: 'card-1', title: 'MCP Lab', render_band: 'task', student_label: 'implementation_task', week: 5, thumbnail: null, score: 0.8, reasons: ['baseline'] },
    ]);

    const result = await simulate('enr-1', 12);

    expect(mockRankCandidates).toHaveBeenCalled();
    expect(mockRankLearningValue).not.toHaveBeenCalled();
    expect(result.ranker).toBe('legacy');
    expect(result.excluded).toBeUndefined();
    expect(result.items[0]).toMatchObject({ kind: 'anchored', card_id: 'card-1', score: 0.8 });
  });
});

describe('simulate — useCapeRanker: true explains inclusion, exclusion, score, and rerank (design doc §17 AC 9)', () => {
  it('surfaces excluded candidates with their reason when a prerequisite is unmet', async () => {
    mockRankLearningValue.mockResolvedValue({
      items: [{
        ref: 'card:card-1', type: 'implementation_task', surface: 'class', card_id: 'card-1', title: 'MCP Lab',
        render_band: 'task', week: 5, rank_score: 0.85, reasons: ['closes a skill gap'],
        components: { skill_gap_fit: 0.9, prerequisite_sequence_fit: 1, goal_role_industry_fit: 0.5, evidence_balance_need: 0.5, freshness_field_importance: 0.5, time_modality_fit: 1, momentum_continuation_value: 0.5, live_community_urgency: 0.3, mismatch_penalty: 0 },
      }],
      excluded: [{ ref: 'card:card-2', reason: 'requires agents_mcp placement >= 60 (learner at 10)' }],
      policy_version: 1,
      learner_state_version: '2026-08-03T00:00:00.000Z',
    });

    const result = await simulate('enr-1', 12, undefined, { useCapeRanker: true });

    expect(mockRankLearningValue).toHaveBeenCalled();
    expect(mockRankCandidates).not.toHaveBeenCalled();
    expect(result.ranker).toBe('cape');
    expect(result.excluded).toEqual([{ ref: 'card:card-2', reason: 'requires agents_mcp placement >= 60 (learner at 10)' }]);
  });

  it('includes the Stage 3 score-component breakdown for at least one included item', async () => {
    mockRankLearningValue.mockResolvedValue({
      items: [{
        ref: 'card:card-1', type: 'implementation_task', surface: 'class', card_id: 'card-1', title: 'MCP Lab',
        render_band: 'task', week: 5, rank_score: 0.85, reasons: ['closes a skill gap'],
        components: { skill_gap_fit: 0.9, prerequisite_sequence_fit: 1, goal_role_industry_fit: 0.5, evidence_balance_need: 0.5, freshness_field_importance: 0.5, time_modality_fit: 1, momentum_continuation_value: 0.5, live_community_urgency: 0.3, mismatch_penalty: 0 },
      }],
      excluded: [],
      policy_version: 1,
      learner_state_version: '2026-08-03T00:00:00.000Z',
    });

    const result = await simulate('enr-1', 12, undefined, { useCapeRanker: true });

    const anchoredItem = result.items.find((i: any) => i.kind === 'anchored');
    expect(anchoredItem.components).toBeDefined();
    expect(anchoredItem.components.skill_gap_fit).toBe(0.9);
    expect(anchoredItem.score).toBe(0.85);
    expect(anchoredItem.reasons).toContain('closes a skill gap');
  });

  it('never persists anything — no INSERT/UPDATE queries, read-only regardless of which ranker is used', async () => {
    mockRankLearningValue.mockResolvedValue({ items: [], excluded: [], policy_version: 1, learner_state_version: 'v1' });
    const { sequelize } = require('../../../config/database');
    await simulate('enr-1', 12, undefined, { useCapeRanker: true });
    const writeCalls = (sequelize.query as jest.Mock).mock.calls.filter(([sql]: [string]) => /INSERT|UPDATE|DELETE/i.test(String(sql)));
    expect(writeCalls).toHaveLength(0);
  });
});

// The "env.capeLearningValueRankerEnabled true is an implicit trigger, with
// no explicit useCapeRanker param" behavior is covered in its own file,
// feedControlService.simulateCapeFlagOn.test.ts — a top-level env mock for a
// whole separate file (the same proven pattern todayFeedComposer.
// capeFlagOn.test.ts uses) rather than jest.isolateModulesAsync per-test
// module-registry surgery, which fought Jest's mock-hoisting order badly
// enough in this file (5+ dependency modules to re-mock consistently) that
// it wasn't worth the fragility for one assertion already implied by the
// `useCapeRanker` param tests above.
