/**
 * CAPE Phase 4 T009 — companion to feedControlService.simulate.test.ts.
 * Isolated into its own file (top-level env mock forces the flag true for
 * every test here) because simulate() has enough dependencies that doing
 * this per-test via jest.isolateModulesAsync fought Jest's mock-hoisting
 * order — same reasoning as todayFeedComposer.capeFlagOn.test.ts, which uses
 * the identical whole-file-env-mock pattern successfully.
 */
jest.mock('../../../config/env', () => {
  const actual = jest.requireActual('../../../config/env');
  return { env: { ...actual.env, capeLearningValueRankerEnabled: true, feedControlEnabled: false } };
});
jest.mock('../timelineService', () => ({ getFeed: jest.fn() }));
jest.mock('../feedConfigService', () => ({ getFeedPolicy: jest.fn(), setFeedPolicy: jest.fn() }));
jest.mock('../feedRanker', () => ({ rankCandidates: jest.fn() }));
jest.mock('../../cape/capeLearningValueRanker', () => ({ rankLearningValue: jest.fn() }));
jest.mock('../typeRegistry', () => ({
  resolve: jest.fn((slug: string) => ({ slug, home_surface: 'class', today_eligible: true, feed_mode: 'anchored', student_label: slug })),
  register: jest.fn(),
  allTypes: jest.fn(() => []),
}));

import { sequelize } from '../../../config/database';
jest.spyOn(sequelize, 'query').mockResolvedValue([] as any);

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
const FEED_CARDS = [{ id: 'card-1', type: 'implementation_task', title: 'MCP Lab', render_band: 'task', status: null, week: 5, created_at: new Date(), priority: 0 }];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFeedPolicy.mockResolvedValue(POLICY);
  mockGetFeed.mockResolvedValue({ cards: FEED_CARDS, is_explorer: false });
  mockRankLearningValue.mockResolvedValue({ items: [], excluded: [], policy_version: 1, learner_state_version: 'v1' });
});

describe('simulate — env.capeLearningValueRankerEnabled true is an implicit trigger, no explicit useCapeRanker param needed', () => {
  it('routes through rankLearningValue and never calls the legacy rankCandidates', async () => {
    const result = await simulate('enr-1', 12);
    expect(mockRankLearningValue).toHaveBeenCalled();
    expect(mockRankCandidates).not.toHaveBeenCalled();
    expect(result.ranker).toBe('cape');
  });
});
