/**
 * linkedInText — LinkedIn's "little text" escaping for the `commentary` field.
 *
 * WHY THIS IS NOT AN EDGE CASE. LinkedIn's `/rest/posts` endpoint treats `commentary` as
 * "little text", in which these characters are reserved and MUST be backslash-escaped:
 *
 *     \ | { } @ [ ] ( ) < > # * _ ~
 *
 * An unescaped one does not get mangled in the rendered post - the API rejects the whole call
 * with **422**. Marketing copy contains brackets, hashes and parentheses constantly ("Register
 * here (limited seats)", "#AI", "5 _free_ sessions"), so the default case for this product is
 * the failing case. Verified by reading a working implementation, not inferred from docs.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: strip, replace or "clean" anything. The operator wrote
 * the copy and approved it; a transport that quietly rewrites approved text would break the
 * whole point of the approval chain (T024/T025 exist because approved copy must publish as
 * approved). Escaping changes the wire encoding and not one character of what a reader sees.
 */

/**
 * Reserved in LinkedIn little text. Order matters only for the backslash, which is handled
 * first below so its own escape is not re-escaped by a later pass.
 */
export const LITTLE_TEXT_RESERVED = ['\\', '|', '{', '}', '@', '[', ']', '(', ')', '<', '>', '#', '*', '_', '~'] as const;

const RESERVED_WITHOUT_BACKSLASH = LITTLE_TEXT_RESERVED.filter((c) => c !== '\\');

/**
 * Escape text for LinkedIn's `commentary` field.
 *
 * The backslash is escaped FIRST. Doing it in the same pass as the others, or later, would
 * double-escape every backslash this function itself inserted and produce visible `\(` in the
 * published post - a bug that looks like a rendering problem and is actually an ordering one.
 */
export function escapeLittleText(text: string): string {
  if (text === '') return '';
  let out = text.split('\\').join('\\\\');
  for (const char of RESERVED_WITHOUT_BACKSLASH) {
    out = out.split(char).join(`\\${char}`);
  }
  return out;
}

/** Reverse of `escapeLittleText`, for showing a stored commentary back to a human. */
export function unescapeLittleText(text: string): string {
  let out = text;
  for (const char of RESERVED_WITHOUT_BACKSLASH) {
    out = out.split(`\\${char}`).join(char);
  }
  return out.split('\\\\').join('\\');
}

/**
 * LinkedIn's commentary limit is 3,000 characters, counted on the text a READER sees - the
 * escape backslashes do not count against it.
 *
 * This matters because a naive length check against the escaped string rejects perfectly legal
 * copy: "Join us (free)" is 14 characters to a reader and 16 on the wire, and a post near the
 * limit with many brackets could be refused for being 200 characters over when it is not.
 */
export const COMMENTARY_MAX_CHARS = 3000;

export function commentaryLength(text: string): number {
  // Unicode-aware: emoji are single characters to LinkedIn's counter, two UTF-16 code units to
  // `String.length`. Counting code units would under-report the space available.
  return Array.from(text).length;
}

export function commentaryExceedsLimit(text: string): boolean {
  return commentaryLength(text) > COMMENTARY_MAX_CHARS;
}
