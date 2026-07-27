import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { env } from '../config/env';
import {
  Enrollment, Cohort, LiveSession, AttendanceRecord, AssignmentSubmission,
} from '../models';
import { sendPortalMagicLink } from './emailService';

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

export async function requestMagicLink(email: string): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // A person may hold several enrollments (e.g. a prior Explorer plus a paid
  // seat). Resolution order matters, and "most recent" is NOT sufficient:
  //
  //   1. The STAFF-linked enrollment, if one exists. Staff hold their mgmt role
  //      on one specific enrollment (the CommunityMember row is keyed on
  //      enrollment_id, not email), and it is frequently the OLDER one. Picking
  //      by recency logged staff into a stale enrollment with no "Management
  //      Portal" link, making the portal->admin bridge unreachable. That bridge
  //      is the only entry point, since admin->portal needs a session from it.
  //   2. Otherwise the most recent active, portal-enabled enrollment, so the
  //      link never lands on a stale seat (this replaced a non-deterministic
  //      findOne that could email a link into an arbitrary account).
  //
  // Mirrors loadStaffPortalLinkByEmail, which the admin->portal direction
  // already uses; both directions now agree on which enrollment "is" the user.
  // Imported lazily: mgmtBridgeService imports signParticipantJwt from this
  // module, so a top-level import would close a cycle.
  const { loadStaffPortalLinkByEmail } = await import('./access/mgmtBridgeService');
  const staffLink = await loadStaffPortalLinkByEmail(normalizedEmail);

  const enrollment =
    (staffLink
      ? await Enrollment.findOne({
          where: { id: staffLink.enrollmentId, status: 'active', portal_enabled: true },
        })
      : null)
    ?? (await Enrollment.findOne({
      where: { email: normalizedEmail, status: 'active', portal_enabled: true },
      order: [['created_at', 'DESC']],
    }));

  if (!enrollment) {
    // Check if enrollment exists but portal not enabled
    const pendingEnrollment = await Enrollment.findOne({
      where: { email: normalizedEmail, status: 'active', portal_enabled: false },
      order: [['created_at', 'DESC']],
    });
    if (pendingEnrollment) {
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
    },
  };
}

export async function getParticipantSessions(enrollmentId: string, cohortId: string) {
  const sessions = await LiveSession.findAll({
    where: { cohort_id: cohortId, status: { [Op.ne]: 'cancelled' } },
    order: [['session_number', 'ASC']],
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
