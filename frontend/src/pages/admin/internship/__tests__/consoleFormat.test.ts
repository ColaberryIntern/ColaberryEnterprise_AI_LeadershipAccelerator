/**
 * The Intern Console's presentation rules.
 *
 * All three views share these, which is the point — the Command Center, the Triage Board and the
 * Activity Timeline must not describe the same intern differently. Two of the rules below exist
 * because the finalised design got them wrong in a way that only shows up against real data:
 *
 *   - a never-active intern rendered through a numeric formatter reads as "0d", i.e. as the
 *     healthiest person on the board;
 *   - the design's "needs attention" filter compared `pace <= -2` with no null check, and 8 of the
 *     10 real interns have no pace at all because their cohort has no sessions.
 */
import {
  ago, paceLabel, certLabel, needsAttention, matchesFilter, byNeediest,
  stripCells, gateCleared, LEVEL_ORDER, LEVEL_LABEL, STRIP_WEEKS,
} from '../consoleFormat';
import { InternRow, WeekRow } from '../../../../services/adminInternConsoleApi';

const week = (w: number | null, published: number, completed: number): WeekRow => ({
  week: w,
  publishedCardCount: published,
  completed,
  completedPct: published ? Math.round((completed / published) * 1000) / 10 : 0,
  weekDone: published > 0 && completed / published >= 0.3,
});

const row = (over: Partial<InternRow> = {}): InternRow => ({
  enrollment_id: 'enr-1',
  name: 'Sarbjit Kaur',
  email: null,
  application_state: 'active',
  application_id: 'app-1',
  joined_at: '2026-09-22T00:00:00.000Z',
  day: 10,
  cohort: { id: 'c-1', name: 'Explorer', type: 'explorer' },
  activity: {
    last_activity_at: '2026-09-30T00:00:00.000Z', last_activity_source: 'xp_events',
    days_since: 1, level: 'yellow', days: [], graced: false,
  },
  training: { weeks: [], weeks_completed: 0, weeks_1_3_clear: false, pace: null, pace_unavailable: 'cohort_has_no_sessions' },
  cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
  project: null,
  ...over,
});

const paced = (delta: number, band: 'gold' | 'green' | 'yellow' | 'red') =>
  ({ pace: { weeks_completed: 3 + delta, scheduled_week: 3, delta, band }, pace_unavailable: null });

describe('how long since they were seen', () => {
  it('calls a never-active intern "never", NOT "0d"', () => {
    // The single most important line in the formatter. "0d" would put someone who has done nothing
    // at the healthy end of the scale, which is the exact opposite of the truth.
    expect(ago(null)).toBe('never');
  });

  it('reads today and yesterday in words', () => {
    expect(ago(0)).toBe('today');
    expect(ago(1)).toBe('yesterday');
  });

  it('counts days after that', () => {
    expect(ago(4)).toBe('4d ago');
    expect(ago(200)).toBe('200d ago');
  });
});

describe('the six bands', () => {
  it('degrades in a fixed order with unknown last', () => {
    expect(LEVEL_ORDER).toEqual(['green', 'yellow', 'orange', 'red', 'black', 'unknown']);
  });

  it('labels unknown as never active rather than as a long gap', () => {
    // If this label ever reads "10+ days" or similar, the two facts have been merged.
    expect(LEVEL_LABEL.unknown).toBe('Never active');
    expect(LEVEL_LABEL.black).toBe('10+ days');
  });
});

describe('pace, and the refusal to show one', () => {
  it('says the cohort has no schedule instead of showing a band', () => {
    // 8 of 10 real interns. A green "On pace" here would be invented.
    expect(paceLabel(row())).toEqual({ text: 'No cohort schedule', band: null });
  });

  it('distinguishes having no cohort at all', () => {
    const out = paceLabel(row({ training: { ...row().training, pace_unavailable: 'no_cohort' } }));

    expect(out).toEqual({ text: 'No cohort', band: null });
  });

  it('reads each delta in words, with the band attached', () => {
    const at = (d: number, b: 'gold' | 'green' | 'yellow' | 'red') =>
      paceLabel(row({ training: { ...row().training, ...paced(d, b) } }));

    expect(at(3, 'gold')).toEqual({ text: '3 wks ahead', band: 'gold' });
    expect(at(1, 'green')).toEqual({ text: '1 wk ahead', band: 'green' });
    expect(at(0, 'green')).toEqual({ text: 'On pace', band: 'green' });
    expect(at(-1, 'yellow')).toEqual({ text: '1 wk behind', band: 'yellow' });
    expect(at(-3, 'red')).toEqual({ text: '3 wks behind', band: 'red' });
  });
});

describe('the cert cell: three states that must not collapse', () => {
  it('says cert prep is off when the feature is off', () => {
    expect(certLabel(row({ cert: { sittings: 0, completed: 0, last_sitting_at: null, available: false } })))
      .toEqual({ text: 'Cert prep off', muted: true });
  });

  it('says not started when the feature is on and they have sat none', () => {
    // Different from the above: "off" is about us, "not started" is about them.
    expect(certLabel(row())).toEqual({ text: 'Not started', muted: true });
  });

  it('counts sittings, and never reports a score', () => {
    const out = certLabel(row({ cert: { sittings: 60, completed: 51, last_sitting_at: null, available: true } }));

    expect(out.text).toBe('60 sittings · 51 scored');
    expect(out.text).not.toMatch(/\d{3,4}$/);   // no scaled score smuggled in
  });

  it('says sitting, singular, for one', () => {
    expect(certLabel(row({ cert: { sittings: 1, completed: 1, last_sitting_at: null, available: true } })).text)
      .toBe('1 sitting');
  });
});

describe('needs attention', () => {
  it('flags the stale bands and never-active', () => {
    for (const level of ['orange', 'red', 'black', 'unknown'] as const) {
      expect(needsAttention(row({ activity: { ...row().activity, level } }))).toBe(true);
    }
  });

  it('does not flag someone active today or this week', () => {
    for (const level of ['green', 'yellow'] as const) {
      expect(needsAttention(row({ activity: { ...row().activity, level } }))).toBe(false);
    }
  });

  it('flags 2+ weeks behind when there IS a pace', () => {
    expect(needsAttention(row({ training: { ...row().training, ...paced(-2, 'red') } }))).toBe(true);
  });

  it('does NOT flag an intern merely because their pace cannot be measured', () => {
    // The trap. `null <= -2` is false in JavaScript only by luck, and 8 of 10 interns have a null
    // pace — flagging all of them would make this filter useless on its first day.
    const r = row({ activity: { ...row().activity, level: 'green' } });

    expect(r.training.pace).toBeNull();
    expect(needsAttention(r)).toBe(false);
  });
});

describe('the filters', () => {
  it('shows everyone under all', () => {
    expect(matchesFilter(row({ activity: { ...row().activity, level: 'green' } }), 'all')).toBe(true);
  });

  it('selects interns with no project', () => {
    expect(matchesFilter(row(), 'noproj')).toBe(true);
    expect(matchesFilter(row({ project: { project_id: 'p', name: 'x', stage: 'implementation', tasks_total: 1, tasks_complete: 0, tasks_pct: 0, has_repo: false, command_center_url: null } }), 'noproj')).toBe(false);
  });

  it('selects paused interns by their application state', () => {
    expect(matchesFilter(row({ application_state: 'paused' }), 'paused')).toBe(true);
    expect(matchesFilter(row({ application_state: 'active' }), 'paused')).toBe(false);
  });
});

describe('sorting the neediest first', () => {
  it('puts a never-active intern above the longest silence', () => {
    // They have no elapsed time, so any numeric fallback either buries them (0) or lies (999).
    const never = row({ enrollment_id: 'never', activity: { ...row().activity, days_since: null, level: 'unknown' } });
    const long = row({ enrollment_id: 'long', activity: { ...row().activity, days_since: 200, level: 'black' } });
    const fresh = row({ enrollment_id: 'fresh', activity: { ...row().activity, days_since: 0, level: 'green' } });

    expect([fresh, long, never].sort(byNeediest).map((r) => r.enrollment_id))
      .toEqual(['never', 'long', 'fresh']);
  });
});

describe('the week strip', () => {
  it('always draws weeks 0 to 10', () => {
    expect(stripCells(row()).map((c) => c.week)).toEqual([...STRIP_WEEKS]);
    expect(stripCells(row())).toHaveLength(11);
  });

  it('marks weeks 1 to 3 as the gate, and nothing else', () => {
    const gated = stripCells(row()).filter((c) => c.gate).map((c) => c.week);

    expect(gated).toEqual([1, 2, 3]);
  });

  it('distinguishes an unpublished week from one the intern has not done', () => {
    // Drawn as an empty bar they look identical, and they are completely different facts about the
    // intern: one is the curriculum's state, the other is theirs.
    const cells = stripCells(row({
      training: { ...row().training, weeks: [week(1, 0, 0), week(2, 10, 0), week(3, 10, 8)] },
    }));

    expect(cells.find((c) => c.week === 1)).toMatchObject({ unpublished: true, done: false });
    expect(cells.find((c) => c.week === 2)).toMatchObject({ unpublished: false, done: false });
    expect(cells.find((c) => c.week === 3)).toMatchObject({ unpublished: false, done: true });
  });

  it('treats a week with no row at all as unpublished', () => {
    expect(stripCells(row()).every((c) => c.unpublished)).toBe(true);
  });

  it('ignores the unscheduled bucket rather than drawing it as a week', () => {
    const cells = stripCells(row({ training: { ...row().training, weeks: [week(null, 5, 5)] } }));

    expect(cells).toHaveLength(11);
    expect(cells.every((c) => c.unpublished)).toBe(true);
  });
});

describe('the weeks 1-3 gate count', () => {
  it('counts only the gate weeks that are done', () => {
    expect(gateCleared(row({ training: { ...row().training, weeks: [week(1, 10, 8), week(2, 10, 1), week(3, 10, 8)] } }))).toBe(2);
  });

  it('counts a missing gate week as not cleared', () => {
    expect(gateCleared(row({ training: { ...row().training, weeks: [week(1, 10, 8), week(2, 10, 8)] } }))).toBe(2);
  });

  it('does not count week 4 towards the gate', () => {
    expect(gateCleared(row({ training: { ...row().training, weeks: [week(4, 10, 10)] } }))).toBe(0);
  });
});
