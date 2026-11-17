import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { LiveSession, AttendanceRecord, Enrollment } from '../models';
import { openHouseEventIdOf } from './openHouseReminderPolicy';
import { award } from './pointsService';
import { classInstant } from './acceleratorService';
import { recordPresenceEvent, formatDisplayName } from './sessionPresenceService';

// Live Sessions build-out Phase 3 (Session CC-20260721-s7h4): student-initiated
// attendance capture + credit. When a student joins a live session from the
// portal we record attendance (create-only, upgrade-not-downgrade) and award
// points once per (enrollment, session). Meet has no reliable join webhook, so
// the portal join click is the deterministic capture point.

/** Minutes after start_time within which a join still counts as 'present'. */
export const ATTENDANCE_GRACE_MINUTES = 10;

/** A join is only credited while the session is joinable (not completed/cancelled). */
const JOINABLE_STATUSES = new Set(['scheduled', 'live']);

/** Statuses that must never be downgraded by a self-join (admin decisions win). */
const PROTECTED_STATUSES = new Set(['present', 'excused']);

/**
 * Pure: present vs late for a join at `now`, given the session's stored
 * date + wall-clock start_time. A join any time up to `graceMinutes` after
 * start counts present; later counts late. Exported for unit testing.
 */
export function computeAttendanceStatus(
  sessionDate: string,
  startTime: string,
  now: Date,
  graceMinutes: number = ATTENDANCE_GRACE_MINUTES
): 'present' | 'late' {
  const start = classInstant(sessionDate, startTime);
  const cutoff = start.getTime() + graceMinutes * 60 * 1000;
  return now.getTime() <= cutoff ? 'present' : 'late';
}

/**
 * Pure: the attendance status to persist given the existing row's status (or
 * null for a new row) and the freshly computed status. Never downgrades an
 * admin-set present/excused; upgrades absent/late/new to the computed value.
 * Exported for unit testing.
 */
export function resolveJoinedStatus(
  existing: string | null | undefined,
  computed: 'present' | 'late'
): string {
  if (existing && PROTECTED_STATUSES.has(existing)) return existing;
  return computed;
}

/**
 * Pure: may this caller join this session?
 *
 * A class is joined by its own cohort. An Open House (a session carrying an
 * Eventbrite event id) is also joined by anyone REGISTERED for that event,
 * whatever their cohort. OH1 (2026-11-17): 11 of the 171 platform registrants
 * for the Nov 19 Open House sit in other cohorts, so the reminder's Join button
 * answered them "Session not found or not joinable" and recorded no attendance.
 * Registration is the invitation; being in some other cohort grants nothing.
 */
export function maySelfJoin(args: {
  sessionCohortId: string | null | undefined;
  callerCohortId: string | null | undefined;
  openHouseEventId: string | null;
  registeredForEvent: boolean;
}): boolean {
  if (args.sessionCohortId && args.callerCohortId && String(args.sessionCohortId) === String(args.callerCohortId)) return true;
  return Boolean(args.openHouseEventId) && args.registeredForEvent;
}

/** The session, when `maySelfJoin` allows this caller; null otherwise. */
async function findJoinableSessionFor(enrollmentId: string, sessionId: string, cohortId: string): Promise<LiveSession | null> {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return null;
  const sessionCohortId = (session as any).cohort_id ?? null;
  const openHouseEventId = openHouseEventIdOf(session as any);
  let registeredForEvent = false;
  if (openHouseEventId && String(sessionCohortId) !== String(cohortId)) {
    const rows = await sequelize.query(
      `SELECT 1 FROM open_house_registrations WHERE event_id = :eventId AND enrollment_id::text = :enrollmentId LIMIT 1`,
      { replacements: { eventId: openHouseEventId, enrollmentId: String(enrollmentId) }, type: QueryTypes.SELECT },
    );
    registeredForEvent = rows.length > 0;
  }
  return maySelfJoin({ sessionCohortId, callerCohortId: cohortId, openHouseEventId, registeredForEvent }) ? session : null;
}

export interface JoinResult {
  ok: true;
  status: string;
  awarded: boolean;
  points: number;
}

/**
 * Record a student's join of a live session and award attendance credit once.
 * Returns null when the session is not in the caller's cohort or is not
 * joinable (→ the controller responds 404), so watching a recording of a
 * completed session never earns live-attendance credit.
 */
export async function joinLiveSession(
  enrollmentId: string,
  sessionId: string,
  cohortId: string,
  now: Date = new Date(),
  source: 'classroom' | 'meet' = 'classroom',
): Promise<JoinResult | null> {
  const session = await findJoinableSessionFor(enrollmentId, sessionId, cohortId);
  if (!session || !JOINABLE_STATUSES.has(session.status)) return null;

  const computed = computeAttendanceStatus(session.session_date, session.start_time, now);

  const [record, created] = await AttendanceRecord.findOrCreate({
    where: { enrollment_id: enrollmentId, session_id: sessionId },
    defaults: {
      enrollment_id: enrollmentId,
      session_id: sessionId,
      status: computed,
      join_time: now,
      marked_by: 'self',
    } as any,
  });

  let finalStatus: string = created ? computed : (record as any).status;
  if (!created) {
    const resolved = resolveJoinedStatus((record as any).status, computed);
    const updates: any = {};
    if (!(record as any).join_time) updates.join_time = now;
    if (resolved !== (record as any).status) {
      updates.status = resolved;
      updates.marked_by = 'self';
    }
    finalStatus = resolved;
    if (Object.keys(updates).length) await record.update(updates);
  }

  // Idempotent per (enrollment, session) via the points ledger's unique index.
  // The attendance write and this award are two independently-idempotent writes
  // (not one transaction): if award throws after the row exists, a retry re-finds
  // the row (no downgrade) and re-awards with no duplicate side effect.
  const { awarded, points } = await award(enrollmentId, {
    eventType: 'session_attended',
    eventKey: `session_attended:${sessionId}`,
    metadata: { session_id: sessionId, status: finalStatus },
  });

  // Best-effort named presence event for the instructor deck's live ticker —
  // never blocks or fails the join itself if the lookup/insert has trouble.
  try {
    const enrollment = await Enrollment.findByPk(enrollmentId);
    if (enrollment) {
      await recordPresenceEvent(
        sessionId, enrollmentId,
        source === 'meet' ? 'virtual_building_enter' : 'classroom_enter',
        formatDisplayName((enrollment as any).full_name),
      );
    }
  } catch (err) {
    console.warn('[presence] join event failed (non-fatal):', (err as Error).message);
  }

  return { ok: true, status: finalStatus, awarded, points };
}

/** A student left the Google Meet tab (best-effort, page-unload signal — see
 * sessionPresenceService.ts header for why this is a proxy, not real presence). */
export async function leaveMeetingSession(
  enrollmentId: string, sessionId: string, cohortId: string,
): Promise<boolean> {
  const session = await findJoinableSessionFor(enrollmentId, sessionId, cohortId);
  if (!session) return false;
  try {
    const enrollment = await Enrollment.findByPk(enrollmentId);
    if (enrollment) {
      await recordPresenceEvent(sessionId, enrollmentId, 'virtual_building_leave', formatDisplayName((enrollment as any).full_name));
    }
  } catch (err) {
    console.warn('[presence] leave event failed (non-fatal):', (err as Error).message);
  }
  return true;
}

/**
 * Fill leave_time + duration_minutes for anyone who joined but has no leave
 * recorded, clamping leave to the session's scheduled end. Idempotent (only
 * touches rows with a join_time and a null leave_time). Called from the
 * session-completion cron. Returns the number of rows finalized.
 */
export async function finalizeSessionAttendance(
  sessionId: string,
  now: Date = new Date()
): Promise<number> {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return 0;
  const end = classInstant(session.session_date, session.end_time);
  const leaveAt = now.getTime() < end.getTime() ? now : end;

  const rows = await AttendanceRecord.findAll({
    where: { session_id: sessionId, join_time: { [Op.ne]: null as any }, leave_time: null as any },
  });
  let finalized = 0;
  for (const r of rows) {
    const joinMs = new Date((r as any).join_time).getTime();
    const durationMinutes = Math.max(0, Math.round((leaveAt.getTime() - joinMs) / 60000));
    await r.update({ leave_time: leaveAt, duration_minutes: durationMinutes } as any);
    finalized++;
  }
  return finalized;
}
