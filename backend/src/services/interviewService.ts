import Anthropic from '@anthropic-ai/sdk';
import InterviewSession, { InterviewAnswer, InterviewStatus } from '../models/InterviewSession';
import InterviewRubric, { RubricQuestion } from '../models/InterviewRubric';
import Enrollment from '../models/Enrollment';
import { env } from '../config/env';
import { sendInterviewResult } from './emailService';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: env.anthropicApiKey, timeout: 30000, maxRetries: 2 });
  }
  return _client;
}

export function _resetClientForTesting(): void {
  _client = null;
}

function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>): void {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'interview', event, ...ctx }));
}

// ─── Scoring (pure function — deterministic, unit-testable) ───────────────────

export function scoreAnswer(answer: string, expectedTopics: string[], maxPoints: number): number {
  if (!expectedTopics.length) return 0;
  const lower = answer.toLowerCase();
  const hits = expectedTopics.filter((t) => lower.includes(t.toLowerCase())).length;
  return Math.round((hits / expectedTopics.length) * maxPoints);
}

export function computeInterviewScore(
  answers: Array<{ question_id: string; answer: string }>,
  questions: RubricQuestion[]
): { scoredAnswers: InterviewAnswer[]; total_score: number } {
  const maxTotal = questions.reduce((s, q) => s + q.max_points, 0);

  const scoredAnswers: InterviewAnswer[] = questions.map((q) => {
    const submitted = answers.find((a) => a.question_id === q.id);
    const points = submitted
      ? scoreAnswer(submitted.answer, q.expected_topics, q.max_points)
      : 0;
    return {
      question_id: q.id,
      question_text: q.text,
      answer: submitted?.answer ?? '',
      points_earned: points,
    };
  });

  const rawTotal = scoredAnswers.reduce((s, a) => s + a.points_earned, 0);
  const total_score = maxTotal > 0 ? Math.round((rawTotal / maxTotal) * 100) : 0;
  return { scoredAnswers, total_score };
}

// ─── LLM feedback (non-deterministic narrative — separate from score) ─────────

async function generateFeedback(
  weekNumber: number,
  scoredAnswers: InterviewAnswer[],
  totalScore: number
): Promise<string> {
  const client = getClient();
  const answerBlock = scoredAnswers
    .map((a, i) => `Q${i + 1}: ${a.question_text}\nA: ${a.answer}\nPoints: ${a.points_earned}`)
    .join('\n\n');

  const message = await client.messages.create({
    model: env.advisorClaudeModel,
    max_tokens: 800,
    system:
      'You are a technical interviewer for the AI Systems Architect program at Colaberry. ' +
      'Write concise, actionable feedback (3–5 sentences) on the student\'s mock interview answers. ' +
      'Be specific, constructive, and encouraging. Do not repeat the questions verbatim.',
    messages: [
      {
        role: 'user',
        content:
          `Week ${weekNumber} mock interview — overall score: ${totalScore}/100.\n\n${answerBlock}`,
      },
    ],
  });

  return (message.content[0] as Anthropic.TextBlock).text;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface StartInterviewResult {
  session_id: string;
  status: InterviewStatus;
  questions: Array<{ id: string; text: string }>;
  already_completed: boolean;
}

// Idempotent: returns existing session if one already exists for this enrollment + week.
export async function startInterview(
  enrollmentId: string,
  weekNumber: number
): Promise<StartInterviewResult> {
  const rubric = await InterviewRubric.findOne({ where: { week_number: weekNumber } });
  if (!rubric) {
    throw Object.assign(new Error(`No interview rubric for week ${weekNumber}`), {
      error_class: 'ValidationError',
    });
  }

  const [session, created] = await InterviewSession.findOrCreate({
    where: { enrollment_id: enrollmentId, week_number: weekNumber },
    defaults: { rubric_id: rubric.id, status: 'in_progress', answers: [] },
  });

  if (!created && session.status === 'pending') {
    await session.update({ status: 'in_progress', updated_at: new Date() });
  }

  log('info', 'interview_started', {
    enrollment_id: enrollmentId,
    week_number: weekNumber,
    session_id: session.id,
    created,
    outcome: 'success',
  });

  return {
    session_id: session.id,
    status: session.status as InterviewStatus,
    questions: rubric.questions.map((q) => ({ id: q.id, text: q.text })),
    already_completed: session.status === 'completed',
  };
}

export interface SubmitInterviewResult {
  total_score: number;
  feedback: string;
  emailed: boolean;
}

export async function submitInterview(
  sessionId: string,
  enrollmentId: string,
  rawAnswers: Array<{ question_id: string; answer: string }>
): Promise<SubmitInterviewResult> {
  const session = await InterviewSession.findOne({
    where: { id: sessionId, enrollment_id: enrollmentId },
    include: [{ model: InterviewRubric, as: 'rubric' }],
  });

  if (!session) {
    throw Object.assign(new Error('Interview session not found'), { error_class: 'ValidationError' });
  }

  // Already scored — idempotent: return stored result without re-scoring or re-emailing.
  if (session.status === 'completed' && session.total_score !== null) {
    return {
      total_score: session.total_score,
      feedback: session.feedback ?? '',
      emailed: session.emailed_at !== null,
    };
  }

  const rubric = session.get('rubric') as InterviewRubric;
  const { scoredAnswers, total_score } = computeInterviewScore(rawAnswers, rubric.questions);

  let feedback = '';
  try {
    feedback = await generateFeedback(session.week_number, scoredAnswers, total_score);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', 'feedback_generation_failed', { session_id: sessionId, error: msg, error_class: 'UpstreamUnavailable' });
    feedback = 'Feedback generation is temporarily unavailable. Your score has been recorded.';
  }

  await session.update({
    status: 'completed',
    answers: scoredAnswers,
    total_score,
    feedback,
    updated_at: new Date(),
  });

  let emailed = false;
  try {
    const enrollment = await Enrollment.findByPk(enrollmentId);
    if (enrollment) {
      await sendInterviewResult({
        to: enrollment.email,
        full_name: enrollment.full_name,
        week_number: session.week_number,
        total_score,
        feedback,
      });
      await session.update({ emailed_at: new Date(), updated_at: new Date() });
      emailed = true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', 'interview_email_failed', { session_id: sessionId, error: msg, error_class: 'UpstreamUnavailable' });
  }

  log('info', 'interview_submitted', {
    session_id: sessionId,
    enrollment_id: enrollmentId,
    week_number: session.week_number,
    total_score,
    emailed,
    outcome: 'success',
  });

  return { total_score, feedback, emailed };
}
