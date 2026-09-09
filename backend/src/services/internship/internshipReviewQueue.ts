import { Op } from 'sequelize';
import Enrollment from '../../models/Enrollment';
import InternshipApplication from '../../models/InternshipApplication';
import InternshipAdministrativeIntake from '../../models/InternshipAdministrativeIntake';
import InternshipInterviewResponse from '../../models/InternshipInterviewResponse';
import InternshipInterviewSession from '../../models/InternshipInterviewSession';
import InternshipStatusEvent from '../../models/InternshipStatusEvent';
import { buildRecommendation, type Recommendation } from './internshipRecommendation';
import { buildSummary, progress, type SummaryLine } from './internshipInterviewService';
import { decisionHistory } from './internshipDecisionService';
import { REASON_DEFINITIONS } from './internshipReasonCodes';
import { orderedQuestions } from './internshipQuestionBank';

/**
 * Dhee's review surface.
 *
 * ── WHAT THE REVIEWER IS SHOWN, AND WHAT THEY ARE NOT ──────────────────────
 *
 * The contract lists what a reviewer must see, and one thing they must not: "Do
 * not show a hidden personality score or infer protected traits." So the detail
 * view carries the applicant's own answers, the interview channel, the
 * confirmations, the contradictions with evidence quoted, and the full audit
 * trail — and no score of any kind, because none exists to show.
 *
 * ── RELIABILITY IS DECLARED, NOT ASSUMED ───────────────────────────────────
 *
 * "Each metric must retain source, observed time, freshness, and reliability
 * state. If attendance or another source is unreliable, mark it unknown and
 * exclude it from automated assessment rather than treating it as zero."
 *
 * `buildProfileSignals` returns every signal with an explicit `reliability`, and
 * anything `unknown` is handed to `buildRecommendation` as an EXCLUDED signal
 * rather than as a zero. A reviewer therefore sees "attendance: unknown (no rows
 * for this cohort)" instead of "attendance: 0%", which is the difference between
 * missing data and a bad student.
 */

const OPEN_STATES_EXCLUDED = ['rejected', 'withdrawn', 'removed', 'completed'];

export interface QueueRow {
  application_id: string;
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
  state: string;
  interview_channel: string | null;
  submitted_at: string | null;
  created_at: string;
  progress: { resolved: number; total: number };
  /** Blocking factor count. A number, not a score — it is a count of things to look at. */
  blocking_count: number;
}

/** Queue buckets, matching the admin surface the contract asks for. */
export type QueueBucket =
  | 'awaiting_review'
  | 'information_requested'
  | 'waitlisted'
  | 'interview_incomplete'
  | 'calls_failed'
  | 'approved_awaiting_documents'
  | 'all_open';

const BUCKET_STATES: Record<Exclude<QueueBucket, 'calls_failed' | 'all_open'>, string[]> = {
  awaiting_review: ['under_review'],
  information_requested: ['information_requested'],
  waitlisted: ['waitlisted'],
  interview_incomplete: ['interview_channel_selected', 'interview_scheduled', 'interview_in_progress', 'interview_complete'],
  approved_awaiting_documents: ['approved', 'offer_letter_ready', 'signed_documents_uploaded'],
};

export async function queueCounts(): Promise<Record<QueueBucket, number>> {
  const counts = {} as Record<QueueBucket, number>;

  for (const [bucket, states] of Object.entries(BUCKET_STATES)) {
    counts[bucket as QueueBucket] = await InternshipApplication.count({
      where: { state: { [Op.in]: states } },
    });
  }

  // "Calls failed or incomplete" is a property of the SESSION, not the
  // application state — an application can sit in interview_in_progress with a
  // failed call behind it, and that is exactly the person who needs chasing.
  const failedSessions = await InternshipInterviewSession.findAll({
    where: { channel: 'phone', status: 'failed' },
    attributes: ['application_id'],
    group: ['application_id'],
  });
  counts.calls_failed = failedSessions.length;

  counts.all_open = await InternshipApplication.count({
    where: { state: { [Op.notIn]: OPEN_STATES_EXCLUDED } },
  });

  return counts;
}

export async function queue(params: {
  bucket: QueueBucket;
  limit: number;
  offset: number;
}): Promise<{ rows: QueueRow[]; total: number }> {
  let where: any;

  if (params.bucket === 'all_open') {
    where = { state: { [Op.notIn]: OPEN_STATES_EXCLUDED } };
  } else if (params.bucket === 'calls_failed') {
    const failed = await InternshipInterviewSession.findAll({
      where: { channel: 'phone', status: 'failed' },
      attributes: ['application_id'],
      group: ['application_id'],
    });
    const ids = failed.map((s) => s.application_id);
    // An empty IN () is a SQL error in some dialects and an always-false in
    // others. Short-circuit rather than depend on which.
    if (!ids.length) return { rows: [], total: 0 };
    where = { id: { [Op.in]: ids }, state: { [Op.notIn]: OPEN_STATES_EXCLUDED } };
  } else {
    where = { state: { [Op.in]: BUCKET_STATES[params.bucket] } };
  }

  const total = await InternshipApplication.count({ where });
  const apps = await InternshipApplication.findAll({
    where,
    order: [['submitted_at', 'ASC'], ['created_at', 'ASC']],
    limit: params.limit,
    offset: params.offset,
  });

  const rows: QueueRow[] = [];
  const allQuestions = orderedQuestions().length;

  for (const app of apps) {
    const [enrollment, answers] = await Promise.all([
      Enrollment.findByPk(app.enrollment_id, { attributes: ['full_name', 'email'] }),
      InternshipInterviewResponse.findAll({ where: { application_id: app.id } }),
    ]);

    const rec = buildRecommendation({
      answers: answers.map((r) => ({
        question_key: r.question_key,
        answer_text: r.answer_text,
        answer_value: r.answer_value,
        state: r.state,
      })),
      attests_not_employed_fulltime: app.attests_not_employed_fulltime,
      commitment_acknowledged: !!app.commitment_acknowledged_at,
    });

    rows.push({
      application_id: app.id,
      enrollment_id: app.enrollment_id,
      full_name: (enrollment as any)?.full_name ?? null,
      email: (enrollment as any)?.email ?? null,
      state: app.state,
      interview_channel: app.interview_channel,
      submitted_at: app.submitted_at ? new Date(app.submitted_at).toISOString() : null,
      created_at: new Date(app.created_at).toISOString(),
      progress: { resolved: rec.completeness.resolved, total: allQuestions },
      blocking_count: rec.factors.filter((f) => f.severity === 'blocking').length,
    });
  }

  return { rows, total };
}

export interface ProfileSignal {
  key: string;
  label: string;
  value: string | number | null;
  source: string;
  observed_at: string | null;
  reliability: 'reliable' | 'unknown';
  reason?: string;
}

/**
 * The Group C signals — things the platform already knows and must never ask for.
 *
 * Every one carries its source and reliability. A signal we cannot establish is
 * returned with `reliability: 'unknown'` and a reason, and the caller passes those
 * to the recommendation as exclusions rather than as zeros.
 */
export async function buildProfileSignals(app: InternshipApplication): Promise<ProfileSignal[]> {
  const signals: ProfileSignal[] = [];

  const enrollment = await Enrollment.findByPk(app.enrollment_id, {
    attributes: ['enrollment_type', 'payment_status', 'cohort_id', 'status', 'created_at'],
  });

  signals.push({
    key: 'enrollment_type',
    label: 'Account type',
    value: (enrollment as any)?.enrollment_type ?? null,
    source: 'enrollments',
    observed_at: (enrollment as any)?.created_at
      ? new Date((enrollment as any).created_at).toISOString()
      : null,
    reliability: enrollment ? 'reliable' : 'unknown',
    ...(enrollment ? {} : { reason: 'no enrollment row found' }),
  });

  signals.push({
    key: 'payment_status',
    label: 'Payment status',
    value: (enrollment as any)?.payment_status ?? null,
    source: 'enrollments',
    observed_at: null,
    reliability: enrollment ? 'reliable' : 'unknown',
    ...(enrollment ? {} : { reason: 'no enrollment row found' }),
  });

  signals.push({
    key: 'training_cohort',
    label: 'Training cohort',
    value: (enrollment as any)?.cohort_id ?? null,
    source: 'enrollments.cohort_id',
    observed_at: null,
    reliability: (enrollment as any)?.cohort_id ? 'reliable' : 'unknown',
    ...((enrollment as any)?.cohort_id ? {} : { reason: 'not placed in a cohort' }),
  });

  // Attendance is the contract's own example of a signal that must be marked
  // unknown rather than zero. Reading it properly needs the attendance
  // aggregation that Phase 7 builds, so until then it is declared unknown —
  // which is honest, and keeps it out of the recommendation either way.
  signals.push({
    key: 'attendance_rate',
    label: 'Attendance',
    value: null,
    source: 'attendance_records',
    observed_at: null,
    reliability: 'unknown',
    reason: 'attendance aggregation lands with the tracking phase; not read here',
  });

  return signals;
}

export interface ApplicationDetail {
  application: {
    id: string;
    enrollment_id: string;
    state: string;
    interview_channel: string | null;
    submitted_at: string | null;
    decided_at: string | null;
    attests_not_employed_fulltime: boolean;
    commitment_acknowledged_at: string | null;
    converted_from_existing_intern: boolean;
    created_at: string;
  };
  person: { full_name: string | null; email: string | null };
  intake: Record<string, unknown> | null;
  summary: SummaryLine[];
  progress: Awaited<ReturnType<typeof progress>>;
  sessions: Array<{
    id: string;
    channel: string;
    status: string;
    scheduled_for: string | null;
    completed_at: string | null;
    failure_reason: string | null;
    /** Present only when the applicant consented to recording. */
    transcript: string | null;
    transcript_withheld: boolean;
  }>;
  recommendation: Recommendation;
  signals: ProfileSignal[];
  decisions: Array<Record<string, unknown>>;
  timeline: Array<{
    from_state: string | null;
    to_state: string;
    actor_type: string;
    actor_id: string | null;
    reason: string | null;
    evidence_source: string | null;
    at: string;
  }>;
  reason_options: Array<{ code: string; label: string; applies_to: readonly string[] }>;
}

export async function applicationDetail(applicationId: string): Promise<ApplicationDetail | null> {
  const app = await InternshipApplication.findByPk(applicationId);
  if (!app) return null;

  const [enrollment, intake, answers, sessions, events, decisions, summary, prog, signals] =
    await Promise.all([
      Enrollment.findByPk(app.enrollment_id, { attributes: ['full_name', 'email'] }),
      InternshipAdministrativeIntake.findOne({ where: { application_id: app.id } }),
      InternshipInterviewResponse.findAll({ where: { application_id: app.id } }),
      InternshipInterviewSession.findAll({
        where: { application_id: app.id },
        order: [['created_at', 'ASC']],
      }),
      InternshipStatusEvent.findAll({
        where: { application_id: app.id },
        order: [['created_at', 'ASC']],
      }),
      decisionHistory(app.id),
      buildSummary(app.id),
      progress(app.id),
      buildProfileSignals(app),
    ]);

  // Unknown signals are EXCLUDED from the recommendation, never counted as zero.
  const unreliable = signals
    .filter((s) => s.reliability === 'unknown')
    .map((s) => ({ signal: s.key, reason: s.reason ?? 'reliability could not be established' }));

  const recommendation = buildRecommendation({
    answers: answers.map((r) => ({
      question_key: r.question_key,
      answer_text: r.answer_text,
      answer_value: r.answer_value,
      state: r.state,
    })),
    attests_not_employed_fulltime: app.attests_not_employed_fulltime,
    commitment_acknowledged: !!app.commitment_acknowledged_at,
    unreliable_signals: unreliable,
  });

  const consented = !!intake?.consent_recording;

  return {
    application: {
      id: app.id,
      enrollment_id: app.enrollment_id,
      state: app.state,
      interview_channel: app.interview_channel,
      submitted_at: app.submitted_at ? new Date(app.submitted_at).toISOString() : null,
      decided_at: app.decided_at ? new Date(app.decided_at).toISOString() : null,
      attests_not_employed_fulltime: app.attests_not_employed_fulltime,
      commitment_acknowledged_at: app.commitment_acknowledged_at
        ? new Date(app.commitment_acknowledged_at).toISOString()
        : null,
      converted_from_existing_intern: app.converted_from_existing_intern,
      created_at: new Date(app.created_at).toISOString(),
    },
    person: {
      full_name: (enrollment as any)?.full_name ?? null,
      email: (enrollment as any)?.email ?? null,
    },
    intake: intake
      ? {
        legal_name: intake.legal_name,
        preferred_name: intake.preferred_name,
        phone: intake.phone,
        time_zone: intake.time_zone,
        country: intake.country,
        linkedin_url: intake.linkedin_url,
        github_url: intake.github_url,
        portfolio_url: intake.portfolio_url,
        work_auth_category: intake.work_auth_category,
        permission_to_call: intake.permission_to_call,
        permission_ai_interviewer: intake.permission_ai_interviewer,
        consent_recording: intake.consent_recording,
        accommodation_request: intake.accommodation_request,
      }
      : null,
    summary,
    progress: prog,
    sessions: sessions.map((s) => ({
      id: s.id,
      channel: s.channel,
      status: s.status,
      scheduled_for: s.scheduled_for ? new Date(s.scheduled_for).toISOString() : null,
      completed_at: s.completed_at ? new Date(s.completed_at).toISOString() : null,
      failure_reason: s.failure_reason,
      // Consent gates the reviewer's view too, not just storage. A transcript we
      // were not permitted to keep must not be readable because it happened to
      // survive somewhere.
      transcript: consented ? s.transcript : null,
      transcript_withheld: !consented && !!s.transcript,
    })),
    recommendation,
    signals,
    decisions: decisions.map((d) => ({
      id: d.id,
      decision: d.decision,
      reason_code: d.reason_code,
      student_message: d.student_message,
      reviewer_notes: d.reviewer_notes,
      conditions: d.conditions,
      reapply_after: d.reapply_after,
      decided_by: d.decided_by,
      decided_at: new Date(d.decided_at).toISOString(),
      ai_recommendation: d.ai_recommendation,
    })),
    timeline: events.map((e) => ({
      from_state: e.from_state,
      to_state: e.to_state,
      actor_type: e.actor_type,
      actor_id: e.actor_id,
      reason: e.reason,
      evidence_source: e.evidence_source,
      at: new Date(e.created_at).toISOString(),
    })),
    reason_options: Object.values(REASON_DEFINITIONS).map((r) => ({
      code: r.code,
      label: r.reviewer_label,
      applies_to: r.applies_to,
    })),
  };
}
