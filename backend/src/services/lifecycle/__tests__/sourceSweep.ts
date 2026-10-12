/**
 * Shared apparatus for source sweeps. NOT a test file: it holds no `it` and asserts nothing.
 *
 * Extracted because two suites now sweep source for a claim about code, and a sweep's
 * instrument is the part that goes wrong. `lifecycleRegistrationCoverage` was written first and
 * its own header records what has already gone wrong on this tree:
 *
 *   - plain `grep -r` SKIPS three `.ts` files as binary, because they contain deliberate,
 *     load-bearing NUL bytes, including the most important approval file in the build.
 *   - the ripgrep-backed search tooling times out on this worktree and returned 4 of 7 sites
 *     with no error at all.
 *   - an unbounded `Project\.` pattern matched `DeliveryProject.` and `OpsBcProject.` as
 *     substrings and was wrong by 6 of 7.
 *   - a sweep matched its OWN HEADER COMMENT and reported two creation sites that are sentences.
 *
 * Two copies of that hard-won instrument would drift, and the copy that drifted would be the one
 * reporting completeness it does not have.
 */
import fs from 'fs';

/**
 * Blank out comments so a sweep reads CODE and not prose.
 *
 * PRESERVES LENGTH AND LINE COUNT by replacing comment characters with spaces rather than
 * deleting them, so line numbers in a report still point at the real line.
 *
 * ## The measured limitation, and it is narrower than it first looks
 *
 * It is NOT string-aware or regex-aware. The `(^|[^:])` guard means a `//` preceded by a
 * colon is never read as a comment, so a URL SCHEME survives -- but any LATER colon-less
 * `//`, including one inside the same string literal, is blanked. Measured 2026-10-12, and
 * consistent with what `lifecycleRegistrationCoverage.test.ts` already pinned:
 *
 *     const u = 'https://example.com/p';       SURVIVES (no second //)
 *     const o = { u: 'http://x.com' };         SURVIVES
 *     const u = 'https://example.com/a//b';    SCHEME survives, `//b` is blanked
 *     const s = 'a // b';                      MANGLED from the slashes
 *     const p = '//shared/path';               MANGLED
 *     const r = /a//b/;                        MANGLED
 *
 * So the rule for a caller is narrow and checkable: safe for a sweep whose patterns cannot
 * occur after a colon-less `//` in a string or regex literal. Every sweep using it searches
 * for identifiers and SQL keywords, none of which can.
 *
 * LEFT AS-IS DELIBERATELY, for the reason the older suite gives: a string-aware stripper is
 * more code than the thing it protects, would need its own tests to be trustworthy, and this
 * error is in the safe direction twice over -- it can only ever REMOVE text, and the suites
 * built on it assert explicit named lists that fail by name rather than passing with a
 * shorter set.
 */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_m, before: string, comment: string) =>
      before + comment.replace(/./g, ' '));
}

/**
 * Read a file with line endings normalised to LF.
 *
 * CRLF normalisation is not tidiness. Phase 5 lost a grading to a sweep that was satisfiable by
 * a comment, and then to the FIX for it, which silently no-opped because it was anchored on LF
 * while the file on disk was CRLF and reported a misleading green. Every line-oriented regex in
 * this repo must run on normalised text, and doing it at the read is the only place it cannot be
 * forgotten.
 *
 * `fs.readFileSync` rather than a search tool: it reads NUL bytes as content and cannot time out
 * partway while reporting success.
 */
export function readNormalised(file: string): string {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

/** Read a file, normalise its newlines, and blank its comments. The usual combination. */
export function readCode(file: string): string {
  return stripComments(readNormalised(file));
}

/**
 * Where a symbol first appears in code, or -1.
 *
 * Returned as an INDEX rather than a boolean so a caller can assert ORDER. "The guard is called"
 * and "the guard is called before the row is returned" are different claims, and only the second
 * one rules out a guard that runs too late to matter.
 */
export function codeIndexOf(code: string, needle: string): number {
  return code.indexOf(needle);
}
