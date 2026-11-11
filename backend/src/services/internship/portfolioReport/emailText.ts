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
