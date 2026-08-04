/**
 * CAPE Phase 4 flag-ON behavior (design doc §9, §16 Phase 4). Complements
 * `todayFeedComposer.capeFlagOff.test.ts` (T001) — that file proves flag-off
 * is byte-identical to pre-Phase-4 behavior; this file proves flag-on
 * actually does something different and that the new explanation columns are
 * really written (and written idempotently).
 */
// Mocks the ranker module (not `config/database`) — `todayFeedComposer.ts`'s
// own import chain (todayFeedPlan -> timelineGatingService ->
// models/TimelineCard) eagerly runs Sequelize `Model.init()` at module load,
// which needs the REAL `sequelize` instance shape, not a bare `{query}`
// stub (a full mock there breaks every model's init, not just this file's
// queries) — so `sequelize.query` is spied on instead, same real-instance
// pattern the rest of this repo's I/O-shell tests use when they can't
// wholesale-mock `config/database`.
jest.mock('../../cape/capeLearningValueRanker', () => ({ rankLearningValue: jest.fn() }));
// This file exercises the flag-ON code path specifically (flag-default/env
// parsing itself is T001's job, already covered in
// todayFeedComposer.capeFlagOff.test.ts) — force the flag on via a partial
// mock of the real env module so every helper under test here sees it true,
// without needing a process.env + jest.resetModules dance per test.
jest.mock('../../../config/env', () => {
  const actual = jest.requireActual('../../../config/env');
  return { env: { ...actual.env, capeLearningValueRankerEnabled: true } };
});

import { applyCapeRankingIfEnabled, extractCapeExplanation, persistImpression, type TodayFeedItem } from '../todayFeedComposer';
import { rankLearningValue } from '../../cape/capeLearningValueRanker';
import { sequelize } from '../../../config/database';

const mockRank = rankLearningValue as unknown as jest.Mock;
const mockQuery = jest.spyOn(sequelize, 'query').mockResolvedValue([] as any);

function mkItem(ref: string, extra: Record<string, any> = {}): TodayFeedItem {
  return {
    position: 0, kind: 'anchored', ref, surface: 'today', type: 'implementation_task', render_band: 'task',
    card_id: `card-${ref}`, title: ref, subtitle: null, description: null, image: null, video: null, blog: null,
    content: null, week: 1, estimated_time: 15, status: null, interacted: false,
    ...extra,
  } as TodayFeedItem;
}

beforeEach(() => jest.clearAllMocks());

describe('applyCapeRankingIfEnabled — a fixture with a clear skill gap produces a measurably reordered sequence', () => {
  it('flag on: calls rankLearningValue and returns its (reordered) items', async () => {
    const gathered = [mkItem('low-priority'), mkItem('closes-gap')];
    mockRank.mockResolvedValue({
      items: [mkItem('closes-gap', { rank_score: 0.9, reasons: ['closes a skill gap'] }), mkItem('low-priority', { rank_score: 0.2, reasons: ['general fit'] })],
      excluded: [],
      policy_version: 1,
      learner_state_version: '2026-08-03T00:00:00.000Z',
    });

    const result = await applyCapeRankingIfEnabled('enr-1', gathered);

    expect(result.map((i) => i.ref)).toEqual(['closes-gap', 'low-priority']); // reordered vs gathered's ['low-priority','closes-gap']
    expect(mockRank).toHaveBeenCalledWith('enr-1', gathered, expect.any(Date));
  });

  it('boundary: an empty candidate list short-circuits without calling rankLearningValue', async () => {
    const result = await applyCapeRankingIfEnabled('enr-1', []);
    expect(result).toEqual([]);
    expect(mockRank).not.toHaveBeenCalled();
  });

  it('failure path: a ranking error is caught and the feed falls back to the unranked gathered order, not a throw', async () => {
    const gathered = [mkItem('a'), mkItem('b')];
    mockRank.mockRejectedValue(new Error('DB unavailable'));
    const result = await applyCapeRankingIfEnabled('enr-1', gathered);
    expect(result).toBe(gathered); // exact fallback: same reference, unranked order preserved
  });
});

describe('extractCapeExplanation', () => {
  it('extracts rank_score/reasons/policy_version/learner_state_version from a ranked item', () => {
    const item = mkItem('a', { rank_score: 0.75, reasons: ['closes a skill gap'], policy_version: 1, learner_state_version: 'v1' });
    expect(extractCapeExplanation(item)).toEqual({ rank_score: 0.75, reasons: ['closes a skill gap'], policy_version: 1, learner_state_version: 'v1' });
  });

  it('returns undefined for a plain (unranked / flag-off) item with no rank_score', () => {
    expect(extractCapeExplanation(mkItem('a'))).toBeUndefined();
  });
});

describe('persistImpression — writes the 4 CAPE explanation columns, idempotently', () => {
  it('includes rank_score/reasons/policy_version/learner_state_version in the INSERT when an explanation is provided', async () => {
    const item = mkItem('a');
    await persistImpression('enr-1', item, null, { rank_score: 0.8, reasons: ['x'], policy_version: 1, learner_state_version: 'v1' });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('rank_score');
    expect(String(sql)).toContain('reasons');
    expect(String(sql)).toContain('policy_version');
    expect(String(sql)).toContain('learner_state_version');
    expect(opts.replacements.rank_score).toBe(0.8);
    expect(opts.replacements.policy_version).toBe(1);
  });

  it('writes NULL/[] for the 4 columns when no explanation is provided (flag-off path — matches pre-Phase-4 rows)', async () => {
    const item = mkItem('a');
    await persistImpression('enr-1', item, null);
    const [, opts] = mockQuery.mock.calls[0];
    expect(opts.replacements.rank_score).toBeNull();
    expect(opts.replacements.reasons).toBe('[]');
    expect(opts.replacements.policy_version).toBeNull();
    expect(opts.replacements.learner_state_version).toBeNull();
  });

  it('idempotency: calling twice with the same enrollment+position relies on ON CONFLICT DO NOTHING (present in the SQL) — the contract is unchanged by this task', async () => {
    const item = mkItem('a');
    await persistImpression('enr-1', item, null);
    await persistImpression('enr-1', item, null);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    for (const [sql] of mockQuery.mock.calls) {
      expect(String(sql)).toContain('ON CONFLICT (enrollment_id, position) DO NOTHING');
    }
  });
});
