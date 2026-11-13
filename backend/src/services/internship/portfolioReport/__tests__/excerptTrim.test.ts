import { isSentenceComplete, trimToSentence } from '../sidecar/communications';

/**
 * An excerpt must end where a sentence ends.
 *
 * `shapes.ts` refuses to reference an intern's own words, and the reason is recorded in a test
 * called "never quotes the excerpt": a 600-character hard slice ended Quincy's message at
 * "the live expor". That was the right call about a broken snippet. Its cost, measured on
 * 2026-11-11, was that the composer had only a subject line and a date to write from and all
 * thirteen messages opened with the same sentence.
 *
 * Fixing the snippet is what makes the words usable at all, so these cases guard the cut itself.
 */

const QUINCY = 'the set is empty on the board and what remains is R5 and above, which needs the live export';

describe('trimToSentence', () => {
  /**
   * The cut index is DERIVED from the string, not counted by hand. Two earlier versions of this
   * file asserted hand-counted offsets and both were wrong, which is its own small lesson: a test
   * whose setup is guessed proves whatever the guess happened to be.
   */
  const MID_WORD = QUINCY.indexOf('export') + 3;

  it('POSITIVE CONTROL: a hard slice really does cut mid-word', () => {
    const hard = QUINCY.slice(0, MID_WORD);
    expect(QUINCY.slice(MID_WORD - 1, MID_WORD + 1)).toMatch(/^[a-z]{2}$/); // letters either side
    expect(hard.endsWith(' ')).toBe(false);
    expect(hard.endsWith('exp')).toBe(true);
    expect(isSentenceComplete(hard)).toBe(false);
  });

  it('returns text shorter than the cap untouched', () => {
    expect(trimToSentence('Short and done.', 600)).toBe('Short and done.');
  });

  it('cuts at the last sentence end inside the window', () => {
    const first = 'Ten of eleven stories are verified.';
    const second = 'Thirty five of thirty six criteria pass.';
    const t = `${first} ${second} The last one is testing.`;
    // A window that reaches into the third sentence keeps the first two, whole.
    const out = trimToSentence(t, `${first} ${second}`.length + 6);
    expect(out).toBe(`${first} ${second}`);
    expect(isSentenceComplete(out)).toBe(true);
  });

  it('keeps only the first sentence when the second does not fit', () => {
    const first = 'Ten of eleven stories are verified.';
    const t = `${first} Thirty five of thirty six criteria pass.`;
    const out = trimToSentence(t, first.length + 20);
    expect(out).toBe(first);
    expect(isSentenceComplete(out)).toBe(true);
  });

  it('never ends mid-word, even when there is no usable sentence end', () => {
    const out = trimToSentence(QUINCY, MID_WORD);
    expect(out).not.toContain('exp');
    expect(out.endsWith('...')).toBe(true);
    // Whatever it kept, the last real word is whole.
    const lastWord = out.replace(/\.\.\.$/, '').trim().split(' ').pop() as string;
    expect(QUINCY.split(' ')).toContain(lastWord);
  });

  it('ignores a sentence end that is too early to be worth using', () => {
    // A period at 8 characters would otherwise cut a 200-character message down to "e.g."
    const t = `e.g. ${'word '.repeat(60)}`.trim();
    const out = trimToSentence(t, 120);
    expect(out).not.toBe('e.g.');
    expect(out.length).toBeGreaterThan(100);
  });

  it('handles question and exclamation ends, not only periods', () => {
    const t = 'Can you confirm the read route? I will start on it as soon as you say yes and then continue.';
    expect(trimToSentence(t, 45)).toBe('Can you confirm the read route?');
  });

  it('is deterministic: the same input gives the same cut', () => {
    expect(trimToSentence(QUINCY, 77)).toBe(trimToSentence(QUINCY, 77));
  });
});

describe('isSentenceComplete', () => {
  it('is true only when the snippet ends on terminal punctuation', () => {
    expect(isSentenceComplete('A whole thought.')).toBe(true);
    expect(isSentenceComplete('A whole thought?  ')).toBe(true);
    expect(isSentenceComplete('cut off here...')).toBe(false);
    expect(isSentenceComplete('the live expor')).toBe(false);
  });
});
