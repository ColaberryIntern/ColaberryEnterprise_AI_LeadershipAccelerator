/**
 * The detail behind the digest's "unread mentions and replies" number.
 *
 * WHY THIS EXISTS. Aleem's accepted digest redesign (UX Team to-do
 * 10478732232, 2026-11-05) adds a Mentions card: "who mentioned or replied to
 * you, when, a snippet, and a Reply link, so the learner can act from the
 * inbox without hunting in the portal." The digest only ever loaded counts, so
 * the card had no data to render. This supplies it.
 *
 * SCOPE, AND WHY THE CARD CAN BE SHORTER THAN THE TILE. The stat tile counts
 * every unread notification except DMs, which includes likes and friend
 * requests (see buildDigestContent in communityDigestService.ts). This card is
 * only mentions and replies, because that is what it is called and what a
 * learner can act on. So a learner with 4 unread of which 2 are likes sees
 * "4" on the tile and 2 rows in the card. Changing what the tile counts is a
 * product decision, not a side effect of a redesign.
 *
 * FAILURE PATH. Three batched reads, no writes, no external calls. A throw
 * here must not cost the learner their digest, so the caller treats a failure
 * as "no card" and logs it; the counts and the Upcoming card still send.
 */
import { Op } from 'sequelize';
import CommunityNotification from '../models/CommunityNotification';
import CommunityMember from '../models/CommunityMember';
import CommunityPost from '../models/CommunityPost';
import CommunityComment from '../models/CommunityComment';
import type { DigestMention } from './email/communityDigestEmail';

/** At most this many rows reach the card; the template also slices to 5. */
const MAX_MENTIONS = 5;

/**
 * Unread mentions and replies for one community member, newest first.
 * Returns [] when there are none — the template then omits the card.
 */
export async function loadDigestMentions(memberId: string): Promise<DigestMention[]> {
  const notifications = await CommunityNotification.findAll({
    where: {
      member_id: memberId,
      read_at: null,
      notification_type: { [Op.in]: ['mention', 'reply'] },
      source_type: { [Op.in]: ['post', 'comment'] },
    },
    attributes: ['notification_type', 'source_type', 'source_id', 'actor_member_id', 'created_at'],
    order: [['created_at', 'DESC']],
    limit: MAX_MENTIONS,
  });

  if (!notifications.length) return [];

  const actorIds = [...new Set(notifications.map((n) => n.actor_member_id).filter(Boolean))] as string[];
  const postIds = [...new Set(notifications.filter((n) => n.source_type === 'post').map((n) => n.source_id))];
  const commentIds = [...new Set(notifications.filter((n) => n.source_type === 'comment').map((n) => n.source_id))];

  const [actors, posts, comments] = await Promise.all([
    actorIds.length
      ? CommunityMember.findAll({ where: { id: { [Op.in]: actorIds } }, attributes: ['id', 'display_name'] })
      : Promise.resolve([]),
    postIds.length
      ? CommunityPost.findAll({ where: { id: { [Op.in]: postIds } }, attributes: ['id', 'body'] })
      : Promise.resolve([]),
    commentIds.length
      ? CommunityComment.findAll({ where: { id: { [Op.in]: commentIds } }, attributes: ['id', 'body'] })
      : Promise.resolve([]),
  ]);

  const actorName = new Map(actors.map((a) => [a.id, a.display_name]));
  const bodyById = new Map<string, string>();
  posts.forEach((p) => bodyById.set(p.id, p.body));
  comments.forEach((c) => bodyById.set(c.id, c.body));

  return notifications.map((n) => ({
    // A removed member or a deleted post still gets a row: the learner has an
    // unread notification either way, and a blank card would be the bug.
    actorName: (n.actor_member_id && actorName.get(n.actor_member_id)) || 'Someone in your cohort',
    kind: n.notification_type === 'reply' ? 'reply' : 'mention',
    snippet: bodyById.get(n.source_id) || 'Open the community to see this.',
    occurredAt: n.created_at,
  }));
}
