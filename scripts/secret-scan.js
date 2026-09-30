#!/usr/bin/env node
/**
 * Lightweight secret scan for CI (TBI Security: no secrets in source/commits/logs).
 *
 * Scans git-tracked files (excluding docs, tests, examples, vendored, and binaries) for high-signal
 * secret patterns. Deterministic, no external deps. Not a replacement for full history scanning, but
 * a fast PR gate that fails loudly if a credential lands in tracked source.
 *
 * Run: `node scripts/secret-scan.js`
 */
const { execSync } = require('child_process');
const fs = require('fs');

const PATTERNS = [
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'OpenAI API key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
];

// Skip docs, examples, tests, vendored code, lockfiles and binaries — low risk, high false-positive.
const SKIP =
  /(^|\/)(node_modules|dist|build|coverage|\.git)\/|\.(md|lock|map|png|jpe?g|gif|svg|pdf|ico|woff2?|ttf|eot)$|\.example$|\.sample$|(^|\/)docs\/|__tests__\/|\.test\.|\.spec\./i;

// Per-line allowlist for deliberately-fake fixtures: AWS documentation example keys all contain
// `EXAMPLE`; add a `secret-scan:allow` (or `gitleaks:allow`) marker comment to intentionally allow a line.
const ALLOW = /EXAMPLE|deliberately fake|secret-scan:allow|gitleaks:allow/i;

let files;
try {
  files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch (e) {
  console.error('[secret-scan] git ls-files failed:', e.message);
  process.exit(1);
}

const findings = [];
let scanned = 0;
for (const f of files) {
  if (SKIP.test(f)) continue;
  let src;
  try {
    src = fs.readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  if (src.length > 2_000_000) continue; // skip very large files
  scanned++;
  src.split('\n').forEach((line, i) => {
    if (ALLOW.test(line)) return; // deliberately-fake fixture or explicitly allowlisted
    for (const p of PATTERNS) {
      if (p.re.test(line)) findings.push({ f, line: i + 1, name: p.name });
    }
  });
}

if (findings.length) {
  console.error('[secret-scan] FAIL — possible secrets in tracked source:');
  findings.slice(0, 50).forEach((x) => console.error(`  - ${x.f}:${x.line}  (${x.name})`));
  console.error('Move secrets to env vars / the CCPP rotation tables. False positive? Refine scripts/secret-scan.js.');
  process.exit(1);
}

console.log(`[secret-scan] OK — scanned ${scanned} tracked files, no secrets found.`);
