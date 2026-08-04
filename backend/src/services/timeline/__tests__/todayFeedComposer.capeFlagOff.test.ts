/**
 * CAPE Phase 4 (design doc §9, §16 Phase 4) — flag-off regression baseline.
 *
 * `selectAnchoredOrder` is the single seam both `extendFeed` and
 * `composeReadOnlyPage` route the anchored queue through before consumption.
 * This is the run's single most important acceptance criterion: with
 * CAPE_LEARNING_VALUE_RANKER_ENABLED unset/false (the default everywhere,
 * including production), Today feed ranking must be byte-identical to
 * pre-Phase-4 behavior. Proven here by reference identity (`toBe`, not
 * `toEqual`) so even a same-shape-but-reordered/copied array would fail this
 * test — the only correct flag-off implementation is "do nothing at all."
 *
 * Later Phase 4 tasks (T008) add the flag-ON branch to `selectAnchoredOrder`;
 * this file's flag-off assertions must keep passing unchanged through every
 * subsequent task in this run.
 */
// T008 addition (does not alter any T001 assertion above/below): mocked so
// the new flag-off test for `applyCapeRankingIfEnabled` can assert
// rankLearningValue is NEVER called when the flag is off — the exact gate a
// task-verifier sabotage run proved was otherwise uncovered (removing the
// `!env.capeLearningValueRankerEnabled` check left every existing test in
// this file AND in capeFlagOn.test.ts fully green).
jest.mock('../../cape/capeLearningValueRanker', () => ({ rankLearningValue: jest.fn() }));

import { selectAnchoredOrder, applyCapeRankingIfEnabled, type TodayFeedItem } from '../todayFeedComposer';
import { rankLearningValue } from '../../cape/capeLearningValueRanker';

const mockRankLearningValue = rankLearningValue as unknown as jest.Mock;

function mkItem(ref: string): TodayFeedItem {
  return {
    position: 0,
    kind: 'anchored',
    ref,
    surface: 'today',
    type: 'implementation_task',
    render_band: 'task',
    card_id: `card-${ref}`,
    title: ref,
    subtitle: null,
    description: null,
    image: null,
    video: null,
    blog: null,
    content: null,
    week: 1,
    estimated_time: 15,
    status: null,
    interacted: false,
  };
}

describe('selectAnchoredOrder — CAPE Phase 4 flag-off regression baseline', () => {
  it('flag off: returns the EXACT SAME array reference gatherAnchored produced (identity, not just equality)', () => {
    const queue = [mkItem('a'), mkItem('b'), mkItem('c')];
    const result = selectAnchoredOrder(queue, false);
    expect(result).toBe(queue);
  });

  it('flag off: order is unchanged for a realistic multi-item queue', () => {
    const queue = [mkItem('w1-lesson'), mkItem('w1-lab'), mkItem('w1-check'), mkItem('w2-lesson')];
    const result = selectAnchoredOrder(queue, false);
    expect(result.map((i) => i.ref)).toEqual(['w1-lesson', 'w1-lab', 'w1-check', 'w2-lesson']);
  });

  it('boundary: empty queue stays empty, flag off or on', () => {
    expect(selectAnchoredOrder([], false)).toEqual([]);
    expect(selectAnchoredOrder([], true)).toEqual([]);
  });

  it('flag currently a no-op passthrough on BOTH branches until a later Phase 4 task wires real ranking behind the flag (prevents a half-built composer from silently changing production ranking)', () => {
    const queue = [mkItem('a'), mkItem('b')];
    expect(selectAnchoredOrder(queue, true)).toBe(queue);
  });
});

describe('env.capeLearningValueRankerEnabled — default OFF', () => {
  const ORIGINAL_ENV = process.env.CAPE_LEARNING_VALUE_RANKER_ENABLED;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.CAPE_LEARNING_VALUE_RANKER_ENABLED;
    else process.env.CAPE_LEARNING_VALUE_RANKER_ENABLED = ORIGINAL_ENV;
    jest.resetModules();
  });

  it('defaults to false when CAPE_LEARNING_VALUE_RANKER_ENABLED is unset', () => {
    jest.resetModules();
    delete process.env.CAPE_LEARNING_VALUE_RANKER_ENABLED;
    const { env } = require('../../../config/env');
    expect(env.capeLearningValueRankerEnabled).toBe(false);
  });

  it('reads true only when explicitly set to the string "true"', () => {
    jest.resetModules();
    process.env.CAPE_LEARNING_VALUE_RANKER_ENABLED = 'true';
    const { env } = require('../../../config/env');
    expect(env.capeLearningValueRankerEnabled).toBe(true);
  });

  it('stays false for any other truthy-looking string (e.g. "1", "yes") — matches the strict === \'true\' convention used by sibling flags', () => {
    jest.resetModules();
    process.env.CAPE_LEARNING_VALUE_RANKER_ENABLED = '1';
    const { env } = require('../../../config/env');
    expect(env.capeLearningValueRankerEnabled).toBe(false);
  });
});

/**
 * T008 addition. `applyCapeRankingIfEnabled` (added in T008) is the function
 * that actually decides, at runtime, whether to call the CAPE ranker at all.
 * Unlike `selectAnchoredOrder` above (a pure passthrough regardless of the
 * flag — real ranking never lived there), THIS is the real gate. This suite
 * uses the REAL `env` singleton this file already imports at module load
 * (unmocked — `CAPE_LEARNING_VALUE_RANKER_ENABLED` is not set in the test
 * process, so `env.capeLearningValueRankerEnabled` is false here exactly as
 * it is in production by default), so this exercises the actual default
 * production code path, not a mocked stand-in for it.
 */
describe('applyCapeRankingIfEnabled — flag OFF (real default env, not mocked)', () => {
  function mkItem(ref: string): TodayFeedItem {
    return {
      position: 0, kind: 'anchored', ref, surface: 'today', type: 'implementation_task', render_band: 'task',
      card_id: `card-${ref}`, title: ref, subtitle: null, description: null, image: null, video: null, blog: null,
      content: null, week: 1, estimated_time: 15, status: null, interacted: false,
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('returns the exact same array reference as the input (no ranking applied)', async () => {
    const queue = [mkItem('a'), mkItem('b'), mkItem('c')];
    const result = await applyCapeRankingIfEnabled('enr-1', queue);
    expect(result).toBe(queue);
  });

  it('NEVER calls rankLearningValue when the flag is off — this is the exact check a sabotage run (task verification) proved was otherwise missing: removing the flag gate left every other test in this file and in todayFeedComposer.capeFlagOn.test.ts fully green', async () => {
    await applyCapeRankingIfEnabled('enr-1', [mkItem('a'), mkItem('b')]);
    expect(mockRankLearningValue).not.toHaveBeenCalled();
  });

  it('still short-circuits before calling rankLearningValue for an empty queue (belt-and-suspenders with the flag check)', async () => {
    await applyCapeRankingIfEnabled('enr-1', []);
    expect(mockRankLearningValue).not.toHaveBeenCalled();
  });
});
