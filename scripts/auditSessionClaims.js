#!/usr/bin/env node
/**
 * auditSessionClaims — mechanically tie the claims in a session-log entry to the evidence
 * that would establish them.
 *
 * WHY THIS EXISTS. Phase 2 of the Growth OS reset put six tasks through an independent
 * verifier. Three failed, and not one of them failed on behaviour — every production change
 * was reproduced as correct. They failed on the evidence written *about* the work, in four
 * recurring shapes:
 *
 *   1. A claim of ABSENCE ("deleted", "removed", "nothing does X") backed by a test COUNT.
 *      A count proves presence. It cannot prove absence. T206 claimed in four places that
 *      three tests were deleted; they were still in the tree and running.
 *   2. A claim of COMPLETENESS ("the three paths", "four named ways", "all five writers")
 *      written from a plan rather than derived from source. The plan said three writers;
 *      there were five.
 *   3. A claim ABOUT A FILE written without reading the file — a citation, a literal, a line
 *      number taken from memory.
 *   4. A claim that a CORRECTION was made, landing in the commit message and the log while
 *      the shipped artifact kept asserting the thing being retracted.
 *
 * The meta-failure underneath all four: self-review checks whatever happened to be measured,
 * not the claims actually made. T206's verification block passed its own review precisely
 * because the one number it checked was the one thing that was right — 924, where 921 was
 * correct, and 924 − 3 = 921 was the arithmetic proving the prose false.
 *
 * WHAT THIS CHECKS, and nothing more:
 *   A. FIGURE TRACEABILITY. Every number in a `- Verification:` line must appear verbatim
 *      inside a fenced block in the same entry. A figure with no pasted command output
 *      behind it is unreconstructible, and an unreconstructible figure is indistinguishable
 *      from an invented one even when honestly measured.
 *   B. ABSENCE EVIDENCE. Any sentence asserting something is gone must have a pasted zero in
 *      the same entry — a `→ 0`, a `returns 0`, a `no matches`. The count is not enough.
 *   C. COMPLETENESS (warning only). A sentence asserting an exhaustive set should have a
 *      fenced block in the entry, on the assumption the set was derived by a command.
 *
 * WHAT IT CANNOT CHECK. It does not read the code, so it cannot tell whether a claim is TRUE
 * — only whether the entry carries the shape of evidence that claim requires. It is a
 * completeness gate on evidence, not a correctness gate on facts. Citation literals are
 * verified by `verifyGrowthOsResetCitations.js`, which this does not duplicate.
 *
 * Usage:  node scripts/auditSessionClaims.js docs/sessions/CC-20261005-r6h2.md [T206]
 *         node scripts/auditSessionClaims.js --rev 837f1673 docs/sessions/... [T206]
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------------------
// PRECISION MATTERS MORE THAN REACH HERE. The first version of this file flagged 21 things
// on a real entry, most of them `wc -l` counts, prose containing the word "no", and an
// honest retraction of a superseded figure. A gate that cries wolf gets skipped, and a
// skipped gate is worse than none because it also supplies false assurance. So every check
// below is narrowed to a shape that only a real claim takes, and each is willing to miss
// cases rather than manufacture them.
// ---------------------------------------------------------------------------------------

/** A figure worth tracing: a number immediately qualified by what it counts. */
// `(?<![\\w-])` so a hyphenated identifier followed by the counted noun is not read as a
// figure: "row-31 citations" names a table row, it does not assert a count of 31.
const FIGURE = /(?<![\w-])(\d[\d,]{1,})\s*\**\s*(tests|suites|citations)\b/gi;

/** Words that mark a number as superseded rather than asserted - a retraction is not a claim. */
const RETRACTED = /\b(retract|superseded|previously|used to|was wrong|stale|read "|said "|replaced|corrected from|earlier version|attempt \d|auditor flagged|flagged "|had taken the count|also WRONG)\b/i;

/**
 * An absence claim about a CODE ARTEFACT. The verb alone is far too broad - "no schema
 * change", "removed from the roster", "dropped the deposit" are all prose. Requiring a
 * backticked identifier or path in the same sentence is what separates "I deleted
 * `fooTest`" from an English sentence that happens to contain a negation.
 */
const ABSENCE_VERB = /\b(deleted|removed|stripped out|no longer (?:present|exists|in the tree)|gone from the tree)\b/i;
const NAMES_CODE = /`[^`]+`/;

/** Evidence that something is ABSENT, as opposed to a count proving presence. */
const ZERO_EVIDENCE = /(→\s*\**0\**(?!\d)|returns? \**0\**(?!\d)|\bno matches\b|\bzero matches\b|grep -c[^\n]{0,200}?\b0\b)/i;

/** A claim that a set is exhaustive. Also requires a named artefact to count as one. */
const COMPLETENESS = /\b(all (?:five|four|three|two|\d+)|every (?:writer|caller|consumer|path|file|field|site)|exactly (?:five|four|three|two|\d+)|the (?:five|four|three|two) (?:writers|paths|callers|syntaxes|ways|classes|sites))\b/i;

function entriesOf(md) {
  const lines = md.split(/\r?\n/);
  const starts = [];
  lines.forEach((l, i) => { if (/^- \[[x~ ]\] /.test(l)) starts.push(i); });
  return starts.map((s, k) => ({
    title: lines[s].slice(6).trim(),
    body: lines.slice(s, k + 1 < starts.length ? starts[k + 1] : lines.length),
  }));
}

/**
 * Split into BULLETS first, then sentences within each. Splitting the whole entry on
 * sentence boundaries let one keyword in one bullet contaminate a 400-word blob, which is
 * how the first version produced unreadable findings.
 */
function claims(body) {
  const out = [];
  let current = [];
  for (const l of body) {
    if (/^\s*- /.test(l) && current.length) { out.push(current.join(' ')); current = []; }
    current.push(l.trim());
  }
  if (current.length) out.push(current.join(' '));
  return out.flatMap((b) => b.split(/(?<=[.!?])\s+(?=[A-Z*`(])/))
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function fencedBlocks(body) {
  const out = [];
  let inside = false;
  let buf = [];
  for (const l of body) {
    if (/^\s*```/.test(l)) {
      if (inside) { out.push(buf.join('\n')); buf = []; }
      inside = !inside;
      continue;
    }
    if (inside) buf.push(l);
  }
  return out;
}

function auditEntry(entry) {
  const findings = [];
  const blocks = fencedBlocks(entry.body).join('\n');
  const all = claims(entry.body);

  // ---- A. A qualified figure must be reconstructible from a pasted command. ----
  for (const sentence of all) {
    if (RETRACTED.test(sentence)) continue;
    for (const m of sentence.matchAll(FIGURE)) {
      const n = m[1].replace(/,/g, '');
      if (new RegExp(`\\b${n}\\b`).test(blocks)) continue;
      findings.push({
        kind: 'UNTRACEABLE FIGURE',
        detail: `${n} ${m[2]} — asserted, but that number is in no fenced block in this entry`,
        fix: 'paste the invocation and its output, or drop the figure',
      });
    }
  }

  // ---- B. An absence claim about a named artefact needs a pasted zero. ----
  const hasZero = ZERO_EVIDENCE.test(entry.body.join('\n'));
  if (!hasZero) {
    for (const sentence of all) {
      if (!ABSENCE_VERB.test(sentence) || !NAMES_CODE.test(sentence)) continue;
      findings.push({
        kind: 'ABSENCE CLAIM WITHOUT A ZERO',
        detail: sentence.slice(0, 160),
        fix: 'grep for the thing claimed gone and paste the 0 / no-matches result',
      });
    }
  }

  // ---- C. An exhaustive-set claim should be derived (warning). ----
  if (!blocks.trim()) {
    for (const sentence of all) {
      if (!COMPLETENESS.test(sentence) || !NAMES_CODE.test(sentence)) continue;
      findings.push({
        kind: 'WARN: COMPLETENESS CLAIM, NOTHING DERIVED',
        detail: sentence.slice(0, 160),
        fix: 'derive the set from source and paste the command',
      });
    }
  }

  // De-duplicate: the same figure or sentence flagged twice is noise, not emphasis.
  const seen = new Set();
  return findings.filter((f) => {
    const key = f.kind + '|' + f.detail;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function main() {
  const args = process.argv.slice(2);
  let rev = null;
  const revAt = args.indexOf('--rev');
  if (revAt !== -1) { rev = args[revAt + 1]; args.splice(revAt, 2); }
  const [file, taskFilter] = args;
  if (!file) {
    console.error('usage: node scripts/auditSessionClaims.js [--rev SHA] <session-log.md> [TaskIdPrefix]');
    process.exit(2);
  }

  const md = rev
    ? execFileSync('git', ['show', `${rev}:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    : fs.readFileSync(file, 'utf8');

  let entries = entriesOf(md);
  if (taskFilter) entries = entries.filter((e) => e.title.includes(taskFilter));
  if (!entries.length) {
    console.error(`no entries matched${taskFilter ? ` "${taskFilter}"` : ''} in ${file}${rev ? ` at ${rev}` : ''}`);
    process.exit(2);
  }

  let errors = 0;
  let warnings = 0;
  for (const e of entries) {
    const findings = auditEntry(e);
    if (!findings.length) continue;
    console.log(`\n${e.title.slice(0, 110)}`);
    for (const f of findings) {
      const warn = f.kind.startsWith('WARN');
      if (warn) warnings += 1; else errors += 1;
      console.log(`  ${warn ? '~' : '✗'} ${f.kind}`);
      console.log(`      ${f.detail}`);
      console.log(`      fix: ${f.fix}`);
    }
  }

  console.log(
    `\n${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} audited${rev ? ` at ${rev}` : ''} — `
    + `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`,
  );
  process.exit(errors ? 1 : 0);
}

main();
