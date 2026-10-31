/**
 * Prove the scanner can still see a secret, before any repository is called clean.
 *
 * ## Why an audit without this is worthless
 *
 * The output of this audit is an ABSENCE: "no intern repository contains a credential."
 * A broken detector and a clean repository produce the identical report. A mistyped
 * config path, a rule pack that failed to load, an allowlist that grew one regex too
 * greedy — each one turns every row green. So the detector is pointed at a repository
 * that is KNOWN to contain planted secrets, and the audit refuses to proceed unless it
 * finds them. Controls validated both ways: planted secrets must be found, and a clean
 * file must come back clean.
 *
 * ## The discriminating fixture
 *
 * `fallback.js` holds the shape this whole exercise is about:
 *
 *     const key = process.env.OPENAI_API_KEY || '<a real key>';
 *
 * The enterprise `.gitleaks.toml` allowlists `process\.env\.[A-Z0-9_]+` because in our
 * own code env indirection really is a reference rather than a value. On that line it
 * suppresses the finding AND the live key sitting next to it. Rather than assert that
 * difference, this plants the line and MEASURES what each config does with it.
 *
 * ## No secret-shaped literal lives in this file
 *
 * Every fixture value is assembled from fragments at runtime. A contiguous literal here
 * would be flagged by this repository's own secret scan and would block the very PR that
 * adds the scanner.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { scanGitDir } = require('./gitleaksScan');

/* Assembled, never written contiguously. See the header. */
const AWS_ID = ['AKIA', 'Q7ZJ', 'LN4X', 'MPWR', '2GTD'].join('');

/**
 * The modern OpenAI key format, which carries the literal marker `T3BlbkFJ`
 * (base64 of "OpenAI") between two 20-character halves.
 *
 * A generic `sk-` followed by 48 random characters does NOT match the rule. The first
 * version of this fixture was exactly that, and the control reported a "miss" that was
 * really the rule correctly declining a value that is not an OpenAI key. Verified
 * detectable before being relied on.
 */
const OPENAI_KEY = ['sk', '-', 'Hq8Lm2Rt9Xv4Zb6Nc1Jd', 'T3BlbkFJ', 'Pg5Ws8Yh0QlaBc4Df7Gh'].join('');

const PK_BEGIN = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const PK_END = ['-----END', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');

/**
 * A VERIFIED-DETECTABLE key body. Do not hand-edit it to look more realistic.
 *
 * This fixture was once "improved" into a longer, more varied body, and the detector
 * stopped matching it in every mode. The control then read as a broken scanner for two
 * rounds of debugging. A control fixture is load-bearing: its only job is to be found,
 * so it is built from a construction that was checked against the binary rather than
 * composed by eye. If this needs to change, re-verify the new value detects BEFORE
 * trusting any verdict produced with it.
 */
const PK_BODY = Array.from(
  { length: 6 },
  (_, i) => `MIIEogIBAAKCAQEAwJq1T8bXnK9vZr3Hd2LpQe7Yf5Rt0Nc4Sg6Wb8Mx1Av3Kj9D${i}`,
).join('\n');

/**
 * Each fixture is one file and one expectation.
 *
 * `mustDetect` is the refusal gate: a miss means the detector is broken for that whole
 * class and no "clean" verdict can be trusted. `clean` is the precision control.
 */
const FIXTURES = [
  {
    file: 'aws-config.txt',
    body: `aws_access_key_id = ${AWS_ID}\naws_region = us-east-1\n`,
    mustDetect: true,
    why: 'AWS access key id, bare',
  },
  {
    file: 'openai.env',
    body: `OPENAI_API_KEY=${OPENAI_KEY}\nMODEL=gpt-4\n`,
    mustDetect: true,
    why: 'provider key in a dotenv file',
  },
  {
    file: 'deploy-key.pem',
    body: `${PK_BEGIN}\n${PK_BODY}\n${PK_END}\n`,
    mustDetect: true,
    why: 'private key block',
  },
  {
    file: 'fallback.js',
    body: '// The shape this audit exists to catch: a hardcoded fallback beside the env read.\n'
      + `const key = process.env.OPENAI_API_KEY || '${OPENAI_KEY}';\nmodule.exports = { key };\n`,
    mustDetect: true,
    why: 'hardcoded fallback behind env indirection',
    discriminating: true,
  },
  {
    file: 'clean.js',
    body: 'const key = process.env.OPENAI_API_KEY;\n'
      + 'if (!key) throw new Error("OPENAI_API_KEY is not set");\nmodule.exports = { key };\n',
    mustDetect: false,
    why: 'env read with no value present (precision control)',
  },
];

function git(dir, args) {
  const r = spawnSync('git', [
    '-c', 'user.name=scanner-selftest',
    '-c', 'user.email=scanner-selftest@localhost',
    '-c', 'commit.gpgsign=false',
    ...args,
  ], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${(r.stderr || '').trim().slice(0, 300)}`);
  }
}

/** A throwaway repository whose history contains every fixture. */
function buildFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glselftest-'));
  git(dir, ['init', '-q', '-b', 'main']);
  for (const f of FIXTURES) fs.writeFileSync(path.join(dir, f.file), f.body, 'utf8');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'planted fixtures for the detector control']);
  return dir;
}

/**
 * @param {{gitleaks: string, config: string}} o
 * @returns {{ok: boolean, rows: Array<object>, misses: Array<string>,
 *            falsePositives: Array<string>}}
 */
function runSelfTest({ gitleaks, config }) {
  const dir = buildFixtureRepo();
  const scan = scanGitDir({ gitleaks, dir, config, timeoutMs: 120000 });
  const hit = (file) => scan.findings.some((f) => f.file === file);

  const rows = FIXTURES.map((f) => ({
    file: f.file,
    why: f.why,
    expected: f.mustDetect ? 'DETECT' : 'clean',
    actual: hit(f.file) ? 'detected' : 'missed',
    discriminating: !!f.discriminating,
  }));

  const misses = rows.filter((r) => r.expected === 'DETECT' && r.actual === 'missed')
    .map((r) => r.file);
  const falsePositives = rows.filter((r) => r.expected === 'clean' && r.actual === 'detected')
    .map((r) => r.file);

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }

  return { ok: misses.length === 0, rows, misses, falsePositives };
}

module.exports = { runSelfTest, FIXTURES };
