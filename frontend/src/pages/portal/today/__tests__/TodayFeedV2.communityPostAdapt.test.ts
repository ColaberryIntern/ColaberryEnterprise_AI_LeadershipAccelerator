/**
 * A community post in the Today feed must not be adapted into a curriculum card.
 *
 * THE DEFECT (prod, 2026-09-10): `adapt()` set `id: item.card_id ?? item.ref`.
 * A `community:<postId>` item has NO card_id, so `id` became the feed ref, and
 * the drawer — which routes on render_band `peer_wins` — handed that ref to a
 * card-scoped endpoint:
 *
 *   GET /api/portal/runtime/cards/community:23f34d73-…/peer-wins  →  500
 *
 * The student saw "Couldn't load this week's ritual — try again shortly." and
 * had no way to reach the post they had just clicked. The same adapter derived
 * the label from the type slug, so the tile and the drawer crumb both read
 * "Community Discussion" instead of the week's ritual name.
 *
 * These tests pin the two fields that close it. They assert on the ADAPTED
 * VALUES, not on a shape, because a card that merely "has an id" is exactly what
 * shipped.
 */
import { adapt } from '../TodayFeedV2';
import type { TodayFeedItem } from '../todayFeedApi';

const POST_ID = '23f34d73-75f8-46cc-96d6-31937417d0b4';

function communityItem(overrides: Partial<TodayFeedItem> = {}): TodayFeedItem {
  return {
    position: 3, kind: 'anchored', ref: `community:${POST_ID}`, surface: 'community',
    type: 'community_discussion', render_band: 'peer_wins', card_id: null,
    title: 'My 3 skills: data quality gate, etl failed triage', subtitle: null,
    description: 'My 3 skills: data quality gate, etl failed triage', image: null, video: null,
    blog: null, content: null, week: 2, estimated_time: null, status: null, interacted: false,
    author: { name: 'Hellen Muhonja', avatar_url: null, level: 1 },
    community_post_id: POST_ID, student_label: 'Skill Drop', comment_count: 2, like_count: 4,
    ...overrides,
  };
}

function cardItem(overrides: Partial<TodayFeedItem> = {}): TodayFeedItem {
  return {
    position: 0, kind: 'anchored', ref: 'card:c1', surface: 'class', type: 'warmup',
    render_band: 'warmup', card_id: 'c1', title: 'Self Study', subtitle: null, description: null,
    image: null, video: null, blog: null, content: null, week: 2, estimated_time: 5,
    status: 'available', interacted: false,
    ...overrides,
  };
}

describe('adapt — community post items', () => {
  it('carries the POST id, so the drawer never has to fall back to the ref', () => {
    const card = adapt(communityItem());
    expect(card.community_post_id).toBe(POST_ID);
    // The uuid alone — no `community:` prefix — is what the post endpoints take.
    expect(card.community_post_id).not.toContain(':');
  });

  it('uses the server’s ritual label, not the title-cased type slug', () => {
    expect(adapt(communityItem()).student_label).toBe('Skill Drop');
    expect(adapt(communityItem()).student_label).not.toBe('Community Discussion');
  });

  it('still falls back to a derived label when the server sends none', () => {
    // Older frozen impressions can serve before rehydrate stamps a label.
    const card = adapt(communityItem({ student_label: null }));
    expect(card.student_label).toBe('Community Discussion');
    // …but the post id is what routing depends on, and it is still present.
    expect(card.community_post_id).toBe(POST_ID);
  });

  it('carries the reply and cheer counts the tile renders', () => {
    const card = adapt(communityItem());
    expect(card.comment_count).toBe(2);
    expect(card.like_count).toBe(4);
  });

  it('leaves `id` as the ref — the feed still keys and dedupes on it', () => {
    expect(adapt(communityItem()).id).toBe(`community:${POST_ID}`);
  });
});

describe('adapt — ordinary curriculum cards are untouched', () => {
  it('keeps the card id and derives a label from the type as before', () => {
    const card = adapt(cardItem());
    expect(card.id).toBe('c1');
    expect(card.student_label).toBe('Warmup');
  });

  it('never marks a curriculum card as a community post', () => {
    const card = adapt(cardItem());
    expect(card.community_post_id).toBeNull();
    expect(card.comment_count).toBeNull();
  });

  it('prefers a server label on a curriculum card too, when one is sent', () => {
    expect(adapt(cardItem({ student_label: 'Self Study' })).student_label).toBe('Self Study');
  });
});
