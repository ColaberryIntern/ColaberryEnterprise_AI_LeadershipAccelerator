import OpenAI from 'openai';
import AssignmentSubmission from '../models/AssignmentSubmission';
import MentorReviewItem, { MentorReviewStatus } from '../models/MentorReviewItem';

const CONFIDENCE_THRESHOLD = parseFloat(process.env.MENTOR_CONFIDENCE_THRESHOLD || '0.8');
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const HEDGING_PHRASES = [
  'cannot determine',
  'insufficient information',
  'unclear',
  'not enough detail',
  'unable to assess',
  'hard to say',
  'difficult to evaluate',
];

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/* ------------------------------------------------------------------ */
/*  Confidence heuristic                                               */
/* ------------------------------------------------------------------ */

export function estimateConfidence(
  assignmentType: string,
  contentJson: unknown,
  aiFeedback: string
): number {
  let score = 0.85;

  // Very short or missing content signals the AI had little to work with
  const contentText = contentJson ? JSON.stringify(contentJson) : '';
  if (contentText.length < 100) score -= 0.35;

  // File-only uploads with no content_json are low-signal
  if (assignmentType === 'prework_upload' && !contentJson) score -= 0.20;

  // Hedging language in the AI reply indicates low confidence
  const lower = aiFeedback.toLowerCase();
  if (HEDGING_PHRASES.some((p) => lower.includes(p))) score -= 0.15;

  return Math.max(0, Math.min(1, score));
}

/* ------------------------------------------------------------------ */
/*  AI feedback generation                                             */
/* ------------------------------------------------------------------ */

async function generateFeedback(submission: AssignmentSubmission): Promise<string> {
  const contentSummary = submission.content_json
    ? JSON.stringify(submission.content_json).slice(0, 3000)
    : '(no text content — file submission)';

  const prompt = `You are reviewing a student submission for the Colaberry Enterprise AI Leadership Accelerator.

Assignment type: ${submission.assignment_type}
Title: ${submission.title}
Content: ${contentSummary}

Provide concise, rubric-based feedback in three parts:
1. STRENGTHS: what the student did well (2-3 bullet points)
2. GAPS: what is missing or needs improvement (2-3 bullet points)
3. NEXT STEPS: 1-2 specific, actionable things the student should do next

Keep the total response under 300 words. Be direct and constructive.`;

  const response = await getOpenAI().chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 400,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

/* ------------------------------------------------------------------ */
/*  Main entry point — called non-blocking after submission creation   */
/* ------------------------------------------------------------------ */

export async function processSubmissionForMentor(submissionId: string): Promise<void> {
  // Idempotency: bail if a review item already exists for this submission
  const existing = await MentorReviewItem.findOne({ where: { submission_id: submissionId } });
  if (existing) return;

  const submission = await AssignmentSubmission.findByPk(submissionId);
  if (!submission) return;

  let aiFeedback: string;
  try {
    aiFeedback = await generateFeedback(submission);
  } catch (err: any) {
    // OpenAI failure must not surface to the student or break the submission
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'mentor-feedback',
      event: 'openai_feedback_generation_failed',
      submission_id: submissionId,
      error_class: err.constructor?.name || 'Error',
      message: err.message,
    }));
    return;
  }

  if (!aiFeedback) return;

  const confidence = estimateConfidence(
    submission.assignment_type,
    submission.content_json,
    aiFeedback
  );

  const status: MentorReviewStatus =
    confidence >= CONFIDENCE_THRESHOLD ? 'auto_approved' : 'pending_review';

  await MentorReviewItem.create({
    submission_id: submissionId,
    enrollment_id: submission.enrollment_id,
    ai_feedback: aiFeedback,
    confidence_score: confidence,
    status,
  } as any);

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'mentor-feedback',
    event: 'mentor_review_item_created',
    submission_id: submissionId,
    enrollment_id: submission.enrollment_id,
    confidence,
    status,
    outcome: 'success',
  }));
}

/* ------------------------------------------------------------------ */
/*  Admin queue operations                                             */
/* ------------------------------------------------------------------ */

export async function listPendingReviews(): Promise<MentorReviewItem[]> {
  return MentorReviewItem.findAll({
    where: { status: 'pending_review' },
    order: [['created_at', 'ASC']],
  });
}

export async function approveReview(
  reviewItemId: string,
  reviewerNotes?: string
): Promise<MentorReviewItem | null> {
  const item = await MentorReviewItem.findByPk(reviewItemId);
  if (!item) return null;
  await item.update({
    status: 'approved',
    reviewer_notes: reviewerNotes || null,
    reviewed_at: new Date(),
  });
  return item;
}

export async function dismissReview(reviewItemId: string): Promise<MentorReviewItem | null> {
  const item = await MentorReviewItem.findByPk(reviewItemId);
  if (!item) return null;
  await item.update({ status: 'dismissed', reviewed_at: new Date() });
  return item;
}

/* ------------------------------------------------------------------ */
/*  Student read                                                       */
/* ------------------------------------------------------------------ */

export async function getFeedbackForSubmission(
  submissionId: string,
  enrollmentId: string
): Promise<{ ai_feedback: string; status: MentorReviewStatus; reviewer_notes: string | null } | null> {
  const item = await MentorReviewItem.findOne({
    where: { submission_id: submissionId, enrollment_id: enrollmentId },
  });
  if (!item) return null;

  // Human-review gate: only feedback that cleared review reaches the student.
  // pending_review = a human hasn't vetted the low-confidence feedback yet;
  // dismissed = a human explicitly rejected it. Neither is shown — the route
  // treats null as "no mentor feedback available yet" (404).
  const RELEASED: MentorReviewStatus[] = ['auto_approved', 'approved'];
  if (!RELEASED.includes(item.status)) return null;

  return {
    ai_feedback: item.ai_feedback,
    status: item.status,
    reviewer_notes: item.status === 'approved' ? item.reviewer_notes : null,
  };
}
