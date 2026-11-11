/**
 * emailText - PURE. Reducing a raw email body to the part that is THEIR message, in THEIR words.
 *
 * ## Why this is its own module
 *
 * `communications.ts` owned `ownText` and imports `classifyEmail` from `timeline.ts`. Once the
 * classifier needed the same cleaning, timeline could not simply import it back without creating
 * the circular dependency CLAUDE.md forbids. So the shared piece moved down here, where both can
 * depend on it and neither depends on the other.
 *
 * ## What gets cut, and why each one
 *
 * **Quoted history.** The thread below someone's reply is usually OUR words. Counting a question
 * we asked last week as a question they are asking today keeps a thread open forever and makes a
 * one-line "done" inherit the whole conversation it quotes.
 *
 * **URLs.** A tracking link's query string is full of question marks and random characters. This
 * is not hypothetical: on 2026-11-11, classifying whole bodies with nothing stripped scored a
 * Basecamp tracking URL as `stuck` on characters inside `?p=eyJzIjoi...`, and 378 classifications
 * changed in total. A question mark inside a URL is not a question.
 *
 * Both cuts exist so the text can then be read GENEROUSLY. They are what make reading further
 * safe rather than merely noisier.
 */

/** The start of quoted history, in the shapes real clients write it. */
export const QUOTED = /\s(On (Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^]{0,120}?wrote:|-{3,}\s*Original Message|From:\s.{3,80}Sent:)/i;

const URL = /https?:\/\/\S+/gi;

/** The new text of a message: quoted history cut, whitespace collapsed. */
export function ownText(body: string | null | undefined): string {
  const t = String(body ?? '').replace(/\s+/g, ' ').trim();
  const m = QUOTED.exec(t);
  return (m ? t.slice(0, m.index) : t).trim();
}

/**
 * How much of a message the classifier reads.
 *
 * 250 was the old limit and it was far too small: of 110 intern emails in a 21 day window on
 * 2026-11-11, 83 were longer than that and 35 asked something the classifier never saw, because
 * people put the courtesy and the context first and the question last. 4000 covers every intern
 * message measured in that window with room to spare, while still bounding the work done per mail.
 */
export const CLASSIFY_CHARS = 4000;

/** Their own words, link-free, bounded - the text a classifier should judge. */
export function classifiableText(body: string | null | undefined, max: number = CLASSIFY_CHARS): string {
  return ownText(body).replace(URL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Cut an excerpt so it ends where a sentence ends, never in the middle of a word.
 *
 * ## Why this is not a cosmetic change
 *
 * `shapes.ts` refuses to reference an intern's own words, and the reason is written into a test
 * called "never quotes the excerpt": a 600-character hard slice ended Quincy's message at
 * `"the live expor"`. That was the correct call about a broken snippet, and it left the composer
 * with only a subject line and a date to write from. The measured consequence on 2026-11-11 was
 * that 13 of 13 messages opened with the identical sentence.
 *
 * So fix the snippet rather than overriding the objection. A sentence-complete excerpt can be
 * referenced safely; a mid-word one cannot, and should not be.
 *
 * Falls back to a word boundary with an ellipsis when there is no sentence end late enough to use
 * - better a clean "..." than a sentence fragment presented as a whole thought. The 40% floor
 * stops a single early period (an initial, "e.g.", a version number) from cutting a long message
 * down to one clause.
 *
 * Lives here, rather than in sidecar/communications.ts where it started, because the report's own
 * thread snippets need the same treatment and the sidecar must not be a dependency of the report.
 */
export function trimToSentence(text: string, max: number = 600): string {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const end = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (end >= Math.floor(max * 0.4)) return window.slice(0, end + 1).trimEnd();
  const space = window.lastIndexOf(' ');
  return `${window.slice(0, space > 0 ? space : max - 3).trimEnd()}...`;
}

/**
 * True when an excerpt ends on a sentence, so a composer may reference it as a whole thought.
 *
 * A trailing ellipsis is explicitly NOT complete, even though it ends in a period. That is the
 * whole case this predicate exists to catch, and a naive `/[.?!]$/` passes it.
 */
export function isSentenceComplete(excerpt: string): boolean {
  const t = excerpt.trim();
  return /[.?!]$/.test(t) && !/\.\.\.$/.test(t);
}

/** Sentences of a cleaned message, in order. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}
