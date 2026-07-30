import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { env } from '../config/env';
import {
  Enrollment, Cohort, LiveSession, AttendanceRecord, AssignmentSubmission, CommunityRoom, CommunityMember,
} from '../models';
import { sendPortalMagicLink } from './emailService';
import { safeNextPath } from '../utils/safeNextPath';

/**
 * Sign a 7-day participant session JWT. Shared by the magic-link verify flow
 * and the free/guest self-serve signup flow so both issue identical tokens.
 */
export function signParticipantJwt(enrollment: { id: string; email: string; cohort_id: string | null }): string {
  return jwt.sign(
    {
      sub: enrollment.id,
      email: enrollment.email,
      cohort_id: enrollment.cohort_id,
      role: 'participant' as const,
    },
    env.jwtSecret,
    { expiresIn: '7d' }
  );
}

/**
 * Sign a READ-ONLY participant JWT for admin "View as member" impersonation.
 * Same identity/session length (7d) as a normal token, but carries `read_only`
 * (which requireParticipant enforces by blocking all writes) and `impersonated_by`
 * for audit. The viewer sees exactly what the member sees; the server guarantees
 * they can change nothing.
 */
export function signReadOnlyParticipantJwt(
  enrollment: { id: string; email: string; cohort_id: string | null },
  impersonatedBy: string,
): string {
  return jwt.sign(
    {
      sub: enrollment.id,
      email: enrollment.email,
      cohort_id: enrollment.cohort_id,
      role: 'participant' as const,
      read_only: true,
      impersonated_by: impersonatedBy,
    },
    env.jwtSecret,
    { expiresIn: '7d' }
  );
}

/**
 * Pick the best of several active, portal-enabled enrollments for the same
 * email. Recency alone is not a safe tiebreaker: the Open House flow can mint
 * a fresh 'explorer' row for someone who already holds an older real seat
 * (e.g. a manual PaySimple-side-channel reconciliation that didn't also
 * retire the stray Explorer row), and "most recent" would then route the
 * student's own login into the free-preview shadow account instead of their
 * real one -- silently hiding their paid access and any account credit tied
 * to the real row. Prefer, in order: an enrollment flagged with a
 * `mgmt_role` (2026-07-30 incident: a staff member's newer, unrelated paid
 * duplicate silently outranked their real staff-flagged enrollment, hiding
 * their own Management Portal access), then non-explorer type, then paid
 * over pending, then most recently created. Exported for testing.
 */
export function pickBestEnrollment<T extends {
  enrollment_type?: string | null;
  payment_status?: string | null;
  created_at?: Date | string | null;
  communityMember?: { mgmt_role?: string | null } | null;
}>(
  candidates: T[],
): T | null {
  if (!candidates.length) return null;
  const rank = (e: T): [number, number, number, number] => [
    e.communityMember?.mgmt_role ? 0 : 1,
    e.enrollment_type === 'explorer' ? 1 : 0,
    e.payment_status === 'paid' ? 0 : 1,
    -new Date(e.created_at ?? 0).getTime(),
  ];
  return [...candidates].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    return 0;
  })[0];
}

/**
 * Email a magic sign-in link.
 *
 * `next` carries the student's pre-login intent through the email round trip so
 * the QR check-in flow can return them to the check-in page instead of dumping
 * them on the dashboard. It is sanitized to a same-origin /portal/ path here —
 * this string ends up inside an email we send, so an unvalidated value would be
 * an open redirect with our branding on it. An unsafe or absent value simply
 * yields a plain link to the default landing page (never an error).
 */
export async function requestMagicLink(
  email: string,
  next?: unknown,
): Promise<{ success: boolean; message: string }> {
  // Deterministic: a person may hold several enrollments (e.g. a prior Explorer
  // plus a paid seat). pickBestEnrollment prefers a mgmt_role-flagged staff
  // enrollment first, then the real (non-explorer, paid) one over a
  // merely-newer Explorer duplicate, so the login link never lands on the
  // wrong account (was a non-deterministic findOne, then a recency-only
  // ORDER BY that a newer Explorer or paid duplicate row could still win).
  const candidates = await Enrollment.findAll({
    where: { email: email.toLowerCase().trim(), status: 'active', portal_enabled: true },
    include: [{ model: CommunityMember, as: 'communityMember', attributes: ['mgmt_role'] }],
  });
  const enrollment = pickBestEnrollment(candidates);

  if (!enrollment) {
    // Check if enrollment exists but portal not enabled
    const pendingEnrollment = await Enrollment.findOne({
      where: { email: email.toLowerCase().trim(), status: 'active', portal_enabled: false },
      order: [['created_at', 'DESC']],
    });
    if (pendingEnrollment) {
      // Observable on purpose: a whole cohort silently blocked at the login
      // screen is exactly the 2026-07-23 Orientation failure, and it produced
      // no server-side signal at all. Log the identity, never the token.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'portal_login_blocked',
        outcome: 'failure',
        error_class: 'PortalAccessDisabled',
        context: { enrollment_id: pendingEnrollment.id, cohort_id: pendingEnrollment.cohort_id },
      }));
      return { success: false, message: 'Your enrollment is pending admin approval for portal access. Please contact your program administrator.' };
    }
    // Generic message to prevent email enumeration
    return { success: true, message: 'If an active enrollment exists for this email, a link has been sent.' };
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await enrollment.update({
    portal_token: token,
    portal_token_expires_at: expiresAt,
  });

  await sendPortalMagicLink({
    to: enrollment.email,
    fullName: enrollment.full_name,
    token,
    cohortName: (await (await import("../models")).Cohort.findByPk(enrollment.cohort_id))?.name || "Accelerator Program",
    next: safeNextPath(next) ?? undefined,
  });

  return { success: true, message: 'If an active enrollment exists for this email, a link has been sent.' };
}

export async function verifyMagicLink(token: string): Promise<{ jwt: string; enrollment: any } | null> {
  const enrollment = await Enrollment.findOne({
    where: {
      portal_token: token,
      portal_token_expires_at: { [Op.gt]: new Date() },
      status: 'active',
    },
  });

  if (!enrollment) return null;

  // Keep token reusable — don't clear it. The token expires naturally
  // via portal_token_expires_at. This lets users bookmark their portal link.

  const jwtToken = signParticipantJwt(enrollment);

  return {
    jwt: jwtToken,
    enrollment: {
      id: enrollment.id,
      full_name: enrollment.full_name,
      email: enrollment.email,
      company: enrollment.company,
      title: enrollment.title,
      cohort_id: enrollment.cohort_id,
    },
  };
}

export async function getParticipantProfile(enrollmentId: string) {
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [{ model: Cohort, as: 'cohort' }],
  });
  if (!enrollment) return null;
  return enrollment;
}

export async function getParticipantDashboard(enrollmentId: string) {
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [{ model: Cohort, as: 'cohort' }],
  });
  if (!enrollment) return null;

  const sessions = await LiveSession.findAll({
    where: { cohort_id: enrollment.cohort_id, status: { [Op.ne]: 'cancelled' } },
    order: [['session_number', 'ASC']],
  });

  const nextSession = sessions.find((s) => s.status === 'scheduled' || s.status === 'live');
  const completedCount = sessions.filter((s) => s.status === 'completed').length;

  const recentSubmissions = await AssignmentSubmission.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['created_at', 'DESC']],
    limit: 3,
    include: [{ model: LiveSession, as: 'session', attributes: ['title', 'session_number'] }],
  });

  return {
    enrollment: {
      id: enrollment.id,
      full_name: enrollment.full_name,
      email: enrollment.email,
      company: enrollment.company,
      title: enrollment.title,
      readiness_score: enrollment.readiness_score,
      prework_score: enrollment.prework_score,
      attendance_score: enrollment.attendance_score,
      assignment_score: enrollment.assignment_score,
      maturity_level: enrollment.maturity_level,
    },
    cohort: enrollment.get('cohort'),
    progress: {
      total_sessions: sessions.length,
      completed_sessions: completedCount,
    },
    next_session: nextSession ? {
      id: nextSession.id,
      session_number: nextSession.session_number,
      title: nextSession.title,
      session_date: nextSession.session_date,
      start_time: nextSession.start_time,
      end_time: nextSession.end_time,
      meeting_link: nextSession.meeting_link,
      status: nextSession.status,
    } : null,
    recent_submissions: recentSubmissions,
  };
}

/**
 * Pure selection: the next live class a student should be pointed at — the
 * lowest-numbered session that is still 'scheduled' or already 'live'. Returns
 * null when every session is completed/cancelled. Exported for unit testing.
 * (Live Sessions build-out Phase 2 — Session CC-20260721-s7h4.)
 */
export function selectNextLiveSession<T extends { status: string; session_number: number }>(
  sessions: T[]
): T | null {
  return (
    [...sessions]
      .sort((a, b) => a.session_number - b.session_number)
      .find((s) => s.status === 'scheduled' || s.status === 'live') || null
  );
}

/**
 * Lean payload for the "Next live class" card on the Today surface. Backed by
 * live_sessions (NOT the CCPP EventBrite event feed, which is a separate,
 * prospect-facing "Next event" countdown). Returns { next_session: null } when
 * there is nothing upcoming so the caller can fall back to the cohort
 * first-class countdown instead of double-rendering.
 */
export async function getNextLiveSession(cohortId: string) {
  const sessions = await LiveSession.findAll({
    where: { cohort_id: cohortId, status: { [Op.ne]: 'cancelled' } },
    order: [['session_number', 'ASC']],
    // Same room linkage as getParticipantSessions below — lets the Today card
    // and topbar pill route into the Colaberry Commons room (the class's
    // waiting room) instead of the retired /portal/sessions/:id page. Left
    // join: sessions predating the Community Rooms rollout legitimately have
    // none.
    include: [{ model: CommunityRoom, as: 'communityRoom', attributes: ['id'], required: false }],
  });
  const next = selectNextLiveSession(sessions as any[]);
  if (!next) return { next_session: null };
  // Cohort timezone drives the time-zone label on the card. start_time/end_time
  // are stored as that zone's wall-clock, so the label must reflect it (not a
  // hardcoded "ET"). Default to Central, the program's home zone.
  const cohort = await Cohort.findByPk(cohortId, { attributes: ['timezone'] });
  return {
    next_session: {
      id: next.id,
      session_number: next.session_number,
      title: next.title,
      session_date: next.session_date,
      start_time: next.start_time,
      end_time: next.end_time,
      status: next.status, // 'scheduled' | 'live'
      meeting_link: next.meeting_link,
      meeting_provider: (next as any).meeting_provider,
      timezone: (cohort as any)?.timezone || 'America/Chicago',
      room_id: (next as any).communityRoom?.id ?? null,
    },
  };
}

export async function getParticipantSessions(enrollmentId: string, cohortId: string) {
  const sessions = await LiveSession.findAll({
    where: { cohort_id: cohortId, status: { [Op.ne]: 'cancelled' } },
    order: [['session_number', 'ASC']],
    // The Colaberry Commons room linked to this session, if Community Rooms
    // has provisioned one (ensureRoomForSession) — surfaced as room_id so
    // callers (Schedule) can link into the room instead of the retired
    // /portal/sessions/:id detail page. Left join: sessions predating the
    // Community Rooms rollout, or created while the feature was disabled,
    // legitimately have none.
    include: [{ model: CommunityRoom, as: 'communityRoom', attributes: ['id'], required: false }],
  });

  const attendance = await AttendanceRecord.findAll({
    where: { enrollment_id: enrollmentId },
  });
  const attendanceMap = new Map(attendance.map((a) => [a.session_id, a.status]));

  return sessions.map((s) => ({
    id: s.id,
    session_number: s.session_number,
    title: s.title,
    description: s.description,
    session_date: s.session_date,
    start_time: s.start_time,
    end_time: s.end_time,
    session_type: s.session_type,
    status: s.status,
    meeting_link: (s.status === 'scheduled' || s.status === 'live') ? s.meeting_link : null,
    recording_url: s.status === 'completed' ? s.recording_url : null,
    attendance_status: attendanceMap.get(s.id) || null,
    room_id: (s as any).communityRoom?.id ?? null,
  }));
}

export async function getParticipantSessionDetail(enrollmentId: string, sessionId: string, cohortId: string) {
  const session = await LiveSession.findOne({
    where: { id: sessionId, cohort_id: cohortId },
  });
  if (!session) return null;

  const attendance = await AttendanceRecord.findOne({
    where: { enrollment_id: enrollmentId, session_id: sessionId },
  });

  const submissions = await AssignmentSubmission.findAll({
    where: { enrollment_id: enrollmentId, session_id: sessionId },
    order: [['created_at', 'DESC']],
  });

  return {
    session: {
      id: session.id,
      session_number: session.session_number,
      title: session.title,
      description: session.description,
      session_date: session.session_date,
      start_time: session.start_time,
      end_time: session.end_time,
      session_type: session.session_type,
      status: session.status,
      meeting_link: (session.status === 'scheduled' || session.status === 'live') ? session.meeting_link : null,
      recording_url: session.status === 'completed' ? session.recording_url : null,
      materials_json: session.materials_json,
      curriculum_json: session.curriculum_json,
    },
    attendance_status: attendance?.status || null,
    submissions,
  };
}

export async function getParticipantSubmissions(enrollmentId: string) {
  return AssignmentSubmission.findAll({
    where: { enrollment_id: enrollmentId },
    include: [{ model: LiveSession, as: 'session', attributes: ['title', 'session_number'] }],
    order: [['created_at', 'DESC']],
  });
}

export async function createParticipantSubmission(enrollmentId: string, data: {
  session_id?: string;
  assignment_type: 'prework_intake' | 'prework_upload' | 'build_lab' | 'evidence' | 'reflection';
  title: string;
  content_json?: any;
}) {
  const submission = await AssignmentSubmission.create({
    enrollment_id: enrollmentId,
    session_id: data.session_id || null,
    assignment_type: data.assignment_type,
    title: data.title,
    content_json: data.content_json || null,
    status: 'submitted',
    submitted_at: new Date(),
  } as any);

  // Non-blocking: failure here must never affect the submission response
  import('./mentorFeedbackService').then(svc =>
    svc.processSubmissionForMentor(submission.id)
  ).catch(err => console.error('[Participant] Mentor feedback trigger failed:', err.message));

  return submission;
}

export async function uploadParticipantSubmission(enrollmentId: string, submissionId: string, file: { path: string; originalname: string }) {
  const submission = await AssignmentSubmission.findOne({
    where: { id: submissionId, enrollment_id: enrollmentId },
  });
  if (!submission) return null;

  await submission.update({
    file_path: file.path,
    file_name: file.originalname,
    status: 'submitted',
    submitted_at: new Date(),
  });

  // Non-blocking: idempotent — will no-op if a review item already exists
  import('./mentorFeedbackService').then(svc =>
    svc.processSubmissionForMentor(submissionId)
  ).catch(err => console.error('[Participant] Mentor feedback trigger (upload) failed:', err.message));

  return submission;
}

export async function getParticipantProgress(enrollmentId: string) {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return null;

  const sessions = await LiveSession.findAll({
    where: { cohort_id: enrollment.cohort_id, status: { [Op.ne]: 'cancelled' } },
    order: [['session_number', 'ASC']],
    attributes: ['id', 'session_number', 'title', 'session_date', 'status'],
  });

  const attendance = await AttendanceRecord.findAll({
    where: { enrollment_id: enrollmentId },
  });
  const attendanceMap = new Map(attendance.map((a) => [a.session_id, a.status]));

  const attendanceHistory = sessions.map((s) => ({
    session_number: s.session_number,
    title: s.title,
    session_date: s.session_date,
    session_status: s.status,
    attendance_status: attendanceMap.get(s.id) || null,
  }));

  return {
    scores: {
      readiness_score: enrollment.readiness_score,
      prework_score: enrollment.prework_score,
      attendance_score: enrollment.attendance_score,
      assignment_score: enrollment.assignment_score,
      maturity_level: enrollment.maturity_level,
    },
    attendance_history: attendanceHistory,
  };
}
