import { Op } from 'sequelize';
import Cohort from '../../../models/Cohort';
import CommunityPost from '../../../models/CommunityPost';
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
 * same body made since the delivery was first claimed; if one exists, an earlier attempt already
 * posted (it crashed before the worker recorded it) and that post is returned instead.
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

    const team = await ensureTeamIdentity();
    const earlier = await CommunityPost.findOne({
      where: { member_id: team.memberId, cohort_id: cohort.id, body, status: 'visible', created_at: { [Op.gte]: d.since } },
      order: [['created_at', 'ASC']],
    });
    if (earlier) return { provider_message_id: earlier.id, reached: 1, already_done: true };

    const post = await createPost(
      team.enrollmentId,
      { body, category: HUB_POST_CATEGORY, media_urls: d.media_urls ?? [] } as never,
      { cohortId: cohort.id, reward: false },
    );
    return { provider_message_id: post.id, reached: 1, already_done: false };
  },
};
