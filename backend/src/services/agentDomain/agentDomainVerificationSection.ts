/**
 * The snapshot's story-verification section, and the verdict shape it renders.
 *
 * ## Why this is its own module
 *
 * `agentDomainSnapshot.ts` reached exactly 500 lines after the builder-path change, which is AT
 * CLAUDE.md's hard ceiling (line 152), so the next edit to it would have broken the rule rather
 * than merely approached it. This is the third extraction in that change with the same
 * justification, and the directory already has the pattern: the Command Center story, the
 * candidate section and now this one each own a module instead of all three living in the file
 * that assembles them.
 *
 * The block moved VERBATIM and `agentDomainSnapshot.ts` re-exports it, so nothing that imported
 * `verificationSection` or `SnapshotStoryVerdict` from there has to change.
 *
 * ## What it is for
 *
 * AF12.1. The platform already holds a verdict on every story and the builder could not see it:
 * measured 3 Nov 2026, 264 stories across the ten agent domains carried a real verification state
 * while their pages said "not started", and the number of unverified stories with SOME criteria
 * claimed was ZERO. Nobody was half-using the file; they had not found it.
 */

/**
 * AF12.1. One story's verification verdict, as the verifier last recorded it.
 *
 * ## The defect this closes
 *
 * `buildVerificationService` writes a verdict into `student_tasks.verification_json` on EVERY
 * sync, for every story, verified or not. Measured in production on 3 Nov 2026, Sarbjit Kaur's
 * `marketing.STORY-000` carried `state: in_progress`, the sentence *"None of the 6 acceptance
 * criteria are marked as passing yet"*, `criteria_passed: 0 of 6`, and all six outstanding
 * criteria spelled out in full. Her story page said **not started**. She emailed to ask what was
 * happening, because the product told her nothing.
 *
 * She is not alone: **264 stories across the ten agent domains, and 347 platform-wide**, carry an
 * `in_progress` verdict while rendering as not started. And the count of unverified stories with
 * SOME criteria claimed is **zero**, which is the number that settles it. Nobody is half-using
 * `.colaberry/progress.json`; they have not found it. One builder worked it out alone (45 verified
 * against 10 silent) and the other six did not.
 *
 * So this is a reading problem, not a computing one. The verdict exists; the page cannot see it.
 *
 * ## WHY `checked_at` IS DELIBERATELY ABSENT
 *
 * The verdict carries a `checked_at` wall-clock that moves on every sync. This file takes part in
 * the change comparison, and this module's own header is explicit about what that means: a
 * wall-clock stamp here "turns every sync into a commit whose only difference is the time it was
 * written, which churns the builder's git history to say nothing and breaks the 'unchanged implies
 * no commit' guarantee (FR-026)".
 *
 * `commit_sha` is kept and `checked_at` is dropped, which is the honest pair anyway: the verdict
 * is ABOUT a commit, so the commit identifies it. Staleness is read from
 * `.colaberry/manifest.json`, the one file allowed to hold a clock, exactly as the rest of the
 * page already does.
 */
export interface SnapshotStoryVerdict {
  story_id: string;
  title: string;
  /** The task row's own status, which is the thing the portal renders today. */
  status: string;
  /**
   * The verifier's state, or `null` when it has never looked at this story.
   *
   * Null and `in_progress` are different facts and must stay distinguishable: "nobody has checked"
   * and "checked, and nothing is claimed" call for different things from the builder.
   */
  verification_state: string | null;
  criteria_passed: number | null;
  criteria_total: number | null;
  /** The verifier's own sentences, rendered verbatim rather than re-worded. */
  reasons: string[];
  /** The criteria not yet claimed, verbatim from the published plan. The actionable part. */
  outstanding: string[];
  /** The commit this verdict was reached against. Not a clock; it moves only when work moves. */
  commit_sha: string | null;
  verified: boolean;
}

/**
 * AF12.1. What the verifier already decided, put where the builder can read it.
 *
 * Deterministic: stories sorted by id, no clock, no randomness, same as everything else in this
 * file. `checked_at` is stripped on purpose (see `SnapshotStoryVerdict`).
 *
 * The `disclosure` is written for the page to render verbatim. 264 silent stories exist because
 * nobody could find `.colaberry/progress.json` from inside the product, so the file that fixes the
 * silence is also the file that names the remedy.
 */
export function verificationSection(
  stories: SnapshotStoryVerdict[] | undefined,
): Record<string, unknown> {
  if (!stories) {
    return {
      known: false,
      note:
        'This snapshot carries no story verification. That means the platform did not supply it, '
        + 'NOT that every story is clear. Say "not reported" in words; do not render zero '
        + 'outstanding.',
      stories: [],
    };
  }

  const sorted = [...stories].sort((a, b) => a.story_id.localeCompare(b.story_id));
  const checked = sorted.filter((s) => s.verification_state !== null);

  return {
    known: true,
    disclosure:
      'A criterion counts as passing when it is marked in `.colaberry/progress.json` in this '
      + 'repository. The verifier reads that file on every sync and records what it found. A story '
      + 'showing 0 of N is not a rejection: nothing has been claimed yet.',
    summary: {
      stories: sorted.length,
      checked: checked.length,
      verified: sorted.filter((s) => s.verified).length,
      // The headline number this whole section exists for.
      awaiting_criteria: checked.filter((s) => !s.verified && (s.criteria_passed ?? 0) === 0).length,
      outstanding_criteria: sorted.reduce((n, s) => n + s.outstanding.length, 0),
    },
    stories: sorted.map((s) => ({
      story_id: s.story_id,
      title: s.title,
      status: s.status,
      verification_state: s.verification_state,
      verified: s.verified,
      criteria_passed: s.criteria_passed,
      criteria_total: s.criteria_total,
      reasons: [...s.reasons],
      outstanding: [...s.outstanding],
      commit_sha: s.commit_sha,
    })),
  };
}
