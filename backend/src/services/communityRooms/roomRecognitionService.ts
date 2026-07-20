import { getOrCreateMember, levelFor } from '../communityService';
import CommunityPointsEvent from '../../models/CommunityPointsEvent';
import ContributionEvent, { ContributionCategory } from '../../models/ContributionEvent';
import { log } from './roomShared';

// Phase B recognition (spec §8.7): reward the behaviors that make a community —
// hosting, helping, showing up — not raw posting. Each contribution is recorded
// once (idempotent) and its points flow to the member's existing community
// score / leaderboard so recognition shows up where students already look.

async function awardCommunityPoints(enrollmentId: string, points: number): Promise<void> {
  if (points <= 0) return;
  const member = await getOrCreateMember(enrollmentId);
  const total = member.points + points;
  await member.update({ points: total, level: levelFor(total) });
  await CommunityPointsEvent.create({ member_id: member.id, points });
}

export interface ContributionInput {
  category: ContributionCategory;
  action: string;
  points: number;
  roomId?: string | null;
  bookingId?: string | null;
  messageId?: string | null;
  idempotencyKey: string;
}

// Idempotent on idempotencyKey; awards points only the first time. Best-effort —
// callers wrap this so a recognition failure never breaks the underlying action.
export async function recordContribution(enrollmentId: string, input: ContributionInput): Promise<void> {
  if (!enrollmentId) return;
  const [, created] = await ContributionEvent.findOrCreate({
    where: { idempotency_key: input.idempotencyKey },
    defaults: {
      enrollment_id: enrollmentId,
      category: input.category,
      action: input.action,
      points: input.points,
      room_id: input.roomId ?? null,
      booking_id: input.bookingId ?? null,
      message_id: input.messageId ?? null,
      idempotency_key: input.idempotencyKey,
    },
  });
  if (created) {
    await awardCommunityPoints(enrollmentId, input.points);
    log('info', 'contribution_recorded', { enrollment_id: enrollmentId, category: input.category, points: input.points });
  }
}
