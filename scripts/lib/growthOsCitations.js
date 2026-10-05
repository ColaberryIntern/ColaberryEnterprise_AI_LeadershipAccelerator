/**
 * The citation rules for docs/growth-os-reset/ -- the rules themselves.
 *
 * Split out of scripts/verifyGrowthOsResetCitations.js when that file crossed
 * the repo's 500-line ceiling. This module owns WHAT a valid citation is; the
 * CLI owns running it and PROVING the rules still bite.
 *
 * Phase 1 of the Growth OS reset produces documents, and documents are where
 * fabrication hides. This exists so a claim about current repo behaviour
 * cannot be asserted without evidence a machine can re-derive.
 *
 * THE CITATION FORM IS MANDATORY:
 *
 *     `path/to/file.ts:123` → "text that occurs exactly once in that file"
 *
 * A bare `path:123` with no literal FAILS.
 *
 * THE LITERAL IS AUTHORITATIVE; THE LINE NUMBER IS ADVISORY. The literal must
 * occur exactly once in the cited file. If it does, the citation passes -- and
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
 * longer satisfy a citation; it removes any need for a `LINE-LINE` range form;
 * and it gives multi-line constructs an expressible citation, since any unique
 * line of the construct works. Range tokens are rejected outright, so there is
 * exactly one citation form.
 *
 * WHAT THIS PROVES is that a quote is REAL, FINDABLE and UNIQUE -- not that it
 * is apposite. Citing a function's signature, or a comment that merely mentions
 * a behaviour, still passes while being the wrong evidence for a claim about
 * enforcement. Judging aptness is a human job and stays one.
 *
 * KNOWN LIMIT, deliberately not closed: a backticked path with no `:LINE` is
 * not a citation token, so dropping the line number is a way to make an
 * uncited claim look sourced. Failing every backticked path would fight
 * ordinary prose -- this very comment names several files -- so the per-file
 * non-vacuity rule plus human review covers it instead.
 *
 * NO BYPASS IS PROVIDED, deliberately. If a cited line holds something this
 * checker refuses to print in a doc (an email address, say), cite a different
 * unique literal from that same line -- the failure message says so. An escape
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
 * Deliberately LOOSE, then validated. A strict pattern silently skips what it
 * cannot parse, which is the worst failure mode for an evidence gate: a
 * verifier showed that `` `Makefile:99999` `` and a backslash path both exited
 * 0 while carrying an invented literal, because the strict form required a
 * dotted extension and forward slashes. Anything that LOOKS like a citation
 * must now be either valid or a failure -- never ignored.
 *
 * The cost is that a backticked `12:30` reads as a citation to a path "12" and
 * fails. That is the right trade: failing loudly on an ambiguous token beats
 * silently skipping a real one. Write times without backticks.
 */
const TOKEN = /`([^`\s:]+):(\d+)(?:-(\d+))?`/g;

const FORBIDDEN = [
  { name: 'email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}/ },
  { name: 'API key prefix', re: /\b(?:sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,})/ },
];

const NUMBER_TOKEN = /\b\d[\d,]*(?:\.\d+)?%?\b/g;

function readLines(abs) {
  return fs.readFileSync(abs, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));
}

function normaliseNumber(raw) {
  return raw.replace(/,/g, '').replace(/%$/, '');
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

/**
 * Pull the literal that follows a citation token.
 *
 * Returns `{ literal, truncated }`. `literal` is null when there is no literal
 * at all; `truncated` flags the one way this gate could be made to approve a
 * FABRICATED quotation, which a task verifier found and which is the whole
 * reason this function returns an object instead of a string:
 *
 *     `target.ts:1` → "const greeting = "THIS TAIL IS INVENTED";"
 *
 * The delimiter closes at the inner quote, so only `const greeting = ` was
 * verified -- ten non-whitespace characters, clearing the floor, unique in the
 * file -- while everything after it rode along inside what a reader sees as
 * the quotation. Confirmed by probe before fixing: that line was ACCEPTED
 * clean, while the identical fabricated tail WITHOUT an inner quote was
 * correctly rejected. The inner quote was the entire bypass.
 *
 * So a delimited literal must be followed by end-of-line, whitespace, or
 * closing punctuation. Anything else means the quotation continues past what
 * was checked, and the citation is refused with a pointer to the other
 * delimiter -- which is how a literal containing a double quote is meant to be
 * written, and what the honest form of the example above uses.
 */
function literalAfter(line, endIndex) {
  const rest = line.slice(endIndex);
  const m = /^\s*(?:→|->)\s*("([^"]+)"|'([^']+)')/.exec(rest);
  if (!m) return { literal: null, truncated: false };

  const after = rest.slice(m[0].length);
  return {
    literal: m[2] !== undefined ? m[2] : m[3],
    truncated: after.length > 0 && !/^[\s|,.;:)\]}]/.test(after),
    delimiter: m[2] !== undefined ? '"' : "'",
  };
}

/**
 * Figures in HTML *text content*, defined precisely so this rule cannot
 * quietly narrow itself until it checks nothing.
 *
 * A "figure" is a numeric token a reader actually sees. `<style>`, `<script>`
 * and `<svg>` elements are removed WHOLE (they are full of numerals --
 * `padding: 12px`, `rgba(0,0,0,.08)`, `viewBox="0 0 24 24"`, path coordinates
 * -- that belong to no document), then every remaining tag is removed, which
 * also discards attributes. From what is left, a figure is a number with at
 * least two significant digits; commas and a trailing % are normalised away.
 */
function htmlTextNumbers(src) {
  const text = src
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  const found = new Set();
  for (const m of text.matchAll(NUMBER_TOKEN)) {
    const raw = normaliseNumber(m[0]);
    if (raw.replace(/\./g, '').length >= 2) found.add(raw);
  }
  return found;
}

/** Every number appearing in the markdown, as exact tokens. */
function collectMdNumbers(files) {
  const out = new Set();
  for (const abs of files) {
    if (!/\.md$/i.test(abs)) continue;
    for (const m of fs.readFileSync(abs, 'utf8').matchAll(NUMBER_TOKEN)) {
      out.add(normaliseNumber(m[0]));
    }
  }
  return out;
}

/** Documentation must not carry addresses, tokens or key shapes. */
function scanForbidden(lines, rel) {
  const failures = [];
  lines.forEach((line, i) => {
    for (const rule of FORBIDDEN) {
      const hit = rule.re.exec(line);
      if (hit) failures.push(`${rel}:${i + 1}  forbidden ${rule.name} in documentation: ${hit[0].slice(0, 24)}…`);
    }
  });
  return failures;
}

/**
 * Evidence from outside the repo must say where it came from and when.
 *
 * Two forms are checked. A `[source: <url>]` wrapper needs a `[fetched
 * YYYY-MM-DD]` beside it. And a BARE external URL needs the same, because a
 * verifier pointed out that dropping the wrapper bypassed the rule entirely --
 * which would have gutted the GHL task, the one place Phase 1 rests on
 * documentation it does not own. Links to this repo are exempt: a PR URL is a
 * pointer, not a factual claim about a third-party API.
 */
function checkAttribution(line, rel, lineNo) {
  if (line.includes('UNVERIFIED')) return null;
  if (/\[fetched\s+\d{4}-\d{2}-\d{2}\]/.test(line)) return null;

  if (/\[source:\s*https?:/i.test(line)) {
    return `${rel}:${lineNo}  external [source: …] without [fetched YYYY-MM-DD] and not marked UNVERIFIED`;
  }

  // A URL inside a citation's own literal is QUOTED SOURCE CODE, not an
  // external attribution. The first run over a real document flagged
  // `const GHL_BASE = 'https://rest.gohighlevel.com/v1';` -- a correctly
  // cited line of this repo -- as an unattributed third-party claim. So the
  // literals come out before the URL scan.
  const outsideLiterals = line.replace(/(?:→|->)\s*(?:"[^"]*"|'[^']*')/g, ' ');

  const url = /https?:\/\/[^\s)\]>"']+/i.exec(outsideLiterals);
  if (url && !/github\.com\/ColaberryIntern/i.test(url[0])) {
    return `${rel}:${lineNo}  external URL (${url[0].slice(0, 48)}) without [fetched YYYY-MM-DD] and not marked UNVERIFIED — wrap it as [source: …] [fetched …] or mark the claim UNVERIFIED`;
  }
  return null;
}

/**
 * Verify one citation. Returns `{ failure }`, `{ drift }`, or `{}`.
 *
 * Extracted from `checkTree` when that function passed CLAUDE.md's 100-line
 * hard ceiling for a function.
 */
function verifyCitation({ rel, lineNo, root, citedPath, start, endStr, literal, truncated, delimiter }) {
  const at = `${rel}:${lineNo}`;

  if (endStr !== undefined) {
    return { failure: `${at}  range citation \`${citedPath}:${start}-${endStr}\` — ranges are not a citation form; cite the one line whose literal you are quoting` };
  }
  if (literal === null) {
    // A digits-only "path" is almost always a time or a ratio in backticks,
    // and the bare-citation message named neither the value nor the cause.
    if (/^\d+$/.test(citedPath)) {
      return { failure: `${at}  \`${citedPath}:${start}\` looks like a time or a ratio, not a citation — drop the backticks` };
    }
    return { failure: `${at}  bare citation \`${citedPath}:${start}\` — every citation needs → "a literal that occurs exactly once in that file"` };
  }
  if (truncated) {
    const other = delimiter === '"' ? "single quotes ('…')" : 'double quotes ("…")';
    return {
      failure: `${at}  literal is truncated at an inner ${delimiter} — only ${JSON.stringify(literal)} would have been verified,\n`
        + `      and anything after it rides along unchecked inside what a reader sees as the quotation.\n`
        + `      Delimit with ${other} instead.`,
    };
  }

  // Distinctiveness floor. Uniqueness alone stops being enough once whole-line
  // equality is a fallback: package.json's last line is exactly `}`, so a
  // one-character literal would resolve "uniquely" and prove nothing.
  if (literal.replace(/\s/g, '').length < 8) {
    return { failure: `${at}  literal too short to be evidence (${JSON.stringify(literal)}) — quote at least 8 non-whitespace characters` };
  }

  if (citedPath.includes('\\')) {
    return { failure: `${at}  citation path uses backslashes (${citedPath}) — use forward slashes, repo-relative` };
  }
  if (citedPath.split('/').includes('..')) {
    return { failure: `${at}  citation path escapes the repo (${citedPath}) — cite a repo-relative path` };
  }
  if (!citedPath.includes('/') && !citedPath.includes('.')) {
    return { failure: `${at}  citation path is not repo-relative (${citedPath}) — expected something like backend/src/x.ts` };
  }

  const targetAbs = path.join(root, citedPath);
  if (!fs.existsSync(targetAbs)) {
    return { failure: `${at}  cited path does not exist: ${citedPath}` };
  }

  // Reading can still fail -- a citation to a directory raised an unhandled
  // EISDIR trace -- and a gate's own crash is not an acceptable report.
  let targetLines;
  try {
    targetLines = readLines(targetAbs);
  } catch (err) {
    return { failure: `${at}  cited path is not a readable file (${citedPath}): ${err.code || err.message}` };
  }

  let hits = [];
  targetLines.forEach((tl, idx) => { if (tl.includes(literal)) hits.push(idx + 1); });

  // Substring matching can be legitimately ambiguous: in enrollmentService.ts,
  // `enrollment_type: 'explorer',` is both a WHERE clause and the write, and
  // the shallower indentation is a substring of the deeper one. Whole-line
  // equality lets an author disambiguate by quoting the indentation, with no
  // new syntax, and keeps the apposite line citable.
  if (hits.length > 1) {
    const exact = [];
    targetLines.forEach((tl, idx) => { if (tl.replace(/\s+$/, '') === literal.replace(/\s+$/, '')) exact.push(idx + 1); });
    if (exact.length === 1) hits = exact;
  }

  if (hits.length === 0) {
    return {
      failure: `${at}  literal not found anywhere in ${citedPath}\n`
        + `      wanted ${JSON.stringify(literal)}\n`
        + `      (if the cited line holds something this checker refuses to print — an address, a token —\n`
        + `       quote a different unique literal from that same line)`,
    };
  }
  if (hits.length > 1) {
    return {
      failure: `${at}  literal is not unique in ${citedPath} — ${hits.length} occurrences (lines ${hits.slice(0, 6).join(', ')}${hits.length > 6 ? ', …' : ''})\n`
        + `      wanted ${JSON.stringify(literal)}\n`
        + `      quote something distinctive enough to identify one line`,
    };
  }
  if (hits[0] !== start) {
    return { drift: `${at}  ${citedPath}:${start} → now at line ${hits[0]} (literal verified; update the number when convenient)` };
  }
  return {};
}

/** Every figure in an HTML doc must be traceable to a sibling markdown doc. */
function checkHtmlFigures(abs, rel, mdNumbers) {
  const failures = [];
  let figures = 0;
  for (const n of htmlTextNumbers(fs.readFileSync(abs, 'utf8'))) {
    figures += 1;
    if (!mdNumbers.has(n)) {
      failures.push(`${rel}  number ${n} appears in the HTML but in no sibling .md — every figure must be traceable to its source doc`);
    }
  }
  return { failures, figures };
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
  const mdNumbers = collectMdNumbers(files);
  const gapCounts = Object.fromEntries(GAP_MARKERS.map((m) => [m, 0]));
  let citations = 0;
  let filesWithCitations = 0;
  let figures = 0;

  for (const abs of files) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    const lines = readLines(abs);
    let fileHadCitation = false;

    failures.push(...scanForbidden(lines, rel));

    lines.forEach((line, i) => {
      for (const m of GAP_MARKERS) {
        if (line.includes(m)) gapCounts[m] += 1;
      }

      const attribution = checkAttribution(line, rel, i + 1);
      if (attribution) failures.push(attribution);

      TOKEN.lastIndex = 0;
      let t;
      while ((t = TOKEN.exec(line)) !== null) {
        const [whole, citedPath, startStr, endStr] = t;
        citations += 1;
        fileHadCitation = true;
        const result = verifyCitation({
          rel,
          lineNo: i + 1,
          root,
          citedPath,
          start: Number(startStr),
          endStr,
          ...literalAfter(line, t.index + whole.length),
        });
        if (result.failure) failures.push(result.failure);
        if (result.drift) drift.push(result.drift);
      }
    });

    if (/\.html$/i.test(abs)) {
      const html = checkHtmlFigures(abs, rel, mdNumbers);
      failures.push(...html.failures);
      figures += html.figures;
    }

    if (fileHadCitation) filesWithCitations += 1;

    // Non-vacuity has to be PER FILE, not per tree. A verifier showed that a
    // document consisting entirely of uncited assertion ("The Governor exists.
    // Suppression is enforced everywhere.") passed so long as one other
    // document in the tree carried a single valid citation -- which is exactly
    // the artifact this gate exists to refuse.
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
