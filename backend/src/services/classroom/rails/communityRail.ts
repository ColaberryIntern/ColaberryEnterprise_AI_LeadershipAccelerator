import { listPosts } from '../../communityService';
import { Rail, RailContext, RailTile, omitIfEmpty } from './types';

/**
 * The cohort's most recent community posts.
 *
 * Reads through `listPosts`, the same service the Community feed itself uses,
 * which means the rail inherits its cohort scoping, its `status: 'visible'`
 * filter and its moderation rules for free. Querying `CommunityPost` directly
 * here would have duplicated all three, and the day they drifted a removed post
 * would surface in the classroom after disappearing from the feed.
 *
 * THE ACTION IS A REPLY, NOT A VISIT. Posting a reply is the first thing a
 * student does with a post they care about, so the tile carries it. The href
 * opens the post itself with the composer focused — `#reply` rather than the
 * feed index, so the student lands on the thing they were answering.
 *
 * A LOCKED POST IS NOT SHOWN. `listPosts` returns `locked` for posts above the
 * viewer's level; those are excluded rather than teased, because a tile whose
 * action a student cannot take is worse than no tile.
 */

/** Enough for a scroll, few enough that the classroom is not the feed. */
const TILE_LIMIT = 6;
/** A tile shows the opening of a post, not the post. */
const BODY_MAX = 120;

function excerpt(body: string | null): string | null {
  if (!body) return null;
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return null;
  return clean.length > BODY_MAX ? `${clean.slice(0, BODY_MAX - 1)}…` : clean;
}

/** "4 comments · 6 likes", omitting either half when it is zero. */
function engagement(comments: number, likes: number): string | null {
  const parts: string[] = [];
  if (comments > 0) parts.push(`${comments} comment${comments === 1 ? '' : 's'}`);
  if (likes > 0) parts.push(`${likes} like${likes === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export async function resolveCommunityRail(ctx: RailContext): Promise<Rail | null> {
  const { posts } = await listPosts(ctx.enrollmentId, { limit: TILE_LIMIT * 2 });

  const tiles: RailTile[] = posts
    .filter((p) => !p.locked)
    .slice(0, TILE_LIMIT)
    .map((p) => ({
      id: p.id,
      title: p.member?.display_name ?? 'Someone in your cohort',
      detail: excerpt(p.body),
      meta: engagement(p.comment_count ?? 0, p.like_count ?? 0),
      image_url: p.member?.avatar_url ?? null,
      glyph: '\u{1F4AC}',
      stamp: p.pinned ? 'PINNED' : null,
      action: {
        label: 'Reply',
        href: `/portal/community?post=${encodeURIComponent(p.id)}#reply`,
        kind: 'primary',
      },
    }));

  return omitIfEmpty({
    surface: 'community',
    label: 'From the community',
    count_label: tiles.length > 0 ? `${tiles.length} recent` : null,
    href: '/portal/community',
    tiles,
  });
}
