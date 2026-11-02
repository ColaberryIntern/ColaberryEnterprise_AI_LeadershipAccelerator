import { BANNED_COPY_RULES, FREE_WORD_RULE, type BannedWordRule } from '../../content/bannedCopyRule';

/**
 * Explorer draft copy guards — the two defects found in the first real draft copy that has
 * ever existed, 2026-10-31.
 *
 * ## How they were found, and why that matters for where they are fixed
 *
 * Fixing `scheduled_emails.id` made the draft writers able to write a row for the first time.
 * The first live render then produced 12 real bodies, and reading them showed two things that
 * no test had ever been in a position to see, because until that day nothing had ever been
 * rendered:
 *
 *   1. ALL 12 advertised the word "free", which 40 TAC 807.172(d) forbids.
 *   2. 5 of 12 carried `href="/portal/runtime/<uuid>"` — a root-relative path, which cannot
 *      resolve in an email client. The other 7 used absolute URLs.
 *
 * NEITHER IS THE MODEL'S FAULT, which is what decides the layer they are fixed at. Both come
 * from `explorer_content_assets`, measured against production:
 *
 *   - 11 of 1403 assets carry the banned word in `title`, and 11 in `summary`. 5 are active,
 *     so reachable by the drafter, including "Welcome to Your Free AI Preview".
 *   - `url` on those rows LITERALLY STORES `/portal/runtime/<uuid>`. The model was faithfully
 *     reproducing a relative path we handed it.
 *
 * So the generator is quoting its inputs correctly and a prompt change fixes nothing. The
 * inputs are wrong for the email channel, and that is a boundary problem.
 *
 * ## Why the data is not edited instead
 *
 * The obvious alternative is to rewrite the 11 titles. It is the wrong fix: most are real
 * titles of real third-party content ("The Easiest FREE AI Tools for Beginners in 2026",
 * "Efficient Reasoning with Training-Free Contrastive Decoding"). Editing them would falsify
 * a citation to make a lint pass, and "Training-Free" is a technical term that is not an
 * advertisement at all. The asset store is a catalogue of what exists; the EMAIL is the
 * advertisement. The rule binds the advertisement, so the guard belongs at that boundary.
 *
 * Nor are the titles string-surgeried into compliance. Removing the word from
 * "Training-Free Contrastive Decoding" yields "Training- Contrastive Decoding", which is
 * mangled text presented as a source's own title. A guard that corrupts a citation to
 * satisfy itself is worse than the violation.
 *
 * ## The shape chosen: exclude on the way in, refuse on the way out
 *
 * `isSafeToAdvertise` keeps banned-word assets out of the prompt, so the generator is never
 * handed the word. `bannedCopyIssues` reads the FINAL body and refuses it if the word
 * survived anyway. The first keeps the feature working; the second makes it impossible for
 * the word to reach a person even if some other input introduces it later.
 *
 * The cost of the exclusion is measured, not assumed: 5 of 468 active assets, about 1%.
 *
 * ## Rules are an argument, and an empty set is a programming error
 *
 * Same shape as `explorerQuoteGuard`, for the reason recorded in `bannedCopyRule.ts`: the
 * canonical rule lives in a dependency-free leaf precisely so a runtime module can read it.
 * `bannedCopyScanner.ts` must NOT be imported here — it opens with `import * as ts from
 * 'typescript'`, a devDependency absent from the production image, and
 * `explorerQuoteGuard`'s own test asserts no runtime file under `explorerGrowth/` imports it.
 *
 * An empty rule set throws rather than returning "clean". Returning clean would be a silent
 * pass, which is the failure this whole subsystem keeps producing; returning "everything is
 * unsafe" would take the feature down over a wiring mistake. A throw is neither, and names
 * the bug.
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

function assertRules(rules: readonly BannedWordRule[], fn: string): void {
  if (rules.length === 0) throw new CopyRulesAbsentError(fn);
}

/**
 * Word-boundary, case-insensitive, built fresh per call.
 *
 * Fresh because these are `/g` elsewhere in this repo and a shared `lastIndex` makes results
 * depend on call order — the bug that reads as an intermittently passing guard, already
 * recorded in `explorerFactGuard`.
 *
 * Boundaries are what keep "freedom", "freely" and "freelance" out. They deliberately do NOT
 * keep "Training-Free" out, because a hyphen is a word boundary: that occurrence is reported,
 * and the asset carrying it is excluded from advertising rather than rewritten.
 */
function wordRegex(word: string): RegExp {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
}

/**
 * An occurrence that is an idiom rather than an advertisement.
 *
 * ## The measurement that caused this
 *
 * Taken 2026-11-01, after the instruction added by #3554 was deployed and a second batch
 * rendered. Of the 24 Explorer drafts that have ever been generated, 18 were rejected, and
 * ALL 18 were rejected for the same thing: a closing courtesy offering help. Not one was a
 * real violation, and the word has never appeared in a single draft subject line.
 *
 * 40 TAC 807.172(d) forbids ADVERTISING training as no-cost. A sign-off offering to answer
 * questions advertises nothing, so rejecting it is a false positive — compliant email was
 * being discarded and the Governor held shut by a guard reporting a defect that was not
 * there. `bannedCopyRule.ts` already says as much: "The word is prohibited, not the offer."
 *
 * ## Why an idiom exemption rather than a context classifier
 *
 * Matching only advertising contexts is more correct in principle, and was weighed and
 * rejected on 2026-11-01: "advertising context" has no crisp definition, and a weak version
 * silently passes a real violation, which is the single failure mode that matters here.
 * Naming one idiom keeps the word banned everywhere else, so the exemption cannot widen by
 * accident — adding to it is a visible edit to this list, not an emergent property.
 *
 * ## Why `precededBy` rather than the phrase
 *
 * The phrase is never spelled out here. `precededBy` carries only the harmless half and the
 * banned half is read off the rule at match time. That keeps a banned-word literal out of
 * this file, which `bannedWordOutboundCopy.test.ts` scans with a shrink-only per-file ratchet
 * where a NEW occurrence fails too. It is the same constraint that shaped
 * `bannedCopyInstruction`, and writing the phrase by hand would pass every behavioural
 * assertion here and fail that ratchet.
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
 * start-of-content counts as a word boundary. Doing it this way rather than with an `^`
 * branch is deliberate: `^` would also match a window truncated mid-word, which would exempt
 * an occurrence sitting inside a longer word that merely ends in `precededBy`.
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
  /** The rule's id, e.g. `tac-807-172-d-free`. */
  rule_id: string;
  /** The word exactly as written, so case stays auditable. */
  text: string;
}

/**
 * Every banned-word occurrence in `content`. Empty means clean.
 *
 * Takes the text as given, including HTML. A tag name or attribute cannot contain a banned
 * English word by accident, and stripping tags first would mean parsing HTML to decide what
 * counts — a parser with holes, where a hole is a silent pass.
 */
export function findBannedCopy(
  content: string,
  rules: readonly BannedWordRule[] = BANNED_COPY_RULES,
): BannedCopyHit[] {
  assertRules(rules, 'findBannedCopy');
  const out: BannedCopyHit[] = [];
  for (const rule of rules) {
    const seen = new Set<string>();
    const re = wordRegex(rule.word);
    let m: RegExpExecArray | null = re.exec(content);
    while (m !== null) {
      const key = m[0].toLowerCase();
      // The exemption is checked BEFORE `seen`, and the order is load-bearing. `seen` keys on
      // the lowercased text, so an exempt occurrence that claimed the key would mask a REAL
      // violation of the same spelling later in the same body. `REAL_BODY_WITH_BOTH_DEFECTS`
      // is a production draft carrying both at once, and is the fixture that pins this.
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
 * Validator-shaped wrapper: human-readable issue strings naming the authority and the
 * approved phrasings, so whoever reads the rejection does not have to go and find the rule.
 */
export function bannedCopyIssues(
  content: string,
  rules: readonly BannedWordRule[] = BANNED_COPY_RULES,
): string[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  return findBannedCopy(content, rules).map((hit) => {
    const rule = byId.get(hit.rule_id);
    const alternatives = rule?.approvedAlternatives.join('" or "') ?? '';
    return (
      `Explorer copy advertises the banned word "${hit.text}" (${hit.rule_id}). `
      + `${rule?.reason ?? ''} Write "${alternatives}" instead.`
    );
  });
}

/**
 * Whether a content asset may be quoted in an advertisement.
 *
 * Checks every field that can reach the copy. `title` and `summary` both carry the word on
 * all 11 affected rows in production, so checking only the title would have let the summary
 * through on every one of them.
 */
export function isSafeToAdvertise(
  asset: { title?: string | null; summary?: string | null },
  rules: readonly BannedWordRule[] = BANNED_COPY_RULES,
): boolean {
  assertRules(rules, 'isSafeToAdvertise');
  const fields = [asset.title ?? '', asset.summary ?? ''];
  return fields.every((f) => findBannedCopy(f, rules).length === 0);
}

/**
 * An `href` value that an email client can follow, or null when it cannot be made into one.
 *
 * Root-relative (`/portal/runtime/...`) is the measured defect and is resolved against the
 * public app base. Absolute URLs, `mailto:`, `tel:` and in-page anchors are returned
 * unchanged. A protocol-relative `//host/path` is NOT rewritten: it already names a host, and
 * prefixing a base would corrupt it.
 *
 * Anything else — a bare `portal/runtime/x`, an empty value — returns null, because guessing
 * what a malformed link meant is how a guard starts inventing destinations.
 */
export function absolutizeHref(href: string, baseUrl: string): string | null {
  const value = href.trim();
  if (value === '') return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return value; // https:, mailto:, tel:
  if (value.startsWith('#')) return value;
  if (value.startsWith('//')) return value;
  if (value.startsWith('/')) return `${baseUrl.replace(/\/+$/, '')}${value}`;
  return null;
}

export interface AbsolutizeResult {
  /** The HTML with every root-relative `href` resolved against the base. */
  html: string;
  /** How many hrefs were rewritten. Zero on already-absolute copy. */
  rewritten: number;
  /** Hrefs that could not be made absolute, verbatim. Non-empty means the copy is broken. */
  unresolvable: string[];
}

/**
 * Resolve every root-relative `href` in an HTML body against `baseUrl`.
 *
 * Returns the count and the unresolvable set rather than just the new string, because a
 * rewriter that reports nothing cannot be asserted on: a test that only compares output
 * passes identically when the function silently matched nothing at all. The count is the
 * control.
 */
export function absolutizeHrefs(html: string, baseUrl: string): AbsolutizeResult {
  const unresolvable: string[] = [];
  let rewritten = 0;
  const out = html.replace(
    /\bhref\s*=\s*(["'])(.*?)\1/gi,
    (whole, quote: string, value: string) => {
      const resolved = absolutizeHref(value, baseUrl);
      if (resolved === null) {
        unresolvable.push(value);
        return whole;
      }
      if (resolved === value) return whole;
      rewritten += 1;
      return `href=${quote}${resolved}${quote}`;
    },
  );
  return { html: out, rewritten, unresolvable };
}

/** Issue strings for links an email client could not follow. */
export function emailLinkIssues(html: string, baseUrl: string): string[] {
  return absolutizeHrefs(html, baseUrl).unresolvable.map(
    (href) =>
      `Explorer copy contains a link an email client cannot follow: "${href}". `
      + 'An email has no page to be relative to, so every href must be absolute.',
  );
}

/**
 * The rule, written for the MODEL rather than for the reviewer.
 *
 * ## Why this exists, measured rather than assumed
 *
 * The two guards above are both defensive: `isSafeToAdvertise` keeps a non-compliant asset
 * out of the digest on the way in, and `bannedCopyIssues` refuses a non-compliant body on
 * the way out. Neither one ever TELLS the generator the rule, and on 2026-11-01 a live
 * render of 12 decisions measured what that costs: 8 of 12 drafts were refused, every one
 * of them for the same banned word, in prose the model wrote unprompted. The three Explorer
 * sequences it reads were checked and carry no banned word, so nothing was feeding it the
 * term - it is simply the ordinary English for a no-cost offer.
 *
 * A guard that refuses two thirds of what it is handed is working as specified and still
 * leaves the feature unusable. This is the missing third layer: state the rule up front, so
 * the refusal becomes the backstop it was meant to be instead of the normal path.
 *
 * ## The word is never written here
 *
 * Every part of the sentence is read off the rule object - `word`, `reason`,
 * `approvedAlternatives` - and none of it is spelled out in this file. That is deliberate
 * twice over. It means this instruction cannot drift from the guard that enforces it, since
 * both read the same constant; and it keeps a banned-word literal out of a source file that
 * `bannedWordOutboundCopy.test.ts` scans with a per-file ratchet, where a new occurrence is
 * a failure rather than a nit.
 *
 * Fails closed on an empty rule set for the same reason the guards do: zero rules means
 * UNCHECKED, and silently instructing the model in nothing would read as compliance.
 */
export function bannedCopyInstruction(
  rules: readonly BannedWordRule[] = BANNED_COPY_RULES,
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
    'COPY COMPLIANCE. These are legal requirements, not style preferences, and a draft '
    + 'that breaks one is discarded rather than edited:\n'
    + lines.join('\n')
  );
}
