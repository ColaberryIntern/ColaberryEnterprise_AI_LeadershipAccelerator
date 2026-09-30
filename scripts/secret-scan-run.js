#!/usr/bin/env node
/**
 * Cross-platform entry point for running the secret scan by hand.
 *
 * The pre-commit hook and CI invoke gitleaks directly; this wrapper exists so a
 * developer gets the same scan, with the same config, from one command that
 * works identically on Windows, macOS and Linux:
 *
 *   npm run secrets:scan        # what is staged right now (same as the hook)
 *   npm run secrets:scan:tree   # every tracked file in the working tree
 *   npm run secrets:history     # every commit on every ref (slow; ~4,600 commits)
 *
 * Exit code is gitleaks' own: 0 = clean, 1 = findings, >1 = the scan itself
 * failed. Callers should treat "the scan failed" as "not clean", never as a pass.
 */
'use strict';

const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { ensure } = require('./ensure-gitleaks');

const MODES = {
  staged: ['git', '--staged'],
  tree: ['dir', '.'],
  history: ['git', '--log-opts=--all'],
};

async function main() {
  const mode = process.argv[2] || 'staged';
  if (!MODES[mode]) {
    process.stderr.write(`usage: secret-scan-run.js <${Object.keys(MODES).join('|')}>\n`);
    process.exit(2);
  }

  let repoRoot;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    process.stderr.write('[secret-scan] not inside a git repository\n');
    process.exit(2);
  }

  const gitleaks = await ensure();

  const args = [
    ...MODES[mode],
    '--config', path.join(repoRoot, '.gitleaks.toml'),
    '--gitleaks-ignore-path', repoRoot,
    // Never print the secret itself. A scan run in a shared terminal, a CI log,
    // or a screen share must not become the second place the credential leaks.
    '--redact=100',
    '--no-banner',
    '--exit-code', '1',
  ];

  if (mode === 'history') {
    process.stderr.write('[secret-scan] sweeping full history — this takes several minutes\n');
  }

  const r = spawnSync(gitleaks, args, { cwd: repoRoot, stdio: 'inherit' });

  if (r.error) {
    process.stderr.write(`[secret-scan] failed to run gitleaks: ${r.error.message}\n`);
    process.exit(2);
  }
  if (r.status === 1) {
    process.stderr.write('\n[secret-scan] findings above (values redacted). See docs/SECRET_SCANNING.md\n');
  }
  process.exit(r.status === null ? 2 : r.status);
}

main().catch((e) => {
  process.stderr.write(`[secret-scan] ${e.message}\n`);
  process.exit(2);
});
