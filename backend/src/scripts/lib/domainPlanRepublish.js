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

/**
 * Which of `candidateIds` any evidence row is about, with how much was paid for each.
 *
 * This is the fail-closed gate's EYES, so it lives here, pure and tested, rather than as a SQL
 * prefix predicate. A gate whose detector is silently wrong does not fail closed, it passes
 * vacuously - which is precisely how a previous measurement of this subsystem reported 0 rows
 * for a condition that was in fact true 964 times.
 *
 * ## Attribution is LONGEST MATCH, not a character class
 *
 * `evidence_records.source_ref` is `<storyId>@<sha>` today, and the first draft of this function
 * asserted no shape by requiring the character after the id to be a non-word one. That is the
 * SAME BUG the shipped matcher guard was written to fix: `.` and `:` are non-word characters and
 * they are both ordinary story-id characters here, so `...recording` happily claimed
 * `...recording.autonomy:R0`'s evidence. The negative-control test caught it.
 *
 * So the rule is the guard's rule (`storyCommitMatcher` in
 * `services/sbp/verification/verifyDecision.ts`): a ref belongs to the LONGEST known story id
 * that prefixes it, and it counts for a candidate only when that longest id IS the candidate.
 * That needs no opinion about which characters a story id or a separator may contain - the ids
 * themselves settle it.
 *
 * `knownIds` must therefore be the full id universe (the published plan's stories AND the
 * re-derived ones), not just the candidates. Pass a partial universe and attribution falls back
 * toward the shorter id, which over-reports earnings, which refuses more removals - the safe
 * direction, but report it rather than relying on it.
 *
 * @param {Array<{source_ref: string, builder_xp?: number}>} evidence
 * @param {Array<string>} candidateIds  the ids being asked about (the proposed removals)
 * @param {Array<string>} [knownIds]    every story id that exists, for disambiguation
 * @returns {Array<{story_id: string, evidence_rows: number, xp: number}>} only ids with a hit
 */
function creditedStories(evidence, candidateIds, knownIds) {
  const candidates = (candidateIds || []).filter(Boolean).map(String);
  if (!candidates.length) return [];
  // Longest first, so the first prefix hit is the longest one.
  const universe = [...new Set([...(knownIds || []).filter(Boolean).map(String), ...candidates])]
    .sort((a, b) => b.length - a.length);
  const wanted = new Set(candidates);

  const tally = new Map();
  for (const e of evidence || []) {
    const ref = e && e.source_ref ? String(e.source_ref) : '';
    if (!ref) continue;
    const owner = universe.find((id) => ref.startsWith(id));
    if (!owner || !wanted.has(owner)) continue;
    const t = tally.get(owner) || { story_id: owner, evidence_rows: 0, xp: 0 };
    t.evidence_rows += 1;
    t.xp += Number(e.builder_xp) || 0;
    tally.set(owner, t);
  }
  return candidates.filter((c) => tally.has(c)).map((c) => tally.get(c));
}

module.exports = { diffPlanStories, perStoryXp, sameAcceptance, creditedStories };
