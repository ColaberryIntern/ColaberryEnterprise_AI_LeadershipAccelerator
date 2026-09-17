/**
 * mentorFeedbackGate — the one place that decides what mentor feedback a student
 * may see, and how it is shaped for them. Pure and I/O-free (it imports only
 * TYPES from the models, so nothing here touches the database), which is exactly
 * why the release gate lives here: every student-facing read runs through it, and
 * the rule can be tested in isolation.
 *
 * THE GATE. A student sees an item ONLY when it is:
 *   - auto_approved: confidence cleared the threshold, released without a human.
 *   - approved:      a human mentor read it and approved it.
 * and NEVER when it is:
 *   - pending_review: low-confidence feedback a human has not vetted yet.
 *   - dismissed:      a human explicitly rejected it.
 */
import type { MentorReviewStatus, MentorReviewItemAttributes } from '../models/MentorReviewItem';
import type { AssignmentSubmissionAttributes } from '../models/AssignmentSubmission';

export const RELEASED_MENTOR_STATUSES: MentorReviewStatus[] = ['auto_approved', 'approved'];

export function isReleasedToStudent(status: MentorReviewStatus): boolean {
  return RELEASED_MENTOR_STATUSES.includes(status);
}

/** One released feedback item as the student sees it, with its submission context. */
export interface StudentFeedbackItem {
  review_id: string;
  submission_id: string;
  /** AI-generated guidance. Always AI-authored — `human_reviewed` says whether a
   *  mentor then vetted it. Labelled as guidance in the UI, never as a grade. */
  ai_feedback: string;
  review_status: 'auto_approved' | 'approved';
  /** True only for `approved` — a mentor read and approved it (not just auto-released). */
  human_reviewed: boolean;
  /** The mentor's own notes. Present only on an approved (human-reviewed) item —
   *  an auto-released item has no human notes to show. */
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  submission: {
    title: string;
    assignment_type: string;
    /** Resubmissions bump this — version 1 is the first submission. */
    version_number: number;
    status: string;
    submitted_at: string | null;
  } | null;
}

const toIso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : String(d);

/**
 * Shape one review + its submission into the student-facing item, applying the
 * release gate and the reviewer-notes rule. Returns null for a status that must
 * not reach the student, so the gate is enforced right here in the mapping.
 */
export function toStudentFeedback(
  review: Pick<MentorReviewItemAttributes, 'id' | 'submission_id' | 'ai_feedback' | 'status' | 'reviewer_notes' | 'reviewed_at' | 'created_at'>,
  submission: Pick<AssignmentSubmissionAttributes, 'title' | 'assignment_type' | 'version_number' | 'status' | 'submitted_at'> | null,
): StudentFeedbackItem | null {
  if (!isReleasedToStudent(review.status)) return null;
  const human = review.status === 'approved';
  return {
    review_id: review.id,
    submission_id: review.submission_id,
    ai_feedback: review.ai_feedback,
    review_status: review.status as 'auto_approved' | 'approved',
    human_reviewed: human,
    // Notes belong to a human review; an auto-released item must not show any,
    // even if a stray value were present on the row.
    reviewer_notes: human ? (review.reviewer_notes ?? null) : null,
    reviewed_at: toIso(review.reviewed_at),
    created_at: toIso(review.created_at),
    submission: submission
      ? {
        title: submission.title,
        assignment_type: submission.assignment_type,
        version_number: submission.version_number ?? 1,
        status: submission.status,
        submitted_at: toIso(submission.submitted_at),
      }
      : null,
  };
}
