/**
 * Run the pinned gitleaks over every commit on every ref of a git directory.
 *
 * One job: turn (directory, config) into a list of findings, or an honest error.
 *
 * ## The distinction this module exists to preserve
 *
 * gitleaks exits 0 for "no leaks", 1 for "leaks found", and >1 for "something went
 * wrong". Collapsing the third case into the first is how an audit reports a repository
 * CLEAN when it never actually scanned it. So an unexpected exit code becomes a thrown
 * error here, never an empty findings list.
 *
 * ## Why nothing from a finding is ever printed raw
 *
 * `--redact=100` is passed on every invocation. The repositories being scanned are
 * PUBLIC and this output lands in a report, so a detected credential must not be
 * re-published by the thing that detected it. gitleaks replaces the value before it ever
 * reaches the report file, which is stronger than redacting on the way out.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

/** gitleaks' own exit-code contract, named so the call site reads as intent. */
const EXIT_CLEAN = 0;
const EXIT_LEAKS_FOUND = 1;

/**
 * Scan every commit reachable from any ref.
 *
 * @param {object} o
 * @param {string} o.gitleaks  path to the pinned binary
 * @param {string} o.dir       a git working directory (scanned as `cwd`)
 * @param {string} o.config    path to a gitleaks .toml
 * @param {string} [o.logOpts] git log options; `--all` means every ref, which is the
 *                             point: a secret that was committed and then "deleted"
 *                             survives in the blob and stays public.
 * @param {number} [o.timeoutMs]
 * @returns {{findings: Array<object>, scannedWith: string}}
 */
function scanGitDir({ gitleaks, dir, config, logOpts = '--all', timeoutMs = 600000 }) {
  const report = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'glrep-')),
    'report.json',
  );

  const args = [
    'git',
    `--log-opts=${logOpts}`,
    '--config', config,
    '--report-format', 'json',
    '--report-path', report,
    '--redact=100',
    '--no-banner',
    '--exit-code', String(EXIT_LEAKS_FOUND),
  ];

  const r = spawnSync(gitleaks, args, {
    cwd: dir,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (r.error) throw new Error(`gitleaks could not run: ${r.error.message}`);
  if (r.status !== EXIT_CLEAN && r.status !== EXIT_LEAKS_FOUND) {
    const why = (r.stderr || r.stdout || '').trim().split('\n').slice(-4).join(' | ');
    throw new Error(`gitleaks exited ${r.status} (not a scan result): ${why || 'no output'}`);
  }

  /* Exit 0 can legitimately leave no report file at all. Absent-and-clean is fine;
     absent-after-exit-1 is not, and would otherwise read as clean. */
  let raw = null;
  if (fs.existsSync(report)) raw = fs.readFileSync(report, 'utf8').trim();
  if (!raw) {
    if (r.status === EXIT_LEAKS_FOUND) {
      throw new Error('gitleaks reported leaks but wrote no report file');
    }
    return { findings: [], scannedWith: config };
  }

  const parsed = JSON.parse(raw);
  const findings = (Array.isArray(parsed) ? parsed : []).map((f) => ({
    rule: f.RuleID,
    file: f.File,
    line: f.StartLine,
    commit: String(f.Commit || '').slice(0, 8),
    date: String(f.Date || '').slice(0, 10),
    author: f.Author || '',
    /* Already redacted by gitleaks. Kept only so a reader can see the SHAPE. */
    redacted: String(f.Secret || '').slice(0, 24),
  }));

  return { findings, scannedWith: config };
}

module.exports = { scanGitDir, EXIT_CLEAN, EXIT_LEAKS_FOUND };
