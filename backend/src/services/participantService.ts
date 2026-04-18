import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { env } from '../config/env';
import {
  Enrollment, Cohort, LiveSession, AttendanceRecord, AssignmentSubmission,
} from '../models';
import { sendPortalMagicLink } from './emailService';

export async function requestMagicLink(email: string): Promise<{ success: boolean; message: string }> {
  const enrollment = await Enrollment.findOne({
    where: { email: email.toLowerCase().trim(), status: 'active', portal_enabled: true },
  });

  if (!enrollment) {
    // Check if enrollment exists but portal not enabled
    const pendingEnrollment = await Enrollment.findOne({
      where: { email: email.toLowerCase().trim(), status: 'active', portal_enabled: false },
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

  const jwtToken = jwt.sign(
    {
      sub: enrollment.id,
      email: enrollment.email,
      cohort_id: enrollment.cohort_id,
      role: 'participant' as const,
    },
    env.jwtSecret,
    { expiresIn: '7d' }
  );

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
  return AssignmentSubmission.create({
    enrollment_id: enrollmentId,
    session_id: data.session_id || null,
    assignment_type: data.assignment_type,
    title: data.title,
    content_json: data.content_json || null,
    status: 'submitted',
    submitted_at: new Date(),
  } as any);
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
