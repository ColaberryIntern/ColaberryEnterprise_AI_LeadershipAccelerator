/**
 * canonicalHash — unit tests for the generic hasher.
 *
 * The extraction's regression proof lives elsewhere and deliberately so: the
 * five `describe('planHash')` tests in
 * `src/services/sbp/__tests__/planStore.test.ts:41-69` were written against the
 * private copy of this algorithm and must pass WITHOUT EDITS. This file is the
 * complement — it tests the generic surface those tests cannot reach, including
 * the three collapse rules (`Date`, `undefined`, `Map`/`Set`) that are traps for
 * anyone hashing something that is not a BuildPlan.
 *
 * NO DATABASE, NO NETWORK, NO CLOCK. The module imports `crypto` and nothing
 * else, which is exactly why it can be the shared identity function.
 */
import { createHash } from 'crypto';
import { canonicalize, canonicalJson, hashCanonical } from '../canonicalHash';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

describe('canonicalize', () => {
  it('sorts object keys at every depth', () => {
    const value = { b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } };
    expect(JSON.stringify(canonicalize(value))).toBe('{"a":{"c":[{"e":4,"f":3}],"d":2},"b":1}');
  });

  it('does NOT mutate the input — the caller keeps their object', () => {
    const value = { b: 1, a: 2 };
    canonicalize(value);
    expect(Object.keys(value)).toEqual(['b', 'a']);
  });

  it('preserves array order, because array order can be meaningful', () => {
    expect(canonicalJson(['b', 'a'])).toBe('["b","a"]');
    expect(hashCanonical(['b', 'a'])).not.toBe(hashCanonical(['a', 'b']));
  });

  it('passes scalars and null through untouched', () => {
    expect(canonicalize(null)).toBeNull();
    expect(canonicalize(7)).toBe(7);
    expect(canonicalize('x')).toBe('x');
    expect(canonicalize(true)).toBe(true);
  });

  it('handles a deeply nested mixture of objects and arrays', () => {
    const deep = { z: [{ y: [{ x: { w: 1, v: 2 } }] }] };
    expect(canonicalJson(deep)).toBe('{"z":[{"y":[{"x":{"v":2,"w":1}}]}]}');
  });
});

describe('hashCanonical', () => {
  it('is stable across calls', () => {
    const value = { a: 1, b: [1, 2, 3] };
    expect(hashCanonical(value)).toBe(hashCanonical(value));
  });

  it('ignores key ORDER — the property the whole util exists for', () => {
    expect(hashCanonical({ a: 1, b: 2, c: { d: 3, e: 4 } }))
      .toBe(hashCanonical({ c: { e: 4, d: 3 }, b: 2, a: 1 }));
  });

  it('changes when any value changes', () => {
    expect(hashCanonical({ a: 1 })).not.toBe(hashCanonical({ a: 2 }));
  });

  it('changes when a key is added', () => {
    expect(hashCanonical({ a: 1 })).not.toBe(hashCanonical({ a: 1, b: 1 }));
  });

  it('is the sha256 of the canonical JSON, not of something else', () => {
    const value = { b: 2, a: 1 };
    expect(hashCanonical(value)).toBe(sha256('{"a":1,"b":2}'));
  });

  it('produces a 64-character lowercase hex digest, matching the VARCHAR(64) column', () => {
    expect(hashCanonical({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── the collapse rules, pinned so they are documented traps, not surprises ───
describe('hashCanonical — what JSON.stringify erases', () => {
  it('treats an undefined-valued key as an absent key', () => {
    expect(hashCanonical({ a: 1, b: undefined })).toBe(hashCanonical({ a: 1 }));
  });

  it('hashes top-level undefined as null instead of throwing', () => {
    expect(hashCanonical(undefined)).toBe(hashCanonical(null));
    expect(canonicalJson(undefined)).toBe('null');
  });

  it('collapses a Date to {} — callers must convert to ISO strings first', () => {
    // Not a bug to fix here: fixing it would change BuildPlan hashing too. It is
    // a rule the Case Study snapshot builder is written against.
    expect(canonicalJson(new Date('2026-01-01T00:00:00.000Z'))).toBe('{}');
    expect(hashCanonical(new Date('2026-01-01T00:00:00.000Z')))
      .toBe(hashCanonical(new Date('2031-06-05T09:30:00.000Z')));
    expect(hashCanonical('2026-01-01T00:00:00.000Z'))
      .not.toBe(hashCanonical('2031-06-05T09:30:00.000Z'));
  });

  it('collapses Map and Set to {} — they enumerate no own keys', () => {
    expect(canonicalJson(new Map([['a', 1]]))).toBe('{}');
    expect(canonicalJson(new Set([1, 2]))).toBe('{}');
  });

  it('throws on a cyclic value rather than inventing a serialization', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => hashCanonical(cyclic)).toThrow();
  });

  it('survives an empty object, an empty array and an empty string', () => {
    expect(canonicalJson({})).toBe('{}');
    expect(canonicalJson([])).toBe('[]');
    expect(canonicalJson('')).toBe('""');
    expect(hashCanonical({})).not.toBe(hashCanonical([]));
  });
});

describe('hashCanonical — boundary inputs', () => {
  it('does not blow the stack on a 200-deep structure', () => {
    let deep: unknown = { leaf: true };
    for (let i = 0; i < 200; i += 1) deep = { [`k${i}`]: deep };
    expect(hashCanonical(deep)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles a wide object with many keys deterministically', () => {
    const keys = Array.from({ length: 500 }, (_, i) => `k${i}`);
    const forward: Record<string, number> = {};
    const backward: Record<string, number> = {};
    keys.forEach((k, i) => { forward[k] = i; });
    [...keys].reverse().forEach((k) => { backward[k] = keys.indexOf(k); });
    expect(hashCanonical(forward)).toBe(hashCanonical(backward));
  });

  it('distinguishes a number from its string form', () => {
    expect(hashCanonical({ a: 1 })).not.toBe(hashCanonical({ a: '1' }));
  });
});
