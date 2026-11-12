import { withToolRecording } from '../agents/tools/toolInvocationRecorder';
import OpenAI from 'openai';
import { sequelize } from '../../config/database';
import { getCurriculumCompletion, WEEK_DONE_THRESHOLD } from '../curriculumCompletionService';

/**
 * Dara upstairs (Colaberry Campus C88). Ali, 2026-10-29: "Dara should be upstairs monitoring curriculum, student habits
 * etc." These are Dara's tools when a STAFF member (a badge that opens the Program floor, the C87 gate) talks to her. Both
 * are read-only and both read the one existing aggregation the Class Dashboard already uses (getCurriculumCompletion), so
 * Dara can never quote a number the dashboard would not show.
 *
 * Signals in this first slice: where students stall (per-card completion in the scheduled week and the one before) and
 * pacing (the gold/green/yellow/red bands). Missed sessions, missed work and logins are the next step (the open question
 * on C88: which habit signals matter most first).
 *
 * SECURITY: the model never supplies an id. It may pass a cohort NAME, which is matched only against the server's own
 * list of started cohorts; anything else falls back to the default cohort and says so. The caller (daraReplyService)
 * offers these tools only to a sender that canReachAgent(sender, 'dara') admits.
 *
 * HONESTY: a cohort under MIN_STUDENTS active students gets no card-level stall claims (the curriculum capability's own
 * rule: a drop-off is not evidence of a curriculum defect, and needs a minimum cohort size). Every result names its
 * cohort, its scheduled week and its population, so the answer is checkable against the Class Dashboard.
 */
export const MIN_STUDENTS = 5;
const STALL_LIMIT = 8;
const BEHIND_LIMIT = 15;
const COHORT_LIMIT = 12;

const cohortParam = {
  type: 'object',
  properties: {
    cohort: {
      type: 'string',
      description: 'Optional cohort name, exactly as listed in availableCohorts of an earlier result. Omit for the default cohort.',
    },
  },
  required: [],
} as const;

export const DARA_STAFF_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'curriculum_health',
      description:
        'Where students are stalling: completion of each published card in the cohort\'s scheduled week and the week ' +
        'before, lowest first, plus the week-level completion. Real data from the Class Dashboard aggregation.',
      parameters: cohortParam,
    },
  },
  {
    type: 'function',
    function: {
      name: 'student_pacing',
      description:
        'Who is keeping up with the schedule: the pace bands (gold, green, yellow, red) and the students behind, with ' +
        'weeks completed against the scheduled week. Real data from the Class Dashboard aggregation.',
      parameters: cohortParam,
    },
  },
];

const TOOL_NAMES = new Set(DARA_STAFF_TOOLS.map((t) => (t.type === 'function' ? t.function.name : null)).filter((n): n is string => n !== null));

export function isDaraStaffTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

interface CohortRow { id: string; name: string; start_date: string; active: number }

/** Started cohorts that have active students, newest first. The only list a cohort name is ever matched against. */
export async function listStartedCohorts(): Promise<CohortRow[]> {
  const [rows] = await sequelize.query(
    `SELECT c.id, c.name, c.start_date, count(e.id)::int AS active
       FROM cohorts c JOIN enrollments e ON e.cohort_id = c.id AND e.status = 'active'
      WHERE c.start_date <= CURRENT_DATE AND c.status <> 'completed'
      GROUP BY c.id, c.name, c.start_date
      ORDER BY c.start_date DESC
      LIMIT ${COHORT_LIMIT}`,
  ) as [CohortRow[], unknown];
  return rows;
}

/**
 * Resolve the cohort a staff question is about. Default: the most recently started cohort with at least MIN_STUDENTS
 * active students (a one-person batch that started yesterday says nothing yet), else the most recent one.
 */
export async function resolveCohort(requested?: string): Promise<{ cohort: CohortRow | null; note: string | null; available: string[] }> {
  const cohorts = await listStartedCohorts();
  const available = cohorts.map((c) => c.name);
  const fallback = cohorts.find((c) => c.active >= MIN_STUDENTS) ?? cohorts[0] ?? null;
  const asked = (requested || '').trim().toLowerCase();
  if (!asked) return { cohort: fallback, note: null, available };
  const hit = cohorts.find((c) => c.name.trim().toLowerCase() === asked);
  if (hit) return { cohort: hit, note: null, available };
  return { cohort: fallback, note: `No started cohort is named "${requested}"; showing the default cohort instead.`, available };
}

async function curriculumHealth(requested?: string): Promise<unknown> {
  const { cohort, note, available } = await resolveCohort(requested);
  if (!cohort) return { status: 'no_data', note: 'No started cohort has active students.' };
  const data = await getCurriculumCompletion(cohort.id);
  if (!data) return { status: 'no_data', cohort: cohort.name, availableCohorts: available };

  const focus = new Set([data.scheduledWeek, data.scheduledWeek - 1]);
  const weeks = data.weeks.filter((w) => w.week !== null && focus.has(w.week));
  const enough = data.activeStudents >= MIN_STUDENTS;
  const stalls = enough
    ? weeks.flatMap((w) => w.sections.flatMap((s) => s.cards
      .filter((c) => c.published)
      .map((c) => ({ week: w.week, section: s.bucket, title: c.title, type: c.type, completedPct: c.completedPct, completedCount: c.completedCount }))))
      .sort((a, b) => a.completedPct - b.completedPct)
      .slice(0, STALL_LIMIT)
    : [];

  return {
    status: 'ok',
    cohort: cohort.name,
    note,
    scheduledWeek: data.scheduledWeek,
    deliveredSessions: data.deliveredSessions,
    activeStudents: data.activeStudents,
    weeks: weeks.map((w) => ({ week: w.week, completedPct: w.completedPct, publishedCards: w.publishedCardCount, studentsCompletedAny: w.studentsCompletedAny })),
    lowestCompletionCards: stalls,
    caution: enough
      ? 'Low completion shows where students have not finished a card; it is not by itself evidence the card is badly made.'
      : `Only ${data.activeStudents} active students: too few for card-level conclusions, so none are given.`,
    availableCohorts: available,
  };
}

async function studentPacing(requested?: string): Promise<unknown> {
  const { cohort, note, available } = await resolveCohort(requested);
  if (!cohort) return { status: 'no_data', note: 'No started cohort has active students.' };
  const data = await getCurriculumCompletion(cohort.id);
  if (!data) return { status: 'no_data', cohort: cohort.name, availableCohorts: available };

  const behind = data.students
    .filter((s) => s.band === 'red' || s.band === 'yellow')
    .slice()
    .sort((a, b) => a.delta - b.delta)
    .slice(0, BEHIND_LIMIT)
    .map((s) => ({ name: s.name, weeksCompleted: s.weeksCompleted, cardsCompleted: s.cardsCompleted, furthestWeekTouched: s.furthestWeekTouched, weeksBehind: -s.delta, band: s.band }));

  return {
    status: 'ok',
    cohort: cohort.name,
    note,
    scheduledWeek: data.scheduledWeek,
    activeStudents: data.activeStudents,
    pace: data.pace,
    behind,
    behindListed: behind.length,
    definition: `A week counts as done at ${Math.round(WEEK_DONE_THRESHOLD * 100)}% of its published cards; the band is weeks done minus the scheduled week (gold +2, green 0 or +1, yellow -1, red -2 or worse).`,
    availableCohorts: available,
  };
}

/**
 * Executes one staff tool by name. Never throws: a failure becomes an honest error payload the model can see, so Dara
 * says she could not read the data instead of inventing an answer.
 */
/**
 * Agent Tools Phase 5: every action carries the identity of the tool that performed it.
 * The wrapper returns the inner result unchanged and rethrows, so it cannot alter behaviour.
 */
export async function executeDaraStaffTool(toolName: string, args: { cohort?: unknown }): Promise<string> {
  return withToolRecording(
    { agentName: 'Dara', toolName, surface: 'dara_staff' },
    () => executeDaraStaffToolInner(toolName, args),
  );
}

async function executeDaraStaffToolInner(toolName: string, args: { cohort?: unknown }): Promise<string> {
  const cohort = typeof args?.cohort === 'string' ? args.cohort : undefined;
  try {
    if (toolName === 'curriculum_health') return JSON.stringify(await curriculumHealth(cohort));
    if (toolName === 'student_pacing') return JSON.stringify(await studentPacing(cohort));
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'dara', event: 'staff_tool_failed', outcome: 'failure',
      error_class: e?.name || 'Error', context: { tool: toolName },
    }));
    return JSON.stringify({ error: 'Tool execution failed', message: 'The curriculum data could not be read right now.' });
  }
}
