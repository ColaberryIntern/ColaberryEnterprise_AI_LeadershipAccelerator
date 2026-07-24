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

const DEFAULT_PROGRAM_WEEKS = 12;

/**
 * Parse a human core_time string ("1:00–3:00 PM CT", "10:00 AM - 12:00 PM")
 * into 24h "HH:MM" start/end. Falls back to 13:00–15:00 (the program default)
 * when the string can't be parsed. Timezone tokens (CT / EST / …) are ignored
 * here; session times are stored wall-clock and rendered in the cohort timezone.
 */
export function parseCoreTime(coreTime?: string): { start_time: string; end_time: string } {
  const fallback = { start_time: '13:00', end_time: '15:00' };
  if (!coreTime) return fallback;
  const parts = coreTime.replace(/[–—]/g, '-').split('-');
  if (parts.length < 2) return fallback;
  const meridiemOf = (s: string): 'AM' | 'PM' | null => {
    const m = s.toUpperCase().match(/\b(AM|PM)\b/);
    return m ? (m[1] as 'AM' | 'PM') : null;
  };
  const to24 = (raw: string, inherit: 'AM' | 'PM' | null): number | null => {
    const t = raw.match(/(\d{1,2}):(\d{2})/);
    if (!t) return null;
    let h = parseInt(t[1], 10);
    const min = parseInt(t[2], 10);
    const mer = meridiemOf(raw) || inherit;
    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  };
  // A meridiem stated only once (at the end) applies to both sides unless the
  // span crosses noon (e.g. "10:00 AM - 12:00 PM"), which states both explicitly.
  const rightMer = meridiemOf(parts[1]);
  const startMin = to24(parts[0], meridiemOf(parts[0]) || rightMer);
  const endMin = to24(parts[1], rightMer);
  if (startMin == null || endMin == null) return fallback;
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  return { start_time: fmt(startMin), end_time: fmt(endMin) };
}

/**
 * Resolve a cohort's session schedule. Prefers an explicit
 * settings_json.schedule, but otherwise derives one from the cohort's top-level
 * fields (core_day / optional_lab_day / core_time) so a cohort seeded with only
 * those fields still generates sessions. This reconciles the two schedule
 * representations that previously disagreed: seedCohorts wrote top-level fields,
 * while the generator only read settings_json.schedule and therefore threw.
 */
export function resolveSchedule(cohort: any): ScheduleConfig {
  const explicit: Partial<ScheduleConfig> = (cohort.settings_json || {}).schedule || {};
  const parsed = parseCoreTime(cohort.core_time);
  if (explicit.recurring_days?.length && explicit.total_sessions) {
    return {
      recurring_days: explicit.recurring_days,
      core_days: explicit.core_days || (cohort.core_day ? [cohort.core_day] : []),
      start_time: explicit.start_time || parsed.start_time,
      end_time: explicit.end_time || parsed.end_time,
      total_sessions: explicit.total_sessions,
    };
  }
  const recurring_days = [cohort.core_day, cohort.optional_lab_day].filter(Boolean);
  const core_days = cohort.core_day ? [cohort.core_day] : [];
  const total_sessions = recurring_days.length ? recurring_days.length * DEFAULT_PROGRAM_WEEKS : 0;
  return { recurring_days, core_days, start_time: parsed.start_time, end_time: parsed.end_time, total_sessions };
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

  const startDate = cohort.start_date;
  if (!startDate) {
    throw new AppError('Cohort has no start_date', 400);
  }

  const schedule = resolveSchedule(cohort);
  if (!schedule.recurring_days.length || !schedule.total_sessions) {
    throw new AppError(
      'Cohort has no usable schedule. Set core_day (and optionally optional_lab_day) on the cohort, ' +
        'or a settings_json.schedule with recurring_days and total_sessions.',
      400
    );
  }

  const { recurring_days, start_time, end_time, total_sessions, core_days } = schedule;

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
