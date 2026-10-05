#!/usr/bin/env node
/**
 * Verify the citations in docs/growth-os-reset/.
 *
 * Phase 1 of the Growth OS reset produces documents, and documents are where
 * fabrication hides. This checker exists so that a claim about current repo
 * behaviour cannot be asserted without evidence a machine can re-derive.
 *
 * THE CITATION FORM IS MANDATORY:
 *
 *     `path/to/file.ts:123` → "text that occurs exactly once in that file"
 *
 * A bare `path:123` with no literal FAILS.
 *
 * THE LITERAL IS AUTHORITATIVE; THE LINE NUMBER IS ADVISORY. The literal must
 * occur exactly once in the cited file. If it does, the citation passes — and
 * if it has moved, that is reported as DRIFT with its new line number, not as
 * a failure.
 *
 * This is the second design. The first made the line number authoritative and
 * required the literal to sit on exactly that line. Two audits took it apart:
 *
 *  - The anti-fabrication property lives entirely in the literal. Requiring a
 *    quote of the enforcing line is what stops a doc citing
 *    `unsubscribeEnforcementService.ts:133` (the signature
 *    `export async function processOptOut(`) as evidence for an enforcement
 *    that is really at :155. The line number never carried that weight.
 *  - Exact-line pinning in a REQUIRED CI check is a trap. 1042 commits touched
 *    backend/src in the last 30 days. Any unrelated insertion above a cited
 *    line would turn this check red on every open PR in the repo, and the
 *    honest response would be to delete the check.
 *
 * Uniqueness also does three jobs the first design needed extra rules for: it
 * is the distinctiveness floor, so a lone brace or a comment terminator can no
 * longer satisfy a citation; it removes any need for a `LINE-LINE` range form; and it gives
 * multi-line constructs an expressible citation, since any unique line of the
 * construct works. Range tokens are therefore rejected outright, so there is
 * exactly one citation form.
 *
 * What this proves is that a quote is REAL and FINDABLE — not that it is
 * apposite. `…:133` → "export async function processOptOut(" still passes
 * while being the wrong line to cite for an enforcement claim. Judging
 * aptness is a human job and stays one.
 *
 * Literals are delimited by double quotes, or by single quotes when the cited
 * line itself contains a double quote. This repo's TypeScript is single-quoted
 * (prettier), so double-quote delimiters cover nearly every real citation.
 *
 * NO BYPASS IS PROVIDED, deliberately. If a cited line contains something this
 * checker refuses to see in a doc (an email address, say), cite a different
 * unique literal from that same line — the failure message says so. An escape
 * token would be used.
 *
 * WHY THE PII RULE LIVES HERE: scripts/secret-scan.js excludes `\.md$` and
 * `docs/`, so documentation is precisely where the repo's secret scanner does
 * not look. The check is targeted (addresses, JWTs, known key prefixes) rather
 * than entropy-based, because generic high-entropy matching false-positives on
 * every git SHA, and the checkpoint has to cite a commit SHA.
 *
 * Usage:
 *   node scripts/verifyGrowthOsResetCitations.js
 *   node scripts/verifyGrowthOsResetCitations.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS_REL = path.join('docs', 'growth-os-reset');

const GAP_MARKERS = ['ABSENT', 'UNKNOWN', 'UNVERIFIED'];

// A citation token: `some/path.ext:123` or `some/path.ext:123-456`.
const TOKEN = /`([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?`/g;

const FORBIDDEN = [
  { name: 'email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}/ },
  { name: 'API key prefix', re: /\b(?:sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,})/ },
];

function readLines(abs) {
  return fs.readFileSync(abs, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(md|html)$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** Pull the literal that follows a citation token, or null. */
function literalAfter(line, endIndex) {
  const rest = line.slice(endIndex);
  const m = /^\s*(?:→|->)\s*("([^"]+)"|'([^']+)')/.exec(rest);
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[3];
}

/**
 * Figures in HTML *text content*, defined precisely so this rule cannot
 * quietly narrow itself until it checks nothing.
 *
 * A "figure" is a numeric token in text that a reader actually sees. So:
 * `<style>`, `<script>` and `<svg>` elements are removed WHOLE (they are full
 * of numerals — `padding: 12px`, `rgba(0,0,0,.08)`, `viewBox="0 0 24 24"`,
 * path coordinates — that belong to no document), then every remaining tag is
 * removed, which also discards attributes. From what is left, a figure is
 * `\d[\d,]*(\.\d+)?%?` with at least two significant digits; commas and a
 * trailing % are normalised away. Single digits are too noisy to be evidence.
 */
function htmlTextNumbers(src) {
  const text = src
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  const found = new Set();
  for (const m of text.matchAll(/\b\d[\d,]*(?:\.\d+)?%?\b/g)) {
    const raw = m[0].replace(/,/g, '').replace(/%$/, '');
    if (raw.replace(/\./g, '').length >= 2) found.add(raw);
  }
  return found;
}

/**
 * `rootOverride` exists so the self-test can be hermetic: its fixtures write
 * their own target files and cite them, instead of citing real repo content
 * that someone else's commit could change out from under a CI gate.
 */
function checkTree(docsAbs, label, rootOverride) {
  const root = rootOverride || REPO_ROOT;
  const failures = [];
  const drift = [];
  const files = walk(docsAbs);
  let citations = 0;
  let filesWithCitations = 0;
  let figures = 0;
  const gapCounts = Object.fromEntries(GAP_MARKERS.map((m) => [m, 0]));

  const mdBodies = [];
  for (const abs of files) {
    if (/\.md$/i.test(abs)) mdBodies.push(fs.readFileSync(abs, 'utf8'));
  }
  const mdAll = mdBodies.join('\n');

  for (const abs of files) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    const lines = readLines(abs);
    let fileHadCitation = false;

    for (const rule of FORBIDDEN) {
      lines.forEach((line, i) => {
        const hit = rule.re.exec(line);
        if (hit) failures.push(`${rel}:${i + 1}  forbidden ${rule.name} in documentation: ${hit[0].slice(0, 24)}…`);
      });
    }

    lines.forEach((line, i) => {
      for (const m of GAP_MARKERS) {
        if (line.includes(m)) gapCounts[m] += 1;
      }

      if (/\[source:\s*https?:/i.test(line) && !/\[fetched\s+\d{4}-\d{2}-\d{2}\]/.test(line) && !line.includes('UNVERIFIED')) {
        failures.push(`${rel}:${i + 1}  external [source: …] without [fetched YYYY-MM-DD] and not marked UNVERIFIED`);
      }

      TOKEN.lastIndex = 0;
      let t;
      while ((t = TOKEN.exec(line)) !== null) {
        const [whole, citedPath, startStr, endStr] = t;
        const start = Number(startStr);
        citations += 1;
        fileHadCitation = true;

        if (endStr !== undefined) {
          failures.push(`${rel}:${i + 1}  range citation \`${citedPath}:${start}-${endStr}\` — ranges are not a citation form; cite the one line whose literal you are quoting`);
          continue;
        }

        const literal = literalAfter(line, t.index + whole.length);
        if (literal === null) {
          failures.push(`${rel}:${i + 1}  bare citation \`${citedPath}:${start}\` — every citation needs → "a literal that occurs exactly once in that file"`);
          continue;
        }

        // Distinctiveness floor. Uniqueness alone stops being enough once
        // whole-line equality is a fallback: package.json's last line is
        // exactly `}`, so a one-character literal would resolve "uniquely"
        // and prove nothing. Eight non-whitespace characters is the bar.
        if (literal.replace(/\s/g, '').length < 8) {
          failures.push(`${rel}:${i + 1}  literal too short to be evidence (${JSON.stringify(literal)}) — quote at least 8 non-whitespace characters`);
          continue;
        }

        const targetAbs = path.join(root, citedPath);
        if (!fs.existsSync(targetAbs)) {
          failures.push(`${rel}:${i + 1}  cited path does not exist: ${citedPath}`);
          continue;
        }

        // The literal is the evidence. Find every line carrying it.
        const targetLines = readLines(targetAbs);
        let hits = [];
        targetLines.forEach((tl, idx) => { if (tl.includes(literal)) hits.push(idx + 1); });

        // Substring matching can be legitimately ambiguous: in
        // enrollmentService.ts, `enrollment_type: 'explorer',` is both a WHERE
        // clause and the write, and the shallower indentation is a substring
        // of the deeper one. So when a literal is not unique as a substring,
        // fall back to whole-line equality, which lets an author disambiguate
        // by quoting the line's own indentation. No new syntax, and it keeps
        // the apposite line citable instead of forcing a detour to a
        // neighbouring one.
        if (hits.length > 1) {
          const exact = [];
          targetLines.forEach((tl, idx) => { if (tl.replace(/\s+$/, '') === literal.replace(/\s+$/, '')) exact.push(idx + 1); });
          if (exact.length === 1) hits = exact;
        }

        if (hits.length === 0) {
          failures.push(
            `${rel}:${i + 1}  literal not found anywhere in ${citedPath}\n` +
            `      wanted ${JSON.stringify(literal)}\n` +
            `      (if the cited line holds something this checker refuses to print — an address, a token —\n` +
            `       quote a different unique literal from that same line)`,
          );
          continue;
        }
        if (hits.length > 1) {
          failures.push(
            `${rel}:${i + 1}  literal is not unique in ${citedPath} — ${hits.length} occurrences (lines ${hits.slice(0, 6).join(', ')}${hits.length > 6 ? ', …' : ''})\n` +
            `      wanted ${JSON.stringify(literal)}\n` +
            `      quote something distinctive enough to identify one line`,
          );
          continue;
        }
        if (hits[0] !== start) {
          drift.push(`${rel}:${i + 1}  ${citedPath}:${start} → now at line ${hits[0]} (literal verified; update the number when convenient)`);
        }
      }
    });

    if (/\.html$/i.test(abs)) {
      const src = fs.readFileSync(abs, 'utf8');
      for (const n of htmlTextNumbers(src)) {
        figures += 1;
        if (!mdAll.includes(n)) {
          failures.push(`${rel}  number ${n} appears in the HTML but in no sibling .md — every figure must be traceable to its source doc`);
        }
      }
    }

    if (fileHadCitation) filesWithCitations += 1;
  }

  if (citations === 0) {
    failures.push(`${label}: zero citations scanned — a run that read nothing must not look like a pass`);
  }

  return { failures, drift, citations, filesWithCitations, files: files.length, gapCounts, figures };
}

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
];

/** A self-contained case root: a docs dir plus the fixture target beside it. */
function caseRoot(tmp, prefix) {
  const root = fs.mkdtempSync(path.join(tmp, prefix));
  fs.writeFileSync(path.join(root, 'target.ts'), TARGET, 'utf8');
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
