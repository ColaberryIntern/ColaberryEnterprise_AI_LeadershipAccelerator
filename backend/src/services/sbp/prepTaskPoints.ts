/**
 * prepTaskPoints — what a Demo Prep task is worth, and how to tell one apart.
 *
 * PURE, with no imports on purpose: this is read by the project tree mapper
 * (pure), the Today feed's serve-time rehydrate, the Classroom rail and the
 * completion endpoint, and several of those are imported by route tests that
 * stub the database. A single Sequelize import here would break every one of
 * them on module load (see the #2478 CI failure on projectsPortalRoutes.archive).
 *
 * Ali, 2026-09-14, on the Projects page: "Demo should have points in the
 * Project section as well." Until now only plan stories were priced, because
 * only they had a path that PAYS — the repo verifier. Demo Prep tasks
 * (PREP-1..PREP-6, `release_key: 'prep'`, `acceptance: []`) are the student's
 * own rehearsals; nothing in a repo can confirm them, so the workspace lets the
 * student confirm them ("You confirm this one yourself"). That confirmation
 * used to live only in the browser. It now reaches the server, and the server
 * pays this.
 */

/** A rehearsal is real work but not a build: less than a story (50 on a 15-story
 *  plan), more than a reply (2), the same as `first_task_complete`. Assumed —
 *  Ali named no figure — and one constant to change if he does. */
export const PREP_TASK_POINTS = 20;

/** The generator hardcodes these ids (`prepTasks()` in buildSchedule); the
 *  workspace panel matches the same shape. */
export function isPrepStory(storyId: string | null | undefined): boolean {
  return /^PREP-\d+$/i.test(String(storyId || '').trim());
}

/**
 * What ONE task pays: a plan story's share of the build budget when the map
 * prices it, a Demo Prep task's flat rate, null for anything else (legacy tasks
 * with no story id, a story the plan does not know). Every surface that shows
 * a price reads it through here, so the Projects page, the Today tile and the
 * Classroom rail cannot disagree.
 */
export function priceForStory(storyId: string | null | undefined, priced: ReadonlyMap<string, number>): number | null {
  if (!storyId) return null;
  const share = priced.get(String(storyId));
  if (share && share > 0) return share;
  return isPrepStory(storyId) ? PREP_TASK_POINTS : null;
}
