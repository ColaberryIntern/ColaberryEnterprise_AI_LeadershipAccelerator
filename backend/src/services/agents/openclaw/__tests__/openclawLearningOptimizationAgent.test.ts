/**
 * OpenclawLearningOptimizationAgent — metric_key overflow guard.
 *
 * OpenclawLearning.metric_key is varchar(200). The topic-keyword branch
 * (runOpenclawLearningOptimizationAgent, "Topic performance" section) falls
 * back to splitting a signal's title into words when topic_tags is empty.
 * That fallback degrades to a single whitespace-free token — routinely
 * >200 chars — when the title itself is a raw URL, which
 * extractContentFromUrl() (openclawRoutes.ts) writes as `title: url` on any
 * scrape failure. Reachable in production: manually-submitted signals carry
 * topic_tags: [] (openclawRoutes.ts:1004,1129,1370,1404,1507 and
 * -Ali-AI.ts:719,778,951). Same overflow shape as the
 * ai_agent_activity_logs.action bug fixed at aiEventService.ts:39-44; this
 * fix truncates the value at the write boundary the same way (fitMetricKey).
 */
jest.mock('../../../../config/database', () => ({ sequelize: {} }));
jest.mock('../../../../models', () => ({
  OpenclawResponse: { findAll: jest.fn() },
  OpenclawLearning: { findOrCreate: jest.fn() },
  OpenclawSignal: { findByPk: jest.fn() },
  EngagementEvent: { count: jest.fn() },
  OpenclawConversation: { findAll: jest.fn() },
}));

import { runOpenclawLearningOptimizationAgent } from '../openclawLearningOptimizationAgent';
import { OpenclawResponse, OpenclawLearning, OpenclawSignal, EngagementEvent, OpenclawConversation } from '../../../../models';

const findAllResponses = OpenclawResponse.findAll as jest.Mock;
const findOrCreateLearning = OpenclawLearning.findOrCreate as jest.Mock;
const findByPkSignal = OpenclawSignal.findByPk as jest.Mock;
const countEngagement = EngagementEvent.count as jest.Mock;
const findAllConversation = OpenclawConversation.findAll as jest.Mock;

const METRIC_KEY_MAX_LENGTH = 200;

// Three responses on the SAME signal so the topic-performance branch's
// `data.count < 3` guard is satisfied (it skips groups with < 3 members).
function threeResponsesOnOneSignal(signalId: string) {
  return [
    { id: 'r1', platform: 'reddit', tone: 'educational', signal_id: signalId, engagement_metrics: { engagement_score: 5 } },
    { id: 'r2', platform: 'reddit', tone: 'educational', signal_id: signalId, engagement_metrics: { engagement_score: 6 } },
    { id: 'r3', platform: 'reddit', tone: 'educational', signal_id: signalId, engagement_metrics: { engagement_score: 7 } },
  ];
}

describe('OpenclawLearningOptimizationAgent — topic metric_key overflow guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findOrCreateLearning.mockResolvedValue([{ update: jest.fn() }, true]);
    countEngagement.mockResolvedValue(0);
    findAllConversation.mockResolvedValue([]);
  });

  it('happy path: a short title produces short, untouched metric_key values', async () => {
    findAllResponses.mockResolvedValue(threeResponsesOnOneSignal('sig-1'));
    findByPkSignal.mockResolvedValue({ title: 'A short real title here', topic_tags: [] });

    await runOpenclawLearningOptimizationAgent('agent-1', { min_sample_size: 3 });

    const topicWrites = findOrCreateLearning.mock.calls.filter(
      ([args]) => args.where.learning_type === 'topic_performance',
    );
    expect(topicWrites.length).toBeGreaterThan(0);
    for (const [args] of topicWrites) {
      expect(args.where.metric_key.length).toBeLessThanOrEqual(METRIC_KEY_MAX_LENGTH);
      // Real words from the short title, not fabricated/truncated.
      expect(['short', 'title', 'here']).toContain(args.where.metric_key);
    }
  });

  it('reproduces the real overflow condition: topic_tags empty + title fallen back to a raw URL truncates instead of overflowing', async () => {
    findAllResponses.mockResolvedValue(threeResponsesOnOneSignal('sig-2'));
    // The exact shape extractContentFromUrl() produces on a scrape failure:
    // title: url, topic_tags: [] — a single whitespace-free token > 200 chars.
    const overflowingUrl =
      'https://example.com/a/very/long/path/segment/that/keeps/going/' +
      'and/going/with/no/spaces/anywhere/in/it/so/the/per-word/length/' +
      'filter/on/whitespace/split/never/applies/and/the/whole/string/' +
      'is/used/as/a/single/token/well/past/two/hundred/characters/total';
    expect(overflowingUrl.length).toBeGreaterThan(METRIC_KEY_MAX_LENGTH);
    findByPkSignal.mockResolvedValue({ title: overflowingUrl, topic_tags: [] });

    await expect(
      runOpenclawLearningOptimizationAgent('agent-1', { min_sample_size: 3 }),
    ).resolves.toBeDefined();

    const topicWrites = findOrCreateLearning.mock.calls.filter(
      ([args]) => args.where.learning_type === 'topic_performance',
    );
    expect(topicWrites.length).toBe(1);
    const writtenKey = topicWrites[0][0].where.metric_key;
    expect(writtenKey.length).toBeLessThanOrEqual(METRIC_KEY_MAX_LENGTH);
    expect(writtenKey.endsWith('…')).toBe(true);
    expect(writtenKey.startsWith(overflowingUrl.slice(0, 30))).toBe(true);
  });

  it('boundary: a topic_tag sitting exactly on the 200-char limit is kept intact, untruncated', async () => {
    findAllResponses.mockResolvedValue(threeResponsesOnOneSignal('sig-3'));
    const exactTag = 'x'.repeat(METRIC_KEY_MAX_LENGTH);
    findByPkSignal.mockResolvedValue({ title: 'irrelevant', topic_tags: [exactTag] });

    await runOpenclawLearningOptimizationAgent('agent-1', { min_sample_size: 3 });

    const topicWrites = findOrCreateLearning.mock.calls.filter(
      ([args]) => args.where.learning_type === 'topic_performance',
    );
    expect(topicWrites.length).toBe(1);
    expect(topicWrites[0][0].where.metric_key).toBe(exactTag);
  });

  it('a supplied topic_tag longer than 200 chars is also truncated, not just the title-split fallback', async () => {
    findAllResponses.mockResolvedValue(threeResponsesOnOneSignal('sig-4'));
    const longTag = 'a'.repeat(METRIC_KEY_MAX_LENGTH + 40);
    findByPkSignal.mockResolvedValue({ title: 'irrelevant', topic_tags: [longTag] });

    await runOpenclawLearningOptimizationAgent('agent-1', { min_sample_size: 3 });

    const topicWrites = findOrCreateLearning.mock.calls.filter(
      ([args]) => args.where.learning_type === 'topic_performance',
    );
    expect(topicWrites.length).toBe(1);
    const writtenKey = topicWrites[0][0].where.metric_key;
    expect(writtenKey.length).toBeLessThanOrEqual(METRIC_KEY_MAX_LENGTH);
    expect(writtenKey.endsWith('…')).toBe(true);
  });
});
