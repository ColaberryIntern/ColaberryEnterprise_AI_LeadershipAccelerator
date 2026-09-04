import MentorReviewItem from '../../models/MentorReviewItem';
import { InstructorFeedbackValue, SnapshotField } from './types';

const RELEASED_STATUSES = ['auto_approved', 'approved'];

/**
 * Only status IN ('auto_approved', 'approved') — the same real release
 * gate mentorFeedbackService.ts's own getFeedbackForSubmission() uses.
 * A pending_review or dismissed item was never actually shown to this
 * student and must not be surfaced here as if it were — this evidence
 * service reflects what the student really has, not what's in the review
 * queue.
 */
export async function getInstructorFeedbackField(enrollmentId: string): Promise<SnapshotField<InstructorFeedbackValue>> {
  const rows = await MentorReviewItem.findAll({
    where: { enrollment_id: enrollmentId, status: RELEASED_STATUSES as any },
    order: [['created_at', 'DESC']],
  });

  const latest: any = rows[0] || null;

  return {
    value: {
      releasedCount: rows.length,
      lastReleasedAt: latest ? new Date(latest.created_at).toISOString() : null,
      avgConfidence: rows.length ? (rows as any[]).reduce((sum, r) => sum + (r.confidence_score || 0), 0) / rows.length : null,
    },
    status: 'known',
    sourceSystem: 'mentor_review_items',
    sourceRecordIds: rows.map((r: any) => r.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time-on-submission',
    reliabilityState: 'healthy',
  };
}
