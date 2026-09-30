/**
 * sessionScheduleService — admin schedule management for a cohort's live sessions.
 *
 * Owns the "skip a day / un-skip / delete-and-compact" mechanics plus per-session
 * curriculum lookup. The core primitive is reflowCohortSchedule: it recomputes
 * every session's date + number from the cohort's recurring days, honoring a set
 * of skipped calendar dates, and PRESERVES each session's title/status/etc.
 *
 * Determinism / idempotency: dates are derived purely from (start_date,
 * recurring_days, skipped_dates) and assigned in session_number order, so running
 * reflow twice with the same inputs yields the same dates and writes nothing the
 * second time.
 *
 * Kept self-contained (models + resolveSchedule + raw SQL only) so it never
 * imports acceleratorService — that direction would create an import cycle, since
 * acceleratorService.deleteSession calls reflowCohortSchedule.
 */
import { QueryTypes } from 'sequelize';
import { Cohort, LiveSession } from '../models';
import { sequelize } from '../config/database';
import { resolveSchedule } from './sessionGenerationService';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Safety cap so a misconfigured schedule can never loop unbounded.
const MAX_DAYS = 500;

export interface ScheduleMutationResult {
  sessions: LiveSession[];
  skipped_dates: string[];
}

export interface SessionCurriculum {
  session_title: string;
  week: number | null;
  blueprint: Record<string, any> | null;
}

/** Format a local Date as 'YYYY-MM-DD' (TZ-safe — no UTC shift like toISOString). */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Read the cohort's skipped calendar dates ('YYYY-MM-DD') as a Set. */
function readSkipped(cohort: Cohort): Set<string> {
  const raw = cohort.settings_json?.schedule?.skipped_dates;
  return new Set<string>(Array.isArray(raw) ? raw : []);
}

/** Persist a skipped-dates set onto the cohort (sorted); returns the array. */
async function writeSkipped(cohort: Cohort, skipped: Set<string>): Promise<string[]> {
  const settings = cohort.settings_json || {};
  const schedule = settings.schedule || {};
  const skipped_dates = Array.from(skipped).sort();
  await cohort.update({ settings_json: { ...settings, schedule: { ...schedule, skipped_dates } } });
  return skipped_dates;
}

/** Reload a cohort's sessions in schedule order. */
async function reloadSessions(cohortId: string): Promise<LiveSession[]> {
  return LiveSession.findAll({
    where: { cohort_id: cohortId },
    order: [['session_number', 'ASC']],
  });
}

/**
 * THE CORE. Recompute every session's date + number for a cohort so they land on
 * consecutive recurring-day slots from start_date, skipping any skipped_dates.
 * Preserves titles, status, and all other fields. Deterministic + idempotent.
 */
export async function reflowCohortSchedule(cohortId: string): Promise<void> {
  const cohort = await Cohort.findByPk(cohortId);
  if (!cohort || !cohort.start_date) return;

  const sched = resolveSchedule(cohort);
  if (!sched.recurring_days.length) return;

  const skipped = readSkipped(cohort);

  const sessions = await reloadSessions(cohortId);
  if (!sessions.length) return;

  // Generate consecutive open slots: a day qualifies if its weekday is recurring
  // AND its date is not skipped. Collect exactly one slot per existing session.
  const slots: string[] = [];
  const current = new Date(cohort.start_date + 'T00:00:00');
  let daysChecked = 0;
  while (slots.length < sessions.length && daysChecked < MAX_DAYS) {
    const dayName = DAY_NAMES[current.getDay()];
    const dateStr = formatDate(current);
    if (sched.recurring_days.includes(dayName) && !skipped.has(dateStr)) {
      slots.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
    daysChecked++;
  }

  // Assign in order. Only date + number change; everything else is preserved.
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const newNumber = i + 1;
    const newDate = slots[i]; // may be undefined only if the cap was hit
    const patch: Partial<{ session_date: string; session_number: number }> = {};
    if (session.session_number !== newNumber) patch.session_number = newNumber;
    if (newDate && session.session_date !== newDate) patch.session_date = newDate;
    if (Object.keys(patch).length) await session.update(patch);
  }
}

/**
 * Skip the calendar day a session currently sits on. Adds that date to the
 * cohort's skipped_dates and reflows — so the skipped day now has no class and
 * that session (plus every later one) pushes forward to the next open slots.
 */
export async function skipSessionDate(sessionId: string): Promise<ScheduleMutationResult | null> {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return null;
  const cohortId = session.cohort_id;
  const cohort = await Cohort.findByPk(cohortId);
  if (!cohort) return null;

  const skipped = readSkipped(cohort);
  skipped.add(session.session_date);
  const skipped_dates = await writeSkipped(cohort, skipped);

  await reflowCohortSchedule(cohortId);
  return { sessions: await reloadSessions(cohortId), skipped_dates };
}

/**
 * Un-skip a previously skipped date: remove it from the cohort's skipped_dates
 * and reflow, so the calendar re-opens that day and sessions compact back.
 */
export async function unskipDate(cohortId: string, date: string): Promise<ScheduleMutationResult | null> {
  const cohort = await Cohort.findByPk(cohortId);
  if (!cohort) return null;

  const skipped = readSkipped(cohort);
  skipped.delete(date);
  const skipped_dates = await writeSkipped(cohort, skipped);

  await reflowCohortSchedule(cohortId);
  return { sessions: await reloadSessions(cohortId), skipped_dates };
}

/** The cohort's skipped calendar dates ('YYYY-MM-DD'), defaulting to []. */
export async function getCohortSkippedDates(cohortId: string): Promise<string[]> {
  const cohort = await Cohort.findByPk(cohortId, { attributes: ['settings_json'] });
  const raw = cohort?.settings_json?.schedule?.skipped_dates;
  return Array.isArray(raw) ? raw : [];
}

/**
 * Resolve the curriculum blueprint for a session. Parses "Week N" from the
 * session title; when found and the cohort has a program, loads that week's
 * blueprint row. Never throws on a missing blueprint — returns null instead.
 */
export async function getSessionCurriculum(sessionId: string): Promise<SessionCurriculum | null> {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return null;

  const weekMatch = session.title.match(/Week\s+(\d+)/i);
  const week = weekMatch ? parseInt(weekMatch[1], 10) : null;
  if (week == null) {
    return { session_title: session.title, week: null, blueprint: null };
  }

  const cohort = await Cohort.findByPk(session.cohort_id, { attributes: ['program_id'] });
  const pid = cohort?.program_id;
  if (!pid) {
    return { session_title: session.title, week, blueprint: null };
  }

  const rows = await sequelize.query<Record<string, any>>(
    `SELECT week, title, purpose, learning_objectives, competencies, evidence_produced, student_outcomes
       FROM curriculum_blueprints
      WHERE program_id = :pid AND week = :wk
      LIMIT 1`,
    { replacements: { pid, wk: week }, type: QueryTypes.SELECT },
  );
  return { session_title: session.title, week, blueprint: rows.length ? rows[0] : null };
}
