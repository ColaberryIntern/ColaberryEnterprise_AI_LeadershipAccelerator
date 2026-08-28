const queryMock = jest.fn();
jest.mock('../../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

import { resolveContentAssets, resolveAllForCandidate } from '../resolveContentAssets';
import type { ContentAssetQuery } from '../../governor/types';

/**
 * EPIC 5 T004.
 *
 * THE SQL ITSELF was verified against production inside a rolled-back
 * transaction, because a mock cannot tell you whether an array operator works or
 * whether a NULL bind means "no filter" or "match nothing":
 *
 *   stage='{activation}' -> returns ONLY the activation card; the expired one,
 *                           the inactive one and the sms-only one are all excluded
 *   stage=NULL           -> no stage filter at all, three cards by priority
 *
 * What follows tests the decision logic and, above all, the REFUSALS.
 */

const asset = (over: Record<string, unknown> = {}) => ({
  id: 'asset-1',
  asset_type: 'LESSON',
  title: 'Welcome to Your Free AI Preview',
  url: '/portal/runtime/card-1',
  source_system: 'timeline_cards',
  source_id: 'card-1',
  ...over,
});

const AS_OF = new Date('2026-08-28T12:00:00Z');

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([asset()]);
});

const q = (over: Partial<ContentAssetQuery> = {}): ContentAssetQuery =>
  ({ asset_type: 'lesson_recommendation', ...over }) as ContentAssetQuery;

describe('a purpose nothing can answer is REFUSED, with its reason', () => {
  it.each([
    'community_digest',
    'friction_recovery',
    'enrollment_offer',
    'referral_invite',
  ] as const)('refuses %s without touching the database', async (purpose) => {
    const result = await resolveContentAssets(q({ asset_type: purpose }), AS_OF);
    expect(result.resolved).toBe(false);
    expect((result as { reason: string }).reason.length).toBeGreaterThan(10);
    // No query at all — an unanswerable purpose is settled before any I/O.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('passes the declared reason through verbatim, so the gap report can say why', async () => {
    const result = await resolveContentAssets(q({ asset_type: 'community_digest' }), AS_OF);
    expect((result as { reason: string }).reason).toMatch(/cohort/i);
  });
});

describe('nothing matched is a REFUSAL, never a substitute', () => {
  it('returns resolved:false rather than an empty success', async () => {
    // The distinction is the whole point: an empty list and a refusal must not
    // look alike, or a resolver bug gets filed as a content gap.
    queryMock.mockResolvedValue([]);
    const result = await resolveContentAssets(q(), AS_OF);
    expect(result).toEqual({ resolved: false, reason: expect.stringContaining('no_asset_for_purpose') });
    expect(result).not.toHaveProperty('assets');
  });

  it('names the purpose and stage in the reason, so a gap is diagnosable', async () => {
    queryMock.mockResolvedValue([]);
    const result = await resolveContentAssets(
      q({ asset_type: 'activation_first_step', state: 'ACTIVATING' }),
      AS_OF,
    );
    expect((result as { reason: string }).reason).toBe(
      'no_asset_for_purpose:activation_first_step:activation',
    );
  });

  it('never falls back to a different purpose when its own has nothing', async () => {
    queryMock.mockResolvedValue([]);
    const result = await resolveContentAssets(q({ asset_type: 'weekly_digest' }), AS_OF);
    expect(result.resolved).toBe(false);
    // One query, for one purpose. A second call would mean it went looking for
    // something else to send — the substitution this module exists to prevent.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * The test named after the bug. All 153 profiles carry an empty affinity list;
 * read as "match nothing" this returns zero assets for every learner alive and
 * looks precisely like a content shortage.
 */
describe('an empty affinity list means NO PREFERENCE, not "match nothing"', () => {
  it('still resolves when the learner has no affinity at all', async () => {
    const result = await resolveContentAssets(q({ affinity_tags: [] }), AS_OF);
    expect(result.resolved).toBe(true);
  });

  it('treats an absent affinity field the same as an empty one', async () => {
    const result = await resolveContentAssets(q(), AS_OF);
    expect(result.resolved).toBe(true);
    expect(queryMock.mock.calls[0][1].replacements.affinity_tags).toBe('{}');
  });

  it('ranks on affinity rather than filtering on it', async () => {
    // Filtering would manufacture a gap for a learner whose interest matches
    // nothing, when any lesson would have served. Affinity picks the better
    // asset; it does not decide whether there is one.
    await resolveContentAssets(q({ affinity_tags: ['ai-strategy'] }), AS_OF);
    const sql = String(queryMock.mock.calls[0][0]);
    // Scope the check to the WHERE clause. `affinity_tags &&` appears in the
    // ORDER BY legitimately, so a whole-string search finds it there and fails
    // a correct implementation — which is exactly what the first version of
    // this assertion did.
    const whereClause = sql.slice(sql.indexOf('WHERE'), sql.indexOf('ORDER BY'));
    expect(whereClause.length).toBeGreaterThan(50);
    expect(whereClause).not.toContain('affinity_tags');
    expect(sql).toContain('ORDER BY CASE');
  });
});

describe('stage comes from the map, never from a raw state', () => {
  it('pins the stage for a purpose that requires one, ignoring the learner', async () => {
    await resolveContentAssets(
      q({ asset_type: 'activation_first_step', state: 'ENGAGED_LEARNER' }),
      AS_OF,
    );
    expect(queryMock.mock.calls[0][1].replacements.stage_tags).toBe('{"activation"}');
  });

  it('translates the learner state when the purpose pins nothing', async () => {
    await resolveContentAssets(q({ asset_type: 'weekly_digest', state: 'ENGAGED_LEARNER' }), AS_OF);
    // 'ENGAGED_LEARNER' -> 'learning'. Passing the raw state here would match
    // nothing: states and stage tags share no members.
    expect(queryMock.mock.calls[0][1].replacements.stage_tags).toBe('{"learning"}');
  });

  it('never sends a raw ExplorerPrimaryState to the database', async () => {
    // The assertion that would have caught the disjoint-vocabulary bug.
    await resolveContentAssets(q({ asset_type: 'weekly_digest', state: 'ACTIVATING' }), AS_OF);
    const tags = String(queryMock.mock.calls[0][1].replacements.stage_tags);
    expect(tags).not.toContain('ACTIVATING');
    expect(tags).toBe('{"activation"}');
  });

  it('passes NULL — not an empty array — when there is no stage to filter on', async () => {
    // An empty array would match nothing. NULL means do not filter, and the SQL
    // checks for it explicitly.
    await resolveContentAssets(q({ asset_type: 'weekly_digest' }), AS_OF);
    expect(queryMock.mock.calls[0][1].replacements.stage_tags).toBeNull();
  });
});

describe('the active window is honoured', () => {
  it('passes asOf to both the start and expiry bounds', async () => {
    await resolveContentAssets(q(), AS_OF);
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain('starts_at IS NULL OR starts_at <= :as_of');
    expect(sql).toContain('expires_at IS NULL OR expires_at > :as_of');
    expect(queryMock.mock.calls[0][1].replacements.as_of).toBe(AS_OF);
  });

  it('only ever asks for email-deliverable assets', async () => {
    // SMS and voice stay gated pending compliance sign-off; this is the layer
    // that makes that structural rather than a matter of remembering.
    await resolveContentAssets(q(), AS_OF);
    expect(String(queryMock.mock.calls[0][0])).toContain("'email' = ANY(allowed_channels)");
  });

  it('respects the per-purpose limit', async () => {
    await resolveContentAssets(q({ asset_type: 'weekly_digest' }), AS_OF);
    expect(queryMock.mock.calls[0][1].replacements.max_rows).toBe(3);
    await resolveContentAssets(q({ asset_type: 'lesson_recommendation' }), AS_OF);
    expect(queryMock.mock.calls[1][1].replacements.max_rows).toBe(1);
  });
});

describe('resolving every query a candidate carries', () => {
  it('resolves ALL entries, not just the first', async () => {
    await resolveAllForCandidate(
      [q({ asset_type: 'weekly_digest' }), q({ asset_type: 'lesson_recommendation' })],
      AS_OF,
    );
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('keeps what resolved AND reports what did not', async () => {
    // Partial success is reported as such: one gap does not discard the assets
    // that did resolve, and one success does not hide the gap.
    queryMock.mockResolvedValueOnce([asset()]).mockResolvedValueOnce([]);
    const { assets, gaps } = await resolveAllForCandidate(
      [q({ asset_type: 'weekly_digest' }), q({ asset_type: 'lesson_recommendation' })],
      AS_OF,
    );
    expect(assets).toHaveLength(1);
    expect(gaps).toHaveLength(1);
  });

  it('returns empty-and-empty for a candidate that asks for nothing', async () => {
    // WAIT and CREATE_HUMAN_TASK carry `required_assets: []`. No queries, no gaps.
    const { assets, gaps } = await resolveAllForCandidate([], AS_OF);
    expect(assets).toEqual([]);
    expect(gaps).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
