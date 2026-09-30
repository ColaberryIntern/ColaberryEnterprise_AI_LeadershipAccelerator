import CommunityMember from '../../models/CommunityMember';
import CommunityPost from '../../models/CommunityPost';
import { CommunityActivityValue, SnapshotField } from './types';

/**
 * Covers the mission's "engagement" AND "community/room/event activity"
 * categories as one — the Checkpoint A discovery report found no separate,
 * distinct "engagement" data source beyond the community layer itself, so
 * treating them as two categories would invent a distinction this
 * codebase doesn't have. `CommunityMember.last_active_at` (presence) is
 * deliberately NOT used as an engagement signal here — its own source
 * comment (sessionPresenceService.ts) calls it "a UX flourish, not a
 * telemetry record"; real posting activity is the honest signal instead.
 */
export async function getCommunityActivityField(enrollmentId: string): Promise<SnapshotField<CommunityActivityValue>> {
  const member = await CommunityMember.findOne({ where: { enrollment_id: enrollmentId } });
  if (!member) {
    return {
      value: null, status: 'unknown', sourceSystem: 'community_members', sourceRecordIds: [], observedAt: null,
      freshnessPolicy: 'real-time', reliabilityState: 'healthy',
      reliabilityReason: 'No CommunityMember row for this enrollment.',
    };
  }

  const m: any = member;
  const posts = await CommunityPost.findAll({ where: { member_id: m.id, status: 'visible' } });

  return {
    value: {
      postCount: posts.length,
      totalLikesReceived: posts.reduce((sum: number, p: any) => sum + (p.like_count || 0), 0),
      totalCommentsReceived: posts.reduce((sum: number, p: any) => sum + (p.comment_count || 0), 0),
      communityPoints: m.points,
      communityLevel: m.level,
    },
    status: 'known',
    sourceSystem: 'community_posts',
    sourceRecordIds: posts.map((p: any) => p.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time',
    reliabilityState: 'healthy',
  };
}
