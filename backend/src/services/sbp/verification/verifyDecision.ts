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
import { ProgressFile, normaliseCriterion } from './progressContract';

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

/**
 * A criterion sitting in the progress file that matches nothing in the plan.
 *
 * ── WHY `asserted` IS A FIELD AND NOT A FILTER ──────────────────────────────
 *
 * `rejected_claims` only ever recorded the ones ticked `true`. That made the
 * signal blind in exactly the state that traps people: an agent that INVENTED
 * the criterion list — because nothing was seeded for it to copy — writes its
 * paraphrases in and leaves them all `false`, because it has not built anything
 * yet. Nothing is asserted, so nothing was recorded, and the verdict read
 * `0/N passed, rejected_claims: []` — byte-identical to a student who had not
 * opened their editor. Across 493 task rows in production every single
 * `rejected_claims` was empty, and this is why.
 *
 * The two states are genuinely different and must stay distinguishable:
 *
 *   asserted: true   "I have met a requirement you never set." A claim. It is
 *                    counted nowhere, and the student is told so.
 *   asserted: false  "The requirements in my file are not your requirements."
 *                    Not a claim at all — a DRIFTED FILE, discovered before the
 *                    student has ticked anything and while the fix is still
 *                    cheap. This is the early-warning case.
 *
 * Collapsing them into one count would report the drifted file as a burst of
 * false claims, which is both wrong about the student and useless for triage.
 */
export interface UnrecognisedCriterion {
  /** Verbatim as written in the file — never normalised. This is what a human must eyeball. */
  text: string;
  /** Was it ticked `true`? See above; the whole point is that `false` is also worth recording. */
  asserted: boolean;
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
   *
   * ASSERTED ONES ONLY, and deliberately unchanged. Everything already reading
   * this field — `verification_json`, `projectTreeDto`, the frontend DTO — means
   * "a tick we could not honour" by it, and widening it in place would silently
   * change what all of them display. `unrecognised_criteria` below is the
   * complete set; this stays the `asserted: true` subset of it.
   */
  rejected_claims: string[];
  /**
   * EVERY criterion in the file that matches no criterion in the plan, ticked or
   * not. See `UnrecognisedCriterion` for why the unticked half is the half that
   * mattered.
   *
   * A superset of `rejected_claims`: filtering this to `asserted` reproduces
   * that field exactly, which is the invariant the tests pin.
   */
  unrecognised_criteria: UnrecognisedCriterion[];
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
): StoryVerdict {
  const entry = progress?.stories.find((s) => s.id === spec.id) ?? null;

  const claimsByText = new Map<string, boolean>();
  const rejected: string[] = [];
  /**
   * Filled from INSIDE the unmatched branch below rather than by a second pass
   * over `entry.criteria`. A second pass would have to re-implement the match
   * test, and the match test is under active change — PR #1624 replaces the bare
   * `planTexts.has(...)` with a supersession-aware `resolveCriterionKey`. Two
   * copies of that rule would agree today and diverge the moment one of them was
   * improved, reporting criteria as unrecognised that the decision itself had
   * just matched. Recording where the branch is actually taken cannot drift.
   */
  const unrecognised: UnrecognisedCriterion[] = [];
  const planTexts = new Set(spec.acceptance.map(normaliseCriterion));
  for (const c of entry?.criteria ?? []) {
    const key = normaliseCriterion(c.text);
    if (!planTexts.has(key)) {
      // A claim about something the plan does not ask for. Counted nowhere.
      unrecognised.push({ text: c.text, asserted: c.passed === true });
      if (c.passed) rejected.push(c.text);
      continue;
    }
    // Two claims about the same criterion: the pessimistic one wins. A file
    // holding both `true` and `false` for one sentence is not evidence of a
    // pass, and resolving it optimistically would reward the ambiguity.
    claimsByText.set(key, (claimsByText.get(key) ?? true) && c.passed);
  }

  const criteria: CriterionOutcome[] = spec.acceptance.map((text) => ({
    text,
    passed: claimsByText.get(normaliseCriterion(text)) === true,
  }));
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
  /**
   * THE DRIFTED FILE, said out loud.
   *
   * Only the UNASSERTED remainder is described here; the asserted ones already
   * have their own sentence further down and saying it twice would read as two
   * separate problems. This branch is the one that used to produce nothing at
   * all: a file whose criteria are all somebody else's wording and all still
   * `false` scored `0/N` with an empty rejection list, and the student was told
   * "none are marked as passing yet" — true, unhelpful, and silent about the
   * only thing they needed to know, which is that the sentences in their file
   * are not the sentences being graded.
   */
  const unassertedCount = unrecognised.length - rejected.length;
  if (unassertedCount > 0) {
    reasons.push(
      `${unassertedCount} criterion/criteria in ${spec.id}'s entry do not match any acceptance criterion `
      + 'in the published plan, so ticking them would do nothing. Replace them with the exact wording from '
      + `this story's doc in \`docs/stories/${spec.id}.md\`, then tick the ones that genuinely pass.`,
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
    unrecognised_criteria: unrecognised,
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
): BuildVerdict {
  const planIds = new Set(stories.map((s) => s.id));
  const unknown = (progress?.stories ?? [])
    .map((s) => s.id)
    .filter((id) => !planIds.has(id));

  const verdicts = [...stories]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => decideStory(s, progress, commits));

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

/**
 * The drift signal, flattened for one log line.
 *
 * WHY IT IS SHAPED FOR A LOG AND NOT FOR A DASHBOARD. This fires on WORDING,
 * not on fraud: an agent that retyped a sentence, a plan republished with new
 * text, or a student who wrote criteria of their own. None of those deserves an
 * alert and none of them is urgent. What they do deserve is to be COUNTABLE —
 * "how many builds in this cohort have a drifted progress file" was an
 * unanswerable question before this, which is how twelve of thirteen went
 * unnoticed until somebody read the repos by hand.
 *
 * The two counts stay apart all the way out to the log. `asserted` is a student
 * claiming something we never asked for; `unasserted` is a file whose
 * requirements are not ours, found BEFORE anything was claimed. Only the second
 * one is invisible in every other signal the platform emits, so collapsing them
 * into a total would hide the number that is actually new.
 *
 * `samples` carries the unmatched sentences verbatim and nothing else — no
 * student name, no email, no repo contents. The project id is enough to find the
 * row, and a log stream is not where names belong.
 *
 * PURE. Returns null when there is nothing to say, so the caller cannot emit an
 * empty drift line on every clean sync.
 */
export interface UnrecognisedCriteriaSummary {
  /** Ticked `true` and matching nothing. Equals the total length of `rejected_claims`. */
  asserted: number;
  /** Present, unticked, and matching nothing — the state this signal was blind to. */
  unasserted: number;
  /** Story ids carrying at least one, unique and sorted. */
  stories_affected: string[];
  /** Up to MAX_DRIFT_SAMPLES unmatched sentences, each truncated. The diagnostic payload. */
  samples: string[];
}

/** Enough unmatched sentences to diagnose the drift, not enough to flood the stream. */
const MAX_DRIFT_SAMPLES = 5;
/** A criterion is a sentence. Anything longer than this is a paste accident, not a claim. */
const MAX_DRIFT_SAMPLE_CHARS = 200;

export function summariseUnrecognisedCriteria(
  verdicts: readonly StoryVerdict[],
): UnrecognisedCriteriaSummary | null {
  const affected = verdicts.filter((v) => (v.unrecognised_criteria?.length ?? 0) > 0);
  if (affected.length === 0) return null;

  let asserted = 0;
  let unasserted = 0;
  const samples: string[] = [];
  for (const v of affected) {
    for (const c of v.unrecognised_criteria) {
      if (c.asserted) asserted += 1;
      else unasserted += 1;
      if (samples.length < MAX_DRIFT_SAMPLES) samples.push(truncateSample(c.text));
    }
  }

  return {
    asserted,
    unasserted,
    stories_affected: [...new Set(affected.map((v) => v.story_id))].sort(),
    samples,
  };
}

function truncateSample(s: string): string {
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length <= MAX_DRIFT_SAMPLE_CHARS ? flat : `${flat.slice(0, MAX_DRIFT_SAMPLE_CHARS - 1)}…`;
}
