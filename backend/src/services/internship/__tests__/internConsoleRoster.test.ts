/**
 * The Intern Console roster — one row per active intern, and the things it must not say.
 *
 * Four of these tests exist because production data contradicted a reasonable assumption:
 *
 *   1. One real intern holds TWO application rows — `withdrawn` from one day, `active` from the
 *      next, because reapplying opens a new application rather than reviving the old record. A
 *      join that picked the wrong one labels a working intern as withdrawn.
 *   2. Eight of the ten interns sit in a cohort with ZERO live sessions, so there is no schedule
 *      to pace against. The class dashboard's unconditional `paceBandFor` would paint them all
 *      green, which looks like a measurement and is not one.
 *   3. Eight of ten have no project at all, so "no project" is the common case.
 *   4. Attendance is off entirely — 7 join rows existed across 2 interns, and no denominator
 *      exists anywhere.
 */
const mockQuery = jest.fn();
const mockRosterWeeks = jest.fn();
const mockSignals = jest.fn();
const mockProjects = jest.fn();

jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../../config/env', () => ({ env: { certPrepEnabled: true } }));
jest.mock('../../curriculumCompletionService', () => ({
  ...jest.requireActual('../../curriculumCompletionService'),
  getRosterWeekBreakdown: (...a: unknown[]) => mockRosterWeeks(...a),
}));
jest.mock('../internConsoleActivity', () => ({
  internActivitySignals: (...a: unknown[]) => mockSignals(...a),
}));
// NOT requireActual: the real module reaches the Sequelize models, which need a real
// `sequelize.define` that this suite's database mock does not provide. Only the function is
// needed here, and `ProjectStage` is a type that erases at runtime.
jest.mock('../../projectDeliveryService', () => ({
  getProjectDelivery: (...a: unknown[]) => mockProjects(...a),
}));

import {
  getConsoleRoster, paceFor, weeksCompletedFrom, dayOfInternship, consoleCounts,
  type ConsoleRosterRow,
} from '../internConsoleRoster';
import { env } from '../../../config/env';
import { StudentWeekRow } from '../../curriculumCompletionService';

const NOW = new Date('2026-10-01T12:00:00Z');
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const COHORT = 'aaaaaaaa-0000-0000-0000-000000000000';

const week = (w: number | null, published: number, completed: number): StudentWeekRow => ({
  week: w,
  publishedCardCount: published,
  completed,
  completedPct: published ? Math.round((completed / published) * 1000) / 10 : 0,
  weekDone: published > 0 && completed / published >= 0.3,
});

const signal = (daysSince: number | null, level: string) => ({
  last_activity_at: daysSince === null ? null : new Date(NOW.getTime() - daysSince * 86_400_000).toISOString(),
  last_activity_source: daysSince === null ? null : 'xp_events',
  days_since: daysSince,
  level,
  days: [],
  graced: false,
});

const identityRow = (id: string, name: string, state: string | null, cohortId: string | null = COHORT) => ({
  enrollment_id: id,
  name,
  email: `${name.toLowerCase().replace(/\W/g, '')}@example.com`,
  joined_at: '2026-09-22T00:00:00.000Z',
  cohort_id: cohortId,
  cohort_name: cohortId ? 'Cohort - July 2026' : null,
  cohort_type: cohortId ? 'accelerator' : null,
  application_state: state,
  application_id: state === null ? null : `app-${id}`,
});

/** The five queries the roster makes in order: identity, sessions, cert. (training/activity/projects are mocked.) */
const respond = (identity: unknown[], sessions: unknown[] = [], cert: unknown[] = []) => {
  mockQuery.mockReset();
  mockQuery
    .mockResolvedValueOnce([identity, {}])   // identity
    .mockResolvedValueOnce([sessions, {}])   // live_sessions
    .mockResolvedValueOnce([cert, {}]);      // cert_sessions
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (env as any).certPrepEnabled = true;
  mockRosterWeeks.mockResolvedValue(new Map());
  mockSignals.mockResolvedValue(new Map());
  mockProjects.mockResolvedValue([]);
});
afterEach(() => (console.warn as jest.Mock).mockRestore?.());

describe('who is on the roster', () => {
  it('takes the population from cohort_memberships, never from enrollments.cohort_id', async () => {
    // An intern's enrollment still points at their CLASS cohort, because the internship is a
    // second membership row. Filtering on e.cohort_id returns nobody, and an empty console reads
    // as "there are no interns" rather than as a wrong query.
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);

    await getConsoleRoster({ now: NOW });

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("cm.membership_type = 'internship'");
    expect(sql).toContain("ic.cohort_type = 'ai_internship'");
    expect(sql).not.toMatch(/WHERE[\s\S]*e\.cohort_id\s*=/);
  });

  it('returns one row per intern even if they hold two membership rows', async () => {
    // DISTINCT ON in the query is what guarantees this; a duplicate would be read as two interns
    // with the same name.
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);

    const out = await getConsoleRoster({ now: NOW });

    expect(String(mockQuery.mock.calls[0][0])).toContain('DISTINCT ON (e.id)');
    expect(out).toHaveLength(1);
  });

  it('reads the application state from the LATEST application row', async () => {
    // The real trap: one intern has a withdrawn row and an active row from the next day. Picking
    // the older one labels a working intern as withdrawn on their manager's dashboard.
    const sqlProbe = async () => {
      respond([identityRow(A, 'Quincy Nkwain Ninying', 'active')]);
      await getConsoleRoster({ now: NOW });
      return String(mockQuery.mock.calls[0][0]);
    };

    const sql = await sqlProbe();

    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toMatch(/ORDER BY a\.updated_at DESC NULLS LAST, a\.created_at DESC\s+LIMIT 1/);
    expect(sql).toContain('ia.state');
  });

  it('takes the application id from the SAME row as the state', async () => {
    // Two facts about one application. Taking the state from the latest row and the id from any
    // other would open a record that says something different from what the console just showed.
    respond([identityRow(A, 'Kalkidan Bezabeh', 'active')]);

    const [row] = await getConsoleRoster({ now: NOW });

    expect(String(mockQuery.mock.calls[0][0])).toContain('SELECT a.state, a.id FROM internship_applications a');
    expect(row.application_id).toBe(`app-${A}`);
    expect(row.application_state).toBe('active');
  });

  it('carries a null application id for an intern holding no application', async () => {
    // The console's Open control renders disabled for these rather than linking nowhere.
    respond([identityRow(A, 'No Application', null)]);

    const [row] = await getConsoleRoster({ now: NOW });

    expect(row.application_id).toBeNull();
  });

  it('scopes to one intern using the same predicate, for the detail endpoint', async () => {
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);

    await getConsoleRoster({ now: NOW, enrollmentIds: [A] });

    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('AND e.id IN (:only)');
    expect(String(sql)).toContain("cm.membership_type = 'internship'");
    expect((opts as any).replacements.only).toEqual([A]);
  });

  it('adds no scope clause when loading the whole roster', async () => {
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);

    await getConsoleRoster({ now: NOW });

    expect(String(mockQuery.mock.calls[0][0])).not.toContain(':only');
  });

  it('includes a paused intern and labels them rather than filtering them out', async () => {
    // A paused intern is exactly who a manager opens this console to find.
    respond([identityRow(A, 'Paused Person', 'paused'), identityRow(B, 'Active Person', 'active')]);

    const out = await getConsoleRoster({ now: NOW });

    expect(out).toHaveLength(2);
    expect(out.find((r) => r.name === 'Paused Person')!.application_state).toBe('paused');
  });

  it('answers an empty roster without touching any other source', async () => {
    respond([]);

    expect(await getConsoleRoster({ now: NOW })).toEqual([]);
    expect(mockRosterWeeks).not.toHaveBeenCalled();
    expect(mockSignals).not.toHaveBeenCalled();
    expect(mockProjects).not.toHaveBeenCalled();
  });
});

describe('no attendance, anywhere', () => {
  it('carries no attendance key on the row', async () => {
    // The product decision, asserted rather than trusted. A key reappearing here is how a
    // switched-off stat comes back.
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);

    const [row] = await getConsoleRoster({ now: NOW });

    const keys = JSON.stringify(row).toLowerCase();
    expect(keys).not.toContain('attend');
    expect(keys).not.toContain('meeting');
  });

  it('carries no aggregate cert score — only counts and a date', async () => {
    // Practice sittings are scored on sets of 1, 10, 15 and 60 items. A 1-item sitting scoring
    // 1000 is not a score, so "best" and "average" are not facts about anything.
    respond([identityRow(A, 'Sarbjit Kaur', 'active')], [], [
      { enrollment_id: A, sittings: 60, completed: 51, last_sitting_at: '2026-10-01T15:11:31.525Z' },
    ]);

    const [row] = await getConsoleRoster({ now: NOW });

    expect(row.cert).toEqual({
      sittings: 60, completed: 51, last_sitting_at: '2026-10-01T15:11:31.525Z', available: true,
    });
    expect(Object.keys(row.cert)).not.toContain('best');
    expect(Object.keys(row.cert)).not.toContain('average');
  });

  it('says cert prep is unavailable rather than reporting zero sittings for everyone', async () => {
    (env as any).certPrepEnabled = false;
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);

    const [row] = await getConsoleRoster({ now: NOW });

    expect(row.cert.available).toBe(false);
    expect(row.cert.sittings).toBe(0);
  });
});

describe('pace, and refusing to invent one', () => {
  it('gives no band when the cohort has no sessions at all', () => {
    // Eight of ten interns are in exactly this cohort. The class dashboard's unconditional
    // paceBandFor would call all eight green or gold off a scheduled week of 0.
    const out = paceFor(2, COHORT, new Map());

    expect(out.pace).toBeNull();
    expect(out.unavailable).toBe('cohort_has_no_sessions');
  });

  it('gives no band when the intern has no cohort', () => {
    const out = paceFor(2, null, new Map([[COHORT, 3]]));

    expect(out.pace).toBeNull();
    expect(out.unavailable).toBe('no_cohort');
  });

  it('does give a band at week 0 when the cohort HAS sessions but has delivered none', () => {
    // Genuinely different: the schedule is known and the class has not started, so an intern two
    // weeks in really is ahead.
    const out = paceFor(2, COHORT, new Map([[COHORT, 0]]));

    expect(out.pace).toEqual({ weeks_completed: 2, scheduled_week: 0, delta: 2, band: 'gold' });
    expect(out.unavailable).toBeNull();
  });

  it('uses the shared bands rather than restating them', () => {
    const at = (done: number, scheduled: number) =>
      paceFor(done, COHORT, new Map([[COHORT, scheduled]])).pace!.band;

    expect(at(5, 3)).toBe('gold');    // +2
    expect(at(4, 3)).toBe('green');   // +1
    expect(at(3, 3)).toBe('green');   //  0 — level with the class is keeping up
    expect(at(2, 3)).toBe('yellow');  // -1
    expect(at(1, 3)).toBe('red');     // -2
  });

  it('reports the pace as unavailable on the row, with the reason beside it', async () => {
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);
    mockRosterWeeks.mockResolvedValue(new Map([[A, [week(1, 10, 8), week(2, 10, 9)]]]));

    const [row] = await getConsoleRoster({ now: NOW });

    expect(row.training.pace).toBeNull();
    expect(row.training.pace_unavailable).toBe('cohort_has_no_sessions');
    expect(row.training.weeks_completed).toBe(2); // the measured fact is still reported
  });
});

describe('weeks completed, and the 1-3 gate', () => {
  it('counts only weeks that are done', () => {
    expect(weeksCompletedFrom([week(1, 10, 8), week(2, 10, 1), week(3, 10, 5)])).toBe(2);
  });

  it('does not count the unscheduled bucket as a week', () => {
    // `week: null` is cards with no week. Nobody is behind on it.
    expect(weeksCompletedFrom([week(1, 10, 8), week(null, 10, 10)])).toBe(1);
  });

  it('never counts a week with nothing published', () => {
    expect(weeksCompletedFrom([week(4, 0, 0)])).toBe(0);
  });

  it('requires all three weeks present AND done for the gate', async () => {
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);
    mockRosterWeeks.mockResolvedValue(new Map([[A, [week(1, 10, 8), week(2, 10, 8)]]]));

    const [row] = await getConsoleRoster({ now: NOW });

    // Week 3 is absent. "We have no row for week 3" is not evidence it was completed.
    expect(row.training.weeks_1_3_clear).toBe(false);
  });

  it('clears the gate when all three are done', async () => {
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);
    mockRosterWeeks.mockResolvedValue(new Map([[A, [week(1, 10, 8), week(2, 10, 8), week(3, 10, 8)]]]));

    const [row] = await getConsoleRoster({ now: NOW });

    expect(row.training.weeks_1_3_clear).toBe(true);
  });
});

describe('day of the internship', () => {
  it('calls the join day day 1, not day 0', () => {
    expect(dayOfInternship('2026-10-01T00:00:00Z', NOW)).toBe(1);
  });

  it('counts whole days from joining', () => {
    expect(dayOfInternship('2026-09-22T00:00:00Z', NOW)).toBe(10);
  });

  it('answers null when we do not know when they joined', () => {
    expect(dayOfInternship(null, NOW)).toBeNull();
  });
});

describe('projects — absent is the common case', () => {
  it('reports no project as null rather than as zero progress', async () => {
    // 8 of 10 interns have no project. Rendering 0% would say they are building something badly.
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);

    const [row] = await getConsoleRoster({ now: NOW });

    expect(row.project).toBeNull();
  });

  it('carries the task counts through for an intern who has one', async () => {
    respond([identityRow(A, 'Ali Muwwakkil', 'active')]);
    mockProjects.mockResolvedValue([{
      project_id: 'p-1', enrollment_id: A, name: 'Regional Medical', stage: 'implementation',
      tasks_total: 12, tasks_complete: 9, tasks_pct: 75, has_repo: true,
      command_center_url: 'https://example.github.io/cc',
    }]);

    const [row] = await getConsoleRoster({ now: NOW });

    expect(row.project).toEqual({
      project_id: 'p-1', name: 'Regional Medical', stage: 'implementation',
      tasks_total: 12, tasks_complete: 9, tasks_pct: 75, has_repo: true,
      command_center_url: 'https://example.github.io/cc',
    });
  });

  it('does not give one intern another intern\'s project', async () => {
    respond([identityRow(A, 'Ali Muwwakkil', 'active'), identityRow(B, 'Sarbjit Kaur', 'active')]);
    mockProjects.mockResolvedValue([
      { project_id: 'p-1', enrollment_id: A, name: 'Ali project', stage: 'implementation', tasks_total: 1, tasks_complete: 1, tasks_pct: 100, has_repo: false, command_center_url: null },
    ]);

    const out = await getConsoleRoster({ now: NOW });

    expect(out.find((r) => r.enrollment_id === A)!.project!.name).toBe('Ali project');
    expect(out.find((r) => r.enrollment_id === B)!.project).toBeNull();
  });
});

describe('one query per source, and fail-soft', () => {
  it('asks each source once for a roster of two', async () => {
    respond([identityRow(A, 'One', 'active'), identityRow(B, 'Two', 'active')]);

    await getConsoleRoster({ now: NOW });

    expect(mockQuery).toHaveBeenCalledTimes(3);      // identity, sessions, cert
    expect(mockRosterWeeks).toHaveBeenCalledTimes(1);
    expect(mockSignals).toHaveBeenCalledTimes(1);
    expect(mockProjects).toHaveBeenCalledTimes(1);
  });

  it('passes the whole roster to each batch loader, not one id at a time', async () => {
    respond([identityRow(A, 'One', 'active'), identityRow(B, 'Two', 'active')]);

    await getConsoleRoster({ now: NOW });

    expect(mockRosterWeeks.mock.calls[0][0]).toEqual([A, B]);
    expect(mockSignals.mock.calls[0][0]).toEqual([A, B]);
  });

  it('still renders the roster when training, cert, activity and projects all fail', async () => {
    // One regressed query must not blank the console for everyone. The row degrades to the facts
    // identity alone can prove.
    respond([identityRow(A, 'Sarbjit Kaur', 'active')]);
    mockRosterWeeks.mockRejectedValue(new Error('training down'));
    mockSignals.mockRejectedValue(new Error('activity down'));
    mockProjects.mockRejectedValue(new Error('projects down'));

    const [row] = await getConsoleRoster({ now: NOW });

    expect(row.name).toBe('Sarbjit Kaur');
    expect(row.training.weeks).toEqual([]);
    expect(row.activity.level).toBe('unknown');
    expect(row.project).toBeNull();
  });

  it('reports an intern the activity loader did not answer for as never, not as missing', async () => {
    respond([identityRow(A, 'One', 'active'), identityRow(B, 'Two', 'active')]);
    mockSignals.mockResolvedValue(new Map([[A, signal(1, 'yellow')]]));

    const out = await getConsoleRoster({ now: NOW });

    expect(out).toHaveLength(2);
    expect(out.find((r) => r.enrollment_id === B)!.activity.level).toBe('unknown');
    expect(out.find((r) => r.enrollment_id === B)!.activity.days_since).toBeNull();
  });
});

describe('the KPI row', () => {
  const rosterRow = (over: Partial<ConsoleRosterRow> = {}): ConsoleRosterRow => ({
    enrollment_id: 'enr-x', name: 'Someone', email: null, application_state: 'active',
    joined_at: '2026-09-22T00:00:00.000Z', day: 10,
    cohort: { id: COHORT, name: 'Cohort', type: 'accelerator' },
    activity: signal(1, 'yellow') as any,
    training: { weeks: [], weeks_completed: 0, weeks_1_3_clear: false, pace: null, pace_unavailable: 'cohort_has_no_sessions' },
    cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
    project: null,
    ...over,
  });

  it('counts a never-active intern as never, and NOT as quiet or dark', () => {
    // The distinction the sixth activity band exists for. Folding "never started" into "gone dark
    // 10+ days" loses the one group that is always worth acting on.
    const counts = consoleCounts([
      rosterRow({ activity: signal(null, 'unknown') as any }),
      rosterRow({ activity: signal(12, 'black') as any }),
      rosterRow({ activity: signal(5, 'orange') as any }),
    ]);

    expect(counts.never_active).toBe(1);
    expect(counts.dark_10_plus).toBe(1);   // only the 12-day one
    expect(counts.quiet_4_plus).toBe(2);   // the 12-day and the 5-day, never the null
  });

  it('counts at the boundaries, inclusively', () => {
    const counts = consoleCounts([
      rosterRow({ activity: signal(3, 'yellow') as any }),
      rosterRow({ activity: signal(4, 'orange') as any }),
      rosterRow({ activity: signal(9, 'red') as any }),
      rosterRow({ activity: signal(10, 'black') as any }),
    ]);

    expect(counts.quiet_4_plus).toBe(3);   // 4, 9, 10
    expect(counts.dark_10_plus).toBe(1);   // 10
  });

  it('counts the gate, projects, pauses and unpaceable rows', () => {
    const counts = consoleCounts([
      rosterRow({ training: { weeks: [], weeks_completed: 3, weeks_1_3_clear: true, pace: { weeks_completed: 3, scheduled_week: 3, delta: 0, band: 'green' }, pace_unavailable: null } }),
      rosterRow({ application_state: 'paused' }),
      rosterRow({ project: { project_id: 'p', name: 'x', stage: 'implementation', tasks_total: 1, tasks_complete: 1, tasks_pct: 100, has_repo: false, command_center_url: null } }),
    ]);

    expect(counts).toMatchObject({
      interns: 3, weeks_1_3_clear: 1, no_project: 2, paused: 1, pace_unavailable: 2,
    });
  });

  it('does not count a cert sitting when cert prep is switched off', () => {
    // Zero sittings because the feature is off is not the same fact as zero sittings because
    // nobody has sat one.
    const counts = consoleCounts([
      rosterRow({ cert: { sittings: 4, completed: 2, last_sitting_at: null, available: false } }),
      rosterRow({ cert: { sittings: 4, completed: 2, last_sitting_at: null, available: true } }),
    ]);

    expect(counts.cert_started).toBe(1);
  });

  it('is all counts and no rates', () => {
    // The averages the design asked for were attendance and cert score. Neither is a fact.
    const counts = consoleCounts([rosterRow()]);

    for (const key of Object.keys(counts)) {
      expect(key).not.toMatch(/pct|percent|avg|average|rate/);
    }
  });
});
