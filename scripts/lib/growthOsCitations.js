/**
 * The citation rules for docs/growth-os-reset/ -- the rules themselves.
 *
 * Split out of scripts/verifyGrowthOsResetCitations.js when that file crossed
 * the repo's 500-line ceiling. This module owns WHAT a valid citation is; the
 * CLI owns running it and PROVING the rules still bite. Extraction was
 * verbatim and the CLI's self-test is the characterization proof.
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
 * Entry point: scripts/verifyGrowthOsResetCitations.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DOCS_REL = path.join('docs', 'growth-os-reset');

const GAP_MARKERS = ['ABSENT', 'UNKNOWN', 'UNVERIFIED'];

/**
 * A citation token: anything shaped `<path>:<digits>` in backticks.
 *
 * Deliberately LOOSE, then validated below. A strict pattern silently skips
 * what it cannot parse, which is the worst possible failure mode for an
 * evidence gate: a verifier showed that `` `Makefile:99999` `` and a
 * backslash path both exited 0 while carrying an invented literal, because
 * the strict form required a dotted extension and forward slashes. Anything
 * that LOOKS like a citation must now be either valid or a failure — never
 * ignored.
 *
 * The cost is that a backticked `12:30` reads as a citation to a path "12"
 * and fails. That is the right trade: failing loudly on an ambiguous token
 * beats silently skipping a real one. Write times without backticks.
 */
const TOKEN = /`([^`\s:]+):(\d+)(?:-(\d+))?`/g;

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

  // Numbers present in the markdown, as a set of exact TOKENS rather than a
  // blob to substring-search. A blob search is near-vacuous for the two- and
  // three-digit figures that actually matter: a verifier demonstrated that an
  // HTML reading "Readiness score: 73" passed against docs whose only "73"
  // was inside "1738".
  const mdNumbers = new Set();
  for (const abs of files) {
    if (!/\.md$/i.test(abs)) continue;
    const body = fs.readFileSync(abs, 'utf8');
    for (const m of body.matchAll(/\b\d[\d,]*(?:\.\d+)?%?\b/g)) {
      mdNumbers.add(m[0].replace(/,/g, '').replace(/%$/, ''));
    }
  }

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

        // Validate the loose path before touching the filesystem.
        if (citedPath.includes('\\')) {
          failures.push(`${rel}:${i + 1}  citation path uses backslashes (${citedPath}) — use forward slashes, repo-relative`);
          continue;
        }
        if (citedPath.split('/').includes('..')) {
          failures.push(`${rel}:${i + 1}  citation path escapes the repo (${citedPath}) — cite a repo-relative path`);
          continue;
        }
        if (!citedPath.includes('/') && !citedPath.includes('.')) {
          failures.push(`${rel}:${i + 1}  citation path is not repo-relative (${citedPath}) — expected something like backend/src/x.ts`);
          continue;
        }

        const targetAbs = path.join(root, citedPath);
        if (!fs.existsSync(targetAbs)) {
          failures.push(`${rel}:${i + 1}  cited path does not exist: ${citedPath}`);
          continue;
        }

        // The literal is the evidence. Find every line carrying it. Reading
        // can still fail — a citation to a directory raised an unhandled
        // EISDIR trace — and a gate's own crash is not an acceptable report.
        let targetLines;
        try {
          targetLines = readLines(targetAbs);
        } catch (err) {
          failures.push(`${rel}:${i + 1}  cited path is not a readable file (${citedPath}): ${err.code || err.message}`);
          continue;
        }
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
        if (!mdNumbers.has(n)) {
          failures.push(`${rel}  number ${n} appears in the HTML but in no sibling .md — every figure must be traceable to its source doc`);
        }
      }
    }

    if (fileHadCitation) filesWithCitations += 1;

    // Non-vacuity has to be PER FILE, not per tree. A verifier showed that a
    // document consisting entirely of uncited assertion ("The Governor
    // exists. Suppression is enforced everywhere.") passed so long as one
    // other document in the tree carried a single valid citation — which is
    // exactly the artifact this gate exists to refuse. Every markdown doc in
    // this tree makes claims about the code, so every one must cite.
    if (/\.md$/i.test(abs) && !fileHadCitation) {
      failures.push(`${rel}  no citations in this document — every doc here makes claims about the code, so each must carry at least one`);
    }
  }

  if (citations === 0) {
    failures.push(`${label}: zero citations scanned — a run that read nothing must not look like a pass`);
  }

  return { failures, drift, citations, filesWithCitations, files: files.length, gapCounts, figures };
}

module.exports = { checkTree, GAP_MARKERS, REPO_ROOT, DOCS_REL };
