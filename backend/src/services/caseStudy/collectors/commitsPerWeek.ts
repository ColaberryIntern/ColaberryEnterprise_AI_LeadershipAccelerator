import {
  skip, type Collector, type CollectorInput, type CollectorResult,
} from './collectorTypes';

const MAX_POINTS = 78; // Eighteen months. Beyond that a sparkline is a smear.

/**
 * `commits_per_week` - commits per calendar week across the span.
 *
 * WHY WEEKS AND NOT DAYS. Daily commit counts are mostly a picture of which
 * days somebody had meetings. Weeks smooth that out without hiding the shape
 * that actually matters: whether the work was steady or arrived in one burst.
 *
 * EMPTY WEEKS ARE INCLUDED, at zero. Dropping them would draw a flat, busy line
 * over a three-month gap, which is the single most misleading thing this
 * collector could do. A gap in the work should look like a gap.
 *
 * Weeks start MONDAY, in UTC, so the same repository buckets identically
 * wherever it is read.
 */
export const commitsPerWeekCollector: Collector = {
  key: 'commits_per_week',
  shape: 'series',
  label: 'Commits per week',
  needsCommits: true,

  collect(input: CollectorInput): CollectorResult {
    const dates = input.commits
      .map((c) => c.authoredDate)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (dates.length === 0) {
      return skip('no_commits', 'the commit log returned no dated commits');
    }

    const counts = new Map<string, number>();
    for (const date of dates) {
      const week = weekStart(date);
      counts.set(week, (counts.get(week) ?? 0) + 1);
    }

    const first = weekStart(dates[0]);
    const last = weekStart(dates[dates.length - 1]);
    const points: { date: string; value: number }[] = [];
    for (let week = first; week <= last; week = addDays(week, 7)) {
      points.push({ date: week, value: counts.get(week) ?? 0 });
      if (points.length >= MAX_POINTS) break;
    }

    const truncated = points.length >= MAX_POINTS && addDays(points[points.length - 1].date, 7) <= last;
    const busiest = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]);

    return {
      ok: true,
      output: {
        shape: 'series',
        payload: { shape: 'series', unit: 'commits', points },
        valueDisplay: `${dates.length} ${dates.length === 1 ? 'commit' : 'commits'}`,
        unit: 'commits',
        numericValue: dates.length,
        methodology: `Read from the commit log up to ${input.sha}, bucketed by UTC calendar week `
          + 'beginning Monday. Weeks with no commits are included at zero, so a gap in the work '
          + 'reads as a gap.',
        limitations: [
          'A commit is not a unit of work. One can be a rename and another a week of thinking.',
          `The busiest week held ${busiest.value} of the ${dates.length} commits, which a smooth line would hide.`,
          ...(truncated ? [`Only the first ${MAX_POINTS} weeks are shown.`] : []),
        ],
        reproduceCommand: `git log ${input.sha} --date=short --pretty=format:%ad | sort | uniq -c`,
      },
    };
  },
};

/** The Monday on or before `date`, as `YYYY-MM-DD`. UTC throughout. */
function weekStart(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  const dayOfWeek = new Date(ms).getUTCDay(); // 0 is Sunday
  const backToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return isoDate(ms - backToMonday * 86_400_000);
}

function addDays(date: string, days: number): string {
  return isoDate(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
