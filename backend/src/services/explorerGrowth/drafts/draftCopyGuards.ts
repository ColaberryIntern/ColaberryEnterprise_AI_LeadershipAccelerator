import { BANNED_COPY_RULES, type BannedWordRule } from '../../content/bannedCopyRule';
import { assertRules, findBannedCopy } from '../../content/bannedCopyMatch';

/**
 * The matcher moved to `services/content/bannedCopyMatch.ts` on 2026-11-02, when
 * `aiMessageService` needed the same decision for campaign copy. It is re-exported here so
 * that every existing importer and the whole existing test suite keep working unchanged:
 * this file's public surface is identical to what it was before the move.
 */
export { CopyRulesAbsentError, findBannedCopy, bannedCopyInstruction } from '../../content/bannedCopyMatch';
export type { BannedCopyHit } from '../../content/bannedCopyMatch';

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
 * ## Rules are an argument, and the matcher lives elsewhere
 *
 * The matching itself, the word-boundary regex and the idiom exemption now live in
 * `services/content/bannedCopyMatch.ts`, because `aiMessageService` needs the same decision
 * for campaign copy and two matchers would drift apart. Its header carries the reasoning.
 * What stays here is the Explorer-specific part: which fields of an asset are screened, how a
 * relative href is resolved, and how the rule is phrased for the model.
 *
 * An empty rule set throws rather than returning "clean", in the matcher and in every wrapper
 * below. Returning clean would be a silent pass, which is the failure this whole subsystem
 * keeps producing; returning "everything is unsafe" would take the feature down over a wiring
 * mistake. A throw is neither, and names the bug.
 */

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
