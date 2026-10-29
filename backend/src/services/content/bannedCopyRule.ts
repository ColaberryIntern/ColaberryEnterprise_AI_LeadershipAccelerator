/**
 * The canonical banned-word rule, as pure data with no dependencies.
 *
 * ## Why this module exists
 *
 * The rule used to live in `bannedCopyScanner.ts`, which opens with
 * `import * as ts from 'typescript'` because it classifies occurrences with the real
 * TypeScript parser rather than a regex. That makes the whole module unimportable from the
 * runtime graph: `typescript` is a devDependency, so a runtime file importing the scanner
 * would reach for a package that is not installed in the production image.
 *
 * The consequence was a FORK, recorded at length in `explorerGrowth/explorerQuoteGuard.ts`:
 * the same rule, under the same id `tac-807-172-d-free`, was declared twice - once here in
 * the scanner's shape (`{ word, approvedAlternatives }`) and once in
 * `brandGovernanceSeed.ts` as a regex pattern - and NEITHER could be read by a pure module.
 * So `explorerQuoteGuard` and `explorerKnowledgeQuote` were written to take their rules as
 * an argument, with their author noting that picking one declaration or minting a third was
 * an open decision. `explorerQuoteGuard`'s own test enforces the ban, asserting that no
 * runtime file under `explorerGrowth/` imports anything named `bannedCopyScanner`.
 *
 * Wiring knowledge grounding into the draft stage forced that decision, because the quote
 * gate fails CLOSED: given zero rules it refuses every entry with `copy_rules_absent`, so
 * there is no "just leave it empty" option. This module resolves it the way that removes a
 * declaration instead of adding one - the data moves to a leaf with no imports, the scanner
 * re-exports it so every existing consumer is untouched, and a pure runtime module can now
 * read the same constant the lint is built on.
 *
 * ## Keep this file dependency-free
 *
 * Its whole value is that anything may import it. Adding an import here - especially one
 * that reaches a model, a config, or a compiler - would recreate the fork it just closed.
 */

/** A banned word and the authority that bans it. */
export interface BannedWordRule {
  id: string;
  /** Matched case-insensitively on word boundaries, so "freedom" and "freely" do not match. */
  word: string;
  reason: string;
  /** What to write instead. */
  approvedAlternatives: readonly string[];
}

/**
 * 40 TAC 807.172(d). The word is prohibited, not the offer: the offer is real, and is
 * stated with the approved phrasings rather than the banned word.
 */
export const FREE_WORD_RULE: BannedWordRule = {
  id: 'tac-807-172-d-free',
  word: 'free',
  reason: '40 TAC 807.172(d) (Texas Workforce Commission): training must not be advertised as "free".',
  approvedAlternatives: ['$0 to start', 'No card needed'],
};

/**
 * Every rule that governs copy put in front of a person.
 *
 * Exported as a set so a caller supplies "the rules" rather than naming one constant and
 * silently missing the next one added here. A caller must still branch on an empty set:
 * zero rules means UNCHECKED, never clean.
 */
export const BANNED_COPY_RULES: readonly BannedWordRule[] = [FREE_WORD_RULE];
