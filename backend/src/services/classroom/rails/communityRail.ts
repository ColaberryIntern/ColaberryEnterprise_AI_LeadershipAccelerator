import { listPosts } from '../../communityService';
import { parseRitualHeading } from '../../runtime/communityRituals';
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
/**
 * A tile shows the opening of a post, not the post. Raised from 120 on
 * 2026-09-13: the tile no longer spends its height on a picture, so the words
 * get that space — about five lines at the tile's width.
 */
const BODY_MAX = 260;
/** Mirrors POINTS_PER_COMMENT — the tile says what replying pays, as Today does. */
const REPLY_POINTS = 2;

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
    .map((p) => {
      const ritual = parseRitualHeading(p.body);
      return {
        id: p.id,
        // The student's own words are the tile. Ali, 2026-09-13, on the picture
        // this rail used to lead with: "I don't like the pictures/images."
        // Chosen from four options — words, ritual banner art, a big initials
        // avatar, or the poster's own photo — because every other option shows
        // the same picture on several tiles at once (19 of 58 ritual posts are
        // Roll Call) while the words are different every time.
        // ONE field for the words, not a headline plus a body: the tile is a
        // quote, and splitting it would print the first line twice.
        title: excerpt(ritual ? ritual.rest : p.body) ?? 'A post from your cohort',
        detail: null,
        meta: engagement(p.comment_count ?? 0, p.like_count ?? 0),
        // NO PICTURE. `image_url` was the member's avatar and none of the 268
        // members has one, so this slot rendered a grey speech-bubble glyph on
        // every tile, every time. The person is named in `person` instead.
        image_url: null,
        glyph: null,
        stamp: p.pinned ? 'PINNED' : null,
        eyebrow: ritual ? `${ritual.icon} ${ritual.name} · Week ${ritual.week}` : null,
        person: {
          name: p.member?.display_name ?? 'Someone in your cohort',
          level: p.member?.level ?? null,
          avatar_url: p.member?.avatar_url ?? null,
        },
        action: {
          label: `Reply · +${REPLY_POINTS} pts`,
          href: `/portal/community?post=${encodeURIComponent(p.id)}#reply`,
          kind: 'primary' as const,
        },
      };
    });

  return omitIfEmpty({
    surface: 'community',
    label: 'From the community',
    count_label: tiles.length > 0 ? `${tiles.length} recent` : null,
    href: '/portal/community',
    tiles,
  });
}
