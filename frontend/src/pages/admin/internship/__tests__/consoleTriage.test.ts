/**
 * View B's lanes and distributions.
 *
 * Lane membership is a pure function of the activity band, so it is tested at every band rather than
 * through a rendered board. Two properties matter more than the individual cases:
 *
 *   - **every band belongs to exactly one lane.** A band that belongs to none has its interns vanish
 *     from the board entirely, and nothing on screen would say so.
 *   - **"no activity yet" stays its own lane.** Merging it into "at risk" loses the group that is
 *     always worth acting on, and the merge is the obvious tidy-up someone will try.
 */
import {
  LANES, LEVEL_ORDER, laneOf, laneRows, levelCounts, share,
  gateDistribution, certDistribution, projectDistribution,
} from '../consoleFormat';
import { InternRow, ActivityLevel, WeekRow } from '../../../../services/adminInternConsoleApi';

const week = (w: number, published: number, completed: number): WeekRow => ({
  week: w,
  publishedCardCount: published,
  completed,
  completedPct: published ? Math.round((completed / published) * 1000) / 10 : 0,
  weekDone: published > 0 && completed / published >= 0.3,
});

const row = (over: Partial<InternRow> = {}): InternRow => ({
  enrollment_id: `enr-${Math.random()}`,
  name: 'Someone',
  email: null,
  application_state: 'active',
  application_id: 'app-1',
  joined_at: '2026-09-22T00:00:00.000Z',
  day: 10,
  cohort: { id: 'c-1', name: 'Explorer', type: 'explorer' },
  activity: {
    last_activity_at: null, last_activity_source: null, days_since: 1,
    level: 'yellow', days: [], graced: false,
  },
  training: { weeks: [], weeks_completed: 0, weeks_1_3_clear: false, pace: null, pace_unavailable: 'cohort_has_no_sessions' },
  cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
  project: null,
  ...over,
});

const at = (level: ActivityLevel) => row({ activity: { ...row().activity, level } });

const project = (stage: string) => ({
  project_id: `p-${stage}`, name: `${stage} project`, stage,
  tasks_total: 10, tasks_complete: 5, tasks_pct: 50, has_repo: false, command_center_url: null,
});

describe('the lanes', () => {
  it('places every band in exactly one lane', () => {
    // The property that matters. A band in no lane means those interns are absent from the board
    // with nothing saying so; a band in two means they are counted twice.
    for (const level of LEVEL_ORDER) {
      const owning = LANES.filter((l) => l.levels.includes(level));
      expect(owning).toHaveLength(1);
    }
  });

  it.each(LEVEL_ORDER)('puts %s in its documented lane', (level) => {
    const expected: Record<ActivityLevel, string> = {
      green: 'green', yellow: 'yellow', orange: 'orange',
      red: 'red', black: 'red', unknown: 'unknown',
    };
    expect(laneOf(level)!.key).toBe(expected[level]);
  });

  it('merges red and black into one at-risk lane, and says 7+ days', () => {
    const lane = LANES.find((l) => l.key === 'red')!;

    expect(lane.levels).toEqual(['red', 'black']);
    expect(lane.title).toContain('7+');
  });

  it('keeps "no activity yet" out of the at-risk lane', () => {
    // Never started is not the far end of the stopped ramp.
    expect(laneOf('unknown')!.key).toBe('unknown');
    expect(LANES.find((l) => l.key === 'red')!.levels).not.toContain('unknown');
  });

  it('answers null for a band no lane claims, rather than guessing', () => {
    expect(laneOf('turquoise' as ActivityLevel)).toBeNull();
  });

  it('selects the rows for a lane, including both of a merged lane\'s bands', () => {
    const rows = [at('red'), at('black'), at('green')];

    expect(laneRows(rows, LANES.find((l) => l.key === 'red')!)).toHaveLength(2);
    expect(laneRows(rows, LANES.find((l) => l.key === 'green')!)).toHaveLength(1);
  });

  it('returns an empty list for an empty lane rather than throwing', () => {
    expect(laneRows([at('green')], LANES.find((l) => l.key === 'unknown')!)).toEqual([]);
  });
});

describe('counting the bands', () => {
  it('reports every band, including the ones with nobody in them', () => {
    // A legend missing its zeros stops being a scale.
    const counts = levelCounts([at('green'), at('green'), at('unknown')]);

    expect(Object.keys(counts)).toEqual([...LEVEL_ORDER]);
    expect(counts).toMatchObject({ green: 2, yellow: 0, orange: 0, red: 0, black: 0, unknown: 1 });
  });

  it('counts nothing as all zeros', () => {
    expect(Object.values(levelCounts([]))).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('share', () => {
  it('is 0 rather than NaN when there is nobody', () => {
    // NaN as a CSS width renders as a FULL bar, so an empty roster would draw every bar at 100%.
    expect(share(0, 0)).toBe(0);
  });

  it('is a percentage of the whole', () => {
    expect(share(1, 4)).toBe(25);
    expect(share(1, 3)).toBe(33.3);
  });
});

describe('the training distribution', () => {
  it('always shows all four gate steps', () => {
    const rows = gateDistribution([row({ training: { ...row().training, weeks: [week(1, 10, 8)] } })]);

    expect(rows.map((r) => r.label)).toEqual(['Wk 1-3: 0/3', 'Wk 1-3: 1/3', 'Wk 1-3: 2/3', 'Wk 1-3: 3/3']);
  });

  it('counts each intern once, by how many gate weeks they cleared', () => {
    const none = row();
    const one = row({ training: { ...row().training, weeks: [week(1, 10, 8)] } });
    const all = row({ training: { ...row().training, weeks: [week(1, 10, 8), week(2, 10, 8), week(3, 10, 8)] } });

    const dist = gateDistribution([none, one, all]);

    expect(dist.map((d) => d.count)).toEqual([1, 1, 0, 1]);
  });
});

describe('the certification distribution', () => {
  it('counts what the roster knows, and never a readiness estimate', () => {
    const dist = certDistribution([
      row(),                                                                                   // not started
      row({ cert: { sittings: 5, completed: 0, last_sitting_at: null, available: true } }),      // sat, none scored
      row({ cert: { sittings: 5, completed: 3, last_sitting_at: null, available: true } }),      // has scored
      row({ cert: { sittings: 0, completed: 0, last_sitting_at: null, available: false } }),     // feature off
    ]);

    expect(dist.map((d) => [d.label, d.count])).toEqual([
      ['Not started', 1], ['Sat, none scored', 1], ['Has scored sittings', 1], ['Cert prep off', 1],
    ]);
    // None of the readiness states may appear here — they are an estimate, not a count of rows.
    for (const d of dist) expect(d.label).not.toMatch(/building|approaching|sustained|not_measured/);
  });

  it('does not count a feature-off intern as "not started"', () => {
    const dist = certDistribution([row({ cert: { sittings: 0, completed: 0, last_sitting_at: null, available: false } })]);

    expect(dist.find((d) => d.label === 'Not started')!.count).toBe(0);
    expect(dist.find((d) => d.label === 'Cert prep off')!.count).toBe(1);
  });
});

describe('the project distribution', () => {
  const STAGES = ['discovery', 'architecture', 'implementation', 'portfolio', 'complete'];

  it('leads with "No project", because that is the biggest group', () => {
    const dist = projectDistribution([row(), row(), row({ project: project('discovery') })], STAGES);

    expect(dist[0]).toMatchObject({ label: 'No project', count: 2 });
  });

  it('uses the server\'s stage list, in the server\'s order', () => {
    // Never a list of its own: a client-side copy loses a column the day a stage is added.
    const dist = projectDistribution([], STAGES);

    expect(dist.slice(1).map((d) => d.label)).toEqual(STAGES);
  });

  it('shows a stage the server did not list rather than dropping its projects', () => {
    // A project in an unknown stage must become a visible oddity, not disappear from the board.
    const dist = projectDistribution([row({ project: project('mothballed') })], STAGES);

    const odd = dist.find((d) => d.label.includes('mothballed'));
    expect(odd).toBeDefined();
    expect(odd!.count).toBe(1);
    expect(odd!.label).toContain('unlisted stage');
  });

  it('keeps every intern accounted for exactly once', () => {
    const rows = [row(), row({ project: project('discovery') }), row({ project: project('mothballed') })];

    const dist = projectDistribution(rows, STAGES);

    expect(dist.reduce((n, d) => n + d.count, 0)).toBe(rows.length);
  });
});
