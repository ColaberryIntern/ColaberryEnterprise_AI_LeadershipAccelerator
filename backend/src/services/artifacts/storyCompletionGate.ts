/**
 * storyCompletionGate - PURE. May a story complete, given what its artifact contract asked for
 * and what the repository actually holds?
 *
 * No I/O, no clock, no randomness. Every rule here is a decision about WITHHOLDING someone's
 * completion, so each one is stated explicitly and tested in both directions.
 *
 * ---------------------------------------------------------------------------
 * THE DIRECTION EACH RULE IS STATED IN, AND WHY THEY ARE NOT ALL THE SAME
 * ---------------------------------------------------------------------------
 *
 * 1. NOTHING EARNED IS EVER REVOKED. A story already latched complete stays complete, whatever
 *    the repository says today. A student who deleted a file last week does not lose work they
 *    were credited for, and `markTaskVerifiedComplete` is first-write-wins underneath this
 *    anyway. This rule is checked FIRST, before the contract is even read, so no later rule can
 *    reach past it.
 *
 * 2. "I COULD NOT CHECK" NEVER RESOLVES WIDER THAN "THE CHECK SAYS NO". An unreadable repository
 *    tree leaves the story OPEN. Granting completion on absence of evidence would make a GitHub
 *    outage hand out completions, and completions are what the board is read from.
 *
 *    This is the OPPOSITE direction from `criterionPaths`, which deliberately enforces nothing
 *    against a student when the tree cannot be read, so a timeout never costs them a criterion.
 *    Both are the cautious direction; they differ because the costs are not symmetric. There,
 *    being wrong TAKES something a student has. Here, being wrong GIVES something nobody
 *    verified, and the whole workstream exists because "done" had stopped meaning anything. Rule
 *    1 is what keeps this from ever taking anything away.
 *
 * 3. ABSENT IS NOT EMPTY, carried all the way through from A0. A story with NO `artifacts` block
 *    completes exactly as it did before this gate existed: roughly 200 open stories predate the
 *    rule and 0 of 67 published plans carry a contract today, so any other reading would freeze
 *    every live board the moment this is switched on. A story declaring `[]` is refused, because
 *    it claims everything is handed over and hands over nothing.
 *
 * 4. A MISSING KEY IS NAMED, NOT SCOLDED. The reason says which key is outstanding and where it
 *    was expected, because the story stays open either way and the only question is whether the
 *    person can tell what to do next.
 *
 * 5. AN ARTIFACT THIS CHECK CANNOT SEE DOES NOT BLOCK. A platform artifact has no repo path by
 *    construction, so the repository check neither confirms nor denies it. Counting it against a
 *    story would make every story declaring one permanently incompletable by a verifier that
 *    cannot see it. It is named in the reason so a human knows it is still owed.
 */

import type { StoryArtifactMatchSummary } from './storyArtifactMatch';
import { SATISFYING_VERDICTS } from './storyArtifactMatch';

export type CompletionVerdict =
  /** Already latched complete. Nothing is re-decided. */
  | 'already_complete'
  /** No contract declared, so this gate has no opinion: behaves exactly as before A3. */
  | 'no_contract'
  /** Every key this check can see is handed over. */
  | 'artifacts_satisfied'
  /** At least one declared key is not handed over. */
  | 'artifacts_outstanding'
  /** The contract declares zero artifacts, which is a refusal rather than a pass. */
  | 'contract_empty'
  /** The tree could not be read, so nothing is asserted and nothing is granted. */
  | 'unverifiable';

export interface CompletionDecision {
  verdict: CompletionVerdict;
  /** Whether the artifact contract permits this story to complete on this sync. */
  may_complete: boolean;
  /** True only on the TRANSITION: it may complete now and was not complete before. */
  is_transition: boolean;
  /** Keys handed over, for the celebration to name. */
  satisfied: string[];
  /** Keys still owed, named. */
  outstanding: string[];
  /** Keys this check cannot speak to, named so a person knows they are still owed. */
  unverifiable: string[];
  /** One sentence, written for the person who owes the artifact. */
  reason: string;
}

export interface CompletionInputs {
  /** Whether the story is ALREADY latched complete. Rule 1. */
  alreadyComplete: boolean;
  /**
   * The story's contract as resolved by A0, or null when the story declares none.
   * An EMPTY ARRAY is meaningfully different from null: see rule 3.
   */
  artifactCount: number | null;
  /** The match against the repository, or null when there was no contract to match. */
  match: StoryArtifactMatchSummary | null;
}

const decision = (
  verdict: CompletionVerdict,
  may: boolean,
  reason: string,
  m: StoryArtifactMatchSummary | null,
  alreadyComplete: boolean,
): CompletionDecision => ({
  verdict,
  may_complete: may,
  is_transition: may && !alreadyComplete,
  satisfied: m ? m.satisfied : [],
  outstanding: m ? m.outstanding : [],
  unverifiable: m ? m.unverifiable : [],
  reason,
});

/**
 * Decide, for one story.
 *
 * `may_complete` answers "does the contract permit completion", NOT "is this story done": the
 * acceptance criteria are judged elsewhere and both must hold. `is_transition` is the signal the
 * celebration keys on, and it is false whenever the story was already complete, which is what
 * makes a re-sync unable to fire it twice.
 */
export function decideStoryCompletion(input: CompletionInputs): CompletionDecision {
  const { alreadyComplete, artifactCount, match } = input;

  // Rule 1, FIRST, so nothing below can reach past it.
  if (alreadyComplete) {
    return decision(
      'already_complete',
      true,
      'This story was already complete. Nothing earned is revoked, whatever the repository holds '
        + 'now.',
      match,
      true,
    );
  }

  // Rule 3, the absent half.
  if (artifactCount === null) {
    return decision(
      'no_contract',
      true,
      'This story declares no artifact contract, so the artifact check has no opinion on it and '
        + 'completion is decided exactly as it was before.',
      null,
      false,
    );
  }

  // Rule 3, the empty half. Checked before the tree, because a story declaring nothing is a
  // problem with the contract rather than with the repository.
  if (artifactCount === 0) {
    return decision(
      'contract_empty',
      false,
      'This story declares an empty artifact contract. An empty contract claims everything is '
        + 'handed over and hands over nothing, so it cannot complete. Declare what the story '
        + 'produces, or remove the block entirely.',
      match,
      false,
    );
  }

  // Rule 2.
  if (!match || match.tree_unreadable) {
    return decision(
      'unverifiable',
      false,
      'The repository could not be read on this sync, so whether the artifacts exist is unknown. '
        + 'The story stays open rather than completing on an unanswered question, and the next '
        + 'sync will check again. Nothing was recorded.',
      match,
      false,
    );
  }

  if (match.outstanding.length > 0) {
    // Rule 4: name them.
    const names = match.outstanding.join(', ');
    const where = match.matches
      .filter((x) => SATISFYING_VERDICTS.indexOf(x.verdict) === -1 && x.repo_path)
      .map((x) => `${x.key} at ${x.repo_path}`)
      .join('; ');
    return decision(
      'artifacts_outstanding',
      false,
      `Still owed: ${names}.${where ? ` Expected ${where}.` : ''}`,
      match,
      false,
    );
  }

  // Rule 5: an artifact handed over on the platform does not block, and is still named.
  const note = match.unverifiable.length
    ? ` ${match.unverifiable.join(', ')} ${match.unverifiable.length === 1 ? 'is' : 'are'} handed `
      + 'over on the platform, which this check cannot see either way, so a person still confirms it.'
    : '';
  return decision(
    'artifacts_satisfied',
    true,
    `Every artifact this check can see is handed over: ${match.satisfied.join(', ') || 'none declared in the repository'}.${note}`,
    match,
    false,
  );
}
