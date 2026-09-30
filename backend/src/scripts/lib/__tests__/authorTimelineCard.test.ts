import { same } from '../authorTimelineCard';

/**
 * Regression coverage for the idempotency bug found by running the Week 1 seeders
 * twice against production: the "Claude Code 101" card reported `applied` on every
 * run instead of `already-current`, because its nested `course` object came back
 * from Postgres `jsonb` with its keys in a different order than the authored literal.
 * A naive JSON.stringify comparison called that "changed" and rewrote the card
 * (churning content_at) forever.
 */
describe('authorTimelineCard / same()', () => {
  it('treats objects with reordered keys as equal (the jsonb round-trip case)', () => {
    const authored = { name: 'Claude Code 101', url: 'https://example.com/c', sections: 'a, b, c' };
    const fromJsonb = { url: 'https://example.com/c', sections: 'a, b, c', name: 'Claude Code 101' };
    expect(same(authored, fromJsonb)).toBe(true);
  });

  it('normalises key order at every depth, not just the top level', () => {
    const a = { outer: { x: 1, inner: { p: 'one', q: 'two' } } };
    const b = { outer: { inner: { q: 'two', p: 'one' }, x: 1 } };
    expect(same(a, b)).toBe(true);
  });

  it('still reports a real content change as different', () => {
    const before = { name: 'Claude Code 101', url: 'https://example.com/c' };
    const after = { url: 'https://example.com/c', name: 'Claude Code 102' };
    expect(same(before, after)).toBe(false);
  });

  it('keeps array order significant (question order is meaningful)', () => {
    expect(same(['first', 'second'], ['second', 'first'])).toBe(false);
    expect(same(['first', 'second'], ['first', 'second'])).toBe(true);
  });

  it('normalises key order inside array elements', () => {
    expect(same([{ a: 1, b: 2 }], [{ b: 2, a: 1 }])).toBe(true);
  });

  it('handles primitives, null and undefined without throwing', () => {
    expect(same(null, null)).toBe(true);
    expect(same(undefined, undefined)).toBe(true);
    expect(same(null, undefined)).toBe(false);
    expect(same('x', 'x')).toBe(true);
    expect(same(1, '1')).toBe(false);
    expect(same(true, false)).toBe(false);
  });

  it('distinguishes a missing key from an explicitly undefined one only when it matters', () => {
    // Both stringify away, so an absent key and an undefined key compare equal —
    // acceptable here: authored literals never rely on that distinction.
    expect(same({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(same({ a: 1 }, { a: 1, b: null })).toBe(false);
  });
});
