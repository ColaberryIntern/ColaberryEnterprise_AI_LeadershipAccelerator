#!/usr/bin/env node
/**
 * C4.14 - fail the build if a blocked outcome claim reappears in the public knowledge hub.
 *
 * `frontend/public/knowledge/` is a PUBLIC static hub, not an authenticated route, so
 * anything written there is readable without asking us for anything. It also contains the
 * design system's own guidance, which is what makes a stale claim self-propagating: the
 * old `BRAND.md` told makers to "lead with proof (5,000+ careers, since 2012)", so anyone
 * following the design system faithfully reintroduced a claim the registry blocks.
 *
 * WHY A PHRASE LIST AND NOT A NUMBER. The claim was removed from 27 files in five
 * different phrasings - careers launched, careers built, careers changed, graduates
 * placed, "more than 5,000 people build careers" - plus bare `5,000+` stat tokens whose
 * noun lived in a sibling element, and one occurrence that spelled it "5,000 plus" and so
 * escaped a search for "5,000+" entirely. Matching the figure alone would have missed the
 * labels; matching the labels alone would have missed the tokens. It checks both.
 *
 * Run:  node scripts/checkKnowledgeHubClaims.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HUB = path.join(__dirname, '..', 'frontend', 'public', 'knowledge');
const EXTENSIONS = /\.(html|js|jsx|md|json|txt)$/;

/**
 * Blocked claims, with the registry key each one belongs to.
 *
 * `trackrecord.careers` is superseded: "careers launched" most naturally means hires,
 * which production measured at 691, so "5,000+" overstated the outcome by roughly an
 * order of magnitude. `trackrecord.wageimpact` has no located methodology and an empty
 * approvedRoutes list.
 */
const BLOCKED = [
  { key: 'trackrecord.careers', pattern: /5,?000\s*(?:\+|plus)/i, label: 'the 5,000+ figure' },
  { key: 'trackrecord.careers', pattern: /more than 5,?000/i, label: '"more than 5,000"' },
  { key: 'trackrecord.careers', pattern: /careers\s+(?:launched|built|changed)/i, label: 'a careers-launched claim' },
  { key: 'trackrecord.careers', pattern: /graduates\s+placed/i, label: '"graduates placed"' },
  { key: 'trackrecord.wageimpact', pattern: /wage\s+impact/i, label: 'the wage-impact claim' },
  { key: 'trackrecord.wageimpact', pattern: /\$\s?100\s?M/i, label: 'the $100M figure' },
];

/**
 * An explicitly marked region where a blocked phrase may be NAMED in order to forbid it.
 *
 * The guidance that stops the claim recurring has to quote the claim, so without an
 * allowance it trips its own guard - and the usual response to that is to weaken the
 * guard until it stops complaining. A marked region is the alternative: it is deliberate,
 * it is greppable, and adding one is a visible act in a diff rather than a regex that
 * quietly grows.
 *
 * Opening a region without closing it is itself an error, so the markers cannot be used
 * to disable the check for the rest of a file.
 */
const ALLOW_OPEN = /claim-check:allow-blocked-list/;
const ALLOW_CLOSE = /claim-check:end/;

/** A single line may also name a phrase to ban it, if it says so on the same line. */
const PROHIBITION = /do not use|do not reintroduce|never use|forbidden/i;

/** Approved replacements, printed on failure so the fix is in the error message. */
const APPROVED = [
  'trackrecord.students   "8k+ data students"      VERIFIED',
  'trackrecord.certified  "2,500+ certified"       VERIFIED',
  'trackrecord.hired      "1,000+ hires"           OWNER_ATTESTED',
  'trackrecord.since2012  "Teaching this since 2012"  VERIFIED',
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (EXTENSIONS.test(entry.name)) out.push(p);
  }
  return out;
}

/**
 * Prove the matcher can still reject before it is allowed to approve.
 *
 * Same shape and same reason as the Explorer copy lint in the `guards` job: the thing
 * being trusted here is a list of patterns, and a pattern that has silently stopped
 * matching reports a clean pass over copy it never read. Every sample below is a phrasing
 * that was really in the hub, including the two that escaped the first search.
 */
const SELF_TEST = [
  ['5,000+ careers since 2012', 'the figure with a plus sign, as it appeared in 23 files'],
  ['5,000 plus careers launched', 'the figure spelled out, which escaped the first search'],
  ['more than 5,000 careers since 2012', 'a third phrasing, found late'],
  ['part of the 5,000+ careers built since 2012', 'careers built'],
  ['5,000+ careers changed', 'careers changed'],
  ['Graduates placed', 'the design-kit stat label, whose number lives elsewhere'],
  ['<div class="n">5,000+</div>', 'a bare stat token'],
  ['$100M+ in wage impact generated', 'the wage-impact claim'],
];

function selfTest() {
  let failures = 0;
  for (const [sample, why] of SELF_TEST) {
    const hit = BLOCKED.some((b) => b.pattern.test(sample));
    console.log(`  ${hit ? 'rejects' : 'MISSES '}  ${why}`);
    if (!hit) failures += 1;
  }
  // An approved claim must NOT trip the guard, or the fix is unusable.
  for (const ok of ['1,000+ hires since 2012', '8k+ data students', '2,500+ certified',
    'Teaching this since 2012']) {
    const hit = BLOCKED.some((b) => b.pattern.test(ok));
    console.log(`  ${hit ? 'WRONGLY REJECTS' : 'allows '}  ${ok}`);
    if (hit) failures += 1;
  }
  if (failures > 0) {
    console.error(`\nself-test FAILED: ${failures} pattern(s) no longer behave as intended`);
    process.exit(1);
  }
  console.log('\nself-test passed: every blocked phrasing is rejected, every approved one allowed.');
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  if (!fs.existsSync(HUB)) {
    console.error(`FAILED: the knowledge hub is not at ${HUB}`);
    process.exit(1);
  }

  const files = walk(HUB, []);
  // A run that scanned nothing is not a pass. The hub has ~180 files; a count this low
  // means the path moved and the check is reporting on an empty set.
  if (files.length < 50) {
    console.error(`FAILED: only ${files.length} file(s) found under ${HUB}. `
      + 'That is not the hub - refusing to report a pass over an empty set.');
    process.exit(1);
  }
  const findings = [];

  for (const file of files) {
    const rel = path.relative(HUB, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let allowing = false;
    let openedAt = 0;
    lines.forEach((line, i) => {
      if (ALLOW_OPEN.test(line)) { allowing = true; openedAt = i + 1; return; }
      if (ALLOW_CLOSE.test(line)) { allowing = false; return; }
      if (allowing) return;
      for (const b of BLOCKED) {
        if (!b.pattern.test(line)) continue;
        // A line that names the phrase in order to ban it is the fix, not the defect.
        if (PROHIBITION.test(line)) continue;
        findings.push({ rel, line: i + 1, label: b.label, key: b.key, text: line.trim().slice(0, 130) });
      }
    });
    // An unclosed region would silence the rest of the file, which is the one way this
    // allowance could be abused by accident.
    if (allowing) {
      findings.push({
        rel, line: openedAt, label: 'an unclosed claim-check:allow-blocked-list region',
        key: 'guard', text: 'add a claim-check:end marker',
      });
    }
  }

  console.log(`knowledge hub claim check: ${files.length} file(s) scanned`);

  if (findings.length === 0) {
    console.log('no blocked claim found.');
    return;
  }

  console.error(`\n${findings.length} blocked claim(s) found:\n`);
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.line}  ${f.label}  (${f.key})`);
    console.error(`    ${f.text}`);
  }
  console.error('\nUse an approved claim instead:');
  for (const a of APPROVED) console.error(`  ${a}`);
  console.error('\nThe registry is frontend/src/config/claimsRegistry.ts and it is the '
    + 'source of truth.\nIf a new figure is genuinely needed, add a row there first - '
    + 'no row, no claim.');
  process.exit(1);
}

if (require.main === module) main();

module.exports = { BLOCKED, PROHIBITION, APPROVED };
