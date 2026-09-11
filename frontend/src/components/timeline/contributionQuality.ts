/**
 * contributionQuality (client mirror) — the "is this a real contribution?" rule.
 *
 * THE SERVER IS THE AUTHORITY. This is a deliberate duplicate of
 * `backend/src/services/community/contributionQuality.ts` so the composer can
 * show a live hint and keep Send disabled as the student types, instead of
 * letting them write, press Send, and get a 400 back. Front and back are
 * separate builds with no shared package, so the copy is the pragmatic option;
 * `contributionQuality.test.ts` pins the thresholds and the counting rules so a
 * change on one side that is not mirrored fails loudly.
 *
 * Keep the two files behaviourally identical. If you change a number here,
 * change it there in the same commit.
 */

/** A reply is conversational — a real question or a real "here's what worked". */
export const MIN_REPLY_WORDS = 5;
/** A ritual answer is the student's own evidence; it should be a sentence or two. */
export const MIN_POST_WORDS = 15;

export interface QualityVerdict {
  ok: boolean;
  words: number;
  needed: number;
  hint: string | null;
}

/**
 * Count words the way a reader would. Collapses whitespace and ignores tokens
 * that carry no meaning alone (bare punctuation, short list markers), so
 * "1. ok 2. ok" does not clear a five-word bar.
 */
export function countWords(text: string | null | undefined): number {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  if (!s) return 0;
  return s.split(' ').filter((w) => {
    const bare = w.replace(/[^\p{L}\p{N}]/gu, '');
    if (!bare) return false;
    if (/^\d+$/.test(bare) && bare.length <= 2) return false;
    return true;
  }).length;
}

function verdict(text: string | null | undefined, needed: number, noun: string): QualityVerdict {
  const words = countWords(text);
  if (words >= needed) return { ok: true, words, needed, hint: null };
  const short = needed - words;
  return {
    ok: false,
    words,
    needed,
    hint: words === 0
      ? `Write a ${noun} to earn your points.`
      : `A few more words — about ${short} more and this counts.`,
  };
}

export function checkReply(text: string | null | undefined): QualityVerdict {
  return verdict(text, MIN_REPLY_WORDS, 'reply');
}

export function checkPost(text: string | null | undefined): QualityVerdict {
  return verdict(text, MIN_POST_WORDS, 'post');
}
