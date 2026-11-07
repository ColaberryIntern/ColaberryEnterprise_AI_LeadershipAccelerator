#!/usr/bin/env node
/**
 * Prove the secret-scanning gate can still FAIL, before anyone trusts that it passed.
 *
 * ## Why a green secret scan is not evidence on its own
 *
 * This gate's output is an ABSENCE: "no credential was found." A working detector and a
 * broken one produce the identical green tick. A mistyped `--config` path, a rule pack that
 * failed to load, an upstream default set that stopped being inherited, an allowlist that
 * grew one regex too greedy -- each of those turns the gate green permanently, and nothing
 * in the run says so.
 *
 * So before the scan is believed, the same binary and the same .gitleaks.toml are pointed at
 * a repository that is KNOWN to contain planted secrets, and this step fails if they are not
 * found. The fixtures and their expectations live in scripts/lib/gitleaksSelfTest.js, which
 * already existed for the intern-repo audit (scripts/internRepoSecretScan.js) and is reused
 * here rather than duplicated.
 *
 * ## Why this exists as a separate entry point
 *
 * The control was previously only wired into the intern-repo audit, so THIS repository's own
 * gate -- the one that blocks main -- had no proof it could fail. Running it by hand once
 * proves nothing about the next run, which is the whole argument for putting it in CI.
 *
 * ## No real credential is involved
 *
 * Every fixture value is assembled from fragments at runtime (see that file's header), the
 * fixture repository is a temp directory, and it is deleted before this process exits.
 * Nothing here is committed and nothing is printed that could leak.
 *
 * Usage:  node scripts/secret-scan-selftest.js
 *         npm run secrets:selftest
 *
 * Exit codes: 0 = the detector found every planted secret. 1 = it missed at least one, so no
 * "clean" verdict from this configuration can be trusted. 2 = the control could not run at
 * all, which is also not a pass.
 */

'use strict';

const path = require('path');
const { ensure } = require('./ensure-gitleaks');
const { runSelfTest } = require('./lib/gitleaksSelfTest');

const CONFIG = path.join(__dirname, '..', '.gitleaks.toml');

(async () => {
  let gitleaks;
  try {
    gitleaks = await ensure();
  } catch (e) {
    // ensure-gitleaks already prints its own remediation block. Exit 2 rather than 1 to keep
    // "the control could not run" distinguishable from "the control ran and the gate is blind".
    console.error(`\nSELF-TEST COULD NOT RUN: ${String(e && e.message).slice(0, 200)}`);
    console.error('Refusing to report a pass. A control that did not run is not a control.');
    process.exit(2);
  }

  const t = runSelfTest({ gitleaks, config: CONFIG });

  console.log('CONTROL: pointing this repo\'s own gate at planted secrets\n');
  console.log(`  config: ${path.relative(path.join(__dirname, '..'), CONFIG)}\n`);
  console.log('  fixture                expected   actual');
  for (const r of t.rows) {
    console.log(
      `  ${r.file.padEnd(22)} ${r.expected.padEnd(10)} ${r.actual}` +
        `${r.discriminating ? '    <- hardcoded key behind env indirection' : ''}`,
    );
  }
  console.log('');

  if (!t.ok) {
    console.error(`SELF-TEST FAILED: the detector missed ${t.misses.join(', ')}.`);
    console.error('');
    console.error('This does NOT mean a secret leaked. It means this configuration can no');
    console.error('longer see a secret of that shape, so a green scan proves nothing. Fix the');
    console.error('config before trusting any clean result from it.');
    console.error('');
    console.error('Most likely causes, in order: [extend] useDefault was removed or the upstream');
    console.error('rule set failed to load; an allowlist regex in .gitleaks.toml grew broad');
    console.error('enough to swallow a real value; the pinned gitleaks version changed rule ids.');
    process.exit(1);
  }

  // A false positive is triage noise, not blindness, and the intern-repo audit treats it the
  // same way. Surfacing it without failing keeps this step's failure meaning exactly one thing.
  if (t.falsePositives.length) {
    console.log(
      `  note: the precision control also flagged ${t.falsePositives.join(', ')} -- ` +
        'expect triage noise, not a broken gate.\n',
    );
  }

  console.log(`SELF-TEST PASSED: ${t.rows.filter((r) => r.expected === 'DETECT').length} planted secrets, all detected.`);
})();
