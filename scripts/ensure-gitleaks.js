#!/usr/bin/env node
/**
 * Resolve a pinned gitleaks binary, downloading and verifying it if needed.
 *
 * WHY THIS EXISTS
 * The pre-commit hook and CI must run the *same* scanner at the *same* version
 * against the *same* .gitleaks.toml. If the hook silently no-ops when gitleaks
 * is missing, the gate is theatre. So this module has exactly one contract:
 * return a path to a verified gitleaks binary, or exit non-zero. It never
 * returns "couldn't find it, carry on".
 *
 * RESOLUTION ORDER
 *   1. GITLEAKS_PATH env var        (operator override, e.g. air-gapped CI)
 *   2. `gitleaks` already on PATH   (only if it reports the pinned version)
 *   3. cached binary under .git/tools/
 *   4. download from GitHub releases, verify SHA-256, cache
 *
 * FAILURE MODES HANDLED: no network, partial download, corrupted cache,
 * checksum mismatch, unsupported platform, missing extractor.
 * NOT HANDLED: a compromised GitHub release signed with a matching checksum.
 *
 * Usage:  node scripts/ensure-gitleaks.js            # prints resolved path
 *         require('./ensure-gitleaks').ensure()      # returns resolved path
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

// Pinned deliberately. Bumping this is a reviewable change: update BOTH the
// version and every checksum below from the release's checksums.txt.
const VERSION = '8.30.1';

// sha256 of the release archive, from gitleaks_<VERSION>_checksums.txt.
const CHECKSUMS = {
  'linux_x64': '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  'linux_arm64': 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  'darwin_x64': 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  'darwin_arm64': 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
  'windows_x64': 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e',
};

function log(msg) {
  process.stderr.write(`[ensure-gitleaks] ${msg}\n`);
}

function fail(msg) {
  log(`ERROR: ${msg}`);
  log('');
  log('The secret-scanning gate could not run, so this commit/build is being');
  log('refused rather than allowed through unscanned. To resolve:');
  log('  - install gitleaks yourself and re-run, or');
  log('  - set GITLEAKS_PATH=/path/to/gitleaks, or');
  log('  - restore network access to github.com and re-run.');
  process.exit(1);
}

/** Map Node's platform/arch onto the release asset naming. */
function target() {
  const platform = { linux: 'linux', darwin: 'darwin', win32: 'windows' }[os.platform()];
  const arch = { x64: 'x64', arm64: 'arm64' }[os.arch()];
  if (!platform || !arch) fail(`unsupported platform ${os.platform()}/${os.arch()}`);
  const key = `${platform}_${arch}`;
  // gitleaks ships no windows_arm64 build; that runs the x64 binary fine.
  const assetKey = CHECKSUMS[key] ? key : `${platform}_x64`;
  if (!CHECKSUMS[assetKey]) fail(`no pinned checksum for ${key}`);
  return {
    key: assetKey,
    isWindows: platform === 'windows',
    ext: platform === 'windows' ? 'zip' : 'tar.gz',
    binName: platform === 'windows' ? 'gitleaks.exe' : 'gitleaks',
  };
}

/** Return the binary's version string, or null if it is not runnable. */
function probeVersion(bin) {
  try {
    const out = execFileSync(bin, ['version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim();
  } catch {
    return null;
  }
}

function gitCommonDir() {
  try {
    const out = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim();
  } catch {
    return null;
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Download over https following redirects. Uses node:https rather than curl so
 * the hook behaves identically on a bare Windows box with no curl on PATH.
 */
function download(url, dest, redirectsLeft = 5) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) return reject(new Error('too many redirects'));
    const req = https.get(url, { headers: { 'User-Agent': 'colaberry-ensure-gitleaks' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      // Write to a temp file first so an interrupted download never leaves a
      // half-written archive that looks cached on the next run.
      const tmp = `${dest}.partial`;
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => {
        fs.renameSync(tmp, dest);
        resolve(dest);
      }));
      out.on('error', reject);
    });
    req.setTimeout(60000, () => req.destroy(new Error('download timed out after 60s')));
    req.on('error', reject);
  });
}

function extract(archive, destDir, t) {
  if (t.isWindows) {
    // PowerShell Expand-Archive is present on every supported Windows build.
    const r = spawnSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command',
       `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${destDir}' -Force`],
      { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' },
    );
    if (r.status !== 0) fail(`could not unzip gitleaks: ${(r.stderr || '').trim()}`);
  } else {
    const r = spawnSync('tar', ['-xzf', archive, '-C', destDir], {
      stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8',
    });
    if (r.status !== 0) fail(`could not untar gitleaks: ${(r.stderr || '').trim()}`);
  }
}

async function ensure() {
  // 1. Operator override.
  const override = process.env.GITLEAKS_PATH;
  if (override) {
    if (!probeVersion(override)) fail(`GITLEAKS_PATH is set to '${override}' but that is not a runnable gitleaks binary`);
    return override;
  }

  const t = target();

  // 2. Already on PATH at the pinned version. A different version is ignored
  //    rather than used, so local results always match CI.
  const onPath = probeVersion('gitleaks');
  if (onPath === VERSION) return 'gitleaks';
  if (onPath) log(`ignoring gitleaks ${onPath} on PATH (pinned to ${VERSION})`);

  // 3. Cached under .git/tools — inside .git so it is never committed and is
  //    removed with the clone.
  const common = gitCommonDir();
  if (!common) fail('not inside a git repository');
  const toolDir = path.join(common, 'tools', `gitleaks-${VERSION}`);
  const bin = path.join(toolDir, t.binName);
  if (fs.existsSync(bin) && probeVersion(bin) === VERSION) return bin;

  // 4. Download, verify, cache.
  fs.mkdirSync(toolDir, { recursive: true });
  const asset = `gitleaks_${VERSION}_${t.key}.${t.ext}`;
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${asset}`;
  const archive = path.join(toolDir, asset);

  if (!fs.existsSync(archive) || sha256(archive) !== CHECKSUMS[t.key]) {
    log(`fetching gitleaks ${VERSION} for ${t.key} (one time, cached in .git/tools)`);
    try {
      await download(url, archive);
    } catch (e) {
      fail(`download failed: ${e.message}`);
    }
  }

  const actual = sha256(archive);
  if (actual !== CHECKSUMS[t.key]) {
    try { fs.unlinkSync(archive); } catch {}
    fail(`checksum mismatch for ${asset}\n  expected ${CHECKSUMS[t.key]}\n  actual   ${actual}`);
  }

  extract(archive, toolDir, t);
  if (!t.isWindows) {
    try { fs.chmodSync(bin, 0o755); } catch {}
  }
  if (probeVersion(bin) !== VERSION) fail(`extracted binary at ${bin} does not report version ${VERSION}`);
  return bin;
}

module.exports = { ensure, VERSION };

if (require.main === module) {
  ensure().then((p) => { process.stdout.write(`${p}\n`); }).catch((e) => fail(e.message));
}
