import { Op } from 'sequelize';
import {
  Cohort, Enrollment, LiveSession, AttendanceRecord, AssignmentSubmission, Lead, CampaignLead, ScheduledEmail,
} from '../models';

export async function listSessionsByCohort(cohortId: string) {
  return LiveSession.findAll({
    where: { cohort_id: cohortId },
    order: [['session_number', 'ASC']],
    include: [{ model: AttendanceRecord, as: 'attendanceRecords' }],
  });
}

export async function getSession(sessionId: string) {
  return LiveSession.findByPk(sessionId, {
    include: [
      { model: AttendanceRecord, as: 'attendanceRecords', include: [{ model: Enrollment, as: 'enrollment' }] },
      { model: AssignmentSubmission, as: 'submissions', include: [{ model: Enrollment, as: 'enrollment' }] },
    ],
  });
}

export async function createSession(data: {
  cohort_id: string;
  session_number: number;
  title: string;
  description?: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_type?: 'core' | 'lab';
  meeting_link?: string;
  curriculum_json?: any;
  materials_json?: any;
}) {
  return LiveSession.create(data as any);
}

export async function updateSession(sessionId: string, data: Partial<{
  title: string;
  description: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_type: 'core' | 'lab';
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  meeting_link: string;
  recording_url: string;
  materials_json: any;
  curriculum_json: any;
}>) {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return null;
  await session.update(data);
  return session;
}

export async function deleteSession(sessionId: string) {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return false;
  await AttendanceRecord.destroy({ where: { session_id: sessionId } });
  await AssignmentSubmission.destroy({ where: { session_id: sessionId } });
  await session.destroy();
  return true;
}

export async function getSessionAttendance(sessionId: string) {
  return AttendanceRecord.findAll({
    where: { session_id: sessionId },
    include: [{ model: Enrollment, as: 'enrollment' }],
    order: [['created_at', 'ASC']],
  });
}

export async function markAttendance(data: {
  enrollment_id: string;
  session_id: string;
  status: 'present' | 'absent' | 'excused' | 'late';
  marked_by?: 'system' | 'admin' | 'self';
  join_time?: Date;
  leave_time?: Date;
  duration_minutes?: number;
  notes?: string;
}) {
  const [record, created] = await AttendanceRecord.findOrCreate({
    where: { enrollment_id: data.enrollment_id, session_id: data.session_id },
    defaults: data as any,
  });
  if (!created) {
    await record.update(data);
  }
  return record;
}

export async function bulkMarkAttendance(sessionId: string, records: Array<{
  enrollment_id: string;
  status: 'present' | 'absent' | 'excused' | 'late';
}>) {
  const results = [];
  for (const rec of records) {
    const result = await markAttendance({
      enrollment_id: rec.enrollment_id,
      session_id: sessionId,
      status: rec.status,
      marked_by: 'admin',
    });
    results.push(result);
  }
  return results;
}

export async function updateAttendanceRecord(recordId: string, data: Partial<{
  status: 'present' | 'absent' | 'excused' | 'late';
  join_time: Date;
  leave_time: Date;
  duration_minutes: number;
  notes: string;
}>) {
  const record = await AttendanceRecord.findByPk(recordId);
  if (!record) return null;
  await record.update(data);
  return record;
}

export async function listSubmissionsByEnrollment(enrollmentId: string) {
  return AssignmentSubmission.findAll({
    where: { enrollment_id: enrollmentId },
    include: [{ model: LiveSession, as: 'session' }],
    order: [['created_at', 'DESC']],
  });
}

export async function listSubmissionsBySession(sessionId: string) {
  return AssignmentSubmission.findAll({
    where: { session_id: sessionId },
    include: [{ model: Enrollment, as: 'enrollment' }],
    order: [['created_at', 'DESC']],
  });
}

export async function createSubmission(data: {
  enrollment_id: string;
  session_id?: string;
  assignment_type: 'prework_intake' | 'prework_upload' | 'build_lab' | 'evidence' | 'reflection';
  title: string;
  content_json?: any;
  file_path?: string;
  file_name?: string;
}) {
  return AssignmentSubmission.create({
    ...data,
    status: 'submitted',
    submitted_at: new Date(),
  } as any);
}

export async function updateSubmission(submissionId: string, data: Partial<{
  status: 'pending' | 'submitted' | 'reviewed' | 'flagged';
  score: number;
  reviewer_notes: string;
  content_json: any;
  file_path: string;
  file_name: string;
}>) {
  const sub = await AssignmentSubmission.findByPk(submissionId);
  if (!sub) return null;
  if (data.status === 'reviewed' || data.score !== undefined) {
    (data as any).reviewed_at = new Date();
  }
  await sub.update(data);

  // Trigger portfolio enhancement refresh (non-blocking)
  if (data.status === 'reviewed' || data.score !== undefined) {
    import('./portfolioEnhancementService').then(svc =>
      svc.refreshProjectOutputs(sub.enrollment_id)
    ).catch(err => console.error('[Accelerator] Portfolio refresh failed:', err.message));
  }

  return sub;
}

const WEIGHT_PREWORK = 0.30;
const WEIGHT_ATTENDANCE = 0.40;
const WEIGHT_ASSIGNMENT = 0.30;

export async function computeReadinessScore(enrollmentId: string) {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return null;

  const cohortSessions = await LiveSession.findAll({
    where: { cohort_id: enrollment.cohort_id, status: { [Op.ne]: 'cancelled' } },
  });
  const totalSessions = cohortSessions.length;

  const attendanceRecords = await AttendanceRecord.findAll({
    where: { enrollment_id: enrollmentId },
  });
  const attended = attendanceRecords.filter(
    (r) => r.status === 'present' || r.status === 'late'
  ).length;
  const attendanceScore = totalSessions > 0 ? (attended / totalSessions) * 100 : 0;

  const preworkSubs = await AssignmentSubmission.findAll({
    where: {
      enrollment_id: enrollmentId,
      assignment_type: { [Op.in]: ['prework_intake', 'prework_upload'] },
    },
  });
  const preworkSubmitted = preworkSubs.filter(
    (s) => s.status === 'submitted' || s.status === 'reviewed'
  ).length;
  const preworkExpected = cohortSessions.filter((s) => s.session_type === 'core').length || 1;
  const preworkScore = Math.min((preworkSubmitted / preworkExpected) * 100, 100);

  const allSubs = await AssignmentSubmission.findAll({
    where: {
      enrollment_id: enrollmentId,
      assignment_type: { [Op.in]: ['build_lab', 'evidence', 'reflection'] },
    },
  });
  const reviewed = allSubs.filter((s) => s.status === 'reviewed' && s.score != null);
  let assignmentScore: number;
  if (reviewed.length > 0) {
    assignmentScore = reviewed.reduce((sum, s) => sum + (s.score || 0), 0) / reviewed.length;
  } else {
    const submitted = allSubs.filter(
      (s) => s.status === 'submitted' || s.status === 'reviewed'
    ).length;
    assignmentScore = allSubs.length > 0 ? (submitted / Math.max(allSubs.length, 1)) * 100 : 0;
  }

  const readinessScore =
    preworkScore * WEIGHT_PREWORK +
    attendanceScore * WEIGHT_ATTENDANCE +
    assignmentScore * WEIGHT_ASSIGNMENT;

  await enrollment.update({
    readiness_score: Math.round(readinessScore * 100) / 100,
    prework_score: Math.round(preworkScore * 100) / 100,
    attendance_score: Math.round(attendanceScore * 100) / 100,
    assignment_score: Math.round(assignmentScore * 100) / 100,
  });

  return {
    readiness_score: enrollment.readiness_score,
    prework_score: enrollment.prework_score,
    attendance_score: enrollment.attendance_score,
    assignment_score: enrollment.assignment_score,
  };
}

export async function computeAllReadinessScores(cohortId: string) {
  const enrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId, status: 'active' },
  });
  const results = [];
  for (const e of enrollments) {
    const scores = await computeReadinessScore(e.id);
    results.push({ enrollment_id: e.id, full_name: e.full_name, ...scores });
  }
  return results;
}

export async function getCohortDashboard(cohortId: string) {
  const [cohort, sessions, enrollments] = await Promise.all([
    Cohort.findByPk(cohortId),
    LiveSession.findAll({ where: { cohort_id: cohortId }, order: [['session_number', 'ASC']] }),
    Enrollment.findAll({ where: { cohort_id: cohortId, status: 'active' } }),
  ]);

  if (!cohort) return null;

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;
  const nextSession = sessions.find((s) => s.status === 'scheduled');

  const avgReadiness = enrollments.length > 0
    ? enrollments.reduce((sum, e) => sum + (e.readiness_score || 0), 0) / enrollments.length
    : 0;
  const avgAttendance = enrollments.length > 0
    ? enrollments.reduce((sum, e) => sum + (e.attendance_score || 0), 0) / enrollments.length
    : 0;

  return {
    cohort,
    stats: {
      total_sessions: totalSessions,
      completed_sessions: completedSessions,
      total_enrollments: enrollments.length,
      avg_readiness: Math.round(avgReadiness * 100) / 100,
      avg_attendance: Math.round(avgAttendance * 100) / 100,
    },
    next_session: nextSession,
    sessions,
    enrollments,
  };
}


// -- Post-Session Processing --

export async function detectAbsentParticipants(sessionId: string) {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return [];

  const enrollments = await Enrollment.findAll({
    where: { cohort_id: session.cohort_id, status: 'active' },
  });

  const attendanceRecords = await AttendanceRecord.findAll({
    where: { session_id: sessionId },
  });

  const attendedIds = new Set(
    attendanceRecords
      .filter((r) => r.status === 'present' || r.status === 'late' || r.status === 'excused')
      .map((r) => r.enrollment_id)
  );

  const absent: Array<{ enrollment: InstanceType<typeof Enrollment>; consecutiveMisses: number; missedTitles: string[] }> = [];

  for (const enrollment of enrollments) {
    if (attendedIds.has(enrollment.id)) continue;

    // Auto-mark absent if no record exists
    await markAttendance({
      enrollment_id: enrollment.id,
      session_id: sessionId,
      status: 'absent',
      marked_by: 'system',
    });

    // Count consecutive misses (most recent sessions first)
    const cohortSessions = await LiveSession.findAll({
      where: { cohort_id: session.cohort_id, status: 'completed' },
      order: [['session_number', 'DESC']],
    });

    let consecutiveMisses = 0;
    const missedTitles: string[] = [];
    for (const s of cohortSessions) {
      const record = await AttendanceRecord.findOne({
        where: { enrollment_id: enrollment.id, session_id: s.id },
      });
      if (!record || record.status === 'absent') {
        consecutiveMisses++;
        missedTitles.push(`#${s.session_number} ${s.title}`);
      } else {
        break;
      }
    }

    absent.push({ enrollment, consecutiveMisses, missedTitles });
  }

  return absent;
}

export async function getUpcomingSessions(hoursAhead: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const todayStr = now.toISOString().split('T')[0];
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const sessions = await LiveSession.findAll({
    where: {
      status: 'scheduled',
      session_date: {
        [Op.between]: [todayStr, cutoffStr],
      },
    },
    include: [{ model: Cohort, as: 'cohort' }],
  });

  // Filter by actual time comparison
  return sessions.filter((s) => {
    const sessionDateTime = new Date(`${s.session_date}T${convertTo24h(s.start_time)}:00`);
    return sessionDateTime > now && sessionDateTime <= cutoff;
  });
}

export async function getSessionsToMarkLive() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const sessions = await LiveSession.findAll({
    where: { status: 'scheduled', session_date: todayStr },
  });

  return sessions.filter((s) => {
    const startTime = new Date(`${s.session_date}T${convertTo24h(s.start_time)}:00`);
    const fifteenMinBefore = new Date(startTime.getTime() - 15 * 60 * 1000);
    return now >= fifteenMinBefore;
  });
}

export async function getSessionsToMarkCompleted() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const sessions = await LiveSession.findAll({
    where: {
      status: 'live',
      session_date: { [Op.in]: [todayStr, yesterdayStr] },
    },
  });

  return sessions.filter((s) => {
    const endTime = new Date(`${s.session_date}T${convertTo24h(s.end_time)}:00`);
    const thirtyMinAfterEnd = new Date(endTime.getTime() + 30 * 60 * 1000);
    return now >= thirtyMinAfterEnd;
  });
}

function convertTo24h(timeStr: string): string {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '10:00';
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// -- Enrollment Management --

export async function listCohortEnrollments(cohortId: string) {
  return Enrollment.findAll({
    where: { cohort_id: cohortId },
    order: [['created_at', 'DESC']],
    include: [{ model: Cohort, as: 'cohort', attributes: ['name'] }],
  });
}

export async function setPortalAccess(enrollmentId: string, enabled: boolean) {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return null;

  await enrollment.update({ portal_enabled: enabled });

  // When enabling portal access, remove the lead from all active campaigns
  if (enabled) {
    await removeLeadFromAllCampaigns(enrollment.email);
  }

  return enrollment;
}

async function removeLeadFromAllCampaigns(email: string) {
  const lead = await Lead.findOne({ where: { email: email.toLowerCase().trim() } });
  if (!lead) return;

  const activeCampaignLeads = await CampaignLead.findAll({
    where: {
      lead_id: lead.id,
      status: { [Op.in]: ['enrolled', 'active'] },
    },
  });

  for (const cl of activeCampaignLeads) {
    // Cancel pending scheduled emails for this lead in this campaign
    await ScheduledEmail.update(
      { status: 'cancelled' } as any,
      { where: { campaign_id: cl.campaign_id, lead_id: lead.id, status: 'pending' } }
    );
    await cl.update({ status: 'removed', outcome: 'converted_to_student' } as any);
  }
}
