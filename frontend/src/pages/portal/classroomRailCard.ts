import type { RailTile } from './classroomRailsApi';
import type { TimelineFeedCard } from '../../components/timeline/TimelineCard';

/**
 * PURE — a community rail tile as the card the thread drawer understands.
 *
 * Ali, 2026-09-13: *"where did the pop up go where I can actually comment. I
 * don't think we added it to the classroom section - only the today timeline.
 * We want to add that same capability when clicked on here."*
 *
 * Today has always opened a community post in the card drawer — the pop-up with
 * the thread and the reply composer. The Classroom's rail only linked out to
 * `/portal/community`, so the same post offered a conversation on one page and a
 * page change on the other.
 *
 * `CardDetailBody` switches on `community_post_id` and renders
 * `CommunityThreadPanel`, which fetches the post and its replies itself. So the
 * only job here is to say "this is a post, and here is which one" — everything
 * else on the card is the minimum a `TimelineFeedCard` requires, and nothing is
 * invented beyond what the tile already knows.
 *
 * Kept out of the page component so it can be tested without a Router, an API
 * or a drawer — the card's SHAPE is what decides whether the thread opens.
 */
export function railTileToPostCard(tile: RailTile): TimelineFeedCard {
  return {
    // The feed ref shape, not the bare post id: `id` reaches card-scoped
    // endpoints elsewhere, and a raw UUID there would be taken for a card id
    // and 404. Today's own adapter prefixes it the same way.
    id: `community:${tile.id}`,
    type: 'community_discussion',
    // The rail's pill already names the ritual; the panel shows this only until
    // the post itself loads.
    student_label: tile.eyebrow || 'Community post',
    render_band: 'peer_wins',
    title: tile.title,
    subtitle: null,
    description: null,
    week: null,
    bucket: 'learn',
    order: 0,
    difficulty: '',
    estimated_time: null,
    // A post pays for the REPLY, and the panel awards that itself. A number
    // here would advertise a reward the drawer does not grant for opening.
    points: {},
    competencies: [],
    status: 'available',
    quiz_score: null,
    completed_at: null,
    community_post_id: tile.id,
    author: tile.person
      // `level` is required on the card but optional on the tile; 1 is the
      // floor of the ladder, and the panel replaces the whole byline with the
      // post's own member the moment it loads.
      ? { name: tile.person.name, avatar_url: tile.person.avatar_url, level: tile.person.level ?? 1 }
      : null,
  };
}
