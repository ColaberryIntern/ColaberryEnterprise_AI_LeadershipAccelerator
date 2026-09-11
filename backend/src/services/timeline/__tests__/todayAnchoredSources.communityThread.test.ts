/**
 * Community-post items in the Today feed carry their OWN identity.
 *
 * Reproduces the defect found on prod 2026-09-10. A `community:<postId>` item is
 * a post, not a curriculum card, so it has `card_id: null`. The client's adapter
 * fell back to the feed REF as the card id, which sent
 *   GET /api/portal/runtime/cards/community:23f34d73-…/peer-wins
 * to a card-scoped endpoint — a 500 on the uuid cast — and the drawer rendered
 * "Couldn't load this week's ritual". The same item's label came out as
 * "Community Discussion" (the type slug, title-cased) rather than the week's
 * ritual name, because the client derived it from `type`.
 *
 * These tests pin both halves: the item carries `community_post_id` and a
 * server-resolved `student_label`, at compose time AND at serve time — the
 * serve-time path is what repairs the frozen impressions already on prod
 * without a backfill (see reference_today_feed_append_only_snapshot).
 */
// models/index wires every Sequelize association at import time, so it has to be
// cut before the community models can be replaced with stubs. ritualStudentLabel
// is deliberately left REAL: the label mapping is the thing under test.
jest.mock('../../../models/index', () => ({}));

const mockFindAll = jest.fn();
jest.mock('../../../models/CommunityPost', () => ({
  __esModule: true,
  default: { findAll: (...args: any[]) => mockFindAll(...args) },
}));
jest.mock('../../../models/CommunityMember', () => ({ __esModule: true, default: {} }));

import { rehydrateCommunityItems, communityFieldsFromPost } from '../todayAnchoredSources';

const MEMBER = { display_name: 'Hellen Muhonja', avatar_url: null, level: 1 };

function mkPost(overrides: Partial<any> = {}) {
  return {
    id: '23f34d73-75f8-46cc-96d6-31937417d0b4',
    body: '🧩 Skill Drop · Week 2\n\nMy 3 skills: data quality gate, etl failed triage, data-quality-report',
    media_urls: [],
    week: 2,
    ritual_meta: { ritual: 'skill_drop', values: {} },
    like_count: 4,
    comment_count: 2,
    member: MEMBER,
    ...overrides,
  };
}

/** A frozen impression as prod actually stored it, BEFORE this fix. */
function mkStaleItem(postId: string): any {
  return {
    position: 3, kind: 'anchored', ref: `community:${postId}`, surface: 'community',
    type: 'community_discussion', render_band: 'peer_wins', card_id: null,
    title: 'old title', subtitle: null, description: 'old body', image: null, video: null,
    blog: null, content: null, week: null, estimated_time: null, status: null, interacted: false,
    author: null,
  };
}

function stub(posts: any[]) {
  mockFindAll.mockResolvedValue(posts.map((p) => ({ get: () => p })));
}

beforeEach(() => { mockFindAll.mockReset(); });

describe('communityFieldsFromPost', () => {
  it('labels a ritual post with the WEEK’S RITUAL NAME, never the type slug', () => {
    const f = communityFieldsFromPost(mkPost());
    // Week 2 is Skill Drop. The bug shipped "Community Discussion" here.
    expect(f.student_label).toBe('Skill Drop');
    expect(f.student_label).not.toBe('Community Discussion');
    expect(f.week).toBe(2);
  });

  it('resolves each week to its own ritual', () => {
    expect(communityFieldsFromPost(mkPost({ week: 1 })).student_label).toBe('Roll Call');
    expect(communityFieldsFromPost(mkPost({ week: 5 })).student_label).toBe('Cohort Wins');
    expect(communityFieldsFromPost(mkPost({ week: 10 })).student_label).toBe('Hot Take');
  });

  it('falls back to Cohort Wins for a ritual post with no week, and stays out of the way for free text', () => {
    // ritualForWeek(null) → DEFAULT_RITUAL, which is Cohort Wins.
    expect(communityFieldsFromPost(mkPost({ week: null })).student_label).toBe('Cohort Wins');
    // A plain community post is not a ritual: it must NOT borrow a ritual name.
    // Only ritual posts are week-tethered (createPost stamps the card's week),
    // so a free-text post arrives with week null too.
    const plain = communityFieldsFromPost(mkPost({ ritual_meta: null, week: null, body: 'Anyone free to pair today?' }));
    expect(plain.student_label).toBe('Community Post');
    expect(plain.week).toBeNull();
  });

  it('gives a text-only ritual post its WEEK’S banner, never a blank tile', () => {
    // The blank teal slab in the feed: community items only ever took `image`
    // from media_urls, so a text post rendered as an empty tile. Now a Week 2
    // post carries the Skill Drop banner — the per-ritual mapping reaches the
    // feed item, which is the whole point of twelve pictures.
    const f = communityFieldsFromPost(mkPost({ media_urls: [], week: 2 }));
    expect(f.image).toBe('/thumbnails/curriculum-types/ritual_skill_drop.jpg');
    expect(communityFieldsFromPost(mkPost({ media_urls: [], week: 10 })).image)
      .toBe('/thumbnails/curriculum-types/ritual_hot_take.jpg');
  });

  it('still never renders blank when the week is unknown', () => {
    // ritualArt(null) → DEFAULT_RITUAL (Cohort Wins) → its own art. The shared
    // community_discussion.jpg remains the fallback only for a ritual with no
    // art of its own, which as of this commit is none of them.
    const f = communityFieldsFromPost(mkPost({ media_urls: [], week: null }));
    expect(f.image).toBe('/thumbnails/curriculum-types/ritual_cohort_wins.jpg');
  });

  it('lets the post’s own media win over the ritual banner', () => {
    const f = communityFieldsFromPost(mkPost({ media_urls: ['https://cdn.example.com/shot.png'] }));
    expect(f.image).toBe('https://cdn.example.com/shot.png');
  });

  it('leaves a video post imageless — the player is the visual', () => {
    const f = communityFieldsFromPost(mkPost({ media_urls: ['https://youtu.be/dQw4w9WgXcQ'] }));
    expect(f.video).not.toBeNull();
    expect(f.image).toBeNull();
  });

  it('carries the engagement counts the tile renders, defaulting to 0', () => {
    expect(communityFieldsFromPost(mkPost()).comment_count).toBe(2);
    expect(communityFieldsFromPost(mkPost()).like_count).toBe(4);
    const bare = communityFieldsFromPost(mkPost({ like_count: undefined, comment_count: undefined }));
    expect(bare.like_count).toBe(0);
    expect(bare.comment_count).toBe(0);
  });
});

describe('rehydrateCommunityItems', () => {
  it('stamps the post id onto a FROZEN impression that never had one', async () => {
    const post = mkPost();
    const items = [mkStaleItem(post.id)];
    stub([post]);

    await rehydrateCommunityItems(items);

    // The whole defect in one assertion: the client now has a real post id to
    // open, instead of falling back to `community:<uuid>` as a card id.
    expect(items[0].community_post_id).toBe(post.id);
    expect(items[0].card_id).toBeNull();
    expect(items[0].student_label).toBe('Skill Drop');
    expect(items[0].comment_count).toBe(2);
  });

  it('never stamps a week onto a community item', async () => {
    // `week` is not a label on a feed item: isPrecedenceImpression() reads it to
    // sort a placed impression into the anchored or the variety cadence tier.
    // Setting it here would re-tier every community post in every feed — a
    // scheduling change wearing the costume of a display fix. The week reaches
    // the student through the ritual label and the post body instead.
    const post = mkPost({ week: 2 });
    const items = [mkStaleItem(post.id)];
    stub([post]);

    await rehydrateCommunityItems(items);

    expect(items[0].week).toBeNull();
    expect(items[0].student_label).toBe('Skill Drop');   // the week still reaches the UI
  });

  it('re-derives the live body and author, not the frozen snapshot', async () => {
    const post = mkPost({ body: 'Edited after placement', member: MEMBER });
    const items = [mkStaleItem(post.id)];
    stub([post]);

    await rehydrateCommunityItems(items);

    expect(items[0].title).toBe('Edited after placement');
    expect(items[0].description).toBe('Edited after placement');
    expect(items[0].author).toEqual({ name: 'Hellen Muhonja', avatar_url: null, level: 1 });
  });

  it('is idempotent — a second pass over the same items changes nothing', async () => {
    const post = mkPost();
    const items = [mkStaleItem(post.id)];
    stub([post]);

    await rehydrateCommunityItems(items);
    const first = JSON.parse(JSON.stringify(items));
    stub([post]);
    await rehydrateCommunityItems(items);

    expect(items).toEqual(first);
  });

  it('leaves an item alone when its post is gone, and never throws', async () => {
    const items = [mkStaleItem('deleted-post-id')];
    stub([]);   // post no longer visible

    await expect(rehydrateCommunityItems(items)).resolves.toBeUndefined();
    expect(items[0].community_post_id).toBeUndefined();
    expect(items[0].title).toBe('old title');
  });

  it('fails soft when the query itself throws — the feed still serves', async () => {
    const items = [mkStaleItem('x')];
    mockFindAll.mockRejectedValue(new Error('connection terminated'));

    await expect(rehydrateCommunityItems(items)).resolves.toBeUndefined();
    expect(items[0].title).toBe('old title');
  });

  it('ignores non-community items entirely (no query at all)', async () => {
    const cardItem: any = { ...mkStaleItem('x'), ref: 'card:c1', card_id: 'c1' };
    await rehydrateCommunityItems([cardItem]);
    expect(mockFindAll).not.toHaveBeenCalled();
  });
});
