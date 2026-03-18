import { Cohort, LiveSession } from '../models';
import { AppError } from '../utils/AppError';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_SESSION_TITLES = [
  'Define & Architect',
  'Enterprise Architecture Deep-Dive',
  'Build Your AI Proof of Capability',
  'Executive Presentation & Strategy',
  'Final Presentations & Roadmap',
];

export interface ScheduleConfig {
  recurring_days: string[];
  start_time: string;
  end_time: string;
  total_sessions: number;
  core_days: string[];
}

export interface GenerateResult {
  sessions: any[];
  deleted: number;
  message: string;
}

/**
 * Generate sessions for a cohort based on its schedule configuration.
 *
 * Reads config from cohort.settings_json.schedule, iterates day-by-day
 * from cohort.start_date, and creates LiveSession records for each
 * matching day until total_sessions is reached.
 */
export async function generateSessionsFromCohort(cohortId: string): Promise<GenerateResult> {
  const cohort = await Cohort.findByPk(cohortId);
  if (!cohort) throw new AppError('Cohort not found', 404);

  const settings = (cohort as any).settings_json || {};
  const schedule: ScheduleConfig = settings.schedule;

  if (!schedule || !schedule.recurring_days?.length || !schedule.total_sessions) {
    throw new AppError(
      'Cohort has no schedule configuration. Set recurring_days and total_sessions in cohort settings.',
      400
    );
  }

  const startDate = cohort.start_date;
  if (!startDate) {
    throw new AppError('Cohort has no start_date', 400);
  }

  const {
    recurring_days,
    start_time = '13:00',
    end_time = '15:00',
    total_sessions,
    core_days = [],
  } = schedule;

  // Delete existing sessions for this cohort (idempotent regeneration)
  const deleted = await LiveSession.destroy({
    where: { cohort_id: cohortId },
  });

  if (deleted > 0) {
    console.log(`[SessionGen] Deleted ${deleted} existing sessions for cohort ${cohortId}`);
  }

  // Generate session dates
  const sessionDates: { date: Date; dayName: string }[] = [];
  const current = new Date(startDate + 'T00:00:00');
  const maxDays = 365; // Safety: don't loop more than a year
  let daysChecked = 0;

  while (sessionDates.length < total_sessions && daysChecked < maxDays) {
    const dayName = DAY_NAMES[current.getDay()];
    if (recurring_days.includes(dayName)) {
      sessionDates.push({
        date: new Date(current),
        dayName,
      });
    }
    current.setDate(current.getDate() + 1);
    daysChecked++;
  }

  // Create LiveSession records
  const sessions = [];
  for (let i = 0; i < sessionDates.length; i++) {
    const { date, dayName } = sessionDates[i];
    const sessionType = core_days.includes(dayName) ? 'core' : 'lab';
    const dateStr = date.toISOString().split('T')[0];
    const defaultTitle = DEFAULT_SESSION_TITLES[i] || `Session ${i + 1}`;
    const title = `Session ${i + 1} — ${defaultTitle}`;

    const session = await LiveSession.create({
      cohort_id: cohortId,
      session_number: i + 1,
      title,
      session_date: dateStr,
      start_time: start_time + ':00',
      end_time: end_time + ':00',
      session_type: sessionType,
      status: 'scheduled',
    } as any);

    sessions.push(session);
    console.log(
      `[SessionGen] Created session ${i + 1}: ${dateStr} (${dayName}) [${sessionType}] — ${title}`
    );
  }

  const message = `${sessions.length} sessions generated for ${cohort.name} (${deleted} previous sessions replaced)`;
  console.log(`[SessionGen] ${message}`);

  return { sessions, deleted, message };
}
