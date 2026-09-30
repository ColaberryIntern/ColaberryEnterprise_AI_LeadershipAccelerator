/**
 * linkedInText — the escaping that decides whether a post publishes or 422s.
 *
 * The cases are drawn from real marketing copy, because that is where the reserved characters
 * actually live. A test suite that only escapes `#` would pass while every "(limited seats)" in
 * the calendar failed.
 */

import {
  escapeLittleText,
  unescapeLittleText,
  commentaryLength,
  commentaryExceedsLimit,
  COMMENTARY_MAX_CHARS,
  LITTLE_TEXT_RESERVED,
} from '../linkedInText';

describe('escapeLittleText', () => {
  it.each(LITTLE_TEXT_RESERVED.filter((c) => c !== '\\'))('escapes the reserved character %s', (char) => {
    expect(escapeLittleText(`a${char}b`)).toBe(`a\\${char}b`);
  });

  it('escapes a backslash FIRST, so its own escapes are not re-escaped', () => {
    // The ordering bug this guards: escaping `(` first and `\` second turns "(" into "\\(" ,
    // which publishes a literal backslash the operator never typed.
    expect(escapeLittleText('a\\b')).toBe('a\\\\b');
    expect(escapeLittleText('(x)')).toBe('\\(x\\)');
    expect(escapeLittleText('\\(')).toBe('\\\\\\(');
  });

  it('escapes real marketing copy, which is full of reserved characters', () => {
    const copy = 'Join our free AI class (limited seats) #AI #Colaberry — register @ the link';
    const escaped = escapeLittleText(copy);
    expect(escaped).toContain('\\(limited seats\\)');
    expect(escaped).toContain('\\#AI');
    expect(escaped).toContain('\\@');
    // Nothing a reader sees has changed.
    expect(unescapeLittleText(escaped)).toBe(copy);
  });

  it('leaves ordinary prose completely untouched', () => {
    const plain = 'Join us Thursday at 6pm CT. Seats are limited, so register early.';
    expect(escapeLittleText(plain)).toBe(plain);
  });

  it('round-trips through unescape for every reserved character at once', () => {
    const all = LITTLE_TEXT_RESERVED.join('');
    expect(unescapeLittleText(escapeLittleText(all))).toBe(all);
  });

  it('handles the empty string and text that is only reserved characters', () => {
    expect(escapeLittleText('')).toBe('');
    expect(unescapeLittleText(escapeLittleText('###'))).toBe('###');
  });

  it('does not strip, replace or otherwise rewrite approved copy', () => {
    // Approved copy must publish as approved. Escaping is a wire encoding, not an edit.
    const approved = 'Ship it *today* — details (here): https://enterprise.colaberry.ai/free-class';
    expect(unescapeLittleText(escapeLittleText(approved))).toBe(approved);
  });
});

describe('commentary length', () => {
  it('counts what a READER sees, not the escaped wire form', () => {
    // The bug this prevents: a 2,990-character post with 30 brackets measures 3,020 escaped
    // and would be refused for being over a limit it is nowhere near.
    const copy = '('.repeat(100);
    expect(commentaryLength(copy)).toBe(100);
    expect(escapeLittleText(copy)).toHaveLength(200);
  });

  it('counts an emoji as one character, not two code units', () => {
    expect(commentaryLength('🔐')).toBe(1);
    expect('🔐'.length).toBe(2); // what a naive check would have used
  });

  it('flags only genuinely over-long copy', () => {
    expect(commentaryExceedsLimit('x'.repeat(COMMENTARY_MAX_CHARS))).toBe(false);
    expect(commentaryExceedsLimit('x'.repeat(COMMENTARY_MAX_CHARS + 1))).toBe(true);
  });
});
