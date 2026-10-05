#!/usr/bin/env node
/**
 * Run the docs/growth-os-reset/ citation check, and prove its rules still bite.
 *
 * The rules live in scripts/lib/growthOsCitations.js. This file owns two
 * things: the CLI, and the self-test that keeps those rules honest.
 *
 * WHY THE SELF-TEST IS NOT OPTIONAL. Every rule exists because some specific
 * way of reporting a false pass was found and closed -- several of them by an
 * independent verifier running a 32-fixture false-pass battery against an
 * earlier commit. A matcher that has silently stopped matching reports a clean
 * pass over documents it never really read, which is strictly worse than no
 * check at all. So the self-test runs FIRST, as its own CI step, mirroring
 * scripts/lint-explorer-copy.js -- whose own comment records that its first
 * draft scanned 1 value instead of 77.
 *
 * It asserts in both directions. Cases that must be REJECTED prove each rule
 * is load-bearing. Cases that must be ACCEPTED prove the checker has not
 * simply started refusing everything -- an over-refusing checker "catches"
 * every rejection case while being no check at all.
 *
 * The fixtures are HERMETIC: each writes its own target file into its own temp
 * root and cites that, so no unrelated commit to real repo content can break a
 * required CI gate's self-test.
 *
 * Usage:
 *   node scripts/verifyGrowthOsResetCitations.js
 *   node scripts/verifyGrowthOsResetCitations.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkTree, GAP_MARKERS, REPO_ROOT, DOCS_REL } = require('./lib/growthOsCitations');

/* ─────────────────────────── self-test ─────────────────────────── */

/**
 * The fixture target every self-test case cites. Written into the case's own
 * temp root, so the self-test never depends on real repo content — a CI gate
 * whose self-test can be broken by an unrelated commit is not a gate.
 *
 * Note line 4 and line 6 both CONTAIN `kind: 'explorer',`, and line 4's
 * shallower indentation is a substring of line 6's. That is the real
 * ambiguity found in enrollmentService.ts, reproduced here so both the
 * not-unique failure and the whole-line-equality fallback are exercised.
 */
const TARGET = [
  "export function writeIt() {",                     // 1
  "  return {",                                      // 2
  "    where: {",                                    // 3
  "    kind: 'explorer',",                           // 4
  "    },",                                          // 5
  "      kind: 'explorer',",                         // 6
  "  };",                                            // 7
  "}",                                               // 8
].join('\n') + '\n';

const OK_CITE = "`target.ts:1` → \"export function writeIt() {\"";

const CASES = [
  { name: 'bare citation (no literal)', body: 'See `target.ts:1` for the shape.\n', want: 'bare citation' },
  { name: 'literal absent from the cited file', body: 'A `target.ts:1` → "no such text exists in this file".\n', want: 'literal not found' },
  { name: 'literal too short to be evidence', body: 'A `target.ts:8` → "}".\n', want: 'too short' },
  { name: 'literal not unique even at 8+ chars', body: 'A `target.ts:4` → "kind: \'explorer\',".\n', want: 'not unique' },
  { name: 'range citation rejected (one form only)', body: 'A `target.ts:1-8` → "export function writeIt() {".\n', want: 'range citation' },
  { name: 'cited path missing', body: 'A `does/not/exist.ts:1` → "export function writeIt() {".\n', want: 'does not exist' },
  { name: 'zero citations scanned', body: 'A document making claims with no citations at all.\n', want: 'zero citations scanned' },
  { name: 'email address in a doc', body: `A ${OK_CITE} and contact someone@example.com now.\n`, want: 'forbidden email address' },
  { name: 'JWT in a doc', body: `A ${OK_CITE} token eyJhbGciOiJIUzI1NiXX.\n`, want: 'forbidden JWT' },
  { name: 'unattributed external source', body: `A ${OK_CITE} and [source: https://example.com/api].\n`, want: 'without [fetched' },
  // The four below were all false-passes found by an independent verifier
  // against the previous commit. Each is now a named case.
  { name: 'extensionless citation (was silently skipped)', body: 'A `Makefile:99999` → "a literal that exists nowhere".\n', want: 'not repo-relative' },
  { name: 'backslash path (was silently skipped)', body: 'A `backend\\src\\nope.ts:1` → "a literal that exists nowhere".\n', want: 'backslash' },
  { name: 'path escaping the repo', body: 'A `../outside.ts:1` → "a literal that exists nowhere".\n', want: 'escapes the repo' },
  { name: 'citation to a directory (was an unhandled crash)', body: 'A `sub/:1` → "a literal that exists nowhere".\n', want: 'not a readable file' },
];

/** A self-contained case root: a docs dir plus the fixture target beside it. */
function caseRoot(tmp, prefix) {
  const root = fs.mkdtempSync(path.join(tmp, prefix));
  fs.writeFileSync(path.join(root, 'target.ts'), TARGET, 'utf8');
  fs.mkdirSync(path.join(root, 'sub'));           // for the directory-citation case
  const docs = path.join(root, 'docs');
  fs.mkdirSync(docs);
  return { root, docs };
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gorc-'));
  let bad = 0;
  console.log('self-test: each fixture below MUST be rejected\n');

  for (const c of CASES) {
    const { root, docs } = caseRoot(tmp, 'case-');
    fs.writeFileSync(path.join(docs, 'doc.md'), c.body, 'utf8');
    const { failures } = checkTree(docs, 'self-test', root);
    const caught = failures.some((f) => f.includes(c.want));
    console.log(`  ${caught ? 'caught  ' : 'MISSED  '} ${c.name}`);
    if (!caught) {
      bad += 1;
      console.log(`           expected a failure containing ${JSON.stringify(c.want)}; got: ${JSON.stringify(failures)}`);
    }
  }

  // HTML-only number, which needs an .md alongside it to be a fair test.
  {
    const { root, docs } = caseRoot(tmp, 'html-');
    fs.writeFileSync(path.join(docs, 'doc.md'), `A ${OK_CITE}.\n`, 'utf8');
    fs.writeFileSync(path.join(docs, 'view.html'), '<p>Score: 73 out of 100</p>\n', 'utf8');
    const h = checkTree(docs, 'self-test', root);
    const caught = h.failures.some((f) => f.includes('number 73'));
    console.log(`  ${caught ? 'caught  ' : 'MISSED  '} number in HTML absent from any .md`);
    if (!caught) bad += 1;
  }

  // The substring hole: an HTML figure of 73 must NOT be satisfied by a
  // document whose only "73" sits inside "1738".
  {
    const { root, docs } = caseRoot(tmp, 'substr-');
    fs.writeFileSync(path.join(docs, 'doc.md'), `A ${OK_CITE}. The queue held 1738 rows.\n`, 'utf8');
    fs.writeFileSync(path.join(docs, 'view.html'), '<p>Readiness score: 73</p>\n', 'utf8');
    const sm = checkTree(docs, 'self-test', root);
    const caught = sm.failures.some((f) => f.includes('number 73'));
    console.log(`  ${caught ? 'caught  ' : 'MISSED  '} HTML figure 73 is not satisfied by "1738"`);
    if (!caught) bad += 1;
  }

  // Per-file non-vacuity: an entirely uncited document must not ride along on
  // a sibling's citation.
  {
    const { root, docs } = caseRoot(tmp, 'uncited-');
    fs.writeFileSync(path.join(docs, 'cited.md'), `A ${OK_CITE}.\n`, 'utf8');
    fs.writeFileSync(path.join(docs, 'bare.md'), 'The Governor exists. Suppression is enforced everywhere.\n', 'utf8');
    const u = checkTree(docs, 'self-test', root);
    const caught = u.failures.some((f) => f.includes('no citations in this document'));
    console.log(`  ${caught ? 'caught  ' : 'MISSED  '} an uncited doc beside a cited one`);
    if (!caught) bad += 1;
  }

  console.log('\nand these MUST be accepted — a checker that refuses everything would\n"catch" every case above without being a check at all\n');

  // CSS/SVG/attribute numerals must NOT count as figures. Without this the
  // HTML rule fails on contact with any real styled page, and the cheapest
  // way to make it green again is to narrow it until it checks nothing.
  {
    const { root, docs } = caseRoot(tmp, 'style-');
    fs.writeFileSync(path.join(docs, 'doc.md'), `A ${OK_CITE}.\n`, 'utf8');
    fs.writeFileSync(
      path.join(docs, 'view.html'),
      '<style>.a{padding:12px;color:rgba(0,0,0,.08)}</style>'
        + '<svg viewBox="0 0 24 24"><path d="M12 3 L18 21"/></svg>'
        + '<p data-x="99">no figures in this sentence</p>\n',
      'utf8',
    );
    const st = checkTree(docs, 'self-test', root);
    const ok = st.failures.length === 0 && st.figures === 0;
    console.log(`  ${ok ? 'passed  ' : 'FAILED  '} CSS, SVG and attribute numerals are not figures`);
    if (!ok) {
      bad += 1;
      console.log(`           figures=${st.figures} failures=${JSON.stringify(st.failures)}`);
    }
  }

  // Whole-line equality must resolve the real substring ambiguity, so the
  // apposite line stays citable instead of forcing a detour to a neighbour.
  {
    const { root, docs } = caseRoot(tmp, 'exact-');
    fs.writeFileSync(path.join(docs, 'doc.md'), '`target.ts:6` → "      kind: \'explorer\',"\n', 'utf8');
    const e = checkTree(docs, 'self-test', root);
    const ok = e.failures.length === 0 && e.drift.length === 0;
    console.log(`  ${ok ? 'passed  ' : 'FAILED  '} indentation disambiguates an otherwise non-unique literal`);
    if (!ok) {
      bad += 1;
      console.log(`           failures=${JSON.stringify(e.failures)} drift=${JSON.stringify(e.drift)}`);
    }
  }

  // Drift must be REPORTED and must NOT fail. This is the property that stops
  // a required CI check going red across every open PR the moment an
  // unrelated commit inserts a line above a cited one.
  {
    const { root, docs } = caseRoot(tmp, 'drift-');
    fs.writeFileSync(path.join(docs, 'doc.md'), '`target.ts:9999` → "export function writeIt() {"\n', 'utf8');
    const d = checkTree(docs, 'self-test', root);
    const ok = d.failures.length === 0 && d.drift.length === 1;
    console.log(`  ${ok ? 'passed  ' : 'FAILED  '} a moved line is drift, not failure`);
    if (!ok) {
      bad += 1;
      console.log(`           failures=${JSON.stringify(d.failures)} drift=${JSON.stringify(d.drift)}`);
    }
  }

  {
    const { root, docs } = caseRoot(tmp, 'good-');
    fs.writeFileSync(path.join(docs, 'doc.md'), `Valid: ${OK_CITE} and a noted ABSENT gap.\n`, 'utf8');
    const g = checkTree(docs, 'self-test', root);
    const ok = g.failures.length === 0 && g.drift.length === 0;
    console.log(`  ${ok ? 'passed  ' : 'FAILED  '} a correct document is accepted, with no drift`);
    if (!ok) {
      bad += 1;
      console.log(`           failures=${JSON.stringify(g.failures)} drift=${JSON.stringify(g.drift)}`);
    }
  }

  // Clean up after ourselves; the previous version left a gorc-* directory in
  // the OS temp dir on every run.
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }

  console.log(`\nself-test: ${bad === 0 ? 'OK' : bad + ' case(s) wrong'}`);
  return bad === 0 ? 0 : 1;
}

/* ─────────────────────────── main ─────────────────────────── */

function main() {
  if (process.argv.includes('--self-test')) process.exit(selfTest());

  const docsAbs = path.join(REPO_ROOT, DOCS_REL);

  // The directory being ABSENT and the directory being EMPTY mean different
  // things, and conflating them would break CI for every unrelated PR. This
  // check runs in the required `guards` job, so on a branch that predates the
  // Growth OS reset there is simply nothing to verify — that is a pass. A
  // directory that EXISTS while yielding no citations is the vacuous-run
  // failure, and that still fails below.
  if (!fs.existsSync(docsAbs)) {
    console.log(`${DOCS_REL.replace(/\\/g, '/')} not present on this branch — nothing to check`);
    return;
  }

  const r = checkTree(docsAbs, DOCS_REL.replace(/\\/g, '/'));

  console.log(`${r.citations} citations checked across ${r.filesWithCitations} of ${r.files} files in ${DOCS_REL.replace(/\\/g, '/')}`);
  console.log(`${r.figures} HTML figures traced to a source doc`);
  const gaps = GAP_MARKERS.map((m) => `${m}=${r.gapCounts[m]}`).join(' ');
  console.log(`honest-gap markers: ${gaps}`);

  if (r.drift.length > 0) {
    console.log(`\n${r.drift.length} citation(s) drifted — literal verified, line number stale:`);
    for (const d of r.drift) console.log(`  ${d}`);
  }

  if (r.failures.length > 0) {
    console.error(`\n${r.failures.length} failure(s):\n`);
    for (const f of r.failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('citations OK');
}

main();
