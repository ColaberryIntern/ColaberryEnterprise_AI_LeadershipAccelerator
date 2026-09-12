import { sequelize } from '../../config/database';
import InternshipApplication from '../../models/InternshipApplication';
import InternshipInterviewResponse from '../../models/InternshipInterviewResponse';
import InternshipInterviewSession from '../../models/InternshipInterviewSession';
import {
  ACTIVE_QUESTION_SET_VERSION,
  SECTION_TITLES,
  activeQuestionKeys,
  findQuestion,
  isValidAnswer,
  orderedQuestions,
  type InterviewQuestion,
} from './internshipQuestionBank';
import { transition } from './internshipApplicationService';
import { emitInternshipEvent } from './internshipAnalytics';

/**
 * The interview, across both channels.
 *
 * ── THE RESUME RULE, WHICH IS THE WHOLE FEATURE ────────────────────────────
 *
 * "Ask only unanswered or unresolved questions when resuming." That is
 * `remainingQuestions()`, and it is derived from the ANSWERS, never from a
 * cursor on the session. A cursor would be per-channel by construction and would
 * therefore ask the phone questions the form already answered — the exact defect
 * the contract forbids.
 *
 * `answered` and `confirmed` are resolved. `not_asked`, `skipped` and
 * `needs_followup` are not, so a skipped question comes back around and a
 * follow-up flagged by the AI is re-asked rather than quietly accepted.
 */

/** Answer states that count as done. Everything else gets asked again. */
const RESOLVED_STATES = new Set(['answered', 'confirmed']);

export interface AnswerInput {
  question_key: string;
  answer_text?: string | null;
  answer_value?: unknown;
  /** Defaults to 'answered'. A transcript extraction may pass 'needs_followup'. */
  state?: 'answered' | 'skipped' | 'needs_followup' | 'confirmed';
}

export interface InterviewProgress {
  version: number;
  total: number;
  resolved: number;
  remaining: number;
  complete: boolean;
  /**
   * Answers captured from a phone call and awaiting the applicant's confirmation
   * (`needs_followup`). They are NOT resolved — the transcript is imperfect and
   * the person has to see their own words before they count — but they are also
   * not nothing, and a UI that reported "Question 1 of 21" after a full call would
   * be lying about what happened. This is what lets the interview say "17 from
   * your call, confirm each below" instead.
   */
  captured_pending: number;
}

/** Every answer on an application, keyed for lookup. */
export async function answerMap(applicationId: string): Promise<Map<string, InternshipInterviewResponse>> {
  const rows = await InternshipInterviewResponse.findAll({ where: { application_id: applicationId } });
  return new Map(rows.map((r) => [r.question_key, r]));
}

/**
 * Questions still to ask, in ask-order.
 *
 * Channel-agnostic on purpose: the phone and the form both call this, so they
 * cannot disagree about what is left.
 */
export async function remainingQuestions(applicationId: string): Promise<InterviewQuestion[]> {
  const answers = await answerMap(applicationId);
  return orderedQuestions().filter((q) => {
    const a = answers.get(q.question_key);
    return !a || !RESOLVED_STATES.has(a.state);
  });
}

export async function progress(applicationId: string): Promise<InterviewProgress> {
  const all = orderedQuestions();
  const answers = await answerMap(applicationId);
  const remaining = all.filter((q) => {
    const a = answers.get(q.question_key);
    return !a || !RESOLVED_STATES.has(a.state);
  });
  const capturedPending = all.filter((q) => answers.get(q.question_key)?.state === 'needs_followup').length;
  return {
    version: ACTIVE_QUESTION_SET_VERSION,
    total: all.length,
    resolved: all.length - remaining.length,
    remaining: remaining.length,
    complete: remaining.length === 0,
    captured_pending: capturedPending,
  };
}

/** The next single question to ask, or null when the interview is complete. */
export async function nextQuestion(applicationId: string): Promise<InterviewQuestion | null> {
  const [next] = await remainingQuestions(applicationId);
  return next ?? null;
}

/**
 * Open (or reuse) a session for a channel.
 *
 * Reuses an in-progress session for the SAME channel rather than opening a
 * second: a student reloading the form mid-interview should not fragment their
 * own audit trail into a dozen sessions.
 */
export async function openSession(params: {
  applicationId: string;
  channel: 'form' | 'phone';
  scheduledFor?: Date | null;
}): Promise<InternshipInterviewSession> {
  const existing = await InternshipInterviewSession.findOne({
    where: { application_id: params.applicationId, channel: params.channel, status: 'in_progress' },
    order: [['created_at', 'DESC']],
  });
  if (existing) return existing;

  return InternshipInterviewSession.create({
    application_id: params.applicationId,
    channel: params.channel,
    status: params.scheduledFor ? 'scheduled' : 'in_progress',
    scheduled_for: params.scheduledFor ?? null,
    started_at: params.scheduledFor ? null : new Date(),
  } as any);
}

/**
 * Record answers. Idempotent per question — the second write to a question
 * UPDATES rather than inserting, which is what the unique index enforces anyway.
 *
 * Rejects any key not in the active bank. A transcript extraction or a tampered
 * request cannot invent a question, so the reviewer never sees an answer to
 * something nobody agreed to ask.
 */
export async function saveAnswers(params: {
  application: InternshipApplication;
  session: InternshipInterviewSession;
  answers: AnswerInput[];
  /** Set when the applicant is editing an answer they already gave. */
  isCorrection?: boolean;
}): Promise<{ saved: string[]; rejected: string[] }> {
  const validKeys = new Set(activeQuestionKeys());
  const saved: string[] = [];
  const rejected: string[] = [];

  await sequelize.transaction(async (tx) => {
    for (const input of params.answers) {
      const question = validKeys.has(input.question_key) ? findQuestion(input.question_key) : null;
      if (!question) { rejected.push(input.question_key); continue; }

      const state = input.state ?? 'answered';

      // A "skipped" answer carries no value, so it is exempt from type
      // validation — but it still records that we asked.
      if (state !== 'skipped' && !isValidAnswer(question, input)) {
        rejected.push(input.question_key);
        continue;
      }

      const [row] = await InternshipInterviewResponse.findOrCreate({
        where: { application_id: params.application.id, question_key: input.question_key },
        defaults: {
          application_id: params.application.id,
          question_key: input.question_key,
          question_set_version: ACTIVE_QUESTION_SET_VERSION,
          // First writer wins the attribution — see the model header.
          answered_via: params.session.channel,
        } as any,
        transaction: tx,
      });

      await row.update({
        session_id: params.session.id,
        answer_text: input.answer_text ?? null,
        answer_value: input.answer_value ?? null,
        state,
        question_set_version: ACTIVE_QUESTION_SET_VERSION,
        answered_at: row.answered_at ?? new Date(),
        ...(params.isCorrection ? { corrected_at: new Date() } : {}),
      }, { transaction: tx });

      saved.push(input.question_key);
    }
  });

  return { saved, rejected };
}

/**
 * Move the application into the interview if it is not already there.
 *
 * Separate from `saveAnswers` so an autosave does not carry a lifecycle side
 * effect, and so the phone path can announce the same transition.
 */
export async function markInterviewStarted(params: {
  application: InternshipApplication;
  enrollmentId: string;
  channel: 'form' | 'phone';
}): Promise<void> {
  const { application } = params;
  const startable = ['interview_channel_selected', 'interview_scheduled', 'interview_in_progress'];
  if (!startable.includes(application.state)) return;

  await transition(application.id, 'interview_in_progress', {
    actor: 'applicant',
    actorId: params.enrollmentId,
    reason: `channel=${params.channel}`,
    evidenceSource: params.channel === 'phone' ? 'synthflow' : 'portal',
  });

  await emitInternshipEvent({
    enrollmentId: params.enrollmentId,
    event: 'internship_interview_started',
    meta: { application_id: application.id, channel: params.channel },
  });
}

/**
 * Close the interview once every question is resolved.
 *
 * Returns false when questions remain, so a channel cannot declare an interview
 * finished that it merely stopped participating in — a dropped call must not
 * complete an interview.
 */
export async function completeInterviewIfDone(params: {
  application: InternshipApplication;
  enrollmentId: string;
  session?: InternshipInterviewSession | null;
}): Promise<boolean> {
  const p = await progress(params.application.id);
  if (!p.complete) return false;

  if (params.session && params.session.status === 'in_progress') {
    await params.session.update({ status: 'completed', completed_at: new Date() });
  }

  if (params.application.state === 'interview_in_progress') {
    await transition(params.application.id, 'interview_complete', {
      actor: 'applicant',
      actorId: params.enrollmentId,
      evidenceSource: 'portal',
    });
    await emitInternshipEvent({
      enrollmentId: params.enrollmentId,
      event: 'internship_interview_completed',
      meta: { application_id: params.application.id },
    });
  }
  return true;
}

export interface SummaryLine {
  question_key: string;
  section: string;
  section_title: string;
  question: string;
  answer_display: string;
  state: string;
  answered_via: string | null;
  is_confirmation: boolean;
}

/**
 * The structured summary the applicant reviews and may correct before submitting.
 *
 * Deliberately shows their own words back rather than a paraphrase. A summary that
 * reworded the answers would be asking them to approve our interpretation, and a
 * phone answer they never see written down is one they cannot correct.
 */
export async function buildSummary(applicationId: string): Promise<SummaryLine[]> {
  const answers = await answerMap(applicationId);

  return orderedQuestions().map((q) => {
    const a = answers.get(q.question_key);
    return {
      question_key: q.question_key,
      section: q.section,
      section_title: SECTION_TITLES[q.section],
      question: q.prompt_form,
      answer_display: displayAnswer(q, a),
      state: a?.state ?? 'not_asked',
      answered_via: a?.answered_via ?? null,
      is_confirmation: !!q.is_confirmation,
    };
  });
}

function displayAnswer(
  q: InterviewQuestion,
  a: InternshipInterviewResponse | undefined,
): string {
  if (!a || a.state === 'not_asked') return '';
  if (a.state === 'skipped') return '(skipped)';
  if (q.answer_type === 'yes_no') return a.answer_value === true ? 'Yes' : a.answer_value === false ? 'No' : '';
  if (q.answer_type === 'choice') return typeof a.answer_value === 'string' ? a.answer_value.replace(/_/g, ' ') : '';
  return a.answer_text ?? '';
}
