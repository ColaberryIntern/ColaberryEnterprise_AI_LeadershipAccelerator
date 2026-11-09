/** Minimal, realistic facts for the portfolio report tests. Shapes mirror the 9 Nov 2026 prod collection. */
import type { CollectedPortfolio } from '../types';

export const NOW = new Date('2026-11-09T22:00:00Z');
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86400000).toISOString();

function weeks(done: number[], pct: Record<number, number> = {}): any[] { // any: test fixture for ConsoleTraining['weeks']
  const numbered = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((w) => ({
    week: w as number | null, publishedCardCount: 30, completed: 0, completedPct: done.includes(w) ? 50 : pct[w] ?? 0, weekDone: done.includes(w),
  }));
  // The roster also carries an unscheduled bucket (week: null); the report must ignore it.
  return [...numbered, { week: null, publishedCardCount: 1000, completed: 0, completedPct: 0, weekDone: false }];
}

export function rosterRow(over: Record<string, unknown> = {}): any { // any: ConsoleRosterRow is readonly-deep; fixtures build it loosely
  return {
    enrollment_id: 'e1', name: 'Kalkidan Bezabeh', email: 'kal@example.com', application_state: 'active', application_id: 'a1',
    joined_at: daysAgo(49), day: 49, cohort: { id: 'c1', name: 'Explorer', type: 'explorer' },
    activity: {
      last_activity_at: daysAgo(0), last_activity_source: 'portal_presence', days_since: 0, level: 'green', graced: false,
      days: Array.from({ length: 28 }, (_, i) => ({ date: `d${i}`, events: i % 2, by_category: { training: i % 2, project: 0, certification: 0, community: 0, other: 0 } })),
    },
    training: { weeks: weeks([1, 2]), weeks_completed: 2, weeks_1_3_clear: false, pace: null, pace_unavailable: 'cohort_has_no_sessions' },
    cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
    project: { project_id: 'p-console', name: 'Console project', stage: 'discovery', tasks_total: 10, tasks_complete: 1, tasks_pct: 10, has_repo: true, command_center_url: null },
    ...over,
  };
}

export function collected(over: Partial<CollectedPortfolio> = {}): CollectedPortfolio {
  return {
    generatedAt: NOW.toISOString(), lookbackDays: 14, emailLookbackDays: 21,
    counts: { interns: 1, weeks_1_3_clear: 0, no_project: 0 },
    roster: [rosterRow()],
    feeds: {}, readiness: [], agentStates: [], agentTabs: [], govPursuits: [],
    projects: [{
      project_id: 'p-console', repo_url: 'https://github.com/x/y', last_sync_at: daysAgo(0),
      commits: [{ sha: 'a1', date: daysAgo(1), author: 'kal', message: 'STORY-1: build it' }, { sha: 'b2', date: daysAgo(1), author: 'Colaberry Build Bot', message: 'chore(colaberry): sync' }],
      recently_verified: [], next_tasks: [{ story_id: 'S2', title: 'Next thing', due_on: null, status: 'not_started' }], overdue: 0,
    }],
    emails: [], weWrote: [],
    ...over,
  };
}

export { daysAgo };
