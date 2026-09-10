/**
 * contributionQuality — the "is this a real contribution?" rule for community
 * posts and replies.
 *
 * Why it exists: both `CreatePostSchema.body` and `CreateCommentSchema.body`
 * were `min(1)`, so a single character earned the full award — 5 points for a
 * post, 2 for a comment. The cohort wall is meant to be evidence that people
 * are actually talking to each other; a wall of "ok" is worse than an empty one,
 * because it looks like engagement.
 *
 * The bar is WORDS, not characters: a character floor is trivially padded
 * ("aaaaaaaaaaaaaaaaaaaa" clears 20 chars and says nothing), while a word floor
 * asks for actual sentences. It is deliberately low — the goal is to stop
 * one-word point farming, not to make people work for permission to be helpful.
 *
 * PURE and dependency-free so the exact same rule can run in the composer as
 * the student types (live hint, disabled Send) and again at the route boundary
 * as the authority. A gate enforced only in the client is decoration.
 */

/** A reply is conversational — a real question or a real "here's what worked". */
export const MIN_REPLY_WORDS = 5;
/** A ritual answer is the student's own evidence; it should be a sentence or two. */
export const MIN_POST_WORDS = 15;

export interface QualityVerdict {
  ok: boolean;
  words: number;
  needed: number;
  /** Student-facing, never scolding: says what is missing, not what they did wrong. */
  hint: string | null;
}

/**
 * Count words the way a reader would. Collapses whitespace, and ignores tokens
 * that carry no meaning on their own (bare punctuation, lone digits used as
 * bullets) so "1. ok 2. ok" does not clear a five-word bar.
 */
export function countWords(text: string | null | undefined): number {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  if (!s) return 0;
  return s.split(' ').filter((w) => {
    const bare = w.replace(/[^\p{L}\p{N}]/gu, '');
    if (!bare) return false;              // pure punctuation: "—", "...", "•"
    if (/^\d+$/.test(bare) && bare.length <= 2) return false;   // "1." / "2)" list markers
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
