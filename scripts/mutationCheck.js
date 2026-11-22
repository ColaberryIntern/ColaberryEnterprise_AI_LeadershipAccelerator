#!/usr/bin/env node
/**
 * Mutation harness: break a tripwire on purpose, prove the test catches it, restore.
 *
 * ## The failure this exists to prevent
 *
 * On 2026-11-20 a mutation in this repo "survived" and looked like a fake tripwire. It was not:
 * the perl pattern never matched, so the file was never changed and the suite passed because
 * nothing was broken. **A mutation that silently fails to apply is indistinguishable from a test
 * that fails to catch it**, and the wrong conclusion is the dangerous one - it says a real
 * tripwire is decorative.
 *
 * So this harness REFUSES to report on a mutation whose edit it cannot prove it made: if the file
 * bytes are unchanged after substitution, that is a harness error, not a test result.
 *
 * Usage:
 *   node scripts/mutationCheck.js <spec.json>
 *
 * Spec shape:
 *   { "cwd": "backend",
 *     "command": "npx jest path/to/suite.test.ts --ci --silent",
 *     "mutations": [ { "label": "...", "file": "src/x.ts", "find": "literal", "replace": "literal" } ] }
 *
 * `find` is a LITERAL string, not a regex, for exactly the reason above.
 * Exit 0 only when every mutation applied AND every one was caught.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const root = path.resolve(__dirname, '..');
const cwd = path.join(root, spec.cwd || '.');

function suitePasses() {
  try {
    execSync(spec.command, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let caught = 0;
let survived = 0;
let broken = 0;

// A baseline run, because a suite that is already red makes every mutation look "caught".
if (!suitePasses()) {
  console.error('[mutation] BASELINE IS RED. Every mutation would look caught. Fix the suite first.');
  process.exit(2);
}
console.log('[mutation] baseline green\n');

/**
 * This repo is checked out on Windows with `core.autocrlf`, so working-tree files hold CRLF
 * while a spec written by hand holds `\n`. Matching raw bytes therefore reports BROKEN for a
 * perfectly good mutation. Normalize both sides to LF to find and replace, then restore the
 * file's original ending style so the mutation does not itself rewrite every line and swamp
 * the diff. (The naive `grep -q $'\r'` check for CRLF silently misreports in this shell, which
 * is how this took two attempts to see.)
 */
function splitEndings(text) {
  const hadCrlf = text.includes('\r\n');
  return { lf: hadCrlf ? text.split('\r\n').join('\n') : text, hadCrlf };
}
function restoreEndings(lfText, hadCrlf) {
  return hadCrlf ? lfText.split('\n').join('\r\n') : lfText;
}

for (const m of spec.mutations) {
  const file = path.join(cwd, m.file);
  const before = fs.readFileSync(file, 'utf8');
  const { lf, hadCrlf } = splitEndings(before);

  if (!lf.includes(m.find)) {
    console.log(`${m.label}\n  BROKEN MUTATION: the literal to replace is not in ${m.file}`);
    broken += 1;
    continue;
  }

  fs.writeFileSync(file, restoreEndings(lf.split(m.find).join(m.replace), hadCrlf));
  const after = fs.readFileSync(file, 'utf8');

  if (after === before) {
    console.log(`${m.label}\n  BROKEN MUTATION: file bytes unchanged after substitution`);
    broken += 1;
    fs.writeFileSync(file, before);
    continue;
  }

  const stillPasses = suitePasses();
  fs.writeFileSync(file, before); // restore immediately, pass or fail

  if (stillPasses) {
    console.log(`${m.label}\n  SURVIVED - the tripwire is decorative, the test does not catch this`);
    survived += 1;
  } else {
    console.log(`${m.label}\n  died (the test caught it)`);
    caught += 1;
  }
}

console.log('\n' + '='.repeat(56));
console.log(`caught:   ${caught}`);
console.log(`survived: ${survived}   (must be 0)`);
console.log(`broken:   ${broken}   (must be 0 - these are harness errors, not results)`);
console.log('='.repeat(56));

process.exit(survived === 0 && broken === 0 ? 0 : 1);
