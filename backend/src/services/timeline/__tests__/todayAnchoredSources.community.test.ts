/**
 * communityCandidates() exhaustion fix (2026-08-04) — was: fetch only the
 * CANDIDATE_CAP=20 most-recent cohort posts, then filter placed ones in
 * memory, so a student who'd seen the current top-20 window got [] forever.
 * Now: exclude already-placed posts IN THE QUERY (so CANDIDATE_CAP applies
 * to the fetch batch, not the lifetime pool) and bound by the student's own
 * `enrolled_at` (not "every post the cohort has ever made") so a late
 * joiner never sees pre-enrollment, contextually stale discussion. See
 * execution-contract.md (.loop-architect/runs/20260804-feed-control-weighted-lanes/)
 * Assumption 4.
 *
 * Real Sequelize model classes (NOT whole-module mocks — `models/index.ts`
 * wires real associations like `Cohort.hasMany(Enrollment, ...)` at import
 * time, which breaks if a model is replaced by a plain object) — static
 * methods are spied on instead, same convention as other DB-heavy modules
 * in this repo that spy on `sequelize.query` rather than replace `sequelize`.
 */
jest.mock('../../projects/projectReadService', () => ({ getActiveProjectTree: jest.fn() }));
jest.mock('../timelineService', () => ({ getFeed: jest.fn() }));
jest.mock('../typeRegistry', () => ({ resolve: jest.fn(() => ({ render_band: 'peer_wins' })) }));
// env.todayAggregateSources is a plain value read ONCE at module load
// (`process.env.TODAY_AGGREGATE_SOURCES === 'true'`), not a live getter —
// setting process.env in beforeEach would have no effect since env.ts has
// already evaluated by then. Mock the module directly instead.
jest.mock('../../../config/env', () => {
  const actual = jest.requireActual('../../../config/env');
  return { env: { ...actual.env, todayAggregateSources: true, todaySessionReplays: false } };
});

import { Op } from 'sequelize';
import Enrollment from '../../../models/Enrollment';
import CommunityPost from '../../../models/CommunityPost';
import { gatherAnchored } from '../todayAnchoredSources';
import { getFeed } from '../timelineService';

const mockEnrollmentFindByPk = jest.spyOn(Enrollment, 'findByPk') as unknown as jest.Mock;
const mockCommunityPostFindAll = jest.spyOn(CommunityPost, 'findAll') as unknown as jest.Mock;
const mockGetFeed = getFeed as unknown as jest.Mock;

const ENROLLED_AT = new Date('2026-07-01T00:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFeed.mockResolvedValue({ cards: [], is_explorer: false });
  mockEnrollmentFindByPk.mockResolvedValue({ cohort_id: 'cohort-1', enrolled_at: ENROLLED_AT } as any);
  mockCommunityPostFindAll.mockResolvedValue([] as any);
});

describe('communityCandidates (via gatherAnchored) — exhaustion fix', () => {
  it('excludes already-placed posts IN the query, not just in-memory after fetch', async () => {
    const placedRefs = new Set(['community:post-1', 'community:post-2', 'card:abc']);
    await gatherAnchored('enr-1', placedRefs);
    const where = mockCommunityPostFindAll.mock.calls[0][0].where;
    expect(where.id[Op.notIn]).toEqual(['post-1', 'post-2']);
  });

  it('bounds the query to posts created on/after the student\'s own enrolled_at (relevance guard)', async () => {
    await gatherAnchored('enr-1', new Set());
    const where = mockCommunityPostFindAll.mock.calls[0][0].where;
    expect(where.created_at[Op.gte]).toEqual(ENROLLED_AT);
  });

  it('does not apply an id exclusion clause when nothing is placed yet (first visit)', async () => {
    await gatherAnchored('enr-1', new Set());
    const where = mockCommunityPostFindAll.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
  });

  it('a student who has seen every post since their own enrollment gets [] (genuinely exhausted, not an error)', async () => {
    mockCommunityPostFindAll.mockResolvedValue([] as any);
    const result = await gatherAnchored('enr-1', new Set(['community:post-1']));
    expect(result.evergreenByType.get('community_discussion') ?? []).toHaveLength(0);
  });

  it('an enrollment with no enrolled_at set does not crash and omits the date bound', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ cohort_id: 'cohort-1', enrolled_at: null } as any);
    await expect(gatherAnchored('enr-1', new Set())).resolves.toBeDefined();
    const where = mockCommunityPostFindAll.mock.calls[0][0].where;
    expect(where.created_at).toBeUndefined();
  });

  it('a missing enrollment fails soft to an empty community list, not a throw', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null as any);
    const result = await gatherAnchored('enr-1', new Set());
    expect(result.evergreenByType.get('community_discussion') ?? []).toHaveLength(0);
  });

  it('community results land under the community_discussion key in evergreenByType (moved into the variety pool, not weekBound)', async () => {
    mockCommunityPostFindAll.mockResolvedValue([
      { get: () => ({ id: 'post-1', body: 'hello world', media_urls: null, member: null }) },
    ] as any);
    const result = await gatherAnchored('enr-1', new Set());
    expect(result.evergreenByType.get('community_discussion')).toHaveLength(1);
    expect(result.weekBound.find((i) => i.ref === 'community:post-1')).toBeUndefined();
  });

  it('is idempotent: calling twice with the same placedRefs produces the same query shape', async () => {
    const placedRefs = new Set(['community:post-1']);
    await gatherAnchored('enr-1', placedRefs);
    await gatherAnchored('enr-1', placedRefs);
    const call1 = mockCommunityPostFindAll.mock.calls[0][0].where;
    const call2 = mockCommunityPostFindAll.mock.calls[1][0].where;
    expect(call1).toEqual(call2);
  });
});
