/**
 * The Classroom opens a community post in the SAME pop-up Today does.
 *
 * Ali, 2026-09-13: *"where did the pop up go where I can actually comment. I
 * don't think we added it to the classroom section - only the today timeline.
 * We want to add that same capability when clicked on here."*
 *
 * The card drawer already renders `CommunityThreadPanel` for any card carrying
 * `community_post_id`, and the Classroom already mounts that drawer — the rail
 * simply never handed it a post. This pins the card the page synthesises from a
 * rail tile, which is what decides whether the thread opens or the drawer shows
 * an empty curriculum card.
 */
import { railTileToPostCard } from '../classroomRailCard';
import type { RailTile } from '../classroomRailsApi';

const tile = (over: Partial<RailTile> = {}): RailTile => ({
  id: 'b463a409-0efb-47ed-947b-8783597e552a',
  title: 'Who I am: Farhat, eight years in supply chain.',
  detail: null,
  meta: '4 comments · 6 likes',
  image_url: null,
  glyph: null,
  stamp: null,
  eyebrow: '👋 Roll Call · Week 7',
  person: { name: 'Farhat Beig', level: 4, avatar_url: null },
  action: { label: 'Reply · +2 pts', href: '/portal/community?post=x#reply', kind: 'primary' },
  ...over,
});

describe('a rail tile becomes the card the thread drawer understands', () => {
  it('carries community_post_id — the field the drawer switches on', () => {
    const card = railTileToPostCard(tile());
    expect(card.community_post_id).toBe('b463a409-0efb-47ed-947b-8783597e552a');
  });

  it('uses the feed ref shape for the id, never the bare post id', () => {
    // `id` reaches card-scoped endpoints elsewhere; a raw UUID there would be
    // taken for a card id and 404. Today's adapter uses the same `community:`
    // prefix for exactly this reason.
    expect(railTileToPostCard(tile()).id).toBe('community:b463a409-0efb-47ed-947b-8783597e552a');
  });

  it('labels the panel with the ritual until the post itself loads', () => {
    expect(railTileToPostCard(tile()).student_label).toBe('👋 Roll Call · Week 7');
  });

  it('falls back to a neutral label for a free-text post', () => {
    expect(railTileToPostCard(tile({ eyebrow: null })).student_label).toBe('Community post');
  });

  it('carries the author so the drawer header is not blank before the fetch', () => {
    expect(railTileToPostCard(tile()).author).toEqual({ name: 'Farhat Beig', avatar_url: null, level: 4 });
  });

  it('survives a tile with no person rather than inventing one', () => {
    expect(railTileToPostCard(tile({ person: null })).author).toBeNull();
  });

  it('defaults a missing level instead of emitting null into a numeric field', () => {
    const card = railTileToPostCard(tile({ person: { name: 'Someone', level: null, avatar_url: null } }));
    expect(card.author).toEqual({ name: 'Someone', avatar_url: null, level: 1 });
  });

  it('advertises no points: the reply award is the post panel\'s business, not the card\'s', () => {
    expect(railTileToPostCard(tile()).points).toEqual({});
    expect(railTileToPostCard(tile()).status).toBe('available');
  });
});
