#!/usr/bin/env node
/**
 * M23 - run the test-file typecheck and compare it to the frozen baseline.
 *
 * THE FAILURE THIS GUARDS AGAINST FIRST IS ITS OWN. At the default heap, `tsc`
 * over `tsconfig.test.json` dies after about 490 seconds with a JavaScript heap
 * FATAL ERROR. It prints no diagnostics and exits 134, so a naive runner reads
 * "0 errors" and reports a clean pass. That is a crash wearing a green badge,
 * and it is the same shape as every other false pass this workstream has found.
 *
 * So this runner asserts tsc COMPLETED before it believes any count:
 *   - exit 0 (no errors) or exit 2 (errors found) are the only accepted exits;
 *   - any heap/abort signature in the output is a hard failure;
 *   - and zero diagnostics with a non-zero exit is treated as a crash, never as
 *     success.
 *
 * Usage:
 *   node scripts/checkTestTypecheck.js            # check against the baseline
 *   node scripts/checkTestTypecheck.js --print    # print the current counts
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND = path.resolve(__dirname, '..', 'backend');
const HEAP_MB = Number(process.env.TEST_TYPECHECK_HEAP_MB || 8192);

/** Only real diagnostic lines. A wrapped continuation is not a file. */
const DIAG = /^(?<file>[^ ].*?)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+)/;

/** Signatures that mean the process died rather than finished checking. */
const CRASH = [
  'JavaScript heap out of memory',
  'FATAL ERROR',
  'Ineffective mark-compacts',
  'Allocation failed',
];

/** Parse tsc output into per-file counts. Exported shape for the tests. */
function parseCounts(stdout) {
  const counts = {};
  for (const line of String(stdout).split('\n')) {
    const m = DIAG.exec(line);
    if (!m) continue;
    const file = m.groups.file.replace(/\\/g, '/').trim();
    counts[file] = (counts[file] || 0) + 1;
  }
  return counts;
}

/**
 * True when the output shows the process aborted rather than completed.
 *
 * ORDER MATTERS, and the first draft had it backwards. 0 = clean, 2 = type
 * errors found; anything else (134 SIGABRT, null from a signal) is a death and
 * not a verdict, and a real heap death always exits that way. So the exit status
 * is the primary test and it catches the whole failure mode on its own.
 *
 * The crash-phrase check is secondary, and it is NOT unconditional, because the
 * phrases appear in ordinary source: `grep` finds "FATAL ERROR" and friends in
 * three src files and in this checker's own test fixtures. tsc echoes source
 * text into diagnostics, so an unconditional match would declare a COMPLETED
 * run a crash, fail CI with the wrong diagnosis, and skip the baseline
 * comparison entirely. A crash prints no diagnostics, so the phrase only counts
 * when nothing parsed.
 */
function crashed(output, status) {
  if (status !== 0 && status !== 2) return true;
  if (CRASH.some((s) => String(output).includes(s))) {
    return Object.keys(parseCounts(output)).length === 0;
  }
  return false;
}

/**
 * Read the frozen table out of the TypeScript source that the jest suite also
 * imports, so there is exactly one copy of it.
 *
 * Plain node cannot `require` a `.ts` file, and adding ts-node to CI just to
 * read a flat object would be a new dependency for no gain. So this parses the
 * text, anchored tightly: a baseline row is two spaces, a quoted path, a colon
 * and a number. Prose in the docblock cannot match that shape.
 *
 * It THROWS rather than returning an empty table, because an unreadable
 * baseline that reads as "no recorded debt" is the same false pass this whole
 * file exists to refuse.
 */
function parseBaseline(text) {
  const baseline = {};
  for (const line of String(text).split('\n')) {
    const m = /^ {2}'([^']+)': (\d+),\s*$/.exec(line);
    if (m) baseline[m[1]] = Number(m[2]);
  }
  const totalMatch = /^export const TEST_TYPECHECK_BASELINE_TOTAL = (\d+);/m.exec(String(text));
  if (!totalMatch) throw new Error('testTypecheckBaseline.ts: TOTAL not found - refusing to run with an unreadable baseline');
  if (Object.keys(baseline).length === 0) throw new Error('testTypecheckBaseline.ts: no entries parsed - refusing to treat that as zero debt');
  return { baseline, total: Number(totalMatch[1]) };
}

/**
 * Compare measured counts to the frozen baseline, in BOTH directions.
 * Reports every failure rather than stopping at the first.
 */
function ratchet(counts, baseline) {
  const failures = [];
  for (const file of Object.keys(counts).sort()) {
    if (!Object.prototype.hasOwnProperty.call(baseline, file)) {
      failures.push(`${file}: NEW file with ${counts[file]} type error(s). Fix them; do not add a baseline entry.`);
    }
  }
  for (const file of Object.keys(baseline).sort()) {
    const frozen = baseline[file];
    const actual = counts[file] || 0;
    if (actual > frozen) {
      failures.push(`${file}: ${actual} error(s), baseline ${frozen}. A NEW one landed. Do not raise the baseline.`);
    } else if (actual === 0) {
      failures.push(`${file}: 0 error(s), baseline ${frozen}. Fixed - DELETE this baseline entry.`);
    } else if (actual < frozen) {
      failures.push(`${file}: ${actual} error(s), baseline ${frozen}. Improved - lower the entry to ${actual}.`);
    }
  }
  return failures;
}

function main() {
  const tsc = path.join(BACKEND, 'node_modules', 'typescript', 'bin', 'tsc');
  const started = Date.now();
  const run = spawnSync(process.execPath,
    [`--max-old-space-size=${HEAP_MB}`, tsc, '-p', 'tsconfig.test.json'],
    { cwd: BACKEND, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (run.stdout || '') + (run.stderr || '');
  const secs = Math.round((Date.now() - started) / 1000);

  if (crashed(out, run.status)) {
    console.error(`FAILED: tsc did not complete (exit ${run.status}, ${secs}s, heap ${HEAP_MB}MB).`);
    console.error('This is a CRASH, not a clean run. Raise TEST_TYPECHECK_HEAP_MB and retry.');
    console.error(out.split('\n').slice(0, 12).join('\n'));
    process.exit(1);
  }

  const counts = parseCounts(out);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`tsc completed in ${secs}s (exit ${run.status}, heap ${HEAP_MB}MB): ${total} error(s) across ${Object.keys(counts).length} file(s)`);

  if (process.argv.includes('--print')) {
    for (const f of Object.keys(counts).sort()) console.log(`  '${f}': ${counts[f]},`);
    return;
  }

  const baselinePath = path.join(BACKEND, 'src', 'services', 'content', 'testTypecheckBaseline.ts');
  const { baseline, total: declaredTotal } = parseBaseline(fs.readFileSync(baselinePath, 'utf8'));

  const failures = ratchet(counts, baseline);
  const frozenTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
  if (frozenTotal !== declaredTotal) {
    failures.push(`the table sums to ${frozenTotal} but TOTAL says ${declaredTotal}`);
  }

  if (failures.length) {
    console.error(`\n${failures.length} baseline failure(s):\n  ` + failures.join('\n  '));
    process.exit(1);
  }
  console.log('test typecheck baseline: matched exactly, in both directions');
}

module.exports = { parseCounts, crashed, ratchet, parseBaseline, DIAG, CRASH };
if (require.main === module) main();
