/**
 * inherited - PURE. Text that came from the INTERN, made safe to put in a message to them.
 *
 * ## The bug this exists for
 *
 * On 2026-11-11 Omolola's brief was held `unsendable_text` and could not be sent at all. The
 * offending character was a single en dash, U+2013, and it was not ours: it was in the subject
 * SHE wrote, `Saratoga Springs Municipal System – project update and stakeholder briefing`. The
 * composer inherits a subject verbatim for a reply, and quotes it in the body, so her dash landed
 * in both and `briefProblems()` refused the result.
 *
 * The sender's refusal is right - `sendAsAli` escapes the body into HTML and a dash renders as a
 * mojibake smear. Holding the whole message is wrong. The person most likely to be unreachable
 * this way is the person who writes carefully enough to use a real dash, and on the day it was
 * measured she was also the intern with the nearest deadline on the roster.
 *
 * ## What it does, and what it deliberately does not
 *
 * Dashes become a hyphen-minus, which is ASCII, keeps the clause break the writer intended, and
 * reads correctly. Angle brackets are removed, because the sender turns them into visible
 * entities. Whitespace is collapsed, because an inherited subject arrives with newlines in it.
 *
 * It does NOT rewrite words, fix spelling, or shorten. The text still belongs to them; this only
 * removes the three characters the transport cannot carry. Everything it changes is a character
 * the reader would have seen broken anyway.
 */

/** The characters `briefProblems()` and the sender both refuse, and what each becomes. */
const SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Em dash and en dash. A hyphen-minus preserves the pause without the transport problem.
  [/[—–]/g, '-'],
  // Angle brackets: the sender escapes these into `&lt;`, which the reader sees literally.
  [/[<>]/g, ''],
  // Curly quotes and apostrophes travel, but they arrive from Outlook in pairs that read badly
  // next to our own straight ones in the same sentence. Normalise rather than mix.
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
];

/**
 * Make text that came from an intern safe to repeat back to them.
 *
 * Returns an empty string for nullish input, so a caller can test the result rather than having to
 * test the input first.
 */
export function sanitizeInherited(text: string | null | undefined): string {
  let out = String(text ?? '');
  for (const [re, to] of SUBSTITUTIONS) out = out.replace(re, to);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * True when this text can be put in a message body as-is.
 *
 * Used by tests to prove the sanitiser actually clears what the sender refuses, rather than
 * trusting that the substitution list is complete.
 */
export function isSendableText(text: string): boolean {
  return !/[—–<>]/.test(text);
}

