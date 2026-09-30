import { normalizePhone } from '../../consentService';

/**
 * The defect: a consent lookup finds a row only under the key it was written
 * with, so two spellings of one number meant a grant recorded on one form was
 * invisible to a check from another.
 */

describe('the same number always produces the same key', () => {
  it('keys every US spelling identically — THE bug', () => {
    const spellings = [
      '214-555-0100',
      '(214) 555-0100',
      '214.555.0100',
      '2145550100',
      '+1 214-555-0100',
      '+1 (214) 555-0100',
      '1-214-555-0100',
      '  214 555 0100  ',
    ];
    const keys = new Set(spellings.map((s) => normalizePhone(s)));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('+12145550100');
  });

  it('is what the previous version got wrong', () => {
    // Old behaviour: bare digits got a bare '+', so these two disagreed.
    expect(normalizePhone('214-555-0100')).toBe(normalizePhone('+1 214-555-0100'));
  });
});

describe('a stated country code is trusted, not overwritten', () => {
  it('leaves a non-US number alone', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('does not turn an 11-digit international number into a US one', () => {
    expect(normalizePhone('+33 1 42 68 53 00')).toBe('+33142685300');
  });

  it('respects the plus even on ten digits', () => {
    // '+' means the caller stated the code; we must not prepend another.
    expect(normalizePhone('+2145550100')).toBe('+2145550100');
  });
});

describe('bare digit counts', () => {
  it('assumes US for exactly ten bare digits', () => {
    expect(normalizePhone('4695009709')).toBe('+14695009709');
  });

  it('treats eleven bare digits starting 1 as US written without the plus', () => {
    expect(normalizePhone('12145550100')).toBe('+12145550100');
  });

  it('does not guess for other lengths — prefixes and stops', () => {
    expect(normalizePhone('442079460958')).toBe('+442079460958');
  });
});

describe('what it refuses', () => {
  it.each([null, undefined, '', '   ', 'abc', '12345'])('returns null for %p', (v) => {
    expect(normalizePhone(v as any)).toBeNull();
  });

  it('rejects fewer than seven digits rather than keying garbage', () => {
    // A key nothing can match is worse than no key: it looks like a record.
    expect(normalizePhone('555-010')).toBeNull();
  });
});

describe('the one production row is unaffected', () => {
  it('leaves an already-correct +1########## key unchanged', () => {
    // consent_records has exactly ONE phone-keyed row, already in this shape.
    // If this changed, the fix would move an existing key and lose the row.
    expect(normalizePhone('+16825975784')).toBe('+16825975784');
  });
});
