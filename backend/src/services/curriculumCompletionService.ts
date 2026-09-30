import { sequelize } from '../config/database';

/**
 * Curriculum completion and student pace, for the Class Dashboard.
 *
 * Two questions the dashboard could not answer before: WHICH parts of the curriculum a
 * cohort is actually completing, and WHICH students are keeping up with it.
 *
 * THREE DEFINITIONS DO THE WORK HERE, and all three are stated rather than implied,
 * because every one of them could reasonably have been set differently.
 */

/**
 * 1. THE COHORT'S WEEK comes from the session TITLE, not `session_number`.
 *
 * There are two sessions a week - an Architecture Day and a Build Day - and the numbering
 * also skips (this cohort has no #14). So session #13 is "Week 6 · Build Day", and reading
 * the number as the week would have put this cohort on week 13 when it is on week 6, and
 * painted every student red. The title is the only place the week is recorded: there is no
 * week column on `live_sessions` and `curriculum_json->week` is null on all 24 rows.
 *
 * An unparseable title is week 0 - that is the Orientation session, the one title in this
 * cohort that names no week, and it genuinely precedes week 1.
 */
export const weekFromSessionTitle = (title: string | null | undefined): number => {
  const match = /week\s*(\d+)/i.exec(String(title ?? ''));
  return match ? Number(match[1]) : 0;
};

/**
 * 2. A WEEK COUNTS AS DONE at 30% of its published cards.
 *
 * "Every card" makes nobody complete a week; "any card" makes a student who opened one
 * item in week 12 look like they have reached week 12 - and the data has exactly that
 * person, 87 cards done with a furthest-touched week of 12 but only 9 weeks touched.
 *
 * THE NUMBER WAS CHOSEN AGAINST THE DATA, not picked. Weeks carry 32 published cards on
 * average, so a student working steadily across several weeks rarely clears half of any
 * one. Measured on the July 2026 cohort against a scheduled week of 6:
 *
 *   >=50% -> gold 2, green 0, yellow 0, red 47
 *   >=30% -> gold 2, green 4, yellow 2, red 41
 *   >=20% -> gold 4, green 3, yellow 2, red 40
 *   any card touched -> gold 6, green 3, yellow 3, red 37
 *
 * 50% put every single student outside gold into red, which reports nothing. 30% separates
 * the bands while still meaning "did a real share of that week" rather than "opened one
 * card". Note what does NOT change across the range: this cohort is genuinely behind, and
 * 13 of its 49 active students have zero completions at any threshold.
 *
 * It stays a named constant and the raw counts - cards completed, furthest week touched -
 * travel with every student, so the band is always checkable against the numbers under it.
 */
export const WEEK_DONE_THRESHOLD = 0.3;

/**
 * 3. THE PACE BANDS, as Ali set them: "If they are 2 weeks ahead - Gold, 1 week green,
 * -1 week yellow, -2 weeks red."
 *
 * Delta is weeks completed minus the cohort's scheduled week. On track (0) sits in Green
 * with +1, because a student level with the class is keeping up by any reading.
 */
export type PaceBand = 'gold' | 'green' | 'yellow' | 'red';

export const paceBandFor = (delta: number): PaceBand => {
  if (delta >= 2) return 'gold';
  if (delta >= 0) return 'green';
  if (delta === -1) return 'yellow';
  return 'red';
};

/**
 * The order a week is actually taught in, matching `bucketEnum` in timelineAdminController
 * and the `TimelineCardBucket` union.
 *
 * Sections used to come back `localeCompare`d, which put `advance` — the last thing in a
 * week — first, and `pre_class` fifth. That is invisible in a list of seven rows and wrong
 * in a heatmap, where the columns are read left to right as the shape of a week. Ali's
 * whole framing was "put in the same order as curriculum", so the order belongs here rather
 * than being re-derived by each consumer.
 */
export const BUCKET_ORDER = [
  'pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance',
] as const;

/** Unknown buckets sort last rather than vanishing, so a new bucket shows up as a column
 *  nobody ordered instead of silently disappearing from the grid. */
export const bucketRank = (bucket: string): number => {
  const i = (BUCKET_ORDER as readonly string[]).indexOf(bucket);
  return i === -1 ? BUCKET_ORDER.length : i;
};

export interface CurriculumCard {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly bucket: string;
  readonly order: number;
  readonly published: boolean;
  readonly completedCount: number;
  readonly completedPct: number;
}

export interface CurriculumSection {
  readonly bucket: string;
  readonly cardCount: number;
  readonly completedPct: number;
  readonly cards: readonly CurriculumCard[];
}

export interface CurriculumWeek {
  /** null is the unscheduled library - real cards, but not part of any week. */
  readonly week: number | null;
  readonly cardCount: number;
  readonly publishedCardCount: number;
  /** Mean of the per-card completion rates across the week's published cards. */
  readonly completedPct: number;
  readonly studentsCompletedAny: number;
  readonly isScheduledWeek: boolean;
  readonly sections: readonly CurriculumSection[];
}

export interface StudentPace {
  readonly enrollmentId: string;
  readonly name: string;
  readonly weeksCompleted: number;
  readonly cardsCompleted: number;
  readonly furthestWeekTouched: number | null;
  readonly delta: number;
  readonly band: PaceBand;
}

export interface CurriculumCompletion {
  readonly cohortId: string;
  readonly scheduledWeek: number;
  readonly deliveredSessions: number;
  readonly activeStudents: number;
  readonly weeks: readonly CurriculumWeek[];
  readonly pace: {
    readonly gold: number; readonly green: number;
    readonly yellow: number; readonly red: number;
  };
  readonly students: readonly StudentPace[];
}

const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/** Cards are program-level; only progress is per-student. */
interface CardRow {
  id: string; title: string; type: string; bucket: string;
  week: number | null; order: number; status: string;
}

export async function getCurriculumCompletion(cohortId: string): Promise<CurriculumCompletion | null> {
  const [cohorts] = await sequelize.query(
    'SELECT id FROM cohorts WHERE id = $1', { bind: [cohortId] },
  ) as [Array<{ id: string }>, unknown];
  if (!cohorts.length) return null;

  const [sessions] = await sequelize.query(
    `SELECT title, status FROM live_sessions
      WHERE cohort_id = $1 AND status <> 'cancelled'`, { bind: [cohortId] },
  ) as [Array<{ title: string; status: string }>, unknown];
  const delivered = sessions.filter((s) => s.status === 'completed' || s.status === 'live');
  const scheduledWeek = delivered.reduce((max, s) => Math.max(max, weekFromSessionTitle(s.title)), 0);

  const [students] = await sequelize.query(
    `SELECT id, COALESCE(NULLIF(TRIM(full_name), ''), email) AS name
       FROM enrollments WHERE cohort_id = $1 AND status = 'active' ORDER BY name`,
    { bind: [cohortId] },
  ) as [Array<{ id: string; name: string }>, unknown];
  const activeStudents = students.length;

  const [cards] = await sequelize.query(
    `SELECT id, title, type, bucket, week, "order", status FROM timeline_cards
      ORDER BY week NULLS LAST, bucket, "order"`,
  ) as [CardRow[], unknown];

  // One pass for completions, keyed by card. Counting only ACTIVE enrolments keeps the
  // denominator and the numerator describing the same population.
  const [completions] = await sequelize.query(
    `SELECT p.card_id, count(*)::int AS completed
       FROM timeline_card_progress p
       JOIN enrollments e ON e.id = p.enrollment_id
      WHERE e.cohort_id = $1 AND e.status = 'active' AND p.status = 'completed'
      GROUP BY p.card_id`, { bind: [cohortId] },
  ) as [Array<{ card_id: string; completed: number }>, unknown];
  const doneByCard = new Map(completions.map((r) => [r.card_id, Number(r.completed)]));

  const [perStudentWeek] = await sequelize.query(
    `SELECT p.enrollment_id, c.week, count(*)::int AS completed
       FROM timeline_card_progress p
       JOIN timeline_cards c ON c.id = p.card_id
       JOIN enrollments e ON e.id = p.enrollment_id
      WHERE e.cohort_id = $1 AND e.status = 'active' AND p.status = 'completed'
      GROUP BY p.enrollment_id, c.week`, { bind: [cohortId] },
  ) as [Array<{ enrollment_id: string; week: number | null; completed: number }>, unknown];

  /* ---------------------------------------------------------------- weeks ---- */

  const publishedByWeek = new Map<string, number>();
  cards.forEach((c) => {
    if (c.status !== 'active') return;
    const key = String(c.week);
    publishedByWeek.set(key, (publishedByWeek.get(key) ?? 0) + 1);
  });

  const weekKeys = Array.from(new Set(cards.map((c) => String(c.week))));
  // Numeric weeks in order, then the unscheduled library last.
  weekKeys.sort((a, b) => {
    if (a === 'null') return 1;
    if (b === 'null') return -1;
    return Number(a) - Number(b);
  });

  const weeks: CurriculumWeek[] = weekKeys.map((key) => {
    const weekCards = cards.filter((c) => String(c.week) === key);
    const buckets = Array.from(new Set(weekCards.map((c) => c.bucket)));

    const sections: CurriculumSection[] = buckets.map((bucket) => {
      const inBucket = weekCards
        .filter((c) => c.bucket === bucket)
        // UNPUBLISHED CARDS SINK. Ali: "Put non published at the bottom of the list."
        // They stay visible - a card withheld from students is a fact about the
        // curriculum - but they never sit above work people were actually asked to do.
        .sort((a, b) => (Number(b.status === 'active') - Number(a.status === 'active'))
          || (a.order - b.order));
      const mapped: CurriculumCard[] = inBucket.map((c) => {
        const done = doneByCard.get(c.id) ?? 0;
        return {
          id: c.id, title: c.title, type: c.type, bucket: c.bucket, order: c.order,
          published: c.status === 'active',
          completedCount: done,
          completedPct: pct(done, activeStudents),
        };
      });
      const pub = mapped.filter((c) => c.published);
      const avg = pub.length
        ? Math.round((pub.reduce((s, c) => s + c.completedPct, 0) / pub.length) * 10) / 10 : 0;
      return { bucket, cardCount: mapped.length, completedPct: avg, cards: mapped };
    }).sort((a, b) => bucketRank(a.bucket) - bucketRank(b.bucket)
      || a.bucket.localeCompare(b.bucket));

    const published = weekCards.filter((c) => c.status === 'active');
    const avgWeek = published.length
      ? Math.round((published.reduce(
        (s, c) => s + pct(doneByCard.get(c.id) ?? 0, activeStudents), 0) / published.length) * 10) / 10
      : 0;
    const anyStudents = new Set(
      perStudentWeek.filter((r) => String(r.week) === key && r.completed > 0)
        .map((r) => r.enrollment_id),
    ).size;

    return {
      week: key === 'null' ? null : Number(key),
      cardCount: weekCards.length,
      publishedCardCount: published.length,
      completedPct: avgWeek,
      studentsCompletedAny: anyStudents,
      isScheduledWeek: key !== 'null' && Number(key) === scheduledWeek,
      sections,
    };
  });

  /* ------------------------------------------------------------- students ---- */

  const byStudent = new Map<string, Map<string, number>>();
  perStudentWeek.forEach((r) => {
    if (!byStudent.has(r.enrollment_id)) byStudent.set(r.enrollment_id, new Map());
    byStudent.get(r.enrollment_id)!.set(String(r.week), Number(r.completed));
  });

  const paceCounts = { gold: 0, green: 0, yellow: 0, red: 0 };
  const paced: StudentPace[] = students.map((s) => {
    const mine = byStudent.get(s.id) ?? new Map<string, number>();
    let weeksCompleted = 0;
    let cardsCompleted = 0;
    let furthest: number | null = null;

    mine.forEach((done, key) => {
      cardsCompleted += done;
      if (key === 'null') return;
      const weekNum = Number(key);
      if (done > 0 && (furthest === null || weekNum > furthest)) furthest = weekNum;
      const publishedInWeek = publishedByWeek.get(key) ?? 0;
      if (publishedInWeek > 0 && done / publishedInWeek >= WEEK_DONE_THRESHOLD) weeksCompleted += 1;
    });

    const delta = weeksCompleted - scheduledWeek;
    const band = paceBandFor(delta);
    paceCounts[band] += 1;
    return {
      enrollmentId: s.id, name: s.name, weeksCompleted, cardsCompleted,
      furthestWeekTouched: furthest, delta, band,
    };
  });

  return {
    cohortId,
    scheduledWeek,
    deliveredSessions: delivered.length,
    activeStudents,
    weeks,
    pace: paceCounts,
    students: paced.sort((a, b) => b.weeksCompleted - a.weeksCompleted || b.cardsCompleted - a.cardsCompleted),
  };
}

/**
 * One student's week-by-week, for the drill-down.
 *
 * Returns every week the curriculum has, not only the ones they touched - a week with zero
 * completions is the most interesting row on this screen, and omitting it would hide the
 * gap the whole view exists to show.
 */
export interface StudentWeekRow {
  readonly week: number | null;
  readonly publishedCardCount: number;
  readonly completed: number;
  readonly completedPct: number;
  readonly weekDone: boolean;
}

export async function getStudentWeekBreakdown(
  cohortId: string, enrollmentId: string,
): Promise<{ enrollmentId: string; name: string; scheduledWeek: number; rows: StudentWeekRow[] } | null> {
  const [rows] = await sequelize.query(
    `SELECT id, COALESCE(NULLIF(TRIM(full_name), ''), email) AS name
       FROM enrollments WHERE id = $1 AND cohort_id = $2`,
    { bind: [enrollmentId, cohortId] },
  ) as [Array<{ id: string; name: string }>, unknown];
  if (!rows.length) return null;

  const [sessions] = await sequelize.query(
    `SELECT title, status FROM live_sessions WHERE cohort_id = $1 AND status <> 'cancelled'`,
    { bind: [cohortId] },
  ) as [Array<{ title: string; status: string }>, unknown];
  const scheduledWeek = sessions
    .filter((s) => s.status === 'completed' || s.status === 'live')
    .reduce((max, s) => Math.max(max, weekFromSessionTitle(s.title)), 0);

  const [weekRows] = await sequelize.query(
    `SELECT c.week,
            count(*) FILTER (WHERE c.status = 'active')::int AS published,
            count(*) FILTER (WHERE p.id IS NOT NULL AND p.status = 'completed')::int AS completed
       FROM timeline_cards c
       LEFT JOIN timeline_card_progress p
         ON p.card_id = c.id AND p.enrollment_id = $1
      GROUP BY c.week
      ORDER BY c.week NULLS LAST`, { bind: [enrollmentId] },
  ) as [Array<{ week: number | null; published: number; completed: number }>, unknown];

  return {
    enrollmentId,
    name: rows[0].name,
    scheduledWeek,
    rows: weekRows.map((r) => {
      const published = Number(r.published);
      const completed = Number(r.completed);
      return {
        week: r.week === null ? null : Number(r.week),
        publishedCardCount: published,
        completed,
        completedPct: pct(completed, published),
        weekDone: published > 0 && completed / published >= WEEK_DONE_THRESHOLD,
      };
    }),
  };
}
