/**
 * Runs every Career Prep browser suite (`*.e2e.js` in this folder) one after another, each in its own process with the
 * same environment (BUILD_DIR, PW_CHANNEL, ...), and exits non-zero if any suite fails or a suite prints no tally.
 * Usage (repo root): PW_CHANNEL=msedge node tests/systemV2/career-prep/runAll.js
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suites = fs.readdirSync(__dirname).filter((f) => f.endsWith('.e2e.js')).sort();
let passed = 0; let total = 0; const failed = [];
for (const s of suites) {
  console.log(`\n=== ${s}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', env: process.env });
  process.stdout.write(r.stdout || '');
  const m = /(\d+)\/(\d+) passed\s*$/.exec((r.stdout || '').trim());
  if (m) { passed += Number(m[1]); total += Number(m[2]); }
  if (r.status !== 0 || !m) failed.push(s);
}
console.log(`\nALL SUITES: ${passed}/${total} checks passed across ${suites.length} suite(s)${failed.length ? `; FAILED: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
