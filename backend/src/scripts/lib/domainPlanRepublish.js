/**
 * AF12.7 - what a re-derive would CHANGE about one agent-domain project's published plan.
 *
 * `buildPlanFromTasks` is a verbatim pass-through of `student_tasks.story_id`, so the plans
 * published on 2026-10-21 are simply a snapshot of the task table as it was BEFORE the rung
 * rows existed. Re-deriving emits them. The question this module answers is not "can we" but
 * "what moves", because a published plan is the authority the verifier grades against and
 * three of the four possible movements are consequential:
 *
 *   added            a story that could not verify before and now can. The point of AF12.7.
 *   removed          a story the plan has and the task table does not. These are the 17
 *                    truncation casualties of the old varchar(60) story_id column. Removing
 *                    one is only safe if nobody ever earned anything against it, which is
 *                    why `unsafeRemovals` exists and why the caller must fail closed on it.
 *   criteriaChanged  a story that stays but whose acceptance text moved. The verifier matches
 *                    criteria by normalised text, so this silently re-grades work already
 *                    submitted against the old wording. Surfaced, never assumed harmless.
 *   kept             everything else. Reported only so the counts add up and a diff that
 *                    accidentally replaced the whole plan is visible rather than plausible.
 *
 * Pure. No database, no I/O, no clock - the caller supplies both story lists and the facts
 * about what has been earned.
 */

/** Same strings in the same order after trimming. Deliberately NOT the verifier's own
 * normalisation: this is a "did the text move at all" check, and it should be MORE sensitive
 * than the matcher, not less. A false alarm costs a line in a dry run; a missed change
 * re-grades a student. */
function sameAcceptance(a, b) {
  const left = (Array.isArray(a) ? a : []).map((s) => String(s).trim());
  const right = (Array.isArray(b) ? b : []).map((s) => String(s).trim());
  return left.length === right.length && left.every((s, i) => s === right[i]);
}

/**
 * @param {Array<{id: string, acceptance?: string[]}>} currentStories  the PUBLISHED plan's stories
 * @param {Array<{id: string, acceptance?: string[]}>} nextStories     the freshly derived stories
 * @param {Set<string>|Array<string>} earnedStoryIds  story ids with a verified task or an
 *        evidence row. A removal of one of these is never automatically safe.
 * @returns {{added: string[], removed: string[], kept: string[], criteriaChanged: string[],
 *            unsafeRemovals: string[], currentCount: number, nextCount: number}}
 */
function diffPlanStories(currentStories, nextStories, earnedStoryIds = []) {
  const cur = new Map((currentStories || []).map((s) => [String(s.id), s]));
  const nxt = new Map((nextStories || []).map((s) => [String(s.id), s]));
  const earned = earnedStoryIds instanceof Set ? earnedStoryIds : new Set(earnedStoryIds || []);

  const added = [...nxt.keys()].filter((id) => !cur.has(id)).sort();
  const removed = [...cur.keys()].filter((id) => !nxt.has(id)).sort();
  const kept = [...nxt.keys()].filter((id) => cur.has(id)).sort();
  const criteriaChanged = kept
    .filter((id) => !sameAcceptance(cur.get(id).acceptance, nxt.get(id).acceptance))
    .sort();

  return {
    added,
    removed,
    kept,
    criteriaChanged,
    // A removal that would delete a story somebody has already been credited for. The caller
    // REFUSES on a non-empty list rather than deciding on the student's behalf.
    unsafeRemovals: removed.filter((id) => earned.has(id)),
    currentCount: cur.size,
    nextCount: nxt.size,
  };
}

/**
 * What one verified story pays on a plan of `storyCount` stories, for the dry run's report.
 *
 * MIRRORS `getBudgetPerUnitXp` in `services/progression/pointsConfigService.ts` and is NOT an
 * authority: nothing is awarded from here. It exists so an operator can see the consequence of
 * a republish before running it, and it is pinned in the tests to the two worked examples in
 * `seedBuildStoryPointsConfig`'s own docblock (800 across 20 pays 40, across 30 pays 27), so
 * if the real rule ever stops rounding this way a test says so instead of a report lying.
 *
 * Fails closed at 0 in the same degenerate cases the real one does.
 */
function perStoryXp(budget, storyCount) {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  if (!Number.isFinite(storyCount) || storyCount <= 0) return 0;
  return Math.round(budget / storyCount);
}

module.exports = { diffPlanStories, perStoryXp, sameAcceptance };
