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
 * A banned PATTERN, for what a word boundary cannot express.
 *
 * An em dash is not a word. `\bX\b` around a punctuation character matches nothing at all,
 * because a boundary is a transition between a word character and a non-word character and
 * there is no word character on either side to transition from. So a rule about typography
 * cannot be written in the shape above - not awkwardly, but at all - and that is the whole
 * reason this second shape exists.
 *
 * Deliberately a SEPARATE interface rather than an optional `word`. Making `word` optional
 * would typecheck at every existing call site while changing what `rule.word` means at three
 * of them, and one of those three is `explorerQuoteGuard.ts`, which builds its own
 * `\b${rule.word}\b` - see the warning on `BANNED_COPY_RULES` below. A separate type makes the
 * compiler, rather than a reviewer, the thing that notices.
 */
export interface BannedPatternRule {
  id: string;
  /**
   * Regex SOURCE, compiled with `gu`. The `u` flag is not optional: it is what makes
   * `\p{...}` property escapes available and what makes a surrogate pair count as one
   * character rather than two halves.
   */
  pattern: string;
  /** What the pattern matches, in words, so a failure message reads as a sentence. */
  matches: string;
  reason: string;
  /** What to write instead. */
  approvedAlternatives: readonly string[];
}

export type BannedCopyRule = BannedWordRule | BannedPatternRule;

export function isPatternRule(rule: BannedCopyRule): rule is BannedPatternRule {
  return typeof (rule as BannedPatternRule).pattern === 'string';
}

/**
 * The ONE place a rule becomes a regex.
 *
 * It lives in this leaf because three modules were building the same expression from the same
 * field and none could see the others: `bannedCopyMatch.ts` and `bannedCopyScanner.ts` each
 * held a byte-identical private `wordRegex`, and `explorerQuoteGuard.ts` holds a third. Two
 * copies of a matcher drifting apart is the failure `bannedCopyMatch.ts`'s own header spends a
 * paragraph on, and it had already happened here in the most invisible way possible: by
 * duplication rather than by edit.
 *
 * Built FRESH on every call. These carry `/g`, and a shared `lastIndex` makes a result depend
 * on call order, which reads as an intermittently passing guard.
 *
 * Case: a word is matched case-insensitively, a pattern is not. `gi` on a pattern would be a
 * silent widening for anything that ever used a letter in a character class, and typography
 * has no case to fold.
 */
export function ruleRegex(rule: BannedCopyRule): RegExp {
  if (isPatternRule(rule)) return new RegExp(rule.pattern, 'gu');
  // Boundaries are what keep "freedom", "freely", "freelance" and "freeTier" out: in
  // "freeTier" there is no boundary between "free" and "T", both being word characters.
  return new RegExp(`\\b${rule.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
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
 *
 * ## WORD RULES ONLY. Adding a pattern rule here breaks a guard silently.
 *
 * The type says `BannedWordRule[]`, and that is load-bearing rather than incidental.
 * `explorerGrowth/explorerQuoteGuard.ts:133` consumes this set and builds its own
 * `\b${escapeForRegExp(rule.word)}\b` instead of calling `ruleRegex`. Handed a pattern rule it
 * would compile `\bundefined\b`, match nothing, and report every quote clean - a gate that
 * cannot fail, which is indistinguishable from a gate that passed. The typography rules below
 * are therefore a SEPARATE set, not an addition to this one, and `bannedCopyRule.test.ts`
 * asserts that this set contains no pattern rule so the trap is caught by a test and not by a
 * production surface.
 *
 * That separation is also the right call on the merits. This set governs what a MODEL writes
 * into outbound email, where an em dash is already handled by the brand governance preflight
 * and where refusing a draft over one would discard compliant mail. The set below governs what
 * a HUMAN commits to frontend source. Same machinery, different surfaces, different
 * consequence for a breach.
 */
export const BANNED_COPY_RULES: readonly BannedWordRule[] = [FREE_WORD_RULE];

/**
 * An em dash or an en dash in frontend copy.
 *
 * Both, not just the em dash. The en dash is the substitution anybody reaches for first when
 * told to stop using em dashes, so a rule that bans one and permits the other bans neither in
 * practice - it relocates the habit by one code point.
 *
 * WHAT TO WRITE INSTEAD, and why there is no automatic rewrite: an em dash in English is doing
 * one of three different jobs - a parenthetical (commas or brackets), a break in thought (a
 * full stop or a colon), or a range (the word "to"). Only a human knows which, so this rule
 * reports and never repairs.
 *
 * Written as escapes rather than as the characters themselves so that the rule is legible in a
 * diff, in a terminal with a narrow font, and in a review comment, where an em dash and an en
 * dash and a hyphen are three glyphs that are very nearly the same picture.
 */
export const DASH_RULE: BannedPatternRule = {
  id: 'house-style-em-en-dash',
  pattern: '[\\u2013\\u2014]',
  matches: 'an em dash or an en dash',
  reason: 'House style: product copy uses a comma, a full stop, a colon or the word "to".',
  approvedAlternatives: [', ', '. ', ': ', ' to '],
};

/**
 * An emoji in frontend copy.
 *
 * `\p{Extended_Pictographic}` rather than a hand-listed set of ranges. A list is the usual
 * approach and it is the wrong one here: it is a parser with holes, and a hole is a silent
 * pass. The property is Unicode's own answer to "is this a picture", so it covers the next
 * emoji too, and the `u` flag makes a surrogate pair one match instead of two halves.
 *
 * THREE EXCLUSIONS, and they are the only ones. Copyright, registered and trademark carry the
 * property because they are rendered as emoji on some platforms, but in this repo they appear
 * in footers and legal lines where they are typography rather than decoration. Excluding them
 * by code point keeps the exclusion visible and narrow; the alternative, loosening the
 * property, would quietly exempt a few hundred characters nobody enumerated.
 *
 * Note what this does NOT catch, so the gap is on the record rather than assumed away: the
 * check mark U+2713, the arrow U+2192 and the bullet U+2022 are not Extended_Pictographic.
 * They are dingbats and punctuation, they are already used as real UI glyphs in this tree, and
 * banning them is a separate decision from banning emoji.
 */
export const EMOJI_RULE: BannedPatternRule = {
  id: 'house-style-emoji',
  pattern: '(?![\\u00A9\\u00AE\\u2122])\\p{Extended_Pictographic}',
  matches: 'an emoji',
  reason: 'House style: product copy carries no emoji. An icon component is the supported way to show a glyph.',
  approvedAlternatives: ['an icon component', 'nothing at all'],
};

/**
 * The same dash, written as an HTML character reference.
 *
 * ## This is not a corner case. It was the hole the rule above shipped with.
 *
 * Measured 2026-11-13 over the same scope: `&mdash;` appears **73 times** in frontend source,
 * and `DASH_RULE` catches none of them, because the source text contains the seven ASCII
 * characters `&mdash;` and not the character U+2014. A gate that bans a glyph but not its
 * escape does not ban the glyph; it bans one spelling of it and reports a number better than
 * the truth, which is the specific failure `frontendCopyBaseline.ts` was written to stop.
 *
 * ## Why this set is COMPLETE, which is the only reason it is allowed to exist
 *
 * A character reference for one code point has a closed set of spellings: the named form, the
 * decimal form and the hexadecimal form, each permitting leading zeros, with `x` in either
 * case. All of them are enumerated below for both dashes. There is no fourth spelling, so
 * this rule has no hole - unlike a hand-listed range, which is a parser with holes and where
 * a hole is a silent pass.
 *
 * A reference must carry its semicolon to be one in JSX, so the trailing `;` is required
 * rather than optional.
 *
 * ## What this rule does NOT cover, stated rather than assumed away
 *
 * EMOJI written as a numeric character reference. Measured on the same day: 44 files carry a
 * numeric reference, and a minority of those resolve to an emoji - `&#9654;` x11 (a right
 * triangle), `&#128077;` and `&#128078;` (thumbs), `&#11088;` (a star), `&#x2705;`,
 * `&#x1F4E5;`, `&#x1F3A7;` and a dozen others at one apiece. They are NOT caught here.
 *
 * The reason is the completeness rule above turned on itself: emoji are an open set of code
 * points, so "a numeric reference to an emoji" cannot be written as a regex without either
 * enumerating ranges (incomplete) or banning every numeric reference (which would also ban
 * `&#10003;`, a check mark, and `&#8594;`, an arrow - two glyphs `EMOJI_RULE` deliberately
 * permits as literals, so banning their escaped form would be incoherent). Deciding it
 * properly means resolving the reference to a code point and re-asking the literal rule,
 * which is a mechanism this module does not have and should not grow in passing.
 *
 * So it is a named gap with a measured size, not an oversight. The eleven `&#9654;` are the
 * ones worth fixing first; one of them, on the portal's own watch button, is fixed in the
 * change that added this rule.
 */
export const ESCAPED_DASH_RULE: BannedPatternRule = {
  id: 'house-style-escaped-dash',
  pattern: '&(?:mdash|ndash|#0*8212|#0*8211|#[xX]0*2014|#[xX]0*2013);',
  matches: 'an em dash or an en dash written as an HTML character reference',
  reason: 'House style: product copy uses a comma, a full stop, a colon or the word "to". Escaping the dash does not make it a different dash.',
  approvedAlternatives: [', ', '. ', ': ', ' to '],
};

/**
 * The typography rules that govern FRONTEND SOURCE, enforced by
 * `frontendTypographyLint.test.ts` against a shrink-only baseline.
 *
 * Kept apart from `BANNED_COPY_RULES` on purpose. See the warning on that constant: one
 * consumer of it builds its own word regex and would fail open on a pattern rule.
 */
export const FRONTEND_TYPOGRAPHY_RULES: readonly BannedPatternRule[] = [
  DASH_RULE,
  ESCAPED_DASH_RULE,
  EMOJI_RULE,
];
