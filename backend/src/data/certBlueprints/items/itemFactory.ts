import { DraftRevisionInput } from '../../../services/certPrep/certQuestionBankService';

/**
 * The shared constructor for every authored CCAR-F item.
 *
 * It was previously inlined in `ccarFoundationsItems.ts`, which was fine for a
 * twenty-item sample and stops being fine at a hundred and fifty: the bank now
 * lives one file per domain so that adding items to Prompt Engineering does not
 * mean opening the same file as Claude Code Configuration, and so the empty
 * domains are visible as short files rather than hidden inside a long one.
 *
 * PROVENANCE, restated here because it is the rule that matters most in this
 * directory: every item is written for Colaberry against the PUBLISHED CCAR-F
 * blueprint — five domains, thirty task statements, six named scenarios. None
 * derives from any purchased or third-party question bank. No wording,
 * explanation or answer key has been copied, paraphrased or reworked from
 * another product. If an item cannot be traced to the public blueprint and our
 * own labs, it does not belong here.
 *
 * DOMAIN NUMBERING IS ANTHROPIC'S. D2 is Tool Design & MCP (18%) and D3 is
 * Claude Code Configuration (20%), so D2 carries LESS weight than D3. Community
 * guides imply descending-weight order and get this backwards. Check the label,
 * never the digit.
 *
 * EVERY ITEM SHIPS AS A DRAFT. `createDraftRevision` refuses to write anything
 * else and `setReviewStatus` refuses to approve without a named reviewer.
 * Authoring an item does not make it servable, and it must not.
 */

export const TRACK = 'ccar-f';
export const BP = '1.0-2026-07';

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * On difficulty, so the labels mean the same thing across five files:
 *   easy   — one option is right and the others are recognisably wrong.
 *   medium — the wrong options are things a half-prepared candidate believes.
 *   hard   — at least one distractor is defensible and a competent practitioner
 *            would seriously consider it; the key is better, not merely correct.
 * An item whose distractors nobody would pick teaches nothing and measures
 * nothing, which is why `dead distractor` is a flag in the admin statistics.
 */
/**
 * WHERE THE CORRECT ANSWER SITS IS DECIDED HERE, NOT BY THE AUTHOR.
 *
 * Authored as written, this bank keyed 110 of 150 items to B. Per domain it ran
 * as high as 83%, and on a 60-item mock drawn to blueprint demand an always-B
 * candidate scored 43.9/60 = 73% against a 72% pass mark. A student who knew
 * nothing passed. Nothing failed and no test caught it: the bank checked that
 * the correct option was not the LONGEST (that cue was found and fixed during
 * authoring, 140/150 down to 38%) and never checked where it SAT.
 *
 * The fix is not to re-letter 150 items by hand, because the next author would
 * reintroduce the same bias the same way - writing the key first and the
 * distractors after it is a natural habit, not a mistake anyone repeats
 * deliberately. So position is assigned here, from the question key, and the
 * authored order in the domain files carries no meaning beyond "the key is
 * whichever option the correct_keys argument names".
 *
 * Derived from the QUESTION KEY rather than the item's index, so it is stable:
 * inserting an item never moves anybody else's answer, which matters because
 * the database holds a seeded copy and a re-seed has to be a no-op. FNV-1a is
 * used for the same reason - a fixed, dependency-free hash whose output cannot
 * drift between Node versions the way a language-level hash might.
 *
 * Multi-select items are left in authored order: "which position holds the
 * answer" is not a question with one answer when two options are correct, and
 * there are three of them in the bank.
 */
const fnv1a = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

/**
 * Move the single correct option to a key-derived position, keeping the
 * distractors in their authored relative order so an author's deliberate
 * sequencing survives everything except the position of the key itself.
 */
export const assignAnswerPosition = (
  questionKey: string,
  options: [string, string][],
  correct: string[],
): { options: [string, string][]; correct: string[]; remap: Record<string, string> } => {
  const letters = options.map(([k]) => k);
  if (correct.length !== 1) {
    return { options, correct, remap: Object.fromEntries(letters.map((k) => [k, k])) };
  }
  const target = fnv1a(questionKey) % options.length;
  const correctIdx = options.findIndex(([k]) => k === correct[0]);
  if (correctIdx < 0) return { options, correct, remap: Object.fromEntries(letters.map((k) => [k, k])) };

  const distractors = options.filter((_, i) => i !== correctIdx);
  const reordered: [string, string][] = [];
  let d = 0;
  for (let slot = 0; slot < options.length; slot += 1) {
    reordered.push(slot === target ? options[correctIdx] : distractors[d++]);
  }

  // Re-letter in place: slot 0 is always 'A' whatever text landed there.
  const remap: Record<string, string> = {};
  const relettered = reordered.map(([oldKey, text], i) => {
    remap[oldKey] = letters[i];
    return [letters[i], text] as [string, string];
  });
  return { options: relettered, correct: [letters[target]], remap };
};

export const item = (
  key: string,
  domain: string,
  objective: string,
  scenario: string,
  difficulty: Difficulty,
  stem: string,
  options: [string, string][],
  correct: string[],
  rationale: string,
  distractors: Record<string, string>,
): DraftRevisionInput => {
  const placed = assignAnswerPosition(key, options, correct);
  // The distractor rationales are keyed by option letter, so they move with the
  // options. Missing this is how a rebalance silently attaches the explanation
  // for one wrong answer to a different wrong answer.
  const movedRationales: Record<string, string> = {};
  for (const [oldKey, text] of Object.entries(distractors)) {
    movedRationales[placed.remap[oldKey] ?? oldKey] = text;
  }
  return {
    question_key: key,
    track_id: TRACK,
    blueprint_version: BP,
    domain_id: domain,
    objective_id: objective,
    scenario_family: scenario,
    stem,
    options: placed.options.map(([k, text]) => ({ key: k, text })),
    correct_keys: placed.correct,
    select_count: placed.correct.length,
    rationale,
    distractor_rationales: movedRationales,
    difficulty,
    author: 'colaberry',
  };
};
