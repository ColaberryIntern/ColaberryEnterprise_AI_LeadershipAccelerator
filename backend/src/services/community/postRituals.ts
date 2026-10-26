import { CommunityPost } from '../../models';
import { ritualOf, type PostRitual } from './boardRitual';

/**
 * Add `ritual: { key, name, icon, week } | null` to the posts GET /api/portal/community/posts returns (Campus v14 B1, Basecamp C65).
 * The feed's DTO (communityService.toFeedItem) does not carry ritual_meta, and that file is far over the 500-line ceiling, so the
 * ritual is attached here with one read by post id (the same approach the route already uses for demo playback). Best effort: a
 * failed read leaves `ritual: null` on every post and is logged, never failing the feed.
 */
export async function withRituals<T extends { id: string }>(posts: T[]): Promise<(T & { ritual: PostRitual | null })[]> {
  if (!posts.length) return [];
  let byId = new Map<string, PostRitual | null>();
  try {
    const rows = (await CommunityPost.findAll({
      where: { id: posts.map((p) => p.id) },
      attributes: ['id', 'body', 'week', 'ritual_meta'],
      raw: true,
    })) as unknown as { id: string; body: string; week: number | null; ritual_meta: { ritual?: string } | null }[];
    byId = new Map(rows.map((r) => [r.id, ritualOf(r.ritual_meta, r.body, r.week)]));
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'community-board', event: 'post_rituals_unavailable', outcome: 'partial', error_class: (err as Error)?.name ?? 'Error' }));
  }
  return posts.map((p) => ({ ...p, ritual: byId.get(p.id) ?? null }));
}
