import { Op } from 'sequelize';
import Enrollment from '../../models/Enrollment';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import StudentNavigationEvent from '../../models/StudentNavigationEvent';
import CurriculumLesson from '../../models/CurriculumLesson';
import { getPilotCohortIds } from './reeseEligibilityService';

// Reese Phase 2 (Autonomous Outreach) — real signal evaluation, one student at
// a time. See execution-contract.md's "grounding corrections" for why this
// does NOT reuse studentSuccessAgent.ts / studentBehaviorIntelligenceAgent.ts
// directly: the former reads two Enrollment fields (`updated_at`, `progress`)
// that don't exist as real columns (Enrollment has timestamps:false and no
// progress field — confirmed always undefined), so that signal never actually
// fires today; the latter only aggregates at LESSON grain (no student
// identifiers), so there is no student to message from its output. Both
// concepts (inactivity/low-completion, idle-event anomaly) are reproduced here
// from real per-student data instead. Neither existing agent file is modified.

const INACTIVITY_THRESHOLD_DAYS = 7;
const LOW_COMPLETION_THRESHOLD_PCT = 20;
const IDLE_EVENT_THRESHOLD = 3;
const IDLE_EVENT_WINDOW_HOURS = 24;

export interface InactivitySignal {
  lastActiveAt: Date | null;
  daysSinceActive: number | null;
  completionPct: number;
  totalCards: number;
  reasons: string[];
}

export interface AnomalySignal {
  idleCount: number;
  lessonId: string | null;
  lessonTitle: string | null;
  windowHours: number;
}

/** All active pilot-cohort student enrollment ids — the candidate list the
 * sweep/follow-up jobs iterate over. Not a substitute for
 * reeseEligibilityService.isEligibleForAutonomousOutreach() — that check is
 * always re-run per-student immediately before any real send, per this run's
 * "no bypass path" requirement. */
export async function getPilotCohortStudentEnrollmentIds(): Promise<string[]> {
  const pilotCohortIds = await getPilotCohortIds();
  if (pilotCohortIds.length === 0) return [];
  const enrollments = await Enrollment.findAll({
    where: { cohort_id: { [Op.in]: pilotCohortIds }, status: 'active' },
    attributes: ['id'],
  });
  return enrollments.map((e) => e.id);
}

/**
 * Real inactivity/low-completion signal for one student, grounded in
 * TimelineCardProgress (real per-student rows with a real `updated_at`).
 * Returns null if neither condition holds — never throws for a student with
 * zero progress rows (a brand-new student falls back to `enrolled_at` as the
 * activity baseline, and `totalCards === 0` short-circuits the completion
 * check so a new student is never flagged as "low progress" before they've
 * had any cards assigned).
 */
export async function evaluateInactivitySignal(enrollmentId: string): Promise<InactivitySignal | null> {
  const rows = await TimelineCardProgress.findAll({ where: { enrollment_id: enrollmentId } });

  const totalCards = rows.length;
  const completedCards = rows.filter((r) => r.status === 'completed').length;
  const completionPct = totalCards > 0 ? Math.round((completedCards / totalCards) * 100) : 100;

  let lastActiveAt: Date | null = null;
  for (const row of rows) {
    if (!row.updated_at) continue;
    if (!lastActiveAt || row.updated_at > lastActiveAt) lastActiveAt = row.updated_at;
  }
  if (!lastActiveAt) {
    const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'enrolled_at'] });
    lastActiveAt = enrollment?.enrolled_at ?? null;
  }

  const daysSinceActive = lastActiveAt
    ? (Date.now() - lastActiveAt.getTime()) / (24 * 60 * 60 * 1000)
    : null;

  const reasons: string[] = [];
  if (daysSinceActive !== null && daysSinceActive >= INACTIVITY_THRESHOLD_DAYS) {
    reasons.push(`No activity in ${Math.floor(daysSinceActive)} days`);
  }
  if (totalCards > 0 && completionPct < LOW_COMPLETION_THRESHOLD_PCT) {
    reasons.push(`Low progress: ${completionPct}%`);
  }
  if (reasons.length === 0) return null;

  return { lastActiveAt, daysSinceActive, completionPct, totalCards, reasons };
}

/**
 * Real per-student idle-event anomaly signal, from the SAME underlying table/
 * event type studentBehaviorIntelligenceAgent.ts reads
 * (`student_navigation_events`, `event_type='idle_detected'`) but computed at
 * student grain with its own independently-defined threshold (that agent has
 * no per-student output to reuse — see this file's header). Returns null
 * below threshold — never throws for a student with zero events.
 */
export async function evaluateBehaviorAnomalySignal(enrollmentId: string): Promise<AnomalySignal | null> {
  const since = new Date(Date.now() - IDLE_EVENT_WINDOW_HOURS * 60 * 60 * 1000);
  const idleEvents = await StudentNavigationEvent.findAll({
    where: { enrollment_id: enrollmentId, event_type: 'idle_detected', created_at: { [Op.gte]: since } },
    order: [['created_at', 'DESC']],
  });

  if (idleEvents.length < IDLE_EVENT_THRESHOLD) return null;

  const lessonId = idleEvents[0].lesson_id ?? null;
  let lessonTitle: string | null = null;
  if (lessonId) {
    const lesson = await CurriculumLesson.findByPk(lessonId, { attributes: ['id', 'title'] });
    lessonTitle = lesson?.title ?? null;
  }

  return { idleCount: idleEvents.length, lessonId, lessonTitle, windowHours: IDLE_EVENT_WINDOW_HOURS };
}
