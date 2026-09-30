/**
 * canonicalJson — the comparison that decides whether a compile makes a version.
 *
 * The first test is the one that matters: it reproduces the production bug where
 * a record read back from JSONB compared unequal to an identical freshly
 * compiled one, purely because Postgres had reordered the keys. Before the fix
 * this check never fired once, so every compile appended a version forever.
 */
import { canonicalJson } from '../capstoneRecordStore';

describe('canonicalJson', () => {
  it('treats JSONB key reordering as unchanged — the production bug', () => {
    // Left side is the real key order Postgres returned for a stored record;
    // right side is the order the compiler builds. Same content, different order.
    const fromJsonb = {
      posts: [], system: { descriptor: null, project_name: 'CoreOps' }, bookend: { closing: null, opening: null },
      identity: { full_name: 'Quincy Nkwain Ninying', headline: null }, artifacts: [], competencies: [],
      schema_version: 1,
    };
    const fromCompiler = {
      schema_version: 1, identity: { headline: null, full_name: 'Quincy Nkwain Ninying' },
      system: { project_name: 'CoreOps', descriptor: null }, artifacts: [], competencies: [], posts: [],
      bookend: { opening: null, closing: null },
    };

    expect(JSON.stringify(fromJsonb)).not.toBe(JSON.stringify(fromCompiler)); // why the old check failed
    expect(canonicalJson(fromJsonb)).toBe(canonicalJson(fromCompiler));
  });

  it('normalises nested objects, not just the top level', () => {
    const a = { outer: { b: 1, a: { d: 4, c: 3 } } };
    const b = { outer: { a: { c: 3, d: 4 }, b: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('does NOT reorder arrays — a real reordering must still register', () => {
    // Artifacts run in week order and posts in week order. Sorting array
    // elements would hide a genuine change as "unchanged".
    expect(canonicalJson({ a: [1, 2, 3] })).not.toBe(canonicalJson({ a: [3, 2, 1] }));
    expect(canonicalJson({ a: [{ week: 1 }, { week: 2 }] }))
      .not.toBe(canonicalJson({ a: [{ week: 2 }, { week: 1 }] }));
  });

  it('normalises objects nested inside arrays', () => {
    expect(canonicalJson({ a: [{ x: 1, y: 2 }] })).toBe(canonicalJson({ a: [{ y: 2, x: 1 }] }));
  });

  it('still detects a real value change', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({ a: '' }));
  });

  it('distinguishes a missing key from an explicit null', () => {
    // An absent competency band and one that resolved to null are different
    // facts, and the record's whole premise is that absence is meaningful.
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 1, b: null }));
  });

  it('handles primitives, null and empty containers', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(5)).toBe('5');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson({})).toBe('{}');
    expect(canonicalJson([])).toBe('[]');
  });

  it('is stable across repeated calls', () => {
    const v = { z: 1, a: { c: [3, 1, 2], b: null } };
    expect(canonicalJson(v)).toBe(canonicalJson(v));
  });
});
