import {
  skip, type Collector, type CollectorInput, type CollectorResult,
} from './collectorTypes';

/**
 * `commit_span` - first commit to last, and how many commits fall inside.
 *
 * WHY THE COUNT TRAVELS WITH THE DATES. "Built over six weeks" and "78 commits
 * over six weeks" are different claims, and the first is the one that invites
 * a reader to imagine six weeks of full-time work. The span alone is elapsed
 * time, not effort, and the limitation says so in those words.
 *
 * DATES ARE UTC CALENDAR DATES, never local timestamps. A repository read from
 * a server in one timezone and a browser in another must produce the same span,
 * and a naive local-time conversion silently shifts a commit made near midnight
 * into the previous or next day.
 */
export const commitSpanCollector: Collector = {
  key: 'commit_span',
  shape: 'span',
  label: 'First commit to last',
  needsCommits: true,

  collect(input: CollectorInput): CollectorResult {
    const dates = input.commits
      .map((c) => c.authoredDate)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (dates.length === 0) {
      return skip('no_commits', 'the commit log returned no dated commits');
    }

    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const days = daysBetween(startDate, endDate) + 1;

    return {
      ok: true,
      output: {
        shape: 'span',
        payload: {
          shape: 'span',
          startDate,
          endDate,
          count: dates.length,
          countLabel: dates.length === 1 ? 'commit' : 'commits',
        },
        valueDisplay: `${days} ${days === 1 ? 'day' : 'days'}`,
        unit: 'days',
        numericValue: days,
        methodology: `Read from the commit log up to ${input.sha}, using UTC authored dates. `
          + 'The span runs from the first dated commit to the last, inclusive.',
        limitations: [
          'Elapsed time is not effort. A span of six weeks says nothing about how many hours fell inside it.',
          'Commits made before the work was moved into this repository are not visible here.',
        ],
        reproduceCommand: `git log ${input.sha} --date=short --pretty=format:%ad | sort | sed -n '1p;$p'`,
      },
    };
  },
};

/** Whole days between two `YYYY-MM-DD` dates, parsed as UTC on both ends. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
