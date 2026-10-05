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
 *     `path/to/file.ts:123` → "the exact text on line 123"
 *
 * A bare `path:123` with no literal FAILS. The literal must occur on exactly
 * that line — there is no ±N slack. The slack is what the first draft of this
 * checker had, and a plan audit caught it immediately: it let
 * `unsubscribeEnforcementService.ts:133` (a function signature) stand in as
 * evidence for an enforcement that actually lives at :155. A gate that accepts
 * the signature of the function instead of the line that does the work is not
 * a gate.
 *
 * Literals are delimited by double quotes, or by single quotes when the cited
 * line itself contains a double quote. This repo's TypeScript is single-quoted
 * (prettier), so double-quote delimiters cover nearly every real citation.
 *
 * NO BYPASS IS PROVIDED, deliberately. If a cited line contains something this
 * checker refuses to see in a doc (an email address, say), cite a different
 * unique literal from that same line. An escape hatch would be used.
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

/** Numbers in HTML text content: tags, attributes, style and script stripped. */
function htmlTextNumbers(src) {
  const text = src
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  const found = new Set();
  for (const m of text.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)) {
    const raw = m[0].replace(/,/g, '');
    // Single digits are too noisy to be evidence of anything.
    if (raw.replace(/\./g, '').length >= 2) found.add(raw);
  }
  return found;
}

function checkTree(docsAbs, label) {
  const failures = [];
  const files = walk(docsAbs);
  let citations = 0;
  let filesWithCitations = 0;
  const gapCounts = Object.fromEntries(GAP_MARKERS.map((m) => [m, 0]));

  const mdBodies = [];
  for (const abs of files) {
    if (/\.md$/i.test(abs)) mdBodies.push(fs.readFileSync(abs, 'utf8'));
  }
  const mdAll = mdBodies.join('\n');

  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs).replace(/\\/g, '/');
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
        const [whole, citedPath, startStr] = t;
        const start = Number(startStr);
        citations += 1;
        fileHadCitation = true;

        const literal = literalAfter(line, t.index + whole.length);
        if (literal === null) {
          failures.push(`${rel}:${i + 1}  bare citation \`${citedPath}:${start}\` — every citation needs → "literal from that line"`);
          continue;
        }

        const targetAbs = path.join(REPO_ROOT, citedPath);
        if (!fs.existsSync(targetAbs)) {
          failures.push(`${rel}:${i + 1}  cited path does not exist: ${citedPath}`);
          continue;
        }
        const targetLines = readLines(targetAbs);
        if (start < 1 || start > targetLines.length) {
          failures.push(`${rel}:${i + 1}  ${citedPath}:${start} out of range (file has ${targetLines.length} lines)`);
          continue;
        }
        if (!targetLines[start - 1].includes(literal)) {
          failures.push(
            `${rel}:${i + 1}  literal not on cited line.\n` +
            `      cited   ${citedPath}:${start}\n` +
            `      wanted  ${JSON.stringify(literal)}\n` +
            `      actual  ${JSON.stringify(targetLines[start - 1].trim().slice(0, 90))}`,
          );
        }
      }
    });

    if (/\.html$/i.test(abs)) {
      const src = fs.readFileSync(abs, 'utf8');
      for (const n of htmlTextNumbers(src)) {
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

  return { failures, citations, filesWithCitations, files: files.length, gapCounts };
}

/* ─────────────────────────── self-test ─────────────────────────── */

const CASES = [
  { name: 'bare citation (no literal)', body: 'See `package.json:1` for the name.\n', want: 'bare citation' },
  { name: 'literal not on cited line', body: 'A `package.json:1` → "this text is not on line 1".\n', want: 'literal not on cited line' },
  { name: 'cited path missing', body: 'A `backend/src/does/not/exist.ts:1` → "x".\n', want: 'does not exist' },
  { name: 'line out of range', body: 'A `package.json:999999` → "x".\n', want: 'out of range' },
  { name: 'zero citations scanned', body: 'A document making claims with no citations at all.\n', want: 'zero citations scanned' },
  { name: 'email address in a doc', body: 'A `package.json:1` → "{" and contact someone@example.com now.\n', want: 'forbidden email address' },
  { name: 'JWT in a doc', body: 'A `package.json:1` → "{" token eyJhbGciOiJIUzI1NiXX.\n', want: 'forbidden JWT' },
  { name: 'unattributed external source', body: 'A `package.json:1` → "{" and [source: https://example.com/api].\n', want: 'without [fetched' },
];

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gorc-'));
  let bad = 0;
  console.log('self-test: each fixture below MUST be rejected\n');

  for (const c of CASES) {
    const dir = fs.mkdtempSync(path.join(tmp, 'case-'));
    fs.writeFileSync(path.join(dir, 'doc.md'), c.body, 'utf8');
    const { failures } = checkTree(dir, 'self-test');
    const caught = failures.some((f) => f.includes(c.want));
    console.log(`  ${caught ? 'caught  ' : 'MISSED  '} ${c.name}`);
    if (!caught) {
      bad += 1;
      console.log(`           expected a failure containing ${JSON.stringify(c.want)}; got: ${JSON.stringify(failures)}`);
    }
  }

  // HTML-only number, which needs an .md alongside it to be a fair test.
  const hdir = fs.mkdtempSync(path.join(tmp, 'html-'));
  fs.writeFileSync(path.join(hdir, 'doc.md'), 'A `package.json:1` → "{".\n', 'utf8');
  fs.writeFileSync(path.join(hdir, 'view.html'), '<p>Score: 73 out of 100</p>\n', 'utf8');
  const h = checkTree(hdir, 'self-test');
  const caughtHtml = h.failures.some((f) => f.includes('number 73'));
  console.log(`  ${caughtHtml ? 'caught  ' : 'MISSED  '} number in HTML absent from any .md`);
  if (!caughtHtml) bad += 1;

  // And a positive control: a correct doc must PASS, or the checker is just
  // refusing everything, which would also "catch" every case above.
  const gdir = fs.mkdtempSync(path.join(tmp, 'good-'));
  fs.writeFileSync(path.join(gdir, 'doc.md'), 'Valid: `package.json:1` → "{" and a noted ABSENT gap.\n', 'utf8');
  const g = checkTree(gdir, 'self-test');
  console.log(`  ${g.failures.length === 0 ? 'passed  ' : 'FAILED  '} a correct document is accepted (control)`);
  if (g.failures.length !== 0) {
    bad += 1;
    console.log(`           ${JSON.stringify(g.failures)}`);
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
  const gaps = GAP_MARKERS.map((m) => `${m}=${r.gapCounts[m]}`).join(' ');
  console.log(`honest-gap markers: ${gaps}`);

  if (r.failures.length > 0) {
    console.error(`\n${r.failures.length} failure(s):\n`);
    for (const f of r.failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('citations OK');
}

main();
