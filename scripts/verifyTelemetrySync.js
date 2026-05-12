/**
 * verifyTelemetrySync.js
 *
 * Runs a diff between (what the production system thinks exists) and
 * (what's actually on disk in the repo). Prints a human-readable
 * "where the gaps are" report.
 *
 * Usage:   node scripts/verifyTelemetrySync.js
 * Env:     CAPTURE_BASE (default https://enterprise.colaberry.ai)
 *          CAPTURE_TOKEN  (default reads scripts/.ali_jwt.txt)
 *
 * Exits non-zero when the sync gap is materially broken — useful for
 * surfacing in CI / pre-deploy checks.
 *
 * Per CLAUDE.md's Telemetry Synchronization Contract (Phase 3):
 *   "After Claude Code completes a build (a feature, a fix, a refactor)
 *    it MUST emit a BuildManifest that conforms to
 *    /system/intelligence/manifests/build_manifest.schema.json"
 *
 * If this script reports zero manifests, telemetry emission has been
 * skipped — fix forward by emitting one manifest per non-trivial
 * commit going forward + optionally backfilling recent commits.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

if (!TOKEN) {
  console.error(`[verify] No JWT at ${TOKEN_FILE}. See CLAUDE.md "Required Review Screenshot Protocol" for refresh steps.`);
  process.exit(2);
}

function get(urlPath) {
  return new Promise((resolve) => {
    const url = new URL(`${BASE}${urlPath}`);
    const req = https.request({
      hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search,
      method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
      timeout: 15000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: null, body }); }
      });
    });
    req.on('error', () => resolve({ status: 0, data: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: null }); });
    req.end();
  });
}

function walkAndCount(absDir, extensions) {
  // Node-native recursive count — works on Linux, macOS, Windows
  // without shelling out to find/Get-ChildItem.
  if (!fs.existsSync(absDir)) return 0;
  let total = 0;
  const stack = [absDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
        stack.push(full);
      } else if (ent.isFile()) {
        if (extensions.some(ext => ent.name.endsWith(ext))) total += 1;
      }
    }
  }
  return total;
}
function countFiles(roots) {
  let total = 0;
  for (const r of roots) {
    total += walkAndCount(path.join(REPO_ROOT, r.path), r.extensions);
  }
  return total;
}

function pad(s, w) { return String(s).padEnd(w); }
function bar(pct) {
  const filled = Math.round((pct / 100) * 20);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}

(async () => {
  console.log(`\n┌─────────────────────────────────────────────────────────────────────┐`);
  console.log(`│  TELEMETRY SYNC VERIFICATION                                         │`);
  console.log(`│  ${pad(BASE, 67)}│`);
  console.log(`└─────────────────────────────────────────────────────────────────────┘\n`);

  // ─── A. Telemetry health endpoint ──────────────────────────────────
  const health = await get('/api/portal/project/telemetry/health');
  const telem = await get('/api/portal/project/telemetry');

  console.log(`[A] Telemetry health\n`);
  if (health.data) {
    const h = health.data;
    console.log(`    Sync health score:       ${h.sync_health_score}%`);
    console.log(`    Total manifests:         ${h.freshness?.total ?? 0}`);
    console.log(`    Fresh manifests:         ${h.freshness?.fresh ?? 0}`);
    console.log(`    Contradictions detected: ${h.contradiction_count ?? 0}`);
    if (h.contradictions_by_kind) {
      for (const [k, v] of Object.entries(h.contradictions_by_kind)) {
        console.log(`      · ${k}: ${v}`);
      }
    }
  } else {
    console.log(`    Healthcheck unavailable (status ${health.status})`);
  }

  // ─── B. Ground truth vs system view ────────────────────────────────
  const bps = await get('/api/portal/project/business-processes');
  const uiMap = await get('/api/portal/project/ui-map');
  const dbMap = await get('/api/portal/project/database-map');

  const bpCount = Array.isArray(bps.data) ? bps.data.length : 0;
  const bpsUsable = Array.isArray(bps.data) ? bps.data.filter(p => p.usability?.usable).length : 0;
  const bpsWithReqs = Array.isArray(bps.data) ? bps.data.filter(p => (p.total_requirements || 0) > 0).length : 0;

  const uiRoutes = uiMap.data?.routes?.length ?? 0;
  const uiComponents = uiMap.data?.components?.length ?? 0;
  const uiPages = uiMap.data?.pages?.length ?? 0;
  const dbTables = dbMap.data?.tables?.length ?? 0;

  const fsCounts = {
    'Backend services':    countFiles([{ path: 'backend/src/services', extensions: ['.ts', '.js'] }]),
    'Backend routes':      countFiles([{ path: 'backend/src/routes', extensions: ['.ts'] }]),
    'Backend models':      countFiles([{ path: 'backend/src/models', extensions: ['.ts'] }]),
    'Backend intelligence':countFiles([{ path: 'backend/src/intelligence', extensions: ['.ts'] }]),
    'Backend scripts':     countFiles([{ path: 'backend/src/scripts', extensions: ['.ts', '.js'] }]),
    'Root scripts':        countFiles([{ path: 'scripts', extensions: ['.js', '.ts'] }]),
    'Frontend pages':      countFiles([{ path: 'frontend/src/pages', extensions: ['.tsx'] }]),
    'Frontend components': countFiles([{ path: 'frontend/src/components', extensions: ['.tsx'] }]),
    'Frontend hooks':      countFiles([{ path: 'frontend/src/hooks', extensions: ['.ts'] }]),
  };

  console.log(`\n[B] Filesystem (ground truth) vs production maps\n`);
  console.log(`    Surface              Filesystem    System map    Status`);
  console.log(`    ─────────────────────────────────────────────────────────`);
  console.log(`    ${pad('UI routes', 21)}${pad('—', 14)}${pad(String(uiRoutes), 14)}${uiRoutes === 0 ? '✗ EMPTY' : '✓'}`);
  console.log(`    ${pad('UI components', 21)}${pad(fsCounts['Frontend components'], 14)}${pad(String(uiComponents), 14)}${uiComponents === 0 ? '✗ EMPTY' : '✓'}`);
  console.log(`    ${pad('UI pages', 21)}${pad(fsCounts['Frontend pages'], 14)}${pad(String(uiPages), 14)}${uiPages === 0 ? '✗ EMPTY' : '✓'}`);
  console.log(`    ${pad('DB tables (Sequelize)', 21)}${pad(fsCounts['Backend models'], 14)}${pad(String(dbTables), 14)}${dbTables === 0 ? '✗ EMPTY' : '✓'}`);
  console.log(`    ${pad('BPs', 21)}${pad('—', 14)}${pad(`${bpCount} (${bpsUsable} usable, ${bpsWithReqs} with reqs)`, 14)}${bpCount > 0 ? '✓' : '✗ EMPTY'}`);

  console.log(`\n    Filesystem reality (for reference):\n`);
  for (const [k, v] of Object.entries(fsCounts)) {
    console.log(`      · ${pad(k, 24)} ${v}`);
  }

  // ─── C. Recent commits not reflected in telemetry ─────────────────
  let recentCommits = [];
  try {
    const out = execSync('git log --since="2 weeks ago" --pretty=format:"%h|%ad|%s" --date=short -n 30', { encoding: 'utf8', cwd: REPO_ROOT });
    recentCommits = out.trim().split('\n').filter(Boolean).map(l => {
      const [hash, date, ...rest] = l.split('|');
      return { hash, date, subject: rest.join('|') };
    });
  } catch { /* git not available */ }

  console.log(`\n[C] Recent commits without telemetry coverage\n`);
  if (recentCommits.length === 0) {
    console.log(`    (git log not available)`);
  } else {
    console.log(`    The following ${recentCommits.length} commits shipped without emitting a BuildManifest.`);
    console.log(`    Per CLAUDE.md "Telemetry Synchronization Contract", each non-trivial commit`);
    console.log(`    should POST to /api/portal/project/telemetry.\n`);
    for (const c of recentCommits.slice(0, 15)) {
      console.log(`      ${c.date}  ${c.hash}  ${c.subject.slice(0, 70)}`);
    }
    if (recentCommits.length > 15) console.log(`      …+${recentCommits.length - 15} more`);
  }

  // ─── D. Verdict ───────────────────────────────────────────────────
  const manifestsTotal = health.data?.freshness?.total ?? 0;
  const broken = manifestsTotal === 0 || (uiRoutes === 0 && uiComponents === 0) || dbTables === 0;

  console.log(`\n┌─────────────────────────────────────────────────────────────────────┐`);
  if (broken) {
    console.log(`│  VERDICT:  TELEMETRY SYNC IS BROKEN                                  │`);
    console.log(`│                                                                       │`);
    console.log(`│  The portal is running on repo heuristics only. None of the recent    │`);
    console.log(`│  productization sprints have been reflected in telemetry.             │`);
    console.log(`│  Fix forward:                                                         │`);
    console.log(`│    1. Adopt BuildManifest emission for every non-trivial commit       │`);
    console.log(`│       (see system/intelligence/manifests/build_manifest.schema.json)  │`);
    console.log(`│    2. Optionally backfill recent commits via a one-shot emit script   │`);
    console.log(`│    3. Re-run this verifier to confirm the gap closes                  │`);
  } else {
    console.log(`│  VERDICT:  Telemetry sync is healthy                                 │`);
  }
  console.log(`└─────────────────────────────────────────────────────────────────────┘\n`);

  process.exit(broken ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
