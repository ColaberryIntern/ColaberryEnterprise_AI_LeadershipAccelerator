import {
  InternRow, ActivityLevel, ActivityDay, PaceBand, ActivityCategory,
} from '../../../services/adminInternConsoleApi';

/**
 * The four tracks in render order, plus `other`.
 *
 * Defined here rather than beside the API types on purpose: a component importing a runtime constant
 * from the API client gets `undefined` in every test that mocks the client, and throws on first
 * render. `consoleFormat` is not mocked by any component test, so these survive.
 *
 * The order is fixed rather than alphabetical because it breaks ties in `dominantTrack`, and a tie
 * that resolved differently between renders would change a day's colour for no reason.
 */
export const TRACK_ORDER: readonly ActivityCategory[] = ['training', 'project', 'certification', 'community', 'other'];

export const TRACK_LABEL: Record<ActivityCategory, string> = {
  training: 'Training',
  project: 'Project work',
  certification: 'Certification',
  community: 'Community',
  other: 'Other',
};

/**
 * The Intern Console's presentation rules, kept pure so they can be tested as facts rather than
 * through a rendered tree. All three views share them, which is the point: the Command Center, the
 * Triage Board and the Activity Timeline must not label the same intern differently.
 */

/** The order the bands degrade in. Used for lanes, segments and sorting. */
export const LEVEL_ORDER: readonly ActivityLevel[] = ['green', 'yellow', 'orange', 'red', 'black', 'unknown'];

export const LEVEL_LABEL: Record<ActivityLevel, string> = {
  green: 'Active today',
  yellow: 'Within 3 days',
  orange: '4-6 days',
  red: '7-9 days',
  black: '10+ days',
  unknown: 'Never active',
};

/**
 * How long since they were last seen, in words.
 *
 * **"never" is not "0d".** A never-active intern has no elapsed time to report, and rendering 0
 * would put them at the healthy end of the scale — the exact opposite of the truth. This is the
 * single most important line in this file.
 */
export function ago(daysSince: number | null): string {
  if (daysSince === null) return 'never';
  if (daysSince === 0) return 'today';
  if (daysSince === 1) return 'yesterday';
  return `${daysSince}d ago`;
}

/** The pace badge, or an explicit refusal when there is nothing to pace against. */
export function paceLabel(row: InternRow): { text: string; band: PaceBand | null } {
  const { pace, pace_unavailable: why } = row.training;
  if (!pace) {
    return {
      text: why === 'no_cohort' ? 'No cohort' : 'No cohort schedule',
      band: null,
    };
  }
  const d = pace.delta;
  if (d >= 2) return { text: `${d} wks ahead`, band: pace.band };
  if (d === 1) return { text: '1 wk ahead', band: pace.band };
  if (d === 0) return { text: 'On pace', band: pace.band };
  if (d === -1) return { text: '1 wk behind', band: pace.band };
  return { text: `${-d} wks behind`, band: pace.band };
}

/**
 * The cert cell. Counts and a date, never an aggregate score.
 *
 * Three distinct states that must not collapse into each other: the feature is off, the intern has
 * never sat one, and the intern has sat some. "0 sittings" would say the second about the first.
 */
export function certLabel(row: InternRow): { text: string; muted: boolean } {
  if (!row.cert.available) return { text: 'Cert prep off', muted: true };
  if (row.cert.sittings === 0) return { text: 'Not started', muted: true };
  const done = row.cert.completed;
  return {
    text: `${row.cert.sittings} ${row.cert.sittings === 1 ? 'sitting' : 'sittings'}`
      + (done !== row.cert.sittings ? ` · ${done} scored` : ''),
    muted: false,
  };
}

export type RosterFilter = 'all' | 'attention' | 'noproj' | 'paused';

export const FILTERS: ReadonlyArray<{ key: RosterFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'noproj', label: 'No project' },
  { key: 'paused', label: 'Paused' },
];

/**
 * Does this intern need attention?
 *
 * Two clauses, and one trap inside the second. The design's version was
 * `level in [orange,red,black,unknown] || pace <= -2`, which in JavaScript treats a missing pace as
 * `undefined <= -2` — false — only by luck. Here `pace` is explicitly `null` for the majority of
 * interns (their cohort has no sessions), so the comparison is guarded: **not being paceable is not
 * evidence of being behind.** Flagging eight interns as needing attention because we cannot measure
 * their cohort would make the filter useless on day one.
 */
export function needsAttention(row: InternRow): boolean {
  const byActivity = ['orange', 'red', 'black', 'unknown'].includes(row.activity.level);
  const byPace = row.training.pace !== null && row.training.pace.delta <= -2;
  return byActivity || byPace;
}

export function matchesFilter(row: InternRow, filter: RosterFilter): boolean {
  switch (filter) {
    case 'attention': return needsAttention(row);
    case 'noproj': return row.project === null;
    case 'paused': return row.application_state === 'paused';
    default: return true;
  }
}

/**
 * Sort the roster so the people who need looking at are first.
 *
 * Never-active sorts to the very top rather than the bottom. They have no `days_since`, and any
 * numeric fallback either buries them (0) or is a lie about how long it has been (999). So they are
 * handled as their own case ahead of the comparison.
 */
export function byNeediest(a: InternRow, b: InternRow): number {
  const rank = (r: InternRow) => (r.activity.days_since === null ? Infinity : r.activity.days_since);
  return rank(b) - rank(a);
}

/** Weeks 0-10, the span the design's strip covers. */
export const STRIP_WEEKS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface StripCell {
  week: number;
  pct: number;
  done: boolean;
  /** Part of the weeks 1-3 project gate, which the design outlines. */
  gate: boolean;
  /** No published cards for this week yet — drawn as absent, not as 0% completed. */
  unpublished: boolean;
}

/**
 * The week strip, one cell per week 0-10.
 *
 * A week with nothing published is marked `unpublished` rather than given 0%: "the curriculum has
 * not shipped this week yet" and "this intern has done none of it" look identical as an empty bar
 * and are completely different facts about the intern.
 */
export function stripCells(row: InternRow): StripCell[] {
  const byWeek = new Map(row.training.weeks.filter((w) => w.week !== null).map((w) => [w.week as number, w]));
  return STRIP_WEEKS.map((week) => {
    const w = byWeek.get(week);
    return {
      week,
      pct: w ? w.completedPct : 0,
      done: !!w && w.weekDone,
      gate: week >= 1 && week <= 3,
      unpublished: !w || w.publishedCardCount === 0,
    };
  });
}

/** How many of the three gate weeks are cleared. */
export function gateCleared(row: InternRow): number {
  return [1, 2, 3].filter((week) => row.training.weeks.some((w) => w.week === week && w.weekDone)).length;
}

/* ── View B: lanes and distributions ──────────────────────────────────────────
 *
 * Lane membership is a pure function of the activity band, and nothing else. The design's own lane
 * list merges `red` and `black` into one "at risk" column, which is a presentation choice rather
 * than a change to the bands — so the merge lives here, once, instead of being re-derived per view.
 */

export interface Lane {
  key: string;
  title: string;
  /** The bands this lane holds. Every band belongs to exactly one lane — asserted by a test. */
  levels: readonly ActivityLevel[];
}

export const LANES: readonly Lane[] = [
  { key: 'green', title: 'Active today', levels: ['green'] },
  { key: 'yellow', title: 'Recent · 1-3 days', levels: ['yellow'] },
  { key: 'orange', title: 'Slipping · 4-6 days', levels: ['orange'] },
  { key: 'red', title: 'At risk · 7+ days', levels: ['red', 'black'] },
  // Kept separate from "at risk" on purpose: never having started is a different conversation from
  // having stopped, and it is the group most often lost by folding the two together.
  { key: 'unknown', title: 'No activity yet', levels: ['unknown'] },
];

/** Which lane a band belongs to, or null if some future band belongs to none. */
export function laneOf(level: ActivityLevel): Lane | null {
  return LANES.find((l) => l.levels.includes(level)) ?? null;
}

export function laneRows(rows: readonly InternRow[], lane: Lane): InternRow[] {
  return rows.filter((r) => lane.levels.includes(r.activity.level));
}

/** How many interns sit in each band. Zeros included, so the legend is a full scale. */
export function levelCounts(rows: readonly InternRow[]): Record<ActivityLevel, number> {
  const out = Object.fromEntries(LEVEL_ORDER.map((l) => [l, 0])) as Record<ActivityLevel, number>;
  for (const r of rows) out[r.activity.level] += 1;
  return out;
}

export interface DistRow {
  label: string;
  count: number;
  /** Share of the roster, for the bar. 0 when there is nobody, never NaN. */
  pct: number;
}

/** n/total as a percentage, 0 when total is 0 — a bar width of NaN renders as a full bar. */
export function share(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

/** How far through the weeks 1-3 gate the roster is: 0/3 through 3/3. */
export function gateDistribution(rows: readonly InternRow[]): DistRow[] {
  return [0, 1, 2, 3].map((n) => {
    const count = rows.filter((r) => gateCleared(r) === n).length;
    return { label: `Wk 1-3: ${n}/3`, count, pct: share(count, rows.length) };
  });
}

/**
 * Certification, by what the roster actually knows.
 *
 * The design distributed interns across the readiness states (not_measured / building / approaching
 * / sustained). Those come from the readiness snapshot, which the roster deliberately does not load
 * — and they are an estimate, not a count. These three buckets are counts of rows: has the feature,
 * has sat something, has a scored sitting.
 */
export function certDistribution(rows: readonly InternRow[]): DistRow[] {
  const buckets: Array<[string, (r: InternRow) => boolean]> = [
    ['Not started', (r) => r.cert.available && r.cert.sittings === 0],
    ['Sat, none scored', (r) => r.cert.available && r.cert.sittings > 0 && r.cert.completed === 0],
    ['Has scored sittings', (r) => r.cert.available && r.cert.completed > 0],
    ['Cert prep off', (r) => !r.cert.available],
  ];
  return buckets.map(([label, test]) => {
    const count = rows.filter(test).length;
    return { label, count, pct: share(count, rows.length) };
  });
}

/**
 * Projects, by stage, with "No project" first because it is the largest group.
 *
 * `stages` comes from the server's own `PROJECT_STAGES`; this function never invents the list. A
 * project whose stage is not in the list still appears, under its own label, rather than vanishing.
 */
export function projectDistribution(rows: readonly InternRow[], stages: readonly string[]): DistRow[] {
  const none = rows.filter((r) => r.project === null).length;
  const known = stages.map((stage) => {
    const count = rows.filter((r) => r.project?.stage === stage).length;
    return { label: stage, count, pct: share(count, rows.length) };
  });
  const unlisted = [...new Set(rows
    .map((r) => r.project?.stage)
    .filter((s): s is string => !!s && !stages.includes(s)))]
    .map((stage) => {
      const count = rows.filter((r) => r.project?.stage === stage).length;
      return { label: `${stage} (unlisted stage)`, count, pct: share(count, rows.length) };
    });
  return [{ label: 'No project', count: none, pct: share(none, rows.length) }, ...known, ...unlisted];
}

/* ── View C: the 28-day heatmap ───────────────────────────────────────────────── */

/** The heatmap window, matching the backend's own 28. */
export const WINDOW_DAYS = 28;

/** Five steps, matching the design's thresholds. Step 0 is "nothing that day", not "no data". */
export const HEAT_STEPS = 5;

/**
 * Which heat step a day's event count falls in.
 *
 * Thresholds are the design's: 0, 1, 2-3, 4-5, 6+. Returned as a step index rather than a colour so
 * the scale lives in CSS tokens and this stays testable without a DOM.
 */
export function heatStep(events: number): number {
  if (events <= 0) return 0;
  if (events < 2) return 1;
  if (events < 4) return 2;
  if (events < 6) return 3;
  return 4;
}

/**
 * Column labels for the 28-day grid: the date on Mondays, blank otherwise.
 *
 * Derived from each day's own `date` string rather than counted back from today, so a grid that
 * arrives short or shifted is labelled by what it actually contains instead of by what it should
 * have contained. Parsed as UTC noon — a bare `YYYY-MM-DD` is midnight UTC, which in a negative
 * timezone lands on the previous local day and shifts every label by one.
 */
export function heatColumnLabels(days: readonly ActivityDay[]): string[] {
  return days.map((d) => {
    const at = new Date(`${d.date}T12:00:00Z`);
    if (Number.isNaN(at.getTime())) return '';
    return at.getUTCDay() === 1 ? `${at.getUTCMonth() + 1}/${at.getUTCDate()}` : '';
  });
}

/**
 * The 28 cells for one intern, padded when the payload is short.
 *
 * The backend always sends 28, and this does not trust that: a short array would otherwise draw a
 * ragged grid where each row's columns mean different dates, which is worse than a visible blank.
 */
/** A padding cell: a real `ActivityDay` with every track at zero, so no reader meets `undefined`. */
const EMPTY_DAY = (): ActivityDay => ({
  date: '',
  events: 0,
  by_category: { training: 0, project: 0, certification: 0, community: 0, other: 0 },
});

export function heatRow(row: InternRow): ActivityDay[] {
  const days = row.activity.days ?? [];
  if (days.length >= WINDOW_DAYS) return days.slice(0, WINDOW_DAYS);
  return [...days, ...Array.from({ length: WINDOW_DAYS - days.length }, EMPTY_DAY)];
}

/**
 * A readable name for a curriculum bucket.
 *
 * Falls back to the raw key rather than to a blank: a bucket nobody has named yet must show up as an
 * ugly label somebody fixes, not as an empty segment nobody notices.
 */
export function BUCKET_LABEL(bucket: string): string {
  const named: Record<string, string> = {
    pre_class: 'Pre-class',
    learn: 'Learn',
    practice: 'Practice',
    build: 'Build',
    reflect: 'Reflect',
    share: 'Share',
    advance: 'Advance',
    unsorted: 'Unsorted',
  };
  return named[bucket] ?? bucket;
}

/* ── The four tracks ──────────────────────────────────────────────────────────── */

/**
 * Which track dominated a day, for a single-colour cell.
 *
 * Ties break by `TRACK_ORDER`, which is stable rather than alphabetical, so the same day never
 * changes colour between renders. A day with nothing returns null and draws as an empty cell, not as
 * the first track with a count of zero.
 */
export function dominantTrack(day: ActivityDay): ActivityCategory | null {
  let best: ActivityCategory | null = null;
  for (const track of TRACK_ORDER) {
    const n = day.by_category?.[track] ?? 0;
    if (n > 0 && (best === null || n > (day.by_category[best] ?? 0))) best = track;
  }
  return best;
}

/** The last seven days of a track, oldest first — the strip the Command Center draws. */
export function trackStrip(row: InternRow, track: ActivityCategory, days = 7): Array<{ date: string; events: number }> {
  const all = row.activity.days ?? [];
  return all.slice(Math.max(0, all.length - days)).map((d) => ({
    date: d.date,
    events: d.by_category?.[track] ?? 0,
  }));
}

/** Did this intern do anything in this track inside the window? */
export function hasTrackActivity(row: InternRow, track: ActivityCategory): boolean {
  return (row.activity.days ?? []).some((d) => (d.by_category?.[track] ?? 0) > 0);
}
