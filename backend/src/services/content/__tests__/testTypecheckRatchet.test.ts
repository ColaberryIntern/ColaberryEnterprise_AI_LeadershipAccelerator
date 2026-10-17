/**
 * M23 - the test-typecheck ratchet, and the crash detection that protects it.
 *
 * The real tree matches the baseline by construction the moment the baseline is
 * pasted in, so a suite that only reads the tree cannot show these rules are
 * able to fail. Every rule is therefore driven with synthetic input first, in
 * both directions, and only then applied to the committed table.
 *
 * THE MOST IMPORTANT CASE IS `crashed`. At the default heap, tsc over the test
 * program dies after ~490s with a heap FATAL ERROR: no diagnostics, exit 134.
 * A runner that only counts diagnostics reads that as zero errors and reports a
 * clean pass. That is the failure this whole file exists to prevent, so it gets
 * the positive control.
 */

import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS script under test
const checker = require('../../../../../scripts/checkTestTypecheck.js');
import { TEST_TYPECHECK_BASELINE, TEST_TYPECHECK_BASELINE_TOTAL } from '../testTypecheckBaseline';

const { parseCounts, crashed, ratchet, parseBaseline } = checker;

describe('M23 - crash detection, because a crash reads exactly like a clean pass', () => {
  const HEAP = [
    '<--- Last few GCs --->',
    'FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory',
  ].join('\n');

  it('treats a heap death as a CRASH even though it reports no errors', () => {
    expect(parseCounts(HEAP)).toEqual({});
    expect(crashed(HEAP, 134)).toBe(true);
  });

  it('treats any exit that is not 0 or 2 as a crash, whatever the output said', () => {
    // 134 is SIGABRT. null is what spawnSync returns when a signal killed it.
    expect(crashed('', 134)).toBe(true);
    expect(crashed('', null)).toBe(true);
    expect(crashed('', 1)).toBe(true);
  });

  it('does NOT call a completed run a crash because a DIAGNOSTIC quoted the phrase', () => {
    // The phrases live in ordinary source: three src files contain them, and so
    // does this suite. tsc echoes source text into diagnostics, so matching the
    // phrase unconditionally would fail CI with the wrong diagnosis and skip the
    // baseline comparison on a run that completed perfectly well.
    const out = "src/a.test.ts(1,1): error TS2322: Type '\"Allocation failed\"' is not assignable to type 'number'.";
    expect(parseCounts(out)).toEqual({ 'src/a.test.ts': 1 });
    expect(crashed(out, 2)).toBe(false);
  });

  it('still catches a crash phrase when NOTHING parsed, even at exit 0', () => {
    expect(crashed('FATAL ERROR: something died', 0)).toBe(true);
  });

  it('accepts the two exits that are real verdicts - the control', () => {
    // Without this the crash check could simply refuse everything, which would
    // "catch" every crash while being no check at all.
    expect(crashed('', 0)).toBe(false);
    expect(crashed("a.test.ts(1,1): error TS2345: no.", 2)).toBe(false);
  });
});

describe('M23 - parsing counts only real diagnostics', () => {
  it('counts one error per diagnostic line, grouped by file', () => {
    const out = [
      'src/a.test.ts(1,1): error TS2345: Argument of type X.',
      'src/a.test.ts(9,4): error TS2322: Type Y.',
      'src/b.test.ts(2,2): error TS7006: Parameter implicitly any.',
    ].join('\n');
    expect(parseCounts(out)).toEqual({ 'src/a.test.ts': 2, 'src/b.test.ts': 1 });
  });

  it('IGNORES an INDENTED diagnostic-shaped line - related info, not a second error', () => {
    // This is the case the `[^ ]` anchor exists for, and the only one that can
    // double-count: tsc prints related information INDENTED and in exactly the
    // diagnostic format, so a parser that allows a leading space counts one
    // error twice and attributes half of it to a file that is fine.
    const out = [
      'src/a.test.ts(1,1): error TS2345: Argument of type X.',
      '  src/helper.ts(5,3): error TS2345: The expected type comes from this signature.',
    ].join('\n');
    expect(parseCounts(out)).toEqual({ 'src/a.test.ts': 1 });
  });

  it('IGNORES a wrapped prose continuation, which names no position', () => {
    // A multi-line message once made a continuation line parse as a filename and
    // produced a phantom "1 src file with an error" in this very workstream.
    const out = [
      'src/a.test.ts(1,1): error TS2345: Argument of type X.',
      "  No index signature with a parameter of type 'string' was found on type '{ 'controllers/x.ts': number }'.",
    ].join('\n');
    expect(parseCounts(out)).toEqual({ 'src/a.test.ts': 1 });
  });

  it('returns nothing for output with no diagnostics at all', () => {
    expect(parseCounts('')).toEqual({});
    expect(parseCounts('Found 0 errors.')).toEqual({});
  });
});

describe('M23 - the ratchet bites in both directions', () => {
  const BASE = { 'src/a.test.ts': 2, 'src/b.test.ts': 1 };

  it('passes when the counts match exactly - the control', () => {
    expect(ratchet({ 'src/a.test.ts': 2, 'src/b.test.ts': 1 }, BASE)).toEqual([]);
  });

  it('CATCHES a new error in a known file, and refuses a raise', () => {
    const f = ratchet({ 'src/a.test.ts': 3, 'src/b.test.ts': 1 }, BASE);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('Do not raise the baseline');
  });

  it('CATCHES an improvement, naming the number to paste', () => {
    const f = ratchet({ 'src/a.test.ts': 1, 'src/b.test.ts': 1 }, BASE);
    expect(f[0]).toContain('lower the entry to 1');
  });

  it('CATCHES a file reaching zero, and demands the entry be deleted', () => {
    const f = ratchet({ 'src/b.test.ts': 1 }, BASE);
    expect(f[0]).toContain('DELETE this baseline entry');
  });

  it('CATCHES a brand new file, and does NOT offer to baseline it', () => {
    const f = ratchet({ ...BASE, 'src/c.test.ts': 4 }, BASE);
    expect(f[0]).toContain('NEW file with 4 type error(s)');
    expect(f[0]).toContain('do not add a baseline entry');
  });
});

describe('M23 - the CI script and this suite must read the same table', () => {
  // The script cannot `require` a .ts file, so it parses the text. That makes
  // two independent readers of one table, and two readers can disagree. If they
  // do, the gate and the suite are checking different numbers and neither is
  // trustworthy. This is the test that ties them together.
  const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', 'testTypecheckBaseline.ts'), 'utf8');

  it('parses the committed file to EXACTLY what TypeScript imports', () => {
    const { baseline, total } = parseBaseline(SOURCE);
    expect(baseline).toEqual(TEST_TYPECHECK_BASELINE);
    expect(total).toBe(TEST_TYPECHECK_BASELINE_TOTAL);
  });

  it('does not pick up prose from the docblock as an entry', () => {
    // The docblock names 8192, 490 and 134. None may become a baseline row.
    const { baseline } = parseBaseline(SOURCE);
    const junk = Object.keys(baseline).filter((k) => !k.includes('/'));
    expect(junk).toEqual([]);
  });

  it('REFUSES an unreadable baseline instead of reading it as zero debt', () => {
    // An empty table would make the ratchet pass trivially on a clean tree.
    expect(() => parseBaseline('export const TEST_TYPECHECK_BASELINE_TOTAL = 400;'))
      .toThrow(/no entries parsed/);
  });

  it('REFUSES a table with no declared total', () => {
    expect(() => parseBaseline("  'src/a.test.ts': 2,\n")).toThrow(/TOTAL not found/);
  });
});

describe('M23 - the committed baseline is internally consistent', () => {
  it('its entries sum to the stated total', () => {
    const sum = Object.values(TEST_TYPECHECK_BASELINE).reduce((a, b) => a + b, 0);
    expect(sum).toBe(TEST_TYPECHECK_BASELINE_TOTAL);
  });

  it('is every bit a test file, which is what was measured', () => {
    const notTests = Object.keys(TEST_TYPECHECK_BASELINE)
      .filter((f) => !/\.test\.ts$/.test(f) && !f.includes('__tests__'));
    expect(notTests).toEqual([]);
  });

  it('has no entry at or below zero, because such an entry must be deleted', () => {
    const bad = Object.entries(TEST_TYPECHECK_BASELINE).filter(([, n]) => !(n > 0));
    expect(bad).toEqual([]);
  });

  it('still carries the debt it was measured with, so a silent wipe is visible', () => {
    // 141 files, 400 errors, measured 2026-10-17. If someone empties the table
    // the ratchet would pass trivially, so the size is asserted here.
    expect(Object.keys(TEST_TYPECHECK_BASELINE).length).toBe(141);
    expect(TEST_TYPECHECK_BASELINE_TOTAL).toBe(400);
  });
});
