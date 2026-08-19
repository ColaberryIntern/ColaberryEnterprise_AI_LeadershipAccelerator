/**
 * verifyDecision — the completion rule, as pure functions.
 *
 * Given the STORED PLAN (the authority on what exists), the progress file the
 * agent wrote, and the commits actually in the repo, decide per story: what
 * state is it in, which criteria are outstanding, and which commit is the
 * evidence.
 *
 * NO I/O. No GitHub, no database, no clock. Every rule below is testable from a
 * literal — which matters, because these rules decide whether a student gets
 * credit and "we think it works" is not good enough for that.
 *
 * ── THE RULE (decided by Ali Muwwakkil, 2026-08-14) ─────────────────────────
 *
 *   DONE = every acceptance criterion ticked  AND  a commit that names the
 *   story and changes at least one file. Both required. Neither sufficient.
 *
 * Consequences taken deliberately:
 *   - Partial completion is a FIRST-CLASS state, not an error. Three of four
 *     criteria is `submitted`, and the outstanding one is named so the student
 *     knows what is left instead of wondering why nothing happened. Most
 *     students will sit in `submitted` for a while; that is the system working.
 *   - Ticked but never committed is NOT done. Committed but never ticked is NOT
 *     done. The two halves fail independently and are tested independently.
 *   - Tests passing in CI is explicitly NOT the bar today. See
 *     docs/BUILD_VERIFICATION_CONTRACT.md for where that would slot in.
 */
import { ProgressFile } from './progressContract';
import { normaliseCriterion, resolveCriterionKey } from './criterionIdentity';
import { missingRequiredPaths, RepoTreeContext } from './criterionPaths';

export type { RepoTreeContext } from './criterionPaths';

/**
 * What a human reads. Deliberately not the same vocabulary as
 * `student_tasks.status` — that column is the student's own planning claim,
 * this is the platform's conclusion about the evidence.
 */
export type StoryVerificationState = 'not_started' | 'in_progress' | 'submitted' | 'verified';

/** A story as the STORED PLAN has it. The plan is the only authority on ids and criteria. */
export interface PlanStorySpec {
  id: string;
  acceptance: string[];
}

/**
 * A commit, reduced to the facts the decision needs. Assembled by the reader;
 * `changed_files` is why the reader has to fetch commit detail rather than
 * trusting the list endpoint.
 */
export interface CommitFact {
  sha: string;
  /** FULL message, not just the subject — the `Story:` trailer lives on a later line. */
  message: string;
  changed_files: number;
  committed_at: string | null;
  author: string | null;
}

export interface CriterionOutcome {
  text: string;
  passed: boolean;
}

export interface StoryVerdict {
  story_id: string;
  state: StoryVerificationState;
  criteria_total: number;
  criteria_passed: number;
  /** The exact text of every criterion still outstanding. This is what the UI shows. */
  outstanding: string[];
  criteria: CriterionOutcome[];
  /** The commit that is the evidence, or null when there is none. */
  commit_sha: string | null;
  commit_at: string | null;
  /** Plain-language "why this is not verified yet". Empty once verified. */
  reasons: string[];
  /**
   * Claims in the progress file that match no criterion in the plan. Recorded
   * rather than silently dropped: a burst of these is either a stale plan or
   * somebody writing their own criteria, and both are worth seeing.
   */
  rejected_claims: string[];
}

export interface BuildVerdict {
  verdicts: StoryVerdict[];
  /** Story ids the progress file claims that the plan does not have. Never verified. */
  unknown_stories: string[];
  rollup: BuildRollup;
}

export interface BuildRollup {
  stories_total: number;
  stories_verified: number;
  stories_submitted: number;
  stories_in_progress: number;
  stories_not_started: number;
  criteria_total: number;
  criteria_passed: number;
  /** Commits in the read window that name a plan story and change a file. */
  qualifying_commits: number;
}

/**
 * A commit "names" a story when it carries a `Story: STORY-nnn` trailer, or —
 * falling back to what the definition-of-done text already shipping in every
 * student CLAUDE.md asks for — when the story id appears in the subject line.
 *
 * The fallback is not generosity. That instruction ("the commit message names
 * the story, e.g. `STORY-001: add the roster endpoint`") has been in every
 * rendered CLAUDE.md since the pipeline started writing them, so students are
 * already doing it. Refusing to honour it would mean the platform stopped
 * recognising work that followed the instructions it gave.
 *
 * Deliberately NOT matched anywhere else in the body: a commit that merely
 * mentions "this unblocks STORY-004" in a paragraph is not a commit for
 * STORY-004.
 */
export function commitNamesStory(message: string, storyId: string): boolean {
  if (!message || !storyId) return false;
  const id = escapeRegExp(storyId);
  const lines = message.split(/\r?\n/);

  // Trailer: a line of its own, `Story: STORY-001`.
  const trailer = new RegExp(`^\\s*story\\s*:\\s*${id}\\s*$`, 'i');
  if (lines.some((l) => trailer.test(l))) return true;

  // Fallback: the id in the subject line (the first line).
  const subject = lines[0] ?? '';
  return new RegExp(`\\b${id}\\b`, 'i').test(subject);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The commit that stands as evidence for a story, or null.
 *
 * Must change at least one file. A commit that changes nothing — an empty
 * commit, or a message-only amend — is a sentence, not work, and this loop is
 * supposed to be harder to satisfy than typing a sentence.
 *
 * When several qualify, the OLDEST wins. It is the moment the work first
 * landed, and pinning to the oldest keeps the evidence reference stable as the
 * student keeps committing — a reference that moved on every push would look
 * like new evidence to anything downstream of it.
 */
export function evidenceCommitFor(storyId: string, commits: CommitFact[]): CommitFact | null {
  const qualifying = commits.filter((c) => c.changed_files > 0 && commitNamesStory(c.message, storyId));
  if (qualifying.length === 0) return null;
  return [...qualifying].sort(compareByOldest)[0];
}

/** Oldest first. Undated commits sort last, then by sha so the order is total and stable. */
function compareByOldest(a: CommitFact, b: CommitFact): number {
  const ta = a.committed_at ? Date.parse(a.committed_at) : Number.POSITIVE_INFINITY;
  const tb = b.committed_at ? Date.parse(b.committed_at) : Number.POSITIVE_INFINITY;
  const na = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
  const nb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
  if (na !== nb) return na - nb;
  return a.sha.localeCompare(b.sha);
}

/**
 * Decide one story.
 *
 * THE PLAN IS THE AUTHORITY. The criteria list comes from the plan, never from
 * the file — so a progress file that adds a fifth criterion to a four-criterion
 * story cannot make itself easier to satisfy, and one that deletes three
 * criteria cannot either. The file only supplies the `passed` flags, matched
 * back onto the plan's criteria by normalised text.
 */
export function decideStory(
  spec: PlanStorySpec,
  progress: ProgressFile | null,
  commits: CommitFact[],
  tree: RepoTreeContext | null = null,
): StoryVerdict {
  const entry = progress?.stories.find((s) => s.id === spec.id) ?? null;

  const claimsByText = new Map<string, boolean>();
  const rejected: string[] = [];
  const planTexts = new Set(spec.acceptance.map(normaliseCriterion));
  for (const c of entry?.criteria ?? []) {
    // `resolveCriterionKey`, not a bare normalise, so a claim written against a
    // wording WE have since rewritten still lands on the criterion it was about.
    // Nine students' committed files carry the pre-rewording text of STORY-000's
    // C3 and C4, on repos we frequently cannot push to and therefore can never
    // correct — matching on today's text alone would reject every one of those
    // ticks and drop verified stories back to `submitted`. See criterionIdentity.
    const key = resolveCriterionKey(c.text, planTexts);
    if (!key) {
      // A claim about something the plan does not ask for. Counted nowhere.
      if (c.passed) rejected.push(c.text);
      continue;
    }
    // Two claims about the same criterion: the pessimistic one wins. A file
    // holding both `true` and `false` for one sentence is not evidence of a
    // pass, and resolving it optimistically would reward the ambiguity. This now
    // also covers a file carrying BOTH the old and new wording of one criterion,
    // which is what a half-repaired file looks like.
    claimsByText.set(key, (claimsByText.get(key) ?? true) && c.passed);
  }

  /**
   * THE PATH CHECK. A criterion that names a repo path is not satisfied while
   * that path is absent from the tree, however honestly it was ticked.
   *
   * Applied AFTER the claim is matched, never instead of it: a criterion blocked
   * this way is `outstanding`, not a `rejected_claim`. The student's text
   * matched the plan perfectly — the file simply is not there — and filing it as
   * a rejected claim would report a wording problem that does not exist.
   *
   * Fails open in every direction that is not a plain fact: no tree read means
   * no enforcement, and a file the platform owed this particular student is
   * never charged to them. See criterionPaths.blameForMissing.
   */
  const missingByText = new Map<string, string[]>();
  for (const text of spec.acceptance) {
    const missing = missingRequiredPaths(text, tree);
    if (missing.length > 0) missingByText.set(normaliseCriterion(text), missing);
  }

  const criteria: CriterionOutcome[] = spec.acceptance.map((text) => {
    const key = normaliseCriterion(text);
    return {
      text,
      passed: claimsByText.get(key) === true && !missingByText.has(key),
    };
  });
  const passedCount = criteria.filter((c) => c.passed).length;
  const outstanding = criteria.filter((c) => !c.passed).map((c) => c.text);

  const commit = evidenceCommitFor(spec.id, commits);
  const reasons: string[] = [];

  // A story the plan gave no acceptance criteria can never be verified by this
  // loop. Vacuous truth ("all zero criteria pass") would hand out credit for a
  // planning gap, so it is refused explicitly and the gap is named.
  const hasCriteria = criteria.length > 0;
  if (!hasCriteria) {
    reasons.push('This story has no acceptance criteria in the published plan, so there is nothing to verify against.');
  }
  const allPassed = hasCriteria && passedCount === criteria.length;

  if (hasCriteria && !allPassed) {
    reasons.push(
      passedCount === 0
        ? `None of the ${criteria.length} acceptance criteria are marked as passing yet.`
        : `${passedCount} of ${criteria.length} acceptance criteria are marked as passing. Outstanding: ${outstanding.join('; ')}`,
    );
  }
  if (!commit) {
    reasons.push(
      `No commit in the repo names ${spec.id} and changes a file. `
      + `Commit your work with a \`Story: ${spec.id}\` trailer (or ${spec.id} in the subject line) and push.`,
    );
  }
  if (rejected.length > 0) {
    reasons.push(
      `${rejected.length} claim(s) in the progress file do not match any acceptance criterion in the published plan and were ignored.`,
    );
  }
  // Named individually, because "a criterion is outstanding" is not an
  // actionable message when the student believes they finished it. The file is
  // the whole of the problem, so the file is what the sentence says.
  for (const [, missing] of missingByText) {
    reasons.push(
      `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not in your repo, so the `
      + 'criterion that requires it cannot pass yet. Add the file, commit it, and push — you can '
      + 'download a fresh copy from the workspace panel in the portal.',
    );
  }

  let state: StoryVerificationState;
  if (allPassed && commit) state = 'verified';
  else if (passedCount > 0) state = 'submitted';
  else if (commit || entry) state = 'in_progress';
  else state = 'not_started';

  return {
    story_id: spec.id,
    state,
    criteria_total: criteria.length,
    criteria_passed: passedCount,
    outstanding,
    criteria,
    commit_sha: commit?.sha ?? null,
    commit_at: commit?.committed_at ?? null,
    reasons: state === 'verified' ? [] : reasons,
    rejected_claims: rejected,
  };
}

/**
 * Decide the whole build. `progress` is null when the file was missing or
 * rejected — in which case every story is judged on its commits alone, which by
 * the rule above can never reach `verified`. That is the correct behaviour for
 * an unreadable file: no credit is awarded, and no credit already awarded is
 * taken away (revocation is not something this loop does at all).
 */
export function decideBuild(
  stories: PlanStorySpec[],
  progress: ProgressFile | null,
  commits: CommitFact[],
  tree: RepoTreeContext | null = null,
): BuildVerdict {
  const planIds = new Set(stories.map((s) => s.id));
  const unknown = (progress?.stories ?? [])
    .map((s) => s.id)
    .filter((id) => !planIds.has(id));

  const verdicts = [...stories]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => decideStory(s, progress, commits, tree));

  const qualifying = commits.filter(
    (c) => c.changed_files > 0 && stories.some((s) => commitNamesStory(c.message, s.id)),
  ).length;

  return {
    verdicts,
    unknown_stories: [...new Set(unknown)],
    rollup: {
      stories_total: verdicts.length,
      stories_verified: verdicts.filter((v) => v.state === 'verified').length,
      stories_submitted: verdicts.filter((v) => v.state === 'submitted').length,
      stories_in_progress: verdicts.filter((v) => v.state === 'in_progress').length,
      stories_not_started: verdicts.filter((v) => v.state === 'not_started').length,
      criteria_total: verdicts.reduce((n, v) => n + v.criteria_total, 0),
      criteria_passed: verdicts.reduce((n, v) => n + v.criteria_passed, 0),
      qualifying_commits: qualifying,
    },
  };
}
