/**
 * Today feed: a community post the student can no longer open leaves the feed.
 *
 * THE DEFECT THIS PINS. The feed replays frozen impression rows. A learner who changed cohort (an Explorer who
 * paid, a learner moved to a later batch) kept every community post placed under the old cohort, and tapping one
 * opened a panel reading "This post belongs to another cohort." (communityService.requireVisiblePostInCohort answers
 * 403). A learner reported it 12 Nov 2026 with screenshots; production held 391 such impressions across 75 learners,
 * plus 11 removed posts across 9.
 *
 * The serve filter applies the post route's own rule (same cohort, not removed), on positive identification only:
 * a missing post, a missing enrollment, or a failed lookup keeps the item.
 */
jest.mock('../../../models/index', () => ({}));

const mockFindAll = jest.fn();
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findAll: (...args: any[]) => mockFindAll(...args) },
}));
jest.mock('../ambientPool', () => ({
  pickAmbientBatch: jest.fn().mockResolvedValue([]),
  AMBIENT_PROVIDERS: ['blog', 'podcast', 'testimonial'],
  AMBIENT_REPEAT_COOLDOWN_DAYS: 30,
}));
jest.mock('../todayAnchoredSources', () => ({
  gatherAnchored: jest.fn().mockResolvedValue({ weekBound: [], evergreenByType: new Map() }),
  rehydrateCardItems: jest.fn().mockResolvedValue(undefined),
  rehydrateCommunityItems: jest.fn().mockResolvedValue(undefined),
  rehydrateProjectItems: jest.fn().mockResolvedValue(undefined),
  rehydrateSessionItems: jest.fn().mockResolvedValue(undefined),
}));

import { getTodayPage } from '../todayFeedComposer';
import { unreachableCommunityRefs } from '../todayFeedServeFilters';
import { sequelize } from '../../../config/database';

const MY_COHORT = 'cohort-nov';
const OLD_COHORT = 'cohort-explorers';

let store: any[];
/** community_posts rows by id: what the reachability query can see. */
let posts: Record<string, { cohort_id: string | null; status: string }>;
/** The viewer's enrollment cohort, or null when the enrollment row is absent. */
let viewerCohort: string | null;
let communityLookupThrows: boolean;
let communityQueries: number;

function seedCommunity(position: number, postId: string) {
  const ref = `community:${postId}`;
  store.push({
    position, kind: 'anchored', ref, provider: null, card_id: null,
    item: {
      position, kind: 'anchored', ref, surface: 'community', type: 'community_discussion', render_band: 'community',
      card_id: null, title: postId, subtitle: null, description: null, image: null, video: null, blog: null, content: null,
      week: null, estimated_time: null, status: null, interacted: false, community_post_id: postId,
    },
    interacted_at: null, served_at: new Date(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  store = [];
  posts = {};
  viewerCohort = MY_COHORT;
  communityLookupThrows = false;
  communityQueries = 0;
  mockFindAll.mockResolvedValue([]);
  jest.spyOn(sequelize, 'query').mockImplementation(((sql: any, opts: any) => {
    const s = String(sql);
    if (s.includes('SELECT position, kind, ref, provider, card_id, item, interacted_at, served_at')) {
      return Promise.resolve([...store] as any);
    }
    if (s.includes('FROM community_posts p')) {
      communityQueries += 1;
      if (communityLookupThrows) return Promise.reject(new Error('connection terminated'));
      if (viewerCohort === null) return Promise.resolve([] as any);   // CROSS JOIN with no enrollment row = no rows
      const ids: string[] = (opts as any).replacements.ids;
      return Promise.resolve(ids.filter((id) => posts[id]).map((id) => ({ id, ...posts[id], viewer_cohort: viewerCohort })) as any);
    }
    return Promise.resolve([] as any);
  }) as any);
});

it('drops a post from another cohort and keeps the student\'s own (the reported bug)', async () => {
  seedCommunity(0, 'old-roll-call');
  seedCommunity(1, 'my-post');
  posts = { 'old-roll-call': { cohort_id: OLD_COHORT, status: 'visible' }, 'my-post': { cohort_id: MY_COHORT, status: 'visible' } };

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items.map((i) => i.ref)).toEqual(['community:my-post']);
});

it('drops a post staff removed, even in the student\'s own cohort', async () => {
  seedCommunity(0, 'removed');
  seedCommunity(1, 'kept');
  posts = { removed: { cohort_id: MY_COHORT, status: 'removed' }, kept: { cohort_id: MY_COHORT, status: 'visible' } };

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items.map((i) => i.ref)).toEqual(['community:kept']);
});

it('stays gone on every load, and the frozen impression row itself is never rewritten', async () => {
  seedCommunity(0, 'old');
  posts = { old: { cohort_id: OLD_COHORT, status: 'visible' } };

  const first = await getTodayPage('enr-1', 0, 10);
  const second = await getTodayPage('enr-1', 0, 10);

  expect(first.items).toEqual([]);
  expect(second.items).toEqual([]);
  expect(store.map((r) => r.ref)).toEqual(['community:old']);
});

it('KEEPS a post whose row is missing: absence is never read as a verdict', async () => {
  seedCommunity(0, 'ghost');
  const page = await getTodayPage('enr-1', 0, 10);
  expect(page.items.map((i) => i.ref)).toEqual(['community:ghost']);
});

it('FAILS SOFT: a failed lookup keeps everything rather than emptying the feed', async () => {
  seedCommunity(0, 'old');
  seedCommunity(1, 'mine');
  posts = { old: { cohort_id: OLD_COHORT, status: 'visible' }, mine: { cohort_id: MY_COHORT, status: 'visible' } };
  communityLookupThrows = true;

  const page = await getTodayPage('enr-1', 0, 10);

  expect(page.items.map((i) => i.ref)).toEqual(['community:old', 'community:mine']);
});

describe('unreachableCommunityRefs', () => {
  it('no community refs: no query at all', async () => {
    await expect(unreachableCommunityRefs('enr-1', ['podcast:a', 'card:b'])).resolves.toEqual(new Set());
    expect(communityQueries).toBe(0);
  });

  it('no enrollment row: nothing is dropped', async () => {
    viewerCohort = null;
    posts = { old: { cohort_id: OLD_COHORT, status: 'visible' } };
    await expect(unreachableCommunityRefs('enr-gone', ['community:old'])).resolves.toEqual(new Set());
  });

  it('a post with no cohort is unreachable for a student who has one, matching the route', async () => {
    posts = { orphan: { cohort_id: null, status: 'visible' } };
    await expect(unreachableCommunityRefs('enr-1', ['community:orphan'])).resolves.toEqual(new Set(['community:orphan']));
  });

  it('asks once per serve, de-duplicating repeated refs', async () => {
    posts = { a: { cohort_id: OLD_COHORT, status: 'visible' } };
    const out = await unreachableCommunityRefs('enr-1', ['community:a', 'community:a']);
    expect(out).toEqual(new Set(['community:a']));
    expect(communityQueries).toBe(1);
  });
});
