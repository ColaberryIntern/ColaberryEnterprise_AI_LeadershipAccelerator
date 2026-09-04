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
): DraftRevisionInput => ({
  question_key: key,
  track_id: TRACK,
  blueprint_version: BP,
  domain_id: domain,
  objective_id: objective,
  scenario_family: scenario,
  stem,
  options: options.map(([k, text]) => ({ key: k, text })),
  correct_keys: correct,
  select_count: correct.length,
  rationale,
  distractor_rationales: distractors,
  difficulty,
  author: 'colaberry',
});
