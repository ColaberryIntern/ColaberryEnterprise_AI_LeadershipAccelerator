/**
 * planRepoSyncDecision — what a plan-to-repo sweep should do about ONE agent-domain project.
 *
 * ## The defect this exists for
 *
 * A builder's repo is written by exactly one thing: `refreshRepoDocuments`, called from
 * `POST /api/portal/workspace/repo/sync`, which is `requireParticipant`. That route is the
 * Sync button in the builder's own workspace. So a plan republished on Sunday reaches a
 * builder's repo only when that builder happens to press a button.
 *
 * Measured on 2026-11-24: the ladder migration put four stories on all seven boards on
 * 19 Nov, all seven plans republished on 22 Nov, and on 24 Nov only the two builders who
 * had pressed Sync had the files. The other five repos were eleven days behind. Ruth
 * Kumera's verified count, passed criteria and points were all short, because
 * `buildVerificationService` grades a commit against the PUBLISHED plan and a story the
 * plan in the repo has never heard of cannot be credited. Refreshing her repo moved her
 * from 6 verified to 7 and from 108 points to 124 with nothing re-graded. The work had
 * been done; only the delivery was missing.
 *
 * ## Why nobody noticed for eleven days
 *
 * `repoTreeRefreshService` pulls every connected repo every six hours and stamps
 * `last_sync_at`. It writes nothing, by design, which is what lets it run on read-only
 * access. The effect is that the column that looks like a freshness signal says "synced
 * today" for a repo that is eleven days stale. There was no signal pointing the other way.
 *
 * ## Why the judgement lives here, away from the I/O
 *
 * Same split as `activeProjectDrift` / `activeProjectDriftService`: this file is pure, so
 * the rules can be tested without a database, fixtures or a clock, and the sweep that calls
 * it stays boring. It decides; it never acts.
 *
 * ## What it deliberately does NOT decide
 *
 * Whether to REPUBLISH. Re-deriving a plan from the board needs `buildPlanFromTasks` and the
 * credited-removal gate in `scripts/lib/domainPlanRepublish.js`, and those are plain `.js`
 * under `src` that `tsc` never compiles, so they do not exist in the dist-only production
 * image. Republishing therefore remains the hand-run `republishDomainBuildPlans.js` until
 * that logic is ported to TypeScript. This module reports board-versus-plan drift so the
 * republish debt is visible, and says nothing about paying it.
 */

/** What the sweep should do with this project. */
export type PlanRepoSyncAction =
  | 'push'            // there is a repo and a published plan: hand it to refreshRepoDocuments
  | 'skip_no_repo'    // no GitHub connection, so there is nowhere to write
  | 'skip_no_plan';   // nothing published yet, so there is nothing authoritative to write

/** Board-versus-published-plan drift. Reported in every case, including the skips. */
export interface PlanRepoSyncDrift {
  drifted: boolean;
  /** On the board, absent from the published plan. These are the stories that cannot be credited. */
  onlyOnBoard: string[];
  /** Still in the published plan, gone from the board. A republish would remove them. */
  onlyInPlan: string[];
}

export interface PlanRepoSyncInput {
  domainKey: string;
  projectId: string;
  hasRepo: boolean;
  hasPublishedPlan: boolean;
  publishedStoryIds: readonly (string | null | undefined)[];
  boardStoryIds: readonly (string | null | undefined)[];
}

export interface PlanRepoSyncVerdict {
  domainKey: string;
  projectId: string;
  action: PlanRepoSyncAction;
  drift: PlanRepoSyncDrift;
}

/**
 * Trim, drop blanks and duplicates, and sort.
 *
 * Sorted and de-duplicated because this feeds a log line a human reads and a diff a test
 * pins: `array_agg` ordering is not guaranteed across plans, and an unsorted difference
 * would make an identical state look like it changed.
 */
function normalizeIds(ids: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (id) seen.add(id);
  }
  return [...seen].sort();
}

/** Members of `a` that are absent from `b`. */
function missingFrom(a: readonly string[], b: readonly string[]): string[] {
  const other = new Set(b);
  return a.filter((id) => !other.has(id));
}

/**
 * Decide one project.
 *
 * Precedence is deliberate: a missing repo is reported ahead of a missing plan, because a
 * project with neither needs a repo connected before a plan matters, and reporting both
 * would make the summary count the same project twice.
 */
export function decidePlanRepoSync(input: PlanRepoSyncInput): PlanRepoSyncVerdict {
  const planIds = normalizeIds(input.publishedStoryIds);
  const boardIds = normalizeIds(input.boardStoryIds);

  const onlyOnBoard = missingFrom(boardIds, planIds);
  const onlyInPlan = missingFrom(planIds, boardIds);

  // Drift is only meaningful once something is published. With no published plan every
  // board story would read as drift, which is noise rather than a finding.
  const drifted = input.hasPublishedPlan && (onlyOnBoard.length > 0 || onlyInPlan.length > 0);

  let action: PlanRepoSyncAction = 'push';
  if (!input.hasRepo) action = 'skip_no_repo';
  else if (!input.hasPublishedPlan) action = 'skip_no_plan';

  return {
    domainKey: input.domainKey,
    projectId: input.projectId,
    action,
    drift: {
      drifted,
      onlyOnBoard: input.hasPublishedPlan ? onlyOnBoard : [],
      onlyInPlan: input.hasPublishedPlan ? onlyInPlan : [],
    },
  };
}
