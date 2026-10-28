/**
 * explorerQuoteGuard — read marketing copy at the moment it would be QUOTED to
 * a person, and flag wording that an advertising rule forbids.
 *
 * WHY A FOURTH ENFORCEMENT POINT, WHEN THREE ALREADY EXIST. The frontend copy
 * ratchet reads source files. The backend outbound ratchet reads source files.
 * The system prompt is an instruction to a generator. None of the three can see
 * a string that arrives from the DATABASE at runtime, and that is exactly where
 * this problem lives: `explorer_content_assets` is synced from curriculum data
 * by `syncTimelineCards`, so an asset title is copy nobody wrote in this repo's
 * source and no source scanner will ever read.
 *
 * It is the same argument `explorerFactGuard` makes for dates and prices, and
 * this module deliberately copies its shape.
 *
 * THIS MODULE HOLDS NO RULES, AND THAT IS THE POINT.
 *
 * The repo already has one agreed declaration of the banned word, in
 * `services/content/bannedCopyScanner.ts`. A runtime file may NOT import that
 * module: it parses TypeScript with `import * as ts from 'typescript'`, a
 * devDependency, and `frontendCopyLint.test.ts` walks every file under
 * `backend/src` and fails the build if any of them imports it, so that a
 * production container never needs a compiler inside it. That guard is correct
 * and this module respects it rather than working around it.
 *
 * The wrong answer would be to retype the word here. A second list drifts from
 * the first, and then two matchers disagree about the same text - the exact
 * duplication `bannedWordOutboundCopy.test.ts` exists to refuse. So rules
 * arrive as an argument, the way `brandGovernance.checkContent` takes them, and
 * this module's own test imports the canonical rule (tests ARE allowed to) and
 * pins this guard's behaviour to it. Adding a second word changes no code here.
 *
 * IT FLAGS. IT DOES NOT FILTER. Measured on production on 2026-10-28: of the
 * 467 active, email-allowed assets, FIVE match the rule, and only ONE of those
 * five is a genuine violation - our own "...Preview" title. The other four are
 * a hyphenated technical term and three references to other companies' products
 * that genuinely cost nothing. A filter would therefore be wrong four times out
 * of five, and a check that is wrong four times out of five trains the person
 * reading it to dismiss all five. Flagging puts the decision in front of a
 * human instead, which is the only thing that can tell those two cases apart.
 *
 * THERE IS NO RUNTIME CALLER YET, AND THE REASON IS A FORK WORTH NAMING. The
 * repo declares this rule TWICE, under the same id `tac-807-172-d-free`:
 *
 *   - `content/bannedCopyScanner.ts` has it as `{ word, approvedAlternatives }`,
 *     which is the shape this guard takes - but that module cannot be imported
 *     from the runtime graph at all, for the compiler reason above.
 *   - `content/brandGovernanceSeed.ts` has it as `{ pattern: '\\b...\\b' }` with
 *     no alternatives, and value-imports `brandGovernanceService`, which reaches
 *     the models and therefore a database connection.
 *
 * So neither declaration can be read by a pure module today, and picking one,
 * or minting a third, is a decision about which library governs quoted copy -
 * which is open. Rules therefore arrive as an argument and the caller supplies
 * them. The test pins this guard to the first declaration so the behaviour is
 * anchored to a real rule rather than an invented one.
 *
 * ZERO RULES MEANS UNCHECKED, NEVER CLEAN. `rulesApplied` is on the result for
 * that reason. An empty rule set produces no flags, and a caller that reads
 * "no flags" as "approved" would be repeating the mistake recorded against
 * `resolveContentPageAccess`, which failed open and once marked all 153
 * Explorers CONVERTED. Callers must branch on `rulesApplied === 0`.
 */

/**
 * One advertising rule, shaped to match the repo's existing declaration so the
 * canonical constant can be passed straight in without adaptation.
 */
export interface QuoteCopyRule {
  /** Stable identifier, e.g. the statute the rule comes from. */
  id: string;
  /** Matched case-insensitively on word boundaries. */
  word: string;
  /** Why the word is forbidden, in words a reviewer can act on. */
  reason: string;
  /** What to write instead. */
  approvedAlternatives: readonly string[];
}

/** A named piece of text that would be put in front of a person. */
export interface QuotableField {
  /** Which part of the asset this is, e.g. 'title' or 'summary'. */
  field: string;
  /** The text itself. Null and undefined are tolerated and skipped. */
  text: string | null | undefined;
}

/** One rule firing on one field. */
export interface CopyFlag {
  ruleId: string;
  field: string;
  /** The matched word exactly as it was written, so casing is visible. */
  matched: string;
  /** Enough surrounding text to judge the usage without opening the record. */
  excerpt: string;
  reason: string;
  approvedAlternatives: readonly string[];
}

export interface QuoteGuardResult {
  flags: readonly CopyFlag[];
  /**
   * How many rules were applied. ZERO MEANS THIS CHECK DID NOT RUN - it does
   * NOT mean the copy is clean. Callers must treat 0 as unchecked.
   */
  rulesApplied: number;
}

/** Characters either side of a match to include in the excerpt. */
const EXCERPT_RADIUS = 40;

/**
 * Escape a rule's word for use inside a RegExp.
 *
 * Rules are data and may one day arrive from a database, so a word containing
 * a regex metacharacter must match literally rather than silently becoming a
 * pattern. `brandGovernance` treats an invalid regex in a rule as a BLOCKING
 * violation for the same reason; here the word is not a pattern at all, so
 * escaping is the whole answer.
 */
function escapeForRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary, case-insensitive matcher for one rule.
 *
 * Boundaries are what keep this honest: the rule's word must not fire inside a
 * longer word that means something else entirely. The canonical rule's own
 * comment says so, and the behaviour is pinned by this module's test.
 */
function matcherFor(rule: QuoteCopyRule): RegExp {
  return new RegExp(`\\b${escapeForRegExp(rule.word)}\\b`, 'gi');
}

/** A short window around a match, with runs of whitespace collapsed. */
function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS);
  const slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '...' : ''}${slice}${end < text.length ? '...' : ''}`;
}

/**
 * Scan every supplied field against every supplied rule.
 *
 * Pure, and deterministic in its ordering: fields in the order given, then
 * rules in the order given, then matches left to right. Running it twice on the
 * same input produces an identical result, which the test asserts, because a
 * flag list that reorders between runs cannot be compared across runs.
 */
export function scanQuotedCopy(
  fields: readonly QuotableField[],
  rules: readonly QuoteCopyRule[],
): QuoteGuardResult {
  const flags: CopyFlag[] = [];

  for (const { field, text } of fields) {
    if (typeof text !== 'string' || text.length === 0) continue;

    for (const rule of rules) {
      const matcher = matcherFor(rule);
      let match = matcher.exec(text);
      while (match !== null) {
        flags.push({
          ruleId: rule.id,
          field,
          matched: match[0],
          excerpt: excerptAround(text, match.index, match[0].length),
          reason: rule.reason,
          approvedAlternatives: rule.approvedAlternatives,
        });
        // A zero-length match would spin forever; a word-boundary pattern over
        // a non-empty word cannot produce one, but the guard costs one line.
        if (match[0].length === 0) matcher.lastIndex += 1;
        match = matcher.exec(text);
      }
    }
  }

  return { flags, rulesApplied: rules.length };
}

/**
 * Did this scan actually check anything?
 *
 * Exported so callers state the distinction explicitly rather than each one
 * remembering to compare a number against zero.
 */
export function wasChecked(result: QuoteGuardResult): boolean {
  return result.rulesApplied > 0;
}
