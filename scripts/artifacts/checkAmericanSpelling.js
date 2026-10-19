/**
 * Scan artifact prose for British spellings and report every one with its file and line.
 *
 * American spelling is a standing rule in this repo. It was being enforced by three guards
 * that had each been copy-pasted into a ticket module and drifted to a different word list,
 * which is how 79 lines of British spelling reached prose that renders into customer-facing
 * PDFs, and how "authorisation" reached a comment already posted to a Basecamp ticket.
 *
 * This is the rerunnable check. `britishSpellings.js` holds the single word list; this walks
 * the files and reports. The jest test in backend/src/scripts/lib/__tests__ calls the same
 * library against the same paths, so CI fails rather than a human noticing twice.
 *
 * ## Exempting a line
 *
 * Some lines must contain a British spelling: the detector itself, and prose that quotes a
 * misspelling in order to talk about it. Put `spelling-exempt` in a comment on the line.
 * An explicit marker is used rather than guessing which lines look like detectors, because
 * the first version of the sweep guessed, and a guess that is wrong in the generous
 * direction silently stops checking real prose.
 *
 * Usage:
 *   node scripts/artifacts/checkAmericanSpelling.js            # exits 1 if anything is found
 *   node scripts/artifacts/checkAmericanSpelling.js --quiet    # report count only
 */
const fs = require('fs');
const path = require('path');
const { findAllBritishSpellings } = require('./britishSpellings');

const ROOT = path.join(__dirname, '..', '..');

/** This file and the word list necessarily contain the British forms. */
const SKIP_FILES = new Set(['britishSpellings.js', 'checkAmericanSpelling.js']);

/** Directories of artifact prose to walk, relative to the repo root. */
const SCAN_DIRS = ['scripts/artifacts'];

/** Extra single files to scan: the Basecamp comment specs, which are prose Ali reads. */
const SCAN_GLOB_DIRS = [{ dir: 'tmp', test: (n) => /-attach\.json$/.test(n) }];

function walk(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(p, test, out);
    } else if (test(entry.name) && !SKIP_FILES.has(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Every file this check covers. Exported so the jest test scans exactly the same set. */
function filesToScan() {
  const files = [];
  for (const d of SCAN_DIRS) files.push(...walk(path.join(ROOT, d), (n) => n.endsWith('.js')));
  for (const g of SCAN_GLOB_DIRS) files.push(...walk(path.join(ROOT, g.dir), g.test));
  return files;
}

/**
 * Returns [{ file, line, word, american, text }] for everything found.
 *
 * Lines carrying `spelling-exempt` are skipped. Files are read as whole lines so the report
 * can name a line number, which is the difference between a finding somebody fixes and a
 * finding somebody re-greps for.
 */
function scan(files = filesToScan()) {
  const findings = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((text, i) => {
      if (text.includes('spelling-exempt')) return;
      for (const hit of findAllBritishSpellings(text)) {
        findings.push({
          file: path.relative(ROOT, file).replace(/\\/g, '/'),
          line: i + 1,
          word: hit.word,
          american: hit.american,
          text: text.trim().slice(0, 100),
        });
      }
    });
  }
  return findings;
}

if (require.main === module) {
  const quiet = process.argv.includes('--quiet');
  const files = filesToScan();
  const findings = scan(files);
  if (!quiet) {
    for (const f of findings) {
      console.log(`${f.file}:${f.line}  ${f.word} -> ${f.american}`);
      console.log(`    ${f.text}`);
    }
  }
  console.log(`\n${files.length} files scanned, ${findings.length} British spelling(s) found`);
  process.exit(findings.length ? 1 : 0);
}

module.exports = { filesToScan, scan };
