/**
 * The honesty guard for STORY-000, defined once and enforced by both the prompt
 * tests and the repo-doc tests.
 *
 * WHY IT IS A POSITIVE ASSERTION RATHER THAN A BLACKLIST. The guard this
 * replaced was two banned phrases — `/tick (them |the |all )*all\b/` and
 * `/mark (them |all )*all (as )?pass/`. A repair-flavoured rewrite saying
 * "bring all five criteria to true" or "complete each Done means line" walks
 * straight through both of them, and those are precisely the phrasings a
 * repair-flavoured prompt reaches for. A blacklist can only ever forbid the
 * sentences somebody already thought of.
 *
 * So the rule is inverted. FIND every instruction that tells the agent to claim
 * a criterion, then require each one to carry a truth condition in the same
 * breath. The blacklist survives as a second net, widened with the two
 * phrasings above.
 *
 * AND THE FLOOR MATTERS AS MUCH AS THE RULE. A "for each match, assert X" loop
 * over an empty match list is a green test that proves nothing — this
 * workstream shipped exactly that failure earlier today, when a constant pinned
 * by index moved underneath the assertion. `claimInstructions` is therefore
 * always asserted to have found some, so a vocabulary change that stops the
 * matcher matching fails loudly instead of passing silently.
 *
 * Not a suite: jest's `testMatch` is `**\/__tests__\/**\/*.test.ts`, so this
 * module is importable from the suites beside it without being collected as one.
 */

/**
 * Instruction-sized units of a markdown document.
 *
 * Blank-line separated blocks, then split again at each bullet, because the two
 * documents wrap differently and a line is the wrong unit for both. The prompt
 * emits one long unwrapped line per bullet, so consecutive bullets would share a
 * unit and a qualifier on one could excuse the next. `docs/stories/STORY-000.md`
 * hard-wraps its own prose, so a single sentence spans several lines and its
 * truth condition routinely lands on a different one from its verb.
 */
export function instructionUnits(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .flatMap((block) => block.split(/\n(?=\s*- )/))
    .map((unit) => unit.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * A unit that tells the agent to CLAIM a criterion: a claiming verb followed,
 * within a clause, by the thing being claimed. Deliberately wider than the
 * vocabulary the documents use today — "complete", "set", "flip", "bring" and
 * "satisfy" are all here so a future rewrite that switches words is caught
 * rather than waved through.
 */
const CLAIM_INSTRUCTION =
  /\b(?:tick|mark|complete|set|flip|bring|satisf)\w*\b[^\n]{0,90}\b(?:criteri\w+|Done means|lines?|boxe?s?|passed|true)\b/i;

/**
 * What makes a claim honest: the instruction says the thing has to be TRUE, or
 * says what happens to the lines that are not.
 *
 * Every alternative here is a truth condition. None of them is a synonym for
 * "finish it" — "finishing" is exactly the word that turns into "tick them
 * all", so it earns no credit.
 */
export const TRUTH_CONDITION =
  /genuinely (?:true|passes|pass)|actually (?:true|satisfied)|true in the repo|when it is (?:actually )?true|is not true|not true yet|unticked|tick themselves|not permission|a claim, not proof|does not inherit|already there alone|only for a line you have just made true/i;

/**
 * Sentences that read as blanket approval, whatever else surrounds them. The
 * second net: a unit can carry a truth condition somewhere and still contain
 * one of these, and one of these is enough on its own.
 */
export const BLANKET_APPROVAL: readonly RegExp[] = [
  /tick (?:them |the |all )*all\b/i,
  /tick everything/i,
  /mark (?:them |all )*all (?:as )?pass/i,
  /mark everything (?:as )?(?:passed|done|complete)/i,
  // The two the old blacklist let through, which a repair prompt reaches for.
  /bring (?:all|every|each) [^\n]{0,40}\bto true\b/i,
  /complete (?:all|every|each) [^\n]{0,30}\b(?:Done means|criteri\w+|lines?)\b/i,
  /set (?:every|all) (?:criteri\w+|lines?|boxe?s?) to (?:true|passed)/i,
  /flip (?:every|all) [^\n]{0,30}\bto true\b/i,
  /assume (?:it|they|the criteri\w+) (?:is|are) (?:true|passed|met)/i,
] as const;

/** Every unit of `text` that instructs the agent to claim a criterion. */
export function claimInstructions(text: string): string[] {
  return instructionUnits(text).filter((u) => CLAIM_INSTRUCTION.test(u));
}

/**
 * Assert the honesty rule over one document.
 *
 * `minInstructions` is the anti-vacuity floor: below it, the matcher has
 * stopped finding the sentences it was written for and the per-unit loop below
 * is asserting nothing. Both documents carry five or more today.
 */
export function expectEveryClaimIsConditional(text: string, minInstructions = 4): void {
  const claims = claimInstructions(text);

  expect(claims.length).toBeGreaterThanOrEqual(minInstructions);

  for (const unit of claims) {
    expect({ unit, carriesTruthCondition: TRUTH_CONDITION.test(unit) })
      .toEqual({ unit, carriesTruthCondition: true });
  }

  for (const re of BLANKET_APPROVAL) {
    const offenders = instructionUnits(text).filter((u) => re.test(u));
    expect({ pattern: String(re), offenders }).toEqual({ pattern: String(re), offenders: [] });
  }
}
