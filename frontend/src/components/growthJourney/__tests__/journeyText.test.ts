import { ADDRESS, safeText, decimalText } from '../journeyText';

/**
 * Characterisation of the mask `journeyText.ts` was extracted WITH (Phase 6, T614).
 *
 * `ADDRESS` and `safeText` came out of `HandoffDetailPage.tsx` unchanged, so this
 * suite exists to show the move changed nothing - and to pin the gaps, which are
 * the part most likely to be "fixed" by accident. Every shape the regex fails to
 * catch is asserted to STILL not be caught, so widening the pattern has to break a
 * named test and argue for itself rather than silently alter a privacy surface.
 *
 * `decimalText` is new and is here because the DECIMAL-arrives-as-string trap
 * (`confidence` comes back as `"0.820"`) is the kind of thing that only shows up
 * against a real payload.
 */

describe('what the mask catches', () => {
  it.each([
    ['lead@example.com', '[redacted]'],
    ['contact lead@example.com now', 'contact [redacted] now'],
    ['a@b', '[redacted]'],
    ['two lead@a.com and other@b.com here', 'two [redacted] and [redacted] here'],
  ])('%s -> %s', (input, expected) => {
    expect(safeText(input)).toBe(expected);
  });

  it('masks inside a stringified object, including in a KEY', () => {
    // The T613 leak: every VALUE went through the mask and the key did not.
    expect(safeText({ 'lead@example.com': 'x' })).not.toContain('lead@example.com');
    expect(safeText({ contact: 'lead@example.com' })).not.toContain('lead@example.com');
  });

  it('is GREEDY across non-whitespace, so one address swallows a whole JSON blob', () => {
    // Measured, not assumed. I expected `{"[redacted]":"x"}` here and the real
    // answer is bare `[redacted]`: `JSON.stringify` emits no spaces, `\S+` matches
    // across `{`, `"`, `:` and `,` alike, so a single `@` anywhere in the blob
    // makes the entire value one match.
    expect(safeText({ 'lead@example.com': 'x' })).toBe('[redacted]');
    expect(safeText({ a: 1, contact: 'lead@example.com', b: 2 })).toBe('[redacted]');

    // The consequence, stated so nobody reads this as a bug: the mask is SAFE but
    // LOSSY. An operator sees `[redacted]` where they might have expected an object
    // with one field hidden, and the surrounding fields are hidden too. That is the
    // right trade for a privacy backstop on a free-form JSONB column, and it is why
    // the handoff page renders packet entries key-by-key rather than masking the
    // packet as one blob - per-entry, only the offending entry is lost.
    expect(safeText('a@b')).toBe('[redacted]');
    expect(safeText({ clean: 'no address here' })).toBe('{"clean":"no address here"}');
  });

  it('stops at whitespace, which is what keeps prose readable', () => {
    expect(safeText('ping lead@example.com about the invoice')).toBe('ping [redacted] about the invoice');
    // but a comma is not whitespace, so a CSV-ish run is taken whole
    expect(safeText('alice,lead@example.com,bob')).toBe('[redacted]');
  });
});

describe('what the mask does NOT catch, asserted so widening it is deliberate', () => {
  // Each of these is a real shape an address can take. They pass through. The
  // header says so, the handoff page's captions say so, and these cells make the
  // claim falsifiable rather than decorative.
  it.each([
    ['@handle', 'no local part'],
    ['contact @handle please', 'no local part, mid-sentence'],
    ['lead @example.com', 'a space inside'],
    ['lead@', 'no domain'],
    ['lead＠example.com', 'U+FF20 full-width at-sign'],
  ])('%s passes through unmasked (%s)', (input) => {
    expect(safeText(input)).toBe(input);
    expect(safeText(input)).not.toContain('[redacted]');
  });
});

describe('the non-string inputs a JSONB column actually produces', () => {
  it.each([
    [null, '—'],
    [undefined, '—'],
  ])('%s renders as an em dash rather than "null"', (input, expected) => {
    expect(safeText(input)).toBe(expected);
  });

  it('renders the empty string as the empty string, not as an em dash', () => {
    // '' is falsy but not absent; the guard tests for null/undefined only, and a
    // blank TEXT column is a different fact from a missing one.
    expect(safeText('')).toBe('');
  });

  it.each([
    [0, '0'],
    [false, 'false'],
    [[], '[]'],
    [{}, '{}'],
  ])('%s survives JSON.stringify rather than reading as absent', (input, expected) => {
    expect(safeText(input)).toBe(expected);
  });
});

describe('the regex itself', () => {
  it('is global, which is why replace() masks every occurrence and not just the first', () => {
    expect(ADDRESS.flags).toContain('g');
  });

  it('is not left stateful between calls by safeText', () => {
    // A /g regex carries lastIndex. `String.replace` resets it, but `test()` does
    // not - so if anyone ever switches this helper to `test()`, alternating calls
    // start lying. Two identical calls must agree.
    expect(safeText('lead@example.com')).toBe(safeText('lead@example.com'));
  });
});

describe('decimalText, for the DECIMAL that arrives as a string', () => {
  it.each([
    ['0.820', '0.82'],
    [0.82, '0.82'],
    ['1', '1.00'],
    [0, '0.00'],
  ])('%s -> %s', (input, expected) => {
    expect(decimalText(input as string | number)).toBe(expected);
  });

  it.each([
    [null, '—'],
    [undefined, '—'],
    ['', '—'],
  ])('%s is absent, not zero - a missing confidence is not a confidence of 0', (input, expected) => {
    expect(decimalText(input as null)).toBe(expected);
  });

  it('hands back a non-numeric string unchanged rather than NaN', () => {
    expect(decimalText('n/a')).toBe('n/a');
  });
});
