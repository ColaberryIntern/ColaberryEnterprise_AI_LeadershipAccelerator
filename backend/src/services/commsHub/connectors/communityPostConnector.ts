import { Op } from 'sequelize';
import Cohort from '../../../models/Cohort';
import CommunityPost from '../../../models/CommunityPost';
import CommsHubDelivery from '../../../models/CommsHubDelivery';
import { CreatePostSchema, type CreatePostInput } from '../../../schemas/communitySchemas';
import { createPost } from '../../communityService';
import { ensureTeamIdentity } from './teamIdentity';
import { ConnectorPermanentError, type Connector, type ConnectorDelivery, type ConnectorResult } from './types';

/**
 * Community post connector (CH7.1). Posts the approved community-post draft into one cohort feed as
 * "Colaberry Team", through the community service's own createPost (mention checks, logging, the
 * same row shape the feed reads). It never inserts posts itself. The program earns no post points.
 *
 * Retry safety: community_posts has no idempotency column, and this ticket does not change that
 * shared table. Before posting, it looks for a visible post by Colaberry Team in that feed with the
 * same body made since the delivery was first claimed that NO OTHER delivery has recorded as its
 * own; if one exists, an earlier attempt of this delivery posted it (and crashed before the worker
 * recorded it), so that post is returned instead. What makes this exact rather than likely is the
 * worker's side (CH7.2, repo-facts): it records provider_message_id right after send, keeps
 * claimed_at as the FIRST claim, and sends one delivery per feed at a time (advisory lock on the
 * channel and target held across send and record).
 *
 * Media goes through the composer's own media_urls rule (http(s) or an uploaded community media
 * path); a banner must be an absolute https URL.
 */
export const HUB_POST_CATEGORY = 'General';

export const communityPostConnector: Connector = {
  channel: 'community_post',
  async send(d: ConnectorDelivery): Promise<ConnectorResult> {
    if (d.destination.target_type !== 'cohort_feed') {
      throw new ConnectorPermanentError(`A community post goes to a cohort feed, not ${d.destination.target_type}.`, 'bad_destination');
    }
    const body = d.draft.body.trim();
    if (!body) throw new ConnectorPermanentError('The community post is empty.', 'empty_body');
    const cohort = await Cohort.findByPk(d.destination.target_id);
    if (!cohort) throw new ConnectorPermanentError('That cohort no longer exists.', 'cohort_missing');

    const media = CreatePostSchema.shape.media_urls.safeParse(d.media_urls ?? []);
    if (!media.success) throw new ConnectorPermanentError('The banner or media link is not an http(s) URL or an uploaded media path.', 'bad_media');
    if (body.length > 10000) throw new ConnectorPermanentError('The community post is longer than 10,000 characters.', 'too_long');

    const team = await ensureTeamIdentity();
    const candidates = await CommunityPost.findAll({
      where: { member_id: team.memberId, cohort_id: cohort.id, body, status: 'visible', created_at: { [Op.gte]: d.since } },
      order: [['created_at', 'ASC']],
    });
    if (candidates.length > 0) {
      const taken = new Set((await CommsHubDelivery.findAll({
        where: { provider_message_id: { [Op.in]: candidates.map((p) => p.id) }, id: { [Op.ne]: d.deliveryId } },
        attributes: ['provider_message_id'],
      })).map((x) => x.provider_message_id));
      const earlier = candidates.find((p) => !taken.has(p.id));
      if (earlier) return { provider_message_id: earlier.id, reached: 1, already_done: true };
    }

    const input: CreatePostInput = { body, category: HUB_POST_CATEGORY, media_urls: media.data ?? [] };
    const post = await createPost(team.enrollmentId, input, { cohortId: cohort.id, reward: false });
    return { provider_message_id: post.id, reached: 1, already_done: false };
  },
};
