#!/usr/bin/env node
/**
 * Audit intern repositories for published credentials (AF4.5, acceptance criterion 2).
 *
 *   node scripts/internRepoSecretScan.js --repos owner/name,owner/name
 *   node scripts/internRepoSecretScan.js --file repos.txt --json out.json
 *
 * ## What this is for
 *
 * An intern repository is PUBLIC. Anything that travels with a clone is published, so
 * "no intern repo contains a secret, a token or a production connection string" has to
 * be measured from the repository contents rather than asserted from a policy.
 *
 * ## Reused, not rebuilt
 *
 * The pinned gitleaks binary (scripts/ensure-gitleaks.js, version-locked and
 * checksum-verified) and gitleaks' own maintained rule pack. No detection pattern is
 * invented here. The enterprise gate already learned the two lessons that matter and
 * both are carried over: scan EVERY COMMIT ON EVERY REF, because a secret that was
 * committed and then deleted survives in the blob and stays public; and pass
 * `--redact=100`, so the tool that finds a credential does not republish it.
 *
 * ## One config, and why a second one was tried and thrown away
 *
 * The audit uses `.gitleaks.toml` — this repository's own config. It was nearly given a
 * separate, "stricter" intern config built on gitleaks' defaults alone, on two
 * assumptions that both turned out to be false:
 *
 *   1. That the enterprise allowlists for `process.env.X` and `TODO` would suppress a
 *      student's hardcoded fallback. They cannot: a gitleaks `regexes` allowlist matches
 *      the CAPTURED SECRET, not the line, so neither can hide a key that merely shares a
 *      line with them. The planted fallback fixture is detected.
 *
 *   2. That a defaults-only config would catch more. It catches strictly LESS.
 *      `.gitleaks.toml` sets `[extend] useDefault = true` and then adds four
 *      Colaberry-specific rules, so it is a superset. Measured over 11 intern
 *      repositories, defaults-only found more in 0 of 11, and MISSED a Colaberry
 *      credential shape in `qninying/ambit` that the full config found.
 *
 * Had the defaults-only pass been the verdict, that repository would have been reported
 * clean. The verdict must come from the superset.
 *
 * ## The refusal
 *
 * The scanner is pointed at planted secrets first (scripts/lib/gitleaksSelfTest.js) and
 * REFUSES to audit anything unless it finds them. A report full of green rows is exactly
 * what a broken detector produces.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ensure } = require('./ensure-gitleaks');
const { scanGitDir } = require('./lib/gitleaksScan');
const { runSelfTest } = require('./lib/gitleaksSelfTest');
const { parseRepoTargets } = require('./lib/parseRepoTargets');

const ROOT = path.join(__dirname, '..');
/** The superset: gitleaks' defaults plus this repository's own four rules. */
const AUDIT_CONFIG = path.join(ROOT, '.gitleaks.toml');
const CLONE_TIMEOUT_MS = 600000;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Resolve the target list, and REFUSE on a malformed entry rather than skipping it.
 *
 * A skipped line is a repository nobody scanned, inside a report that counts how many
 * were clean. Parsing itself lives in ./lib/parseRepoTargets so the rules are unit
 * tested; this function only decides what to do about a rejection.
 */
function targets() {
  const file = arg('file');
  const { repos, rejected } = parseRepoTargets(
    file ? fs.readFileSync(file, 'utf8') : arg('repos', ''),
  );

  if (rejected.length) {
    console.error('Refusing to start -- these entries are not scannable:');
    for (const r of rejected) console.error(`  ${r.value}  (${r.reason})`);
    console.error('\nFix or remove them. A skipped line would not appear in the audit at all.');
    process.exit(2);
  }
  if (!repos.length) {
    console.error('Nothing to scan. Pass --repos owner/name,... or --file <list>.');
    process.exit(2);
  }
  return repos;
}

/**
 * Full clone, every branch. `--all` can only see refs that were actually fetched, so a
 * shallow or single-branch clone would quietly reduce the scan to one branch's tip and
 * still report success.
 */
function cloneRepo(repo, dir) {
  const r = spawnSync('git', [
    '-c', 'credential.helper=',
    'clone', '--quiet', '--no-single-branch',
    `https://github.com/${repo}.git`, dir,
  ], { encoding: 'utf8', timeout: CLONE_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'clone failed').trim().split('\n').pop().slice(0, 200));
  }
}

function selfTestOrExit(gitleaks) {
  console.log('CONTROL: pointing the scanner at planted secrets before trusting any verdict\n');
  const t = runSelfTest({ gitleaks, config: AUDIT_CONFIG });

  console.log('  fixture              expected   actual');
  for (const r of t.rows) {
    console.log(`  ${r.file.padEnd(20)} ${r.expected.padEnd(10)} ${r.actual}`
      + `${r.discriminating ? '    <- the hardcoded-fallback case' : ''}`);
  }
  console.log('');

  if (!t.ok) {
    console.error(`CONTROL FAILED: missed ${t.misses.join(', ')}.`);
    console.error('Refusing to audit. A detector that cannot see a planted secret would');
    console.error('report every repository clean, which is indistinguishable from safe.');
    process.exit(1);
  }
  if (t.falsePositives.length) {
    console.log(`  note: the precision control also flagged ${t.falsePositives.join(', ')} -- `
      + 'expect triage noise, not a broken scan.\n');
  }
  return t;
}

function scanOne(gitleaks, repo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'irepo-'));
  try {
    cloneRepo(repo, dir);
    const scan = scanGitDir({ gitleaks, dir, config: AUDIT_CONFIG });
    const byRule = {};
    for (const f of scan.findings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;
    return {
      repo,
      status: scan.findings.length ? 'FINDINGS' : 'CLEAN',
      count: scan.findings.length,
      byRule,
      findings: scan.findings,
    };
  } catch (e) {
    /* An error is never a clean verdict. */
    return { repo, status: 'ERROR', error: e.message, count: null, byRule: {} };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }
  }
}

async function main() {
  const repos = targets();
  /* `ensure()` is async: it may have to download and checksum-verify the pinned
     binary. Calling it without awaiting hands spawnSync a Promise as the file name. */
  const gitleaks = await ensure();
  console.log(`gitleaks: ${gitleaks}`);
  console.log(`config: ${path.basename(AUDIT_CONFIG)} (gitleaks defaults + this repo's own rules)`);
  console.log(`repositories to audit: ${repos.length}\n`);

  const control = selfTestOrExit(gitleaks);

  const results = [];
  for (const repo of repos) {
    process.stdout.write(`  scanning ${repo} ... `);
    const r = scanOne(gitleaks, repo);
    results.push(r);
    if (r.status === 'ERROR') console.log(`ERROR (${r.error})`);
    else if (r.status === 'CLEAN') console.log('clean');
    else console.log(`${r.count} FINDING(S)`);
  }

  const n = (s) => results.filter((r) => r.status === s).length;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`AUDIT: ${n('CLEAN')} clean, ${n('FINDINGS')} with findings, ${n('ERROR')} not scanned`);
  console.log('='.repeat(70));

  for (const r of results.filter((x) => x.status === 'FINDINGS')) {
    console.log(`\n${r.repo}  --  ${r.count} finding(s), rules: `
      + `${Object.entries(r.byRule).map(([k, v]) => `${k} x${v}`).join(', ')}`);
    /* Values are redacted by gitleaks before they reach here. Shape only. */
    for (const f of r.findings.slice(0, 12)) {
      console.log(`    ${f.rule.padEnd(22)} ${f.file}:${f.line}  commit ${f.commit} (${f.date})`);
    }
    if (r.findings.length > 12) console.log(`    ... and ${r.findings.length - 12} more`);
  }

  for (const r of results.filter((x) => x.status === 'ERROR')) {
    console.log(`\nNOT SCANNED  ${r.repo}: ${r.error}`);
  }

  const out = arg('json');
  if (out) {
    fs.writeFileSync(out, JSON.stringify({
      generatedAt: new Date().toISOString(), control: control.rows, results,
    }, null, 1));
    console.log(`\nreport: ${out}`);
  }

  /* Exit 1 on a finding so this can gate, but NOT on an error row alone -- an
     unreachable repository is an operational problem, not a disclosure. */
  process.exit(n('FINDINGS') ? 1 : 0);
}

main().catch((e) => {
  console.error(`AUDIT FAILED: ${e.message}`);
  process.exit(1);
});
