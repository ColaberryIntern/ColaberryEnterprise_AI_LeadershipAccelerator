import { FriendReferral } from '../models';
import { award } from './pointsService';

export interface FriendInput { name: string; email: string; }
export interface SubmitReferralsResult { count: number; points_awarded: number; }

/**
 * Record one or more friend recommendations and award the one-time "recommend
 * a friend" onboarding points (+25, once per enrollment regardless of friend
 * count — see pointsService's `referral_submitted` event, idempotent per
 * enrollment via award()'s default eventKey).
 */
export async function submitReferrals(enrollmentId: string, friends: FriendInput[]): Promise<SubmitReferralsResult> {
  await FriendReferral.bulkCreate(
    friends.map((f) => ({ enrollment_id: enrollmentId, friend_name: f.name.trim(), friend_email: f.email.trim().toLowerCase() })),
  );
  const { awarded, points } = await award(enrollmentId, { eventType: 'referral_submitted' });
  return { count: friends.length, points_awarded: awarded ? points : 0 };
}

/** Whether this enrollment has recommended at least one friend (the checklist step's `done` signal). */
export async function hasReferral(enrollmentId: string): Promise<boolean> {
  const row = await FriendReferral.findOne({ where: { enrollment_id: enrollmentId } });
  return !!row;
}
