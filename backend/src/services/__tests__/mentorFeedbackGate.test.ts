import { isReleasedToStudent, toStudentFeedback } from '../mentorFeedbackGate';
import type { MentorReviewStatus } from '../../models/MentorReviewItem';

const baseReview = {
  id: 'r1',
  submission_id: 's1',
  ai_feedback: 'STRENGTHS: ... GAPS: ... NEXT STEPS: ...',
  reviewer_notes: null as string | null,
  reviewed_at: null as Date | null,
  created_at: new Date('2026-09-10T12:00:00Z'),
};
const sub = {
  title: 'Build Lab: churn model',
  assignment_type: 'build_lab',
  version_number: 2,
  status: 'submitted',
  submitted_at: new Date('2026-09-09T10:00:00Z'),
};

describe('isReleasedToStudent', () => {
  it('releases only auto_approved and approved', () => {
    expect(isReleasedToStudent('auto_approved')).toBe(true);
    expect(isReleasedToStudent('approved')).toBe(true);
    expect(isReleasedToStudent('pending_review')).toBe(false);
    expect(isReleasedToStudent('dismissed')).toBe(false);
  });
});

describe('toStudentFeedback', () => {
  it('drops pending_review — a human has not vetted it', () => {
    expect(toStudentFeedback({ ...baseReview, status: 'pending_review' }, sub)).toBeNull();
  });

  it('drops dismissed — a human rejected it', () => {
    expect(toStudentFeedback({ ...baseReview, status: 'dismissed' }, sub)).toBeNull();
  });

  it('auto_approved is shown but is not human-reviewed and shows no notes', () => {
    // Even a stray note on an auto-released row must not surface — notes are a human artifact.
    const out = toStudentFeedback({ ...baseReview, status: 'auto_approved', reviewer_notes: 'leaked note' }, sub);
    expect(out).not.toBeNull();
    expect(out!.review_status).toBe('auto_approved');
    expect(out!.human_reviewed).toBe(false);
    expect(out!.reviewer_notes).toBeNull();
  });

  it('approved carries the mentor notes through and is marked human-reviewed', () => {
    const out = toStudentFeedback({ ...baseReview, status: 'approved', reviewer_notes: 'Tighten the exec summary.' }, sub);
    expect(out!.human_reviewed).toBe(true);
    expect(out!.reviewer_notes).toBe('Tighten the exec summary.');
  });

  it('approved with no notes is null notes, still human-reviewed', () => {
    const out = toStudentFeedback({ ...baseReview, status: 'approved', reviewer_notes: null }, sub);
    expect(out!.human_reviewed).toBe(true);
    expect(out!.reviewer_notes).toBeNull();
  });

  it('shapes the submission context and normalizes dates to ISO', () => {
    const out = toStudentFeedback({ ...baseReview, status: 'auto_approved' }, sub);
    expect(out!.submission).toEqual({
      title: 'Build Lab: churn model',
      assignment_type: 'build_lab',
      version_number: 2,
      status: 'submitted',
      submitted_at: '2026-09-09T10:00:00.000Z',
    });
    expect(out!.created_at).toBe('2026-09-10T12:00:00.000Z');
  });

  it('tolerates a missing submission and defaults version to 1', () => {
    const out = toStudentFeedback({ ...baseReview, status: 'approved' }, null);
    expect(out!.submission).toBeNull();
    const out2 = toStudentFeedback({ ...baseReview, status: 'approved' }, { ...sub, version_number: undefined as any });
    expect(out2!.submission!.version_number).toBe(1);
  });
});

// Compile-time guard that the status union is exhausted by the two release states
// plus the two withheld ones — if a new status is added, this array stops covering it.
const ALL_STATUSES: MentorReviewStatus[] = ['pending_review', 'auto_approved', 'approved', 'dismissed'];
describe('release coverage', () => {
  it('exactly two of the four statuses are released', () => {
    expect(ALL_STATUSES.filter(isReleasedToStudent)).toEqual(['auto_approved', 'approved']);
  });
});
