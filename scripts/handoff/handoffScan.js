#!/usr/bin/env node
/**
 * The secret gate for a handoff bundle. Nothing leaves this machine unscanned.
 *
 * WHY A SEPARATE MODULE
 * A handoff bundle is built to be copied onto a USB stick, dropped in OneDrive
 * or emailed. It carries git patches, a settings file and session logs, any of
 * which can pick up a credential. The repo already refuses to let a secret
 * reach a commit (scripts/secret-scan.js, .github/workflows/secret-scan.yml);
 * a bundle that bypasses git must be held to the same bar.
 *
 * WHY THE SELF-TEST IS NOT OPTIONAL
 * This gate's output is an absence. A broken scanner and a clean bundle produce
 * the identical silence, so the scanner is first pointed at known-planted
 * secrets and the run is abandoned if it fails to see them. The fixtures are
 * reused from scripts/lib/gitleaksSelfTest.js rather than re-invented, because
 * that file's header records that composing such values by eye has already
 * produced a fixture the detector could not see.
 *
 * WHY THE PROOF RUNS IN DIRECTORY MODE
 * The existing CI control scans a fixture *git repository*. A bundle is a plain
 * folder, so it is scanned with --no-git, a different code path in gitleaks.
 * Proving the git path works would say nothing about the path actually used, so
 * the control here plants the same fixtures in a plain directory.
 *
 * FAILURE MODES HANDLED: gitleaks unresolvable, a gitleaks version whose
 * directory-scan subcommand is spelled differently, a scanner that errors
 * rather than reporting, an unparseable report, a scanner that sees nothing.
 * NOT HANDLED: a secret in a form no rule in .gitleaks.toml describes.
 *
 * Usage:  const { gate } = require('./handoffScan'); await gate(bundleRoot);
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { REPO_ROOT } = require('./handoffBundle');
const { ensure } = require('../ensure-gitleaks');
const { FIXTURES } = require('../lib/gitleaksSelfTest');

const CONFIG = path.join(REPO_ROOT, '.gitleaks.toml');

// gitleaks renamed plain-directory scanning between v8 minors. Rather than pin
// to one spelling and silently no-op on the other, both are tried and the one
// that proves itself against planted secrets is the one used.
const DIR_MODES = [
  (dir) => ['dir', dir],
  (dir) => ['detect', '--no-git', '--source', dir],
];

/**
 * Run gitleaks over a plain directory.
 * @returns {{ran: boolean, findings: Array<object>, error: string|null}}
 */
function scanDir({ gitleaks, dir, mode, timeoutMs = 180000 }) {
  const report = path.join(os.tmpdir(), `handoff-scan-${process.pid}-${Date.now()}.json`);
  const args = [
    ...mode(dir),
    '--config', CONFIG,
    '--report-format', 'json',
    '--report-path', report,
    '--redact',          // the report must never itself contain the secret
    '--exit-code', '1',
    '--no-banner',
  ];
  const r = spawnSync(gitleaks, args, { encoding: 'utf8', timeout: timeoutMs });

  // A report the scanner never wrote means it did not run, which is not "clean".
  if (!fs.existsSync(report)) {
    return { ran: false, findings: [], error: (r.stderr || r.error?.message || 'no report written').trim().slice(0, 400) };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(report, 'utf8') || '[]');
    fs.rmSync(report, { force: true });
    const findings = (Array.isArray(parsed) ? parsed : []).map((f) => ({
      rule: f.RuleID || f.Description || 'unknown',
      file: f.File || '',
      line: f.StartLine || 0,
    }));
    return { ran: true, findings, error: null };
  } catch (err) {
    fs.rmSync(report, { force: true });
    return { ran: false, findings: [], error: `unparseable report: ${err.message}` };
  }
}

/**
 * Plant the known fixtures in a temp directory and pick the directory-scan
 * spelling that finds every one of them. Returns null if no mode works, which
 * means no clean verdict from this machine can be trusted.
 */
function proveDirectoryScanCanFail(gitleaks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-control-'));
  for (const f of FIXTURES) fs.writeFileSync(path.join(dir, f.file), f.body);

  try {
    for (const mode of DIR_MODES) {
      const scan = scanDir({ gitleaks, dir, mode, timeoutMs: 120000 });
      if (!scan.ran) continue;
      const seen = (file) => scan.findings.some((x) => path.basename(x.file) === file);
      const misses = FIXTURES.filter((f) => f.mustDetect && !seen(f.file)).map((f) => f.file);
      const falsePositives = FIXTURES.filter((f) => !f.mustDetect && seen(f.file)).map((f) => f.file);
      if (misses.length === 0) {
        return { mode, planted: FIXTURES.filter((f) => f.mustDetect).length, falsePositives };
      }
    }
    return null;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }
  }
}

/**
 * The gate. Proves the scanner works, scans the bundle, and returns a verdict.
 * Refusing is the caller's job, but a verdict of `clean: false` must never be
 * downgraded to a warning: the bundle is built to be sent somewhere.
 */
async function gate(bundleRoot) {
  const gitleaks = await ensure();
  const proof = proveDirectoryScanCanFail(gitleaks);
  if (!proof) {
    return {
      clean: false,
      trustworthy: false,
      findings: [],
      reason:
        'the scanner failed to find planted secrets in a directory scan, so a clean result would mean nothing',
    };
  }

  const scan = scanDir({ gitleaks, dir: bundleRoot, mode: proof.mode });
  if (!scan.ran) {
    return { clean: false, trustworthy: false, findings: [], reason: `scanner did not run: ${scan.error}` };
  }
  return {
    clean: scan.findings.length === 0,
    trustworthy: true,
    findings: scan.findings,
    control: `${proof.planted} planted secrets detected in directory mode`,
    reason: scan.findings.length === 0 ? null : `${scan.findings.length} finding(s) in the bundle`,
  };
}

module.exports = { gate, scanDir, proveDirectoryScanCanFail, CONFIG };
