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
  // ignoreDuplicates -> INSERT ... ON CONFLICT DO NOTHING against the
  // (enrollment_id, friend_email) unique index (see FriendReferral model): a
  // retried/double-submitted request re-recommending the same friend is a
  // no-op instead of a duplicate row or a thrown unique-violation.
  await FriendReferral.bulkCreate(
    friends.map((f) => ({ enrollment_id: enrollmentId, friend_name: f.name.trim(), friend_email: f.email.trim().toLowerCase() })),
    { ignoreDuplicates: true },
  );
  const { awarded, points } = await award(enrollmentId, { eventType: 'referral_submitted' });
  return { count: friends.length, points_awarded: awarded ? points : 0 };
}

/**
 * Whether this enrollment has recommended at least one friend (the checklist
 * step's `done` signal). Fails open (false = "not done yet, show the step") on
 * any DB error, matching the sibling entitlement resolvers in this repo — a
 * transient hiccup here must never 500 the whole onboarding-profile response
 * (see the try/catch at this function's call site in resumeIngestService).
 */
export async function hasReferral(enrollmentId: string): Promise<boolean> {
  try {
    const row = await FriendReferral.findOne({ where: { enrollment_id: enrollmentId } });
    return !!row;
  } catch (err: any) {
    console.warn('[friendReferralService] hasReferral failed open:', err?.message);
    return false;
  }
}
