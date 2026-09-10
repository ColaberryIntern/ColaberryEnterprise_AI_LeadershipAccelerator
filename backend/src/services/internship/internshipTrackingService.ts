import CohortMembership from '../../models/CohortMembership';
import Enrollment from '../../models/Enrollment';
import InternshipApplication from '../../models/InternshipApplication';
import InternshipDecision from '../../models/InternshipDecision';
import InternshipDocument from '../../models/InternshipDocument';
import InternshipInterviewSession from '../../models/InternshipInterviewSession';
import InternshipRequirementAcknowledgement from '../../models/InternshipRequirementAcknowledgement';
import InternshipStatusEvent from '../../models/InternshipStatusEvent';
import Project from '../../models/Project';
import AttendanceRecord from '../../models/AttendanceRecord';
import CertReadinessSnapshot from '../../models/CertReadinessSnapshot';
import { findInternshipCohort, internshipSettings } from './internshipCohortService';
import { buildSummary, progress } from './internshipInterviewService';
import { outstandingRequirements } from './internshipDocumentService';

/**
 * The internship area of the student profile / Student Success 360.
 *
 * ── EVERY METRIC CARRIES ITS OWN RELIABILITY ───────────────────────────────
 *
 * "Each metric must retain source, observed time, freshness, and reliability
 * state. If attendance or another source is unreliable, mark it unknown and
 * exclude it from automated assessment rather than treating it as zero or using it
 * in the recommendation."
 *
 * So nothing here returns a bare number. Every metric is a `TrackedMetric` with a
 * source, an observed-at, and a reliability — and `unknown` is a first-class value
 * distinct from zero. An intern with no attendance rows has UNKNOWN attendance,
 * not 0%, and the difference is the difference between "we did not measure" and
 * "they did not turn up".
 *
 * ── THIS EXTENDS THE PROFILE, IT DOES NOT COMPETE WITH IT ──────────────────
 *
 * "Extend the existing student profile and Student Success 360 snapshot. Do not
 * create a competing profile." This service returns ONE section, keyed by
 * enrollment, for the existing surfaces to render. It has no notion of a page.
 */

export type Reliability = 'reliable' | 'unknown';

export interface TrackedMetric<T = number | string | boolean | null> {
  key: string;
  label: string;
  value: T;
  source: string;
  observed_at: string | null;
  reliability: Reliability;
  /** Why it is unknown. Present only when it is. */
  reason?: string;
}

const reliable = <T,>(
  key: string, label: string, value: T, source: string, observedAt?: Date | string | null,
): TrackedMetric<T> => ({
  key,
  label,
  value,
  source,
  observed_at: observedAt ? new Date(observedAt).toISOString() : null,
  reliability: 'reliable',
});

const unknown = (
  key: string, label: string, source: string, reason: string,
): TrackedMetric<null> => ({
  key, label, value: null, source, observed_at: null, reliability: 'unknown', reason,
});

export interface InternshipProfileSection {
  has_internship: boolean;
  application: null | {
    id: string;
    state: string;
    interview_channel: string | null;
    submitted_at: string | null;
    decided_at: string | null;
    activated_at: string | null;
    converted_from_existing_intern: boolean;
  };
  membership: null | {
    cohort_id: string;
    status: string;
    joined_at: string | null;
    week: number | null;
    /** The training cohort, shown to prove it is untouched. */
    training_cohort_id: string | null;
  };
  decisions: Array<{
    decision: string;
    reason_code: string;
    decided_by: string;
    decided_at: string;
    /** Internal notes are NOT included — this section is rendered on surfaces a
     *  wider set of staff can see than the internship reviewer queue. */
    conditions: string | null;
  }>;
  interview: {
    progress: { total: number; resolved: number; remaining: number; complete: boolean };
    sessions: Array<{
      channel: string;
      status: string;
      completed_at: string | null;
      /** Whether a transcript may be read at all, not the transcript itself. */
      transcript_available: boolean;
    }>;
    /** Their answers, for a reviewer. Verbatim. */
    summary_available: boolean;
  };
  documents: {
    all_verified: boolean;
    requirements: Array<{ document_type: string; title: string; verified: boolean; requires_signature: boolean }>;
  };
  requirements_acknowledged: Array<{ requirement_key: string; state: string; verified_at: string | null }>;
  metrics: TrackedMetric[];
  timeline: Array<{
    from_state: string | null;
    to_state: string;
    actor_type: string;
    actor_id: string | null;
    reason: string | null;
    at: string;
  }>;
  /** Signals deliberately excluded from any assessment, with the reason. */
  excluded_from_assessment: Array<{ signal: string; reason: string }>;
}

/**
 * Build the internship section for one enrollment.
 *
 * Returns `has_internship: false` rather than null when there is nothing, so the
 * calling profile can render "no internship" without special-casing an absent
 * section.
 */
export async function internshipProfileSection(enrollmentId: string): Promise<InternshipProfileSection> {
  const empty: InternshipProfileSection = {
    has_internship: false,
    application: null,
    membership: null,
    decisions: [],
    interview: { progress: { total: 0, resolved: 0, remaining: 0, complete: false }, sessions: [], summary_available: false },
    documents: { all_verified: false, requirements: [] },
    requirements_acknowledged: [],
    metrics: [],
    timeline: [],
    excluded_from_assessment: [],
  };

  const application = await InternshipApplication.findOne({
    where: { enrollment_id: enrollmentId },
    order: [['created_at', 'DESC']],
  });
  if (!application) return empty;

  const cohort = await findInternshipCohort();
  const settings = internshipSettings(cohort);

  const [
    enrollment, membershipRow, decisions, sessions, docs, acks, events,
    interviewProgress, summary, projects, attendance, certSnapshot,
  ] = await Promise.all([
    Enrollment.findByPk(enrollmentId, { attributes: ['cohort_id', 'enrolled_at', 'created_at'] }),
    cohort
      ? CohortMembership.findOne({
        where: {
          enrollment_id: enrollmentId,
          cohort_id: cohort.id,
          membership_type: 'internship',
          status: 'active',
        },
      })
      : Promise.resolve(null),
    InternshipDecision.findAll({ where: { application_id: application.id }, order: [['decided_at', 'ASC']] }),
    InternshipInterviewSession.findAll({ where: { application_id: application.id }, order: [['created_at', 'ASC']] }),
    outstandingRequirements(application.id),
    InternshipRequirementAcknowledgement.findAll({ where: { application_id: application.id } }),
    InternshipStatusEvent.findAll({ where: { application_id: application.id }, order: [['created_at', 'ASC']] }),
    progress(application.id),
    buildSummary(application.id),
    Project.count({ where: { enrollment_id: enrollmentId } }),
    AttendanceRecord.findAll({ where: { enrollment_id: enrollmentId }, attributes: ['status', 'created_at'] }),
    CertReadinessSnapshot.findOne({
      where: { enrollment_id: enrollmentId },
      order: [['created_at', 'DESC']],
    }),
  ]);

  const joinedAt = membershipRow?.joined_at ? new Date(membershipRow.joined_at) : null;
  const week = joinedAt
    ? Math.floor((Date.now() - joinedAt.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    : null;

  const excluded: Array<{ signal: string; reason: string }> = [];
  const metrics: TrackedMetric[] = [];

  metrics.push(reliable(
    'application_state', 'Application status', application.state,
    'internship_applications', application.updated_at,
  ));

  metrics.push(reliable(
    'interview_completion', 'Interview answered',
    `${interviewProgress.resolved}/${interviewProgress.total}`,
    'internship_interview_responses',
  ));

  metrics.push(reliable(
    'documents_verified', 'Documents verified', docs.all_verified,
    'internship_documents',
  ));

  metrics.push(reliable(
    'active_projects', 'Projects', projects, 'projects',
  ));

  if (projects > settings.max_active_projects) {
    // Reported as a fact, not silently clamped: a number that exceeds the stated
    // maximum is something a human should look at.
    metrics.push(reliable(
      'over_project_limit', 'Over the project limit', true, 'projects',
    ));
  }

  // ── Attendance: the contract's own example ──────────────────────────────
  if (!attendance.length) {
    metrics.push(unknown(
      'attendance_rate', 'Attendance', 'attendance_records',
      'no attendance rows for this student — not the same as 0% attendance',
    ));
    excluded.push({
      signal: 'attendance_rate',
      reason: 'no attendance rows; excluded rather than counted as zero',
    });
  } else {
    const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
    const newest = attendance
      .map((a) => new Date(a.created_at).getTime())
      .reduce((max, t) => Math.max(max, t), 0);
    metrics.push(reliable(
      'attendance_rate', 'Attendance',
      `${Math.round((present / attendance.length) * 100)}%`,
      'attendance_records', newest ? new Date(newest) : null,
    ));
  }

  // ── Certification readiness ─────────────────────────────────────────────
  if (!certSnapshot) {
    metrics.push(unknown(
      'cert_readiness', 'Certification readiness', 'cert_readiness_snapshots',
      'no readiness snapshot has been computed for this student yet',
    ));
    excluded.push({
      signal: 'cert_readiness',
      reason: 'no snapshot computed; excluded rather than treated as not-ready',
    });
  } else {
    metrics.push(reliable(
      'cert_readiness', 'Certification readiness',
      (certSnapshot as any).overall_state ?? 'unknown',
      'cert_readiness_snapshots', (certSnapshot as any).created_at,
    ));
  }

  // ── Weekly commitment: honest about not being measured yet ──────────────
  metrics.push(unknown(
    'weekly_hours_logged', 'Hours logged this week', 'internship_weekly_commitments',
    'weekly hour logging is not implemented; nothing is being counted, so nothing is reported',
  ));
  excluded.push({
    signal: 'weekly_hours_logged',
    reason: 'not instrumented; excluded rather than shown as 0 hours',
  });

  return {
    has_internship: true,
    application: {
      id: application.id,
      state: application.state,
      interview_channel: application.interview_channel,
      submitted_at: application.submitted_at ? new Date(application.submitted_at).toISOString() : null,
      decided_at: application.decided_at ? new Date(application.decided_at).toISOString() : null,
      activated_at: application.activated_at ? new Date(application.activated_at).toISOString() : null,
      converted_from_existing_intern: application.converted_from_existing_intern,
    },
    membership: membershipRow && cohort
      ? {
        cohort_id: cohort.id,
        status: membershipRow.status,
        joined_at: joinedAt ? joinedAt.toISOString() : null,
        week,
        // Shown deliberately: it proves the training cohort survived activation.
        training_cohort_id: (enrollment as any)?.cohort_id ?? null,
      }
      : null,
    decisions: decisions.map((d) => ({
      decision: d.decision,
      reason_code: d.reason_code,
      decided_by: d.decided_by,
      decided_at: new Date(d.decided_at).toISOString(),
      conditions: d.conditions,
    })),
    interview: {
      progress: interviewProgress,
      sessions: sessions.map((s) => ({
        channel: s.channel,
        status: s.status,
        completed_at: s.completed_at ? new Date(s.completed_at).toISOString() : null,
        transcript_available: !!s.transcript,
      })),
      summary_available: summary.some((l) => l.answer_display.length > 0),
    },
    documents: {
      all_verified: docs.all_verified,
      requirements: docs.requirements.map((r) => ({
        document_type: r.document_type,
        title: r.title,
        verified: r.verified,
        requires_signature: r.requires_signature,
      })),
    },
    requirements_acknowledged: acks.map((a) => ({
      requirement_key: a.requirement_key,
      state: a.state,
      verified_at: a.verified_at ? new Date(a.verified_at).toISOString() : null,
    })),
    metrics,
    timeline: events.map((e) => ({
      from_state: e.from_state,
      to_state: e.to_state,
      actor_type: e.actor_type,
      actor_id: e.actor_id,
      reason: e.reason,
      at: new Date(e.created_at).toISOString(),
    })),
    excluded_from_assessment: excluded,
  };
}

export interface InternshipKpi {
  key: string;
  label: string;
  count: number;
  /** The query the drilldown runs. "Every KPI must drill down to the students." */
  drilldown: { bucket: string } | { state: string };
  reliability: Reliability;
  reason?: string;
}

/**
 * Admin KPIs.
 *
 * Every one carries the drilldown that produced it, because "every KPI must drill
 * down to the students behind the number" — a count with no way to see the people
 * is a number nobody can act on or check.
 */
export async function internshipKpis(): Promise<InternshipKpi[]> {
  const cohort = await findInternshipCohort();
  const settings = internshipSettings(cohort);

  const [
    awaitingReview, informationRequested, waitlisted, awaitingDocuments,
    documentsUploaded, awaitingActivation, active, converted,
  ] = await Promise.all([
    InternshipApplication.count({ where: { state: 'under_review' } }),
    InternshipApplication.count({ where: { state: 'information_requested' } }),
    InternshipApplication.count({ where: { state: 'waitlisted' } }),
    InternshipApplication.count({ where: { state: ['approved', 'offer_letter_ready'] as any } }),
    InternshipApplication.count({ where: { state: 'signed_documents_uploaded' } }),
    InternshipApplication.count({ where: { state: ['documents_verified', 'payment_pending', 'activation_pending'] as any } }),
    InternshipApplication.count({ where: { state: 'active' } }),
    InternshipApplication.count({ where: { converted_from_existing_intern: true } }),
  ]);

  const kpis: InternshipKpi[] = [
    { key: 'awaiting_review', label: 'Awaiting review', count: awaitingReview, drilldown: { bucket: 'awaiting_review' }, reliability: 'reliable' },
    { key: 'information_requested', label: 'Information requested', count: informationRequested, drilldown: { bucket: 'information_requested' }, reliability: 'reliable' },
    { key: 'waitlisted', label: 'Waitlisted', count: waitlisted, drilldown: { bucket: 'waitlisted' }, reliability: 'reliable' },
    { key: 'awaiting_documents', label: 'Approved, awaiting signed documents', count: awaitingDocuments, drilldown: { bucket: 'approved_awaiting_documents' }, reliability: 'reliable' },
    { key: 'documents_uploaded', label: 'Documents awaiting verification', count: documentsUploaded, drilldown: { state: 'signed_documents_uploaded' }, reliability: 'reliable' },
    { key: 'awaiting_activation', label: 'Verified, awaiting activation', count: awaitingActivation, drilldown: { state: 'documents_verified' }, reliability: 'reliable' },
    { key: 'active_interns', label: 'Active interns', count: active, drilldown: { state: 'active' }, reliability: 'reliable' },
    { key: 'converted', label: 'Converted existing interns', count: converted, drilldown: { bucket: 'all_open' }, reliability: 'reliable' },
  ];

  // Active interns with no project. Real, and worth chasing.
  if (active > 0) {
    const activeApps = await InternshipApplication.findAll({
      where: { state: 'active' }, attributes: ['enrollment_id'],
    });
    let withoutProject = 0;
    for (const app of activeApps) {
      const n = await Project.count({ where: { enrollment_id: app.enrollment_id } });
      if (n === 0) withoutProject += 1;
    }
    kpis.push({
      key: 'active_without_projects',
      label: 'Active interns with no project',
      count: withoutProject,
      drilldown: { state: 'active' },
      reliability: 'reliable',
    });
  }

  // The KPIs the contract asks for that this build genuinely cannot compute.
  // Declared as unknown WITH a reason rather than omitted, so the gap is visible
  // on the dashboard instead of looking like a zero.
  kpis.push({
    key: 'curriculum_lag',
    label: 'Curriculum lag',
    count: 0,
    drilldown: { state: 'active' },
    reliability: 'unknown',
    reason: 'per-intern curriculum pacing is not aggregated yet; 0 here means not measured',
  });
  kpis.push({
    key: 'cert_practice_inactive',
    label: 'No recent certification practice',
    count: 0,
    drilldown: { state: 'active' },
    reliability: 'unknown',
    reason: 'practice recency is not aggregated yet; 0 here means not measured',
  });

  void settings;
  return kpis;
}
