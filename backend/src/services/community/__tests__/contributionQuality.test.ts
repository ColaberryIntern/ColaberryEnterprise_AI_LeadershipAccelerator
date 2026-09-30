/**
 * The thoughtfulness gate. Both community body schemas were `min(1)`, so a
 * single character earned the full award — 5 points for a post, 2 for a reply.
 *
 * These assert the RULE's behaviour on real inputs, not just its constants: a
 * threshold with no positive-and-negative case either side of it is
 * indistinguishable from a comment.
 */
import {
  countWords, checkReply, checkPost, MIN_REPLY_WORDS, MIN_POST_WORDS,
} from '../contributionQuality';

describe('countWords', () => {
  it('counts what a reader would call words', () => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords('  padded   with     space  ')).toBe(3);
    expect(countWords('line one\nline two')).toBe(4);
  });

  it('ignores bare punctuation, which is how a "long" empty answer sneaks through', () => {
    expect(countWords('... — •')).toBe(0);
    expect(countWords('hi — there')).toBe(2);
  });

  it('ignores short list markers so "1. ok 2. ok" is two words, not four', () => {
    expect(countWords('1. ok 2. ok')).toBe(2);
  });

  it('keeps real numbers that carry meaning', () => {
    expect(countWords('cut it from 4500 to 300')).toBe(6);
  });

  it.each([null, undefined, '', '   '])('treats %p as zero words', (v) => {
    expect(countWords(v as any)).toBe(0);
  });
});

describe('checkReply', () => {
  it('rejects the one-word point claim this gate exists for', () => {
    for (const junk of ['ok', 'nice', 'thanks', '👍', 'great post']) {
      expect(checkReply(junk).ok).toBe(false);
    }
  });

  it('accepts a real reply', () => {
    const real = 'How long did the triage skill take you to get right?';
    expect(checkReply(real).ok).toBe(true);
    expect(checkReply(real).hint).toBeNull();
  });

  it('sits exactly on the boundary, both sides', () => {
    const four = 'one two three four';
    const five = 'one two three four five';
    expect(countWords(four)).toBe(MIN_REPLY_WORDS - 1);
    expect(checkReply(four).ok).toBe(false);
    expect(countWords(five)).toBe(MIN_REPLY_WORDS);
    expect(checkReply(five).ok).toBe(true);
  });

  it('tells the student what is missing without scolding them', () => {
    const v = checkReply('almost there now');
    expect(v.ok).toBe(false);
    expect(v.words).toBe(3);
    expect(v.needed).toBe(MIN_REPLY_WORDS);
    expect(v.hint).toContain('few more words');
    expect(v.hint).not.toMatch(/invalid|error|too short|rejected/i);
  });

  it('prompts to write something when the box is empty', () => {
    expect(checkReply('').hint).toBe('Write a reply to earn your points.');
  });
});

describe('checkPost', () => {
  it('rejects a padded non-answer', () => {
    expect(checkPost('done').ok).toBe(false);
    expect(checkPost('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').ok).toBe(false);   // long, one word
  });

  it('accepts a genuine ritual answer', () => {
    const real = 'I built a read-only MCP server for my recipe pantry, and the '
      + 'breakthrough was getting stdio transport to connect inside Claude Code.';
    expect(checkPost(real).ok).toBe(true);
  });

  it('sits exactly on the boundary, both sides', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
    expect(checkPost(words(MIN_POST_WORDS - 1)).ok).toBe(false);
    expect(checkPost(words(MIN_POST_WORDS)).ok).toBe(true);
  });

  it('asks for more of a post than of a reply — posting is the bigger claim', () => {
    expect(MIN_POST_WORDS).toBeGreaterThan(MIN_REPLY_WORDS);
  });
});
