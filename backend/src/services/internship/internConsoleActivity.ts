import { sequelize } from '../../config/database';
import {
  getPersonTimeline, TimelineEvent, activityDaysByEnrollment, EnrollmentActivityDay,
} from '../adminOs/personTimelineService';

/**
 * internConsoleActivity — when did this intern last actually show up, and what have the
 * last 28 days looked like.
 *
 *     "I need to see their attendance and when is the last time they showed activity."
 *     (Ali, 2026-10-01)
 *
 * ── THERE IS NO `last_activity_at` COLUMN, AND TWO BETTER SOURCES THAN INVENTING ONE ──
 *
 * `enrollments` has no last-seen field and no last-login. The console design proposed
 * taking a four-way MAX by hand across card progress, meeting joins, cert sittings and
 * GitHub sync. That works, and it duplicates something that already exists:
 *
 *   `getPersonTimeline` (adminOs/personTimelineService.ts) already unifies card
 *   completions, attendance records, skill evidence and assessment attempts into one
 *   ordered feed, collapses identical events, and names the table each row came from.
 *   Its first element IS the cross-domain "last activity". It had no HTTP route, which is
 *   presumably why the design did not find it.
 *
 * So this reads the timeline rather than re-deriving it, and adds the one signal the
 * timeline does not carry: `community_members.last_active_at`, the portal heartbeat bumped
 * by the presence ping. That one is deliberately treated as WEAKER evidence — see below.
 *
 * ── WHY THE HEARTBEAT CANNOT BE THE ONLY ANSWER ───────────────────────────────────────
 *
 * `cohortPresenceService` already documents the catch: `last_active_at` is only fresh while
 * a portal window is pinging. An intern who spends a day in their repo and never opens the
 * portal looks idle by that measure and busy by the timeline. Taking the LATER of the two
 * is therefore not a tie-break, it is the point: each covers the other's blind spot.
 */

/** The bands the design specifies, in the order they degrade. */
export type ActivityLevel = 'green' | 'yellow' | 'orange' | 'red' | 'black' | 'unknown';

export interface ActivityDay {
  /** `YYYY-MM-DD`, oldest first. */
  readonly date: string;
  readonly events: number;
}

export interface ActivitySignal {
  readonly last_activity_at: string | null;
  /**
   * Which source won, so a reader can trace the claim. `portal_presence` when the heartbeat
   * is the most recent thing we know, otherwise the timeline's own source table.
   */
  readonly last_activity_source: string | null;
  readonly days_since: number | null;
  readonly level: ActivityLevel;
  /** Exactly 28 entries, oldest first, whatever the data looks like. */
  readonly days: ActivityDay[];
  /** True when the band was capped by the new-intern grace rule rather than measured. */
  readonly graced: boolean;
}

export const WINDOW_DAYS = 28;

/**
 * How long a new intern is given before silence is treated as a problem.
 *
 * Someone in their first month has barely had time to establish a rhythm, and a brand-new
 * intern reading as "gone dark" on day 8 is a false alarm that costs trust in every other
 * red on the board. They cap at yellow instead.
 */
export const NEW_INTERN_GRACE_DAYS = 30;

const DAY_MS = 86_400_000;
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** Never ran, and never ran is not the same as stopped. */
const NEVER: ActivityLevel = 'unknown';

/** The raw band, before the grace rule. Boundaries are inclusive of the lower number. */
export function bandFor(daysSince: number | null): ActivityLevel {
  if (daysSince === null) return NEVER;
  if (daysSince <= 0) return 'green';
  if (daysSince <= 3) return 'yellow';
  if (daysSince <= 6) return 'orange';
  if (daysSince <= 9) return 'red';
  return 'black';
}

/** The bands that mean MEASURED silence. The only ones the grace cap touches. */
const SOFTENABLE: readonly ActivityLevel[] = ['orange', 'red', 'black'];

/**
 * Apply the new-intern grace cap.
 *
 * `SOFTENABLE` is an allowlist rather than "anything worse than yellow", and that is the
 * whole point: `unknown` is worse than yellow by any reading and must NOT be softened. An
 * intern who has done nothing at all is reported as never, in week one as much as week six,
 * because they are the one group always worth acting on. Rewriting this as
 * `level !== 'green' && level !== 'yellow'` looks like a tidy-up and hides exactly them.
 */
export function withGrace(
  level: ActivityLevel, daysSinceJoined: number | null,
): { level: ActivityLevel; graced: boolean } {
  const isNew = daysSinceJoined !== null && daysSinceJoined <= NEW_INTERN_GRACE_DAYS;
  if (isNew && SOFTENABLE.includes(level)) return { level: 'yellow', graced: true };
  return { level, graced: false };
}

/** Fail-soft: one broken source must not cost the console every other signal. */
async function soft<T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err: any) {
    console.warn(`[InternConsoleActivity] ${what} unavailable:`, err?.message);
    return fallback;
  }
}

/**
 * One day of activity, as either path supplies it.
 *
 * This is the seam between the two loaders — the per-person feed and the per-enrollment batch —
 * and it exists so the banding, the grace cap and the 28-day grid have exactly ONE implementation.
 * A roster that computed "red" slightly differently from the detail page for the same intern would
 * be the worst possible bug here: both numbers look authoritative and they disagree.
 */
export interface ActivityDayInput {
  /** `YYYY-MM-DD`. */
  date: string;
  events: number;
  /** The latest event that day, ISO. */
  lastAt: string;
  lastSource: string;
}

/**
 * The whole rule, as a pure function: which band, whether grace applied, and the 28-day grid.
 *
 * `now` is required rather than defaulted, because every caller already knows it and a silent
 * `new Date()` in here is how a band becomes untestable.
 */
export function signalFrom(input: {
  days: readonly ActivityDayInput[];
  heartbeat: Date | string | null;
  joinedAt: Date | string | null;
  now: Date;
}): ActivitySignal {
  const { now } = input;
  const windowStart = new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY_MS);

  // Latest of the activity rows and the heartbeat. Each covers the other's blind spot.
  const newestDay = input.days.length
    ? input.days.reduce((a, b) => (a.lastAt >= b.lastAt ? a : b))
    : null;
  const eventAt = newestDay ? new Date(newestDay.lastAt) : null;
  const beatAt = input.heartbeat ? new Date(input.heartbeat) : null;

  let lastAt: Date | null = null;
  let source: string | null = null;
  if (eventAt && beatAt) {
    const beatWins = beatAt > eventAt;
    lastAt = beatWins ? beatAt : eventAt;
    source = beatWins ? 'portal_presence' : newestDay!.lastSource;
  } else if (eventAt) {
    lastAt = eventAt; source = newestDay!.lastSource;
  } else if (beatAt) {
    lastAt = beatAt; source = 'portal_presence';
  }

  // Whole days, floored: anything today is 0, which is what "active today" means.
  const daysSince = lastAt
    ? Math.max(0, Math.floor((now.getTime() - lastAt.getTime()) / DAY_MS))
    : null;
  const daysSinceJoined = input.joinedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(input.joinedAt).getTime()) / DAY_MS))
    : null;

  const { level, graced } = withGrace(bandFor(daysSince), daysSinceJoined);

  // Always 28 entries. A sparse grid with gaps would be read as missing data rather than as quiet
  // days, and quiet days are the thing being looked for.
  const counts = new Map<string, number>();
  for (const d of input.days) {
    if (d.date < iso(windowStart) || d.date > iso(now)) continue;
    counts.set(d.date, (counts.get(d.date) ?? 0) + d.events);
  }
  const days: ActivityDay[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const date = iso(new Date(windowStart.getTime() + i * DAY_MS));
    return { date, events: counts.get(date) ?? 0 };
  });

  return {
    last_activity_at: lastAt ? lastAt.toISOString() : null,
    last_activity_source: source,
    days_since: daysSince,
    level,
    days,
    graced,
  };
}

/** Fold a person's ordered feed into day rows. The feed carries no day grouping of its own. */
export function daysFromEvents(events: readonly TimelineEvent[]): ActivityDayInput[] {
  const byDate = new Map<string, ActivityDayInput>();
  for (const e of events) {
    const at = new Date(e.occurredAt);
    const date = iso(at);
    const isoAt = at.toISOString();
    const row = byDate.get(date);
    if (!row) {
      byDate.set(date, { date, events: e.occurrences || 1, lastAt: isoAt, lastSource: e.source });
      continue;
    }
    row.events += e.occurrences || 1;
    // The day's winning source is its latest event, so a quiet late event still names itself.
    if (isoAt > row.lastAt) { row.lastAt = isoAt; row.lastSource = e.source; }
  }
  return [...byDate.values()];
}

/**
 * The activity signal for ONE intern, from the full person feed.
 *
 * `now` is injectable so the band boundaries can be tested as facts rather than as whatever today
 * happens to be.
 */
export async function internActivitySignal(
  enrollmentId: string,
  opts: { now?: Date } = {},
): Promise<ActivitySignal> {
  const now = opts.now ?? new Date();

  const events: TimelineEvent[] = await soft('person timeline', () => getPersonTimeline({
    leadIds: [],
    enrollmentIds: [enrollmentId],
    // The two domains an intern's own work lands in. Acquisition and commerce describe how they
    // were sold to, which is not activity.
    domains: ['learning', 'community'],
    limit: 200,
  }), []);

  const heartbeat = await soft('portal heartbeat', async () => {
    const [rows] = await sequelize.query(
      'SELECT last_active_at FROM community_members WHERE enrollment_id = :id LIMIT 1',
      { replacements: { id: enrollmentId } },
    ) as [Array<{ last_active_at: string | Date | null }>, unknown];
    return rows[0]?.last_active_at ?? null;
  }, null as string | Date | null);

  const joinedAt = await soft('membership', async () => {
    const [rows] = await sequelize.query(
      `SELECT joined_at FROM cohort_memberships
        WHERE enrollment_id = :id AND membership_type = 'internship' AND status = 'active'
        ORDER BY joined_at DESC LIMIT 1`,
      { replacements: { id: enrollmentId } },
    ) as [Array<{ joined_at: string | Date | null }>, unknown];
    return rows[0]?.joined_at ?? null;
  }, null as string | Date | null);

  return signalFrom({ days: daysFromEvents(events), heartbeat, joinedAt, now });
}

/**
 * The activity signal for a WHOLE ROSTER, in three queries regardless of how many interns.
 *
 * Why not just call `internActivitySignal` in a loop: it would be three queries per intern, and
 * the timeline one is a union of ten subqueries. Ten interns would be a hundred-odd subqueries to
 * draw one table. `activityDaysByEnrollment` projects the same sources per enrollment in one pass,
 * and the band is then computed by the same `signalFrom` the single-intern path uses — so the
 * roster and the detail page cannot disagree about the same intern.
 *
 * Every requested enrollment appears in the result. An intern with nothing at all is reported as
 * `unknown` with an empty grid, which is a fact about them; omitting them would silently shorten
 * the roster.
 */
export async function internActivitySignals(
  enrollmentIds: readonly string[],
  opts: { now?: Date } = {},
): Promise<Map<string, ActivitySignal>> {
  const now = opts.now ?? new Date();
  const ids = [...enrollmentIds];
  const out = new Map<string, ActivitySignal>();
  if (ids.length === 0) return out;

  const dayRows = await soft('roster activity', () => activityDaysByEnrollment({
    enrollmentIds: ids,
    domains: ['learning', 'community'],
  }), [] as EnrollmentActivityDay[]);

  const heartbeats = await soft('roster heartbeats', async () => {
    const [rows] = await sequelize.query(
      'SELECT enrollment_id, last_active_at FROM community_members WHERE enrollment_id IN (:ids)',
      { replacements: { ids } },
    ) as [Array<{ enrollment_id: string; last_active_at: string | Date | null }>, unknown];
    return rows;
  }, [] as Array<{ enrollment_id: string; last_active_at: string | Date | null }>);

  const memberships = await soft('roster memberships', async () => {
    const [rows] = await sequelize.query(
      `SELECT enrollment_id, max(joined_at) AS joined_at FROM cohort_memberships
        WHERE enrollment_id IN (:ids) AND membership_type = 'internship' AND status = 'active'
        GROUP BY enrollment_id`,
      { replacements: { ids } },
    ) as [Array<{ enrollment_id: string; joined_at: string | Date | null }>, unknown];
    return rows;
  }, [] as Array<{ enrollment_id: string; joined_at: string | Date | null }>);

  const daysBy = new Map<string, ActivityDayInput[]>();
  for (const r of dayRows) {
    const list = daysBy.get(r.enrollmentId) ?? [];
    list.push({ date: r.date, events: r.events, lastAt: r.lastAt, lastSource: r.lastSource });
    daysBy.set(r.enrollmentId, list);
  }
  const beatBy = new Map(heartbeats.map((r) => [String(r.enrollment_id), r.last_active_at]));
  const joinBy = new Map(memberships.map((r) => [String(r.enrollment_id), r.joined_at]));

  for (const id of ids) {
    out.set(id, signalFrom({
      days: daysBy.get(id) ?? [],
      heartbeat: beatBy.get(id) ?? null,
      joinedAt: joinBy.get(id) ?? null,
      now,
    }));
  }
  return out;
}
