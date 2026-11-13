import { BANNED_COPY_RULES, FREE_WORD_RULE, ruleRegex, type BannedWordRule } from './bannedCopyRule';

/**
 * The banned-copy MATCHER: the one place in the product that decides whether a piece of text
 * breaches a copy rule.
 *
 * ## Why this is its own module
 *
 * It began inside `explorerGrowth/drafts/draftCopyGuards.ts`, which was the right home while
 * the Explorer draft renderer was the only thing screening copy. It no longer is:
 * `aiMessageService` composes campaign email, SMS and voice copy for every campaign in the
 * product, and needs the same decision.
 *
 * The alternative was to let the campaign service import the Explorer drafts module, or to
 * write a second matcher next to it. Both are worse. A general service depending on one
 * subsystem's internals is backwards, and a second matcher is the specific failure that
 * `bannedWordOutboundCopy.test.ts` warns about in its own header: "a second matcher would
 * drift from the first and the two would disagree about the same file."
 *
 * That risk is not hypothetical here. The idiom exemption below was added on 2026-11-02 after
 * a measurement showed 18 of 18 Explorer draft rejections were a false positive. A fresh
 * regex written for the campaign path would not carry it, so screening a second path with a
 * second matcher would have reintroduced that exact bug somewhere new, in the same week it
 * was fixed. One matcher, one definition of a breach.
 *
 * ## Rules are an argument, and an empty set is a programming error
 *
 * The canonical rules live in `bannedCopyRule.ts`, a dependency-less leaf, precisely so a
 * runtime module can read them. `bannedCopyScanner.ts` must NOT be imported here: it opens
 * with `import * as ts from 'typescript'`, a devDependency absent from the production image.
 *
 * An empty rule set throws rather than returning "clean". Returning clean would be a silent
 * pass, which is the failure this subsystem keeps producing; returning "everything is unsafe"
 * would take a feature down over a wiring mistake. A throw is neither, and names the bug.
 *
 * ## This file deliberately contains no literal banned word
 *
 * `bannedWordOutboundCopy.test.ts` holds a shrink-only per-file ratchet in which a file absent
 * from the baseline must score zero, and in which a NEW occurrence fails. Writing an example
 * out in full here would fail that ratchet while passing every behavioural test in this
 * module. Examples are therefore described rather than quoted, and the words themselves are
 * read off the rules at match time.
 */

/** Thrown when a guard is called with no rules, which can only be a wiring mistake. */
export class CopyRulesAbsentError extends Error {
  readonly error_class = 'ContractViolation';

  constructor(fn: string) {
    super(
      `${fn} called with an empty rule set. Zero rules means UNCHECKED, never clean. `
        + 'Pass BANNED_COPY_RULES from services/content/bannedCopyRule.',
    );
    this.name = 'CopyRulesAbsentError';
  }
}

export function assertRules(rules: readonly BannedWordRule[], fn: string): void {
  if (rules.length === 0) throw new CopyRulesAbsentError(fn);
}

/**
 * The regex comes from `ruleRegex` in `bannedCopyRule.ts`, and this module no longer builds
 * its own.
 *
 * It used to, and so did `bannedCopyScanner.ts`, in two byte-identical private functions
 * neither of which could see the other. That is the exact failure this file's header warns
 * about two paragraphs up - "a second matcher would drift from the first and the two would
 * disagree about the same file" - already present, having arrived by duplication rather than
 * by anybody editing one of them.
 *
 * What the shared builder preserves: word-boundary, case-insensitive, built FRESH per call.
 * Fresh because these are `/g` and a shared `lastIndex` makes results depend on call order,
 * the bug that reads as an intermittently passing guard, already recorded in
 * `explorerFactGuard`. Boundaries are what keep longer words that merely START with a banned
 * word out of the results; they deliberately do NOT keep a hyphenated compound out, because a
 * hyphen is a word boundary, so an occurrence inside a hyphenated technical term is reported
 * and the asset carrying it is excluded from advertising rather than rewritten.
 */

/**
 * An occurrence that is an idiom rather than an advertisement.
 *
 * ## The measurement that caused this
 *
 * Taken 2026-11-01, after a prompt instruction was deployed and a second batch rendered. Of
 * the 24 Explorer drafts that had ever been generated, 18 were rejected, and ALL 18 were
 * rejected for the same thing: a closing courtesy offering help. Not one was a real breach,
 * and the word had never appeared in a single draft subject line.
 *
 * 40 TAC 807.172(d) forbids ADVERTISING training as no-cost. A sign-off offering to answer
 * questions advertises nothing, so rejecting it is a false positive - compliant email was
 * being discarded. `bannedCopyRule.ts` already says as much: "The word is prohibited, not the
 * offer."
 *
 * Confirmed by the fix: the next render on the same date, same assets, same cap, went from
 * 2 of 12 drafted to 11 of 12.
 *
 * ## Why an idiom exemption rather than a context classifier
 *
 * Matching only advertising contexts is more correct in principle, and was weighed and
 * rejected on 2026-11-01: "advertising context" has no crisp definition, and a weak version
 * silently passes a real breach, which is the single failure mode that matters here. Naming
 * one idiom keeps the word banned everywhere else, so the exemption cannot widen by accident -
 * adding to it is a visible edit to this list, not an emergent property.
 *
 * ## Why `precededBy` rather than the phrase
 *
 * The phrase is never spelled out. `precededBy` carries only the harmless half, and the
 * banned half is read off the rule at match time. See the note at the top of this file on why
 * a literal here would fail the ratchet while passing every test in this module.
 */
interface IdiomExemption {
  /** The rule this applies to, named so it cannot silently cover a rule added later. */
  ruleId: string;
  /** The word that must immediately precede the occurrence. Never the banned word itself. */
  precededBy: string;
  why: string;
}

const IDIOM_EXEMPTIONS: readonly IdiomExemption[] = [
  {
    ruleId: FREE_WORD_RULE.id,
    precededBy: 'feel',
    why:
      'A closing courtesy offering help, not a claim about price. 18 of 18 Explorer '
      + 'rejections measured on 2026-11-01 were this and nothing else.',
  },
];

/**
 * How far back to look for the preceding word. Generous enough that the word sought is never
 * truncated, bounded so a long body stays linear instead of re-slicing from the start of the
 * content on every match.
 */
const LOOKBACK_CHARS = 48;

/**
 * Whether the occurrence at `at` is an exempt idiom for this rule.
 *
 * A newline is prepended when the window starts at the beginning of the content, so that
 * start-of-content counts as a word boundary. Doing it this way rather than with an `^` branch
 * is deliberate: `^` would also match a window truncated mid-word, which would exempt an
 * occurrence sitting inside a longer word that merely ends in `precededBy`.
 */
function isExemptIdiom(ruleId: string, content: string, at: number): boolean {
  const from = Math.max(0, at - LOOKBACK_CHARS);
  const before = (from === 0 ? '\n' : '') + content.slice(from, at);
  return IDIOM_EXEMPTIONS.some(
    (ex) => ex.ruleId === ruleId
      && new RegExp(`[^A-Za-z0-9_]${ex.precededBy}\\s+$`, 'i').test(before),
  );
}

/** One banned-word hit in copy. */
export interface BannedCopyHit {
  /** The rule's id, as declared on the rule object in `bannedCopyRule.ts`. */
  rule_id: string;
  /** The word exactly as written, so case stays auditable. */
  text: string;
}

/**
 * Every banned-word occurrence in `content`. Empty means clean.
 *
 * Takes the text as given, including HTML. A tag name or attribute cannot contain a banned
 * English word by accident, and stripping tags first would mean parsing HTML to decide what
 * counts - a parser with holes, where a hole is a silent pass.
 */
export function findBannedCopy(
  content: string,
  rules: readonly BannedWordRule[] = BANNED_COPY_RULES,
): BannedCopyHit[] {
  assertRules(rules, 'findBannedCopy');
  const out: BannedCopyHit[] = [];
  for (const rule of rules) {
    const seen = new Set<string>();
    const re = ruleRegex(rule);
    let m: RegExpExecArray | null = re.exec(content);
    while (m !== null) {
      const key = m[0].toLowerCase();
      // The exemption is checked BEFORE `seen`, and the order is load-bearing. `seen` keys on
      // the lowercased text, so an exempt occurrence that claimed the key would mask a REAL
      // breach of the same spelling later in the same body. `REAL_BODY_WITH_BOTH_DEFECTS` in
      // the Explorer guard suite is a production draft carrying both at once, and is the
      // fixture that pins this.
      if (!isExemptIdiom(rule.id, content, m.index) && !seen.has(key)) {
        seen.add(key);
        out.push({ rule_id: rule.id, text: m[0] });
      }
      m = re.exec(content);
    }
  }
  return out;
}

/**
 * The rule, written for the MODEL rather than for the reviewer.
 *
 * ## Why an instruction and not only a guard
 *
 * Detection alone measured badly. On 2026-11-01 a live Explorer render of 12 decisions
 * refused 8 of them, every one for the same banned word, in prose the model wrote unprompted.
 * The sequences it reads carry no banned word, so nothing was feeding it the term; it is
 * simply the ordinary English for a no-cost offer. A guard that refuses two thirds of what it
 * is handed is working as specified and still leaves the feature unusable. Stating the rule
 * up front makes the refusal the backstop it was meant to be instead of the normal path.
 *
 * ## Why it lives beside the matcher
 *
 * Both read the same rule objects, so the instruction cannot drift from the guard that
 * enforces it. Two call sites now share this: the Explorer draft renderer and
 * `aiMessageService`. They differ only in what happens after a breach, which is why the
 * consequence is a parameter rather than a sentence baked in - the Explorer path discards the
 * draft, and the campaign path flags it for review. Telling the model it will be discarded
 * where it will not would be a false statement in a compliance instruction.
 *
 * ## The word is never written here
 *
 * Every part of the sentence is read off the rule object - `word`, `reason`,
 * `approvedAlternatives`. See the note at the top of this file.
 *
 * Fails closed on an empty rule set: zero rules means UNCHECKED, and silently instructing the
 * model in nothing would read as compliance.
 */
export function bannedCopyInstruction(
  rules: readonly BannedWordRule[] = BANNED_COPY_RULES,
  consequence: string = 'a draft that breaks one is discarded rather than edited',
): string {
  assertRules(rules, 'bannedCopyInstruction');
  const lines = rules.map((rule) => {
    const alternatives = rule.approvedAlternatives.map((a) => `"${a}"`).join(' or ');
    return (
      `- Never use the word "${rule.word}" anywhere in the subject or the body. ${rule.reason} `
      + `Write ${alternatives} instead.`
    );
  });
  return (
    'COPY COMPLIANCE. These are legal requirements, not style preferences, and '
    + `${consequence}:\n`
    + lines.join('\n')
  );
}
