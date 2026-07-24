import crypto from 'crypto';
import { Op } from 'sequelize';
import {
  Cohort, Enrollment, LiveSession, AttendanceRecord, AssignmentSubmission, Lead, CampaignLead, ScheduledEmail, Subscription,
} from '../models';
import { env } from '../config/env';
import { centralWallClockToInstant } from './centralDate';

// PaySimple dashboard base for the admin "open this payer in PaySimple" deep link.
// Override with PAYSIMPLE_DASHBOARD_BASE if the account uses a different host.
const PAYSIMPLE_DASHBOARD_BASE = process.env.PAYSIMPLE_DASHBOARD_BASE || 'https://app.paysimple.com';

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
  const session = await LiveSession.create(data as any);
  // Colaberry Commons — auto-create the linked cohort room for this official
  // session (acceptance criterion #1). Best-effort, idempotent, and flag-gated:
  // it never blocks or fails session creation, and does nothing when the feature
  // is off. Lazily imported so the community-rooms tree only loads when enabled.
  if (env.communityRoomsEnabled) {
    try {
      const { ensureRoomForSession } = await import('./communityRooms/roomService');
      await ensureRoomForSession(session);
    } catch (err: any) {
      console.warn('[CommunityRooms] ensureRoomForSession failed (non-fatal):', err?.message);
    }
  }
  return session;
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
  const cohortId = session.cohort_id; // capture before delete so we can compact after
  await AttendanceRecord.destroy({ where: { session_id: sessionId } });
  await AssignmentSubmission.destroy({ where: { session_id: sessionId } });
  await session.destroy();
  // Compact the remaining sessions up (renumber + re-date) so there is no gap.
  // Lazy import avoids any import cycle with sessionScheduleService.
  const { reflowCohortSchedule } = await import('./sessionScheduleService');
  await reflowCohortSchedule(cohortId);
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
  const submission = await AssignmentSubmission.create({
    ...data,
    status: 'submitted',
    submitted_at: new Date(),
  } as any);

  // Non-blocking: failure here must never affect the submission response
  import('./mentorFeedbackService').then(svc =>
    svc.processSubmissionForMentor(submission.id)
  ).catch(err => console.error('[Accelerator] Mentor feedback trigger failed:', err.message));

  return submission;
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
    // Days off (skipped class dates) so the admin sessions view can show/un-skip
    // them on initial load — the page loads sessions via this dashboard endpoint.
    skipped_dates: ((cohort as any).settings_json?.schedule?.skipped_dates) || [],
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

// Live class times are entered and stored as Central wall-clock ("18:30"), but
// this runs in a UTC container — a naive `new Date(dateStr + "T" + timeStr)`
// silently parses that wall-clock AS UTC, running the whole session lifecycle
// (live/completed transitions, recap generation, reminder timing, join windows)
// 5-6 hours off from the real Central class time. classInstant recovers the
// true UTC instant via the shared DST-aware Central-time helper. Root-caused
// 2026-07-23 (Session CC-20260723-t7n4): tonight's Orientation was auto-marked
// 'completed' hours before its real 6:30pm CT start, blocking check-in.
// Takes the RAW stored time string (e.g. "18:30:00") — normalizes via
// convertTo24h internally so every caller gets the seconds-format fix for
// free instead of having to remember to pre-convert.
export function classInstant(sessionDate: string, rawTime: string): Date {
  const naive = new Date(`${sessionDate}T${convertTo24h(rawTime)}:00Z`);
  return centralWallClockToInstant(naive);
}

/** Pure: is `session` due to start within (now, cutoff]? Exported for testing. */
export function isSessionUpcoming(
  session: { session_date: string; start_time: string },
  now: Date,
  cutoff: Date,
): boolean {
  const sessionDateTime = classInstant(session.session_date, session.start_time);
  return sessionDateTime > now && sessionDateTime <= cutoff;
}

/** Pure: should a still-'scheduled' session flip to 'live' at `now`? Exported for testing. */
export function isSessionDueLive(
  session: { session_date: string; start_time: string },
  now: Date,
): boolean {
  const startTime = classInstant(session.session_date, session.start_time);
  const fifteenMinBefore = new Date(startTime.getTime() - 15 * 60 * 1000);
  // Upper bound guards against a session left 'scheduled' well past its own
  // start (e.g. a manual status reset) being re-flagged live long after the
  // fact once the day-window query below picks it up again the next day.
  const sixHoursAfterStart = new Date(startTime.getTime() + 6 * 60 * 60 * 1000);
  return now >= fifteenMinBefore && now < sixHoursAfterStart;
}

/** Pure: should a 'live' session flip to 'completed' at `now`? Exported for testing. */
export function isSessionDueCompleted(
  session: { session_date: string; end_time: string },
  now: Date,
): boolean {
  const endTime = classInstant(session.session_date, session.end_time);
  const thirtyMinAfterEnd = new Date(endTime.getTime() + 30 * 60 * 1000);
  return now >= thirtyMinAfterEnd;
}

export async function getUpcomingSessions(hoursAhead: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  // Widen the DB date-window by a day on each side to absorb the Central/UTC
  // calendar-date skew — isSessionUpcoming() below does the precise comparison.
  const todayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const cutoffStr = new Date(cutoff.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const sessions = await LiveSession.findAll({
    where: {
      status: 'scheduled',
      session_date: {
        [Op.between]: [todayStr, cutoffStr],
      },
    },
    include: [{ model: Cohort, as: 'cohort' }],
  });

  return sessions.filter((s) => isSessionUpcoming(s, now, cutoff));
}

export async function getSessionsToMarkLive() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const sessions = await LiveSession.findAll({
    where: { status: 'scheduled', session_date: { [Op.in]: [todayStr, yesterdayStr] } },
  });

  return sessions.filter((s) => isSessionDueLive(s, now));
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

  return sessions.filter((s) => isSessionDueCompleted(s, now));
}

export function convertTo24h(timeStr: string): string {
  // Sequelize TIME columns (session start_time/end_time) come back as
  // "HH:MM:SS" — the trailing seconds must be optional or every call falls
  // through to the '10:00' default, silently discarding the real time.
  // Found live 2026-07-23 (Session CC-20260723-t7n4): this masked bug meant
  // getSessionsToMarkLive/Completed were evaluating every session against a
  // hardcoded 10am Central instead of its real start/end time.
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
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
  const enrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId },
    order: [['created_at', 'DESC']],
    include: [{ model: Cohort, as: 'cohort', attributes: ['name'] }],
  });

  // Enrich each enrollment with the acquisition/click data we captured on the
  // matching Lead (where they signed up from + UTM attribution), so the admin can
  // see where a prospect came from. One query for all emails — no N+1.
  const emails = Array.from(
    new Set(enrollments.map((e) => (e.email || '').toLowerCase().trim()).filter(Boolean))
  );
  const leads = emails.length
    ? await Lead.findAll({
        where: { email: { [Op.in]: emails } },
        attributes: ['email', 'source', 'form_type', 'utm_source', 'utm_campaign', 'page_url', 'created_at'],
      })
    : [];
  const leadByEmail = new Map<string, Lead>();
  for (const l of leads) {
    const key = (l.email || '').toLowerCase().trim();
    const prev = leadByEmail.get(key);
    // Keep the earliest lead (first touch) when an email has several.
    if (!prev || new Date(l.created_at ?? 0) < new Date(prev.created_at ?? 0)) leadByEmail.set(key, l);
  }

  // Subscription enrichment: the student's self-serve paid plan (monthly/annual/comp)
  // so the admin can see who is actually on a paid subscription vs a one-off/none.
  // Latest subscription per enrollment; one query, no N+1.
  const enrollmentIds = enrollments.map((e) => e.id);
  const subs = enrollmentIds.length
    ? await Subscription.findAll({ where: { enrollment_id: { [Op.in]: enrollmentIds } }, order: [['created_at', 'DESC']] })
    : [];
  const subByEnrollment = new Map<string, Subscription>();
  for (const s of subs) if (!subByEnrollment.has(s.enrollment_id)) subByEnrollment.set(s.enrollment_id, s);

  return enrollments.map((e) => {
    const lead = leadByEmail.get((e.email || '').toLowerCase().trim());
    const json = e.toJSON() as any;
    // Never leak the reusable portal login token into the list payload.
    delete json.portal_token;
    delete json.portal_token_expires_at;
    const sub = subByEnrollment.get(e.id);
    // PaySimple customer id lives on the enrollment and/or the subscription.
    const psCustomerId = json.paysimple_customer_id || sub?.paysimple_customer_id || null;
    return {
      ...json,
      lead_source: lead?.source ?? null,
      form_type: lead?.form_type ?? null,
      utm_source: lead?.utm_source ?? null,
      utm_campaign: lead?.utm_campaign ?? null,
      page_url: lead?.page_url ?? null,
      // Paid-subscription visibility for the admin roster.
      subscription: sub
        ? { plan: sub.plan, status: sub.status, amount_cents: sub.amount_cents, current_period_end: sub.current_period_end }
        : null,
      // Deep link to the payer's record in PaySimple (best-effort; base is overridable).
      paysimple_url: psCustomerId ? `${PAYSIMPLE_DASHBOARD_BASE}/#/customer/${psCustomerId}` : null,
    };
  });
}

/**
 * Build a one-click portal login URL so an admin can view the portal exactly as a
 * given participant sees it. Reuses a still-valid magic-link token (so we don't
 * disturb the student's own bookmarked link) and mints a fresh 30-day one only
 * when missing or expired. Returns null if the enrollment doesn't exist.
 */
export async function getPortalLoginUrl(enrollmentId: string): Promise<string | null> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return null;

  const now = new Date();
  let token = enrollment.portal_token;
  const exp = enrollment.portal_token_expires_at;
  if (!token || !exp || new Date(exp) <= now) {
    token = crypto.randomUUID();
    await enrollment.update({
      portal_token: token,
      portal_token_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  const base = (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/$/, '');
  return `${base}/portal/verify?token=${token}`;
}

/**
 * Read-only "View as member" portal URL. Mints a `read_only` participant JWT
 * (server blocks every write) and returns a `/portal/view-as` link carrying it
 * in the URL HASH (kept out of query strings / server logs / referrers). Unlike
 * getPortalLoginUrl this does NOT mint a real login session — it's a scoped,
 * observe-only token. Returns null if the enrollment is missing.
 */
export async function getReadOnlyViewAsUrl(enrollmentId: string, impersonatedBy: string): Promise<string | null> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return null;
  const { signReadOnlyParticipantJwt } = await import('./participantService');
  const token = signReadOnlyParticipantJwt(
    { id: enrollment.id, email: enrollment.email, cohort_id: enrollment.cohort_id },
    impersonatedBy,
  );
  const base = (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/$/, '');
  return `${base}/portal/view-as#t=${token}`;
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
