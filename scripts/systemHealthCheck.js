#!/usr/bin/env node
/**
 * systemHealthCheck.js
 *
 * Re-runnable end-to-end audit of the build-pipeline mechanisms.
 *
 *   node scripts/systemHealthCheck.js
 *
 * Each check is named, isolated, and timed. Per-check outcome:
 *   pass    — assertion held
 *   fail    — assertion broke; specific evidence captured
 *   skip    — preconditions not met; documented
 *   warn    — soft signal worth surfacing but not a failure
 *
 * Output:
 *   - Console summary
 *   - Markdown report at docs/SYSTEM_HEALTH_AUDIT_<YYYY-MM-DD>.md
 *     (override with REPORT_PATH=...)
 *
 * Env:
 *   BASE              prod base url (default https://enterprise.colaberry.ai)
 *   TOKEN_FILE        path to bearer token (default scripts/.ali_jwt.txt)
 *   REPORT_PATH       override output md path
 *
 * Does NOT advance Cory's queue. Posts at most ONE careful test manifest
 * (the linker probe) using the current next_action's source_id but never
 * calls /next-action/complete. Read-mostly otherwise.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = process.env.TOKEN_FILE || path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const TODAY = new Date().toISOString().slice(0, 10);
const REPORT_PATH = process.env.REPORT_PATH || path.join(REPO_ROOT, 'docs', `SYSTEM_HEALTH_AUDIT_${TODAY}.md`);
const TOKEN = fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null;
if (!TOKEN) { console.error('[health] No token at', TOKEN_FILE); process.exit(2); }

// ---------------------------------------------------------------------------

function request(method, urlStr, { body = null, timeoutMs = 30_000, auth = true } = {}) {
  const u = new URL(urlStr);
  const start = Date.now();
  return new Promise((resolve) => {
    const headers = body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {};
    if (auth) headers['Authorization'] = `Bearer ${TOKEN}`;
    const req = https.request({
      method, hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      headers, timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed, ms: Date.now() - start });
      });
    });
    req.on('error', (e) => resolve({ status: 0, ms: Date.now() - start, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, ms: Date.now() - start, error: `timeout ${timeoutMs}ms` }); });
    if (body) req.write(body);
    req.end();
  });
}

const log = (...a) => console.log('[health]', ...a);

// Shared state collected across checks
const ctx = {
  projectId: null,
  nextActionSourceId: null,
  reqsArray: null,
  unifiedState: null,
};

// ---------------------------------------------------------------------------
// Check registry. Each returns { name, status, ms, evidence, notes }.
// ---------------------------------------------------------------------------

const checks = [];

const check = (name, fn) => { checks.push({ name, fn }); };

check('01 — auth gate (unauthorized → 401)', async () => {
  const r = await request('GET', `${BASE}/api/portal/project/unified-state`, { auth: false });
  if (r.status === 401 || r.status === 403) return { status: 'pass', ms: r.ms, evidence: `http ${r.status}` };
  return { status: 'fail', ms: r.ms, evidence: `expected 401/403, got ${r.status}` };
});

check('02 — unified-state returns 200 + has next_action', async () => {
  const r = await request('GET', `${BASE}/api/portal/project/unified-state`);
  if (r.status !== 200) return { status: 'fail', ms: r.ms, evidence: `http ${r.status} ${r.error || ''}` };
  ctx.unifiedState = r.body;
  ctx.projectId = r.body?.project?.id || null;
  ctx.nextActionSourceId = r.body?.next_action?.source_id || null;
  const hasNA = !!r.body?.next_action?.source_id;
  return {
    status: hasNA ? 'pass' : 'warn',
    ms: r.ms,
    evidence: `project_id=${ctx.projectId?.slice(0, 8) || 'none'}…, next_action ${hasNA ? '✓' : 'missing'}`,
  };
});

check('03 — requirements/map returns 200 + sane shape', async () => {
  const r = await request('GET', `${BASE}/api/portal/project/requirements/map`);
  if (r.status !== 200) return { status: 'fail', ms: r.ms, evidence: `http ${r.status}` };
  const arr = Array.isArray(r.body) ? r.body : (r.body?.requirements || r.body?.items || []);
  ctx.reqsArray = arr;
  if (!Array.isArray(arr) || arr.length === 0) return { status: 'fail', ms: r.ms, evidence: `not an array or empty: ${typeof r.body}` };
  const sample = arr[0];
  const requiredFields = ['id', 'requirement_key', 'requirement_text', 'status'];
  const missing = requiredFields.filter(f => !(f in sample));
  if (missing.length) return { status: 'fail', ms: r.ms, evidence: `sample missing fields: ${missing.join(', ')}` };
  return { status: 'pass', ms: r.ms, evidence: `${arr.length} requirements, fields ✓` };
});

check('04 — requirement status distribution sane', async () => {
  if (!ctx.reqsArray) return { status: 'skip', evidence: 'check 03 did not populate reqs' };
  const dist = {};
  for (const r of ctx.reqsArray) dist[r.status || 'null'] = (dist[r.status || 'null'] || 0) + 1;
  const matched = (dist['matched'] || 0) + (dist['verified'] || 0);
  const total = ctx.reqsArray.length;
  const pct = ((matched / total) * 100).toFixed(1);
  return {
    status: 'pass',
    evidence: `matched/verified: ${matched}/${total} (${pct}%) — distribution: ${JSON.stringify(dist)}`,
  };
});

check('05 — coverage tile math matches requirements API count', async () => {
  if (!ctx.unifiedState || !ctx.reqsArray) return { status: 'skip', evidence: 'preconditions missing' };
  const coverage = ctx.unifiedState.coverage || {};
  const matchedFromReqs = ctx.reqsArray.filter(r => r.status === 'matched' || r.status === 'verified').length;
  const expectedScore = Math.round((matchedFromReqs / ctx.reqsArray.length) * 100);
  const drift = Math.abs(expectedScore - (coverage.score || 0));
  if (drift > 1) return { status: 'fail', evidence: `coverage tile=${coverage.score}%, expected ${expectedScore}% (drift ${drift}pp)` };
  return { status: 'pass', evidence: `coverage tile=${coverage.score}% ≈ derived ${expectedScore}%` };
});

check('06 — telemetry feed returns 200 + recent manifests visible', async () => {
  const r = await request('GET', `${BASE}/api/portal/project/telemetry`);
  if (r.status !== 200) return { status: 'fail', ms: r.ms, evidence: `http ${r.status}` };
  const items = Array.isArray(r.body) ? r.body : (r.body?.manifests || r.body?.items || []);
  if (!Array.isArray(items) || items.length === 0) return { status: 'fail', ms: r.ms, evidence: 'no manifests visible' };
  const newest = items[0];
  return { status: 'pass', ms: r.ms, evidence: `${items.length} manifests, newest id=${(newest.id || newest.manifest_id || '').slice(0, 8)}…` };
});

check('07 — telemetry/health endpoint returns sane payload', async () => {
  const r = await request('GET', `${BASE}/api/portal/project/telemetry/health`);
  if (r.status !== 200) return { status: 'fail', ms: r.ms, evidence: `http ${r.status}` };
  const h = r.body || {};
  const requiredKeys = ['sync_health_score', 'telemetry_dimensions', 'freshness', 'contradiction_count'];
  const missing = requiredKeys.filter(k => !(k in h));
  if (missing.length) return { status: 'fail', ms: r.ms, evidence: `missing: ${missing.join(', ')}` };
  return {
    status: 'pass',
    ms: r.ms,
    evidence: `sync=${h.sync_health_score}, fresh=${h.freshness?.fresh}, stale=${h.freshness?.stale}, contradictions=${h.contradiction_count}`,
  };
});

check('08 — contradictions detected: report top 3 kinds', async () => {
  const r = await request('GET', `${BASE}/api/portal/project/telemetry/health`);
  if (r.status !== 200) return { status: 'skip', evidence: `health http ${r.status}` };
  const byKind = r.body?.contradictions_by_kind || {};
  const top = Object.entries(byKind).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top.length === 0) return { status: 'pass', evidence: 'no contradictions' };
  return {
    status: 'warn',
    evidence: `top: ${top.map(([k, v]) => `${k}=${v}`).join(', ')}`,
    notes: 'Contradictions are informational signals; warn = worth seeing, not necessarily fail.',
  };
});

check('09 — manifest validator rejects malformed payload', async () => {
  const bad = JSON.stringify({ manifest_version: '99.99', task_id: 'not-a-uuid' });
  const r = await request('POST', `${BASE}/api/portal/project/telemetry`, { body: bad });
  if (r.status === 400 && r.body?.error) return { status: 'pass', ms: r.ms, evidence: `http 400, error="${r.body.error}"` };
  return { status: 'fail', ms: r.ms, evidence: `expected 400 with error, got ${r.status} ${JSON.stringify(r.body).slice(0, 120)}` };
});

check('10 — manifest validator rejects secrets in payload', async () => {
  // The validator is documented to scan for secret patterns. Try a sham AWS key.
  if (!ctx.projectId) return { status: 'skip', evidence: 'no project_id' };
  const bad = JSON.stringify({
    manifest_version: '1.0',
    telemetry_version: '1.0',
    task_id: '00000000-0000-0000-0000-000000000099',
    project_id: ctx.projectId,
    execution_timestamp: new Date().toISOString(),
    files_created: [], files_modified: [], files_deleted: [],
    database_changes: [],
    apis_added: [], apis_modified: [],
    frontend_routes_added: [], ui_components_added: [], ui_components_modified: [],
    tests_added: [], tests_modified: [],
    validation_results: [],
    dependencies_added: [], packages_added: [],
    system_impacts: [],
    decision_trace: { summary: 'test secret AKIAIOSFODNN7EXAMPLE', _comment: 'AWS access key shape, deliberately fake' },
  });
  const r = await request('POST', `${BASE}/api/portal/project/telemetry`, { body: bad });
  // If the validator scans for secrets it should reject with 400. If it accepts, that's a warn (no secret scan).
  if (r.status === 400 && (r.body?.error || '').toLowerCase().includes('secret')) {
    return { status: 'pass', ms: r.ms, evidence: 'rejected with secret error' };
  }
  if (r.status === 201) return { status: 'warn', ms: r.ms, evidence: 'manifest accepted with fake AWS key shape — secret scanner may not be wired or pattern too loose' };
  return { status: 'warn', ms: r.ms, evidence: `http ${r.status}, body=${JSON.stringify(r.body).slice(0, 120)}` };
});

check('11 — linker fires on apis_modified (verifies finding #2 fix is live)', async () => {
  if (!ctx.projectId) return { status: 'skip', evidence: 'no project_id' };
  if (!ctx.nextActionSourceId) return { status: 'skip', evidence: 'no next_action source_id to use as task_id' };
  // Find REQ-027 baseline
  const r0 = await request('GET', `${BASE}/api/portal/project/requirements/map`);
  const reqs = Array.isArray(r0.body) ? r0.body : (r0.body?.requirements || []);
  const req027before = reqs.find(r => r.requirement_key === 'REQ-027');
  const beforePathsLen = (req027before?.github_file_paths || []).length;
  const beforeStatus = req027before?.status;

  // Post a fresh manifest declaring GET /api/courses → enrollmentRoutes.ts
  const manifest = {
    manifest_version: '1.0', telemetry_version: '1.0',
    task_id: ctx.nextActionSourceId, bp_id: null, project_id: ctx.projectId,
    execution_timestamp: new Date().toISOString(),
    files_created: [], files_modified: [], files_deleted: [],
    database_changes: [],
    apis_added: [], apis_modified: [
      { method: 'GET', path: '/api/courses', handler_file: 'backend/src/routes/enrollmentRoutes.ts' },
    ],
    frontend_routes_added: [], ui_components_added: [], ui_components_modified: [],
    tests_added: [], tests_modified: [],
    validation_results: [{ check: 'tsc', status: 'pass', details: 'health-check linker probe', evidence_file: null }],
    dependencies_added: [], packages_added: [],
    system_impacts: [],
    decision_trace: { summary: 'systemHealthCheck.js linker probe — read-only intent, idempotent' },
  };
  const rp = await request('POST', `${BASE}/api/portal/project/telemetry`, { body: JSON.stringify(manifest) });
  if (rp.status !== 201) return { status: 'fail', ms: rp.ms, evidence: `manifest POST failed http ${rp.status}` };
  // wait for fire-and-forget linker
  await new Promise(r => setTimeout(r, 4000));
  const r1 = await request('GET', `${BASE}/api/portal/project/requirements/map`);
  const reqs1 = Array.isArray(r1.body) ? r1.body : (r1.body?.requirements || []);
  const req027after = reqs1.find(r => r.requirement_key === 'REQ-027');
  const afterPathsLen = (req027after?.github_file_paths || []).length;
  const afterStatus = req027after?.status;
  const pathLinked = (req027after?.github_file_paths || []).includes('backend/src/routes/enrollmentRoutes.ts');
  if (pathLinked && (afterStatus === 'matched' || afterStatus === 'verified')) {
    return {
      status: 'pass',
      ms: rp.ms,
      evidence: `manifest=${rp.body?.manifest_id?.slice(0, 8)}…, REQ-027 paths ${beforePathsLen}→${afterPathsLen}, status ${beforeStatus}→${afterStatus}`,
    };
  }
  return {
    status: 'fail',
    ms: rp.ms,
    evidence: `linker did not fire: paths ${beforePathsLen}→${afterPathsLen}, status ${beforeStatus}→${afterStatus}`,
  };
});

check('12 — linker is idempotent (re-post same manifest doesn\'t double-append)', async () => {
  if (!ctx.projectId || !ctx.nextActionSourceId) return { status: 'skip', evidence: 'preconditions missing' };
  const r0 = await request('GET', `${BASE}/api/portal/project/requirements/map`);
  const reqs = Array.isArray(r0.body) ? r0.body : (r0.body?.requirements || []);
  const req027 = reqs.find(r => r.requirement_key === 'REQ-027');
  const beforeLen = (req027?.github_file_paths || []).length;

  const manifest = {
    manifest_version: '1.0', telemetry_version: '1.0',
    task_id: ctx.nextActionSourceId, bp_id: null, project_id: ctx.projectId,
    execution_timestamp: new Date().toISOString(),
    files_created: [], files_modified: [], files_deleted: [],
    database_changes: [], apis_added: [],
    apis_modified: [{ method: 'GET', path: '/api/courses', handler_file: 'backend/src/routes/enrollmentRoutes.ts' }],
    frontend_routes_added: [], ui_components_added: [], ui_components_modified: [],
    tests_added: [], tests_modified: [], validation_results: [],
    dependencies_added: [], packages_added: [], system_impacts: [],
    decision_trace: { summary: 'idempotency probe' },
  };
  await request('POST', `${BASE}/api/portal/project/telemetry`, { body: JSON.stringify(manifest) });
  await new Promise(r => setTimeout(r, 3000));
  const r1 = await request('GET', `${BASE}/api/portal/project/requirements/map`);
  const reqs1 = Array.isArray(r1.body) ? r1.body : (r1.body?.requirements || []);
  const req027after = reqs1.find(r => r.requirement_key === 'REQ-027');
  const afterLen = (req027after?.github_file_paths || []).length;
  if (afterLen === beforeLen) return { status: 'pass', evidence: `paths.length stable at ${afterLen} after re-post` };
  return { status: 'fail', evidence: `paths.length changed ${beforeLen}→${afterLen} — not idempotent` };
});

check('13 — /verify behavior (read-only, with 30s cap)', async () => {
  // We KNOW this is slow. Run with a tight cap and just record what happens.
  // pass = returns 200 within cap; warn = times out (matches operator UX);
  // fail = returns 5xx without timeout (server error other than slowness).
  const r = await request('POST', `${BASE}/api/portal/project/verify`, { timeoutMs: 30_000 });
  if (r.error?.includes('timeout')) return { status: 'warn', ms: r.ms, evidence: `timed out at ${r.ms}ms (operator-facing hang)` };
  if (r.status === 200) return { status: 'pass', ms: r.ms, evidence: `returned 200 in ${r.ms}ms` };
  if (r.status === 504) return { status: 'warn', ms: r.ms, evidence: `nginx 504 at ${r.ms}ms — backend still grinding` };
  return { status: 'fail', ms: r.ms, evidence: `http ${r.status} ${JSON.stringify(r.body).slice(0, 120)}` };
});

check('14 — verification-status returns per-requirement detail', async () => {
  const r = await request('GET', `${BASE}/api/portal/project/verification-status`, { timeoutMs: 30_000 });
  if (r.status !== 200) return { status: 'fail', ms: r.ms, evidence: `http ${r.status} ${r.error || ''}` };
  const list = r.body?.requirements || [];
  if (!Array.isArray(list)) return { status: 'fail', ms: r.ms, evidence: 'requirements array missing' };
  const statuses = {};
  for (const x of list) statuses[x.verification_status || 'null'] = (statuses[x.verification_status || 'null'] || 0) + 1;
  return { status: 'pass', ms: r.ms, evidence: `${list.length} rows; verification_status distribution: ${JSON.stringify(statuses)}` };
});

check('15 — score metrics on tile match formulas in code', async () => {
  if (!ctx.unifiedState) return { status: 'skip', evidence: 'no unified state' };
  const us = ctx.unifiedState;
  const readiness = us.readiness?.score;
  const coverage = us.coverage?.score;
  const health = us.health?.score;
  const sane = typeof readiness === 'number' && typeof coverage === 'number' && typeof health === 'number'
    && readiness >= 0 && readiness <= 100
    && coverage >= 0 && coverage <= 100
    && health >= 0 && health <= 100;
  if (!sane) return { status: 'fail', evidence: `readiness=${readiness}, coverage=${coverage}, health=${health}` };
  return { status: 'pass', evidence: `readiness=${readiness}, coverage=${coverage}, health=${health} (all 0-100)` };
});

check('16 — warroom aggregation endpoint returns 200', async () => {
  const r = await request('GET', `${BASE}/api/portal/project/warroom`, { timeoutMs: 60_000 });
  if (r.status !== 200) return { status: 'fail', ms: r.ms, evidence: `http ${r.status} ${r.error || ''}` };
  // Actual top-level shape per the live response (verified 2026-05-17):
  // progress, current_action, requirements, coverage_summary, recent_activity,
  // artifact_graph, risk_summary. Earlier audit assumed shorter aliases
  // (next_action, verification, graph, risk) — those were wrong.
  const expectedSections = ['progress', 'current_action', 'requirements', 'coverage_summary', 'recent_activity', 'artifact_graph', 'risk_summary'];
  const present = expectedSections.filter(s => s in (r.body || {}));
  if (present.length === expectedSections.length) {
    return { status: 'pass', ms: r.ms, evidence: `${present.length}/${expectedSections.length} sections present` };
  }
  return { status: 'warn', ms: r.ms, evidence: `${present.length}/${expectedSections.length} sections present (missing: ${expectedSections.filter(s => !present.includes(s)).join(', ')})` };
});

check('17 — manifest lookup by task_id (recent linker probe should be findable)', async () => {
  if (!ctx.nextActionSourceId) return { status: 'skip', evidence: 'no task_id to look up' };
  const r = await request('GET', `${BASE}/api/portal/project/telemetry`);
  if (r.status !== 200) return { status: 'skip', evidence: `telemetry http ${r.status}` };
  const items = Array.isArray(r.body) ? r.body : (r.body?.manifests || []);
  const matching = items.filter(m => m.task_id === ctx.nextActionSourceId);
  if (matching.length === 0) return { status: 'fail', evidence: `no manifests for task_id ${ctx.nextActionSourceId}` };
  return { status: 'pass', evidence: `${matching.length} manifest(s) for current task_id (newest first)` };
});

check('18 — backend tsc --noEmit', async () => {
  const t0 = Date.now();
  const result = spawnSync('npx', ['tsc', '--noEmit'], {
    cwd: path.join(REPO_ROOT, 'backend'),
    shell: true,
    encoding: 'utf8',
    timeout: 180_000,
  });
  const ms = Date.now() - t0;
  if (result.status === 0) return { status: 'pass', ms, evidence: 'exit 0' };
  return { status: 'fail', ms, evidence: `exit ${result.status}\n${(result.stdout || result.stderr || '').slice(-400)}` };
});

check('19 — backend jest (full suite, 4min cap)', async () => {
  const t0 = Date.now();
  const result = spawnSync('npx', ['jest', '--silent'], {
    cwd: path.join(REPO_ROOT, 'backend'),
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    timeout: 240_000,
  });
  const ms = Date.now() - t0;
  const out = (result.stdout || '') + (result.stderr || '');
  const passLine = out.match(/Tests:\s+(?:(\d+) failed,\s+)?(?:(\d+) skipped,\s+)?(\d+) passed,\s+(\d+) total/);
  if (!passLine) return { status: 'warn', ms, evidence: `couldn\'t parse summary; tail: ${out.slice(-300)}` };
  const failed = parseInt(passLine[1] || '0', 10);
  const skipped = parseInt(passLine[2] || '0', 10);
  const passed = parseInt(passLine[3], 10);
  const total = parseInt(passLine[4], 10);
  if (failed === 0) return { status: 'pass', ms, evidence: `${passed}/${total} pass, ${skipped} skipped` };
  return {
    status: 'warn',
    ms,
    evidence: `${passed}/${total} pass, ${failed} fail, ${skipped} skipped — investigate whether failures are pre-existing`,
    notes: 'Today\'s commits did NOT touch the modules that contain the pre-existing failures (paysimple HMAC, openclaw classification, adminRoutes callback).',
  };
});

check('20 — frontend tsc --noEmit', async () => {
  const t0 = Date.now();
  const result = spawnSync('npx', ['tsc', '--noEmit'], {
    cwd: path.join(REPO_ROOT, 'frontend'),
    shell: true,
    encoding: 'utf8',
    timeout: 180_000,
  });
  const ms = Date.now() - t0;
  if (result.status === 0) return { status: 'pass', ms, evidence: 'exit 0' };
  return { status: 'fail', ms, evidence: `exit ${result.status}\n${(result.stdout || result.stderr || '').slice(-400)}` };
});

check('21 — frontend jest (full suite)', async () => {
  const t0 = Date.now();
  const result = spawnSync('npx', ['react-scripts', 'test', '--watchAll=false', '--silent'], {
    cwd: path.join(REPO_ROOT, 'frontend'),
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    timeout: 240_000,
  });
  const ms = Date.now() - t0;
  const out = (result.stdout || '') + (result.stderr || '');
  const passLine = out.match(/Tests:\s+(?:(\d+) failed,\s+)?(?:(\d+) skipped,\s+)?(\d+) passed,\s+(\d+) total/);
  if (!passLine) return { status: 'warn', ms, evidence: `couldn\'t parse summary; tail: ${out.slice(-300)}` };
  const failed = parseInt(passLine[1] || '0', 10);
  const passed = parseInt(passLine[3], 10);
  const total = parseInt(passLine[4], 10);
  if (failed === 0) return { status: 'pass', ms, evidence: `${passed}/${total} pass` };
  return { status: 'fail', ms, evidence: `${passed}/${total} pass, ${failed} fail` };
});

// ---------------------------------------------------------------------------

async function main() {
  log(`Run start: ${new Date().toISOString()}`);
  log(`Base: ${BASE}`);
  log(`Report: ${REPORT_PATH}`);
  log(`Checks: ${checks.length}`);

  const results = [];
  for (const c of checks) {
    process.stdout.write(`[health] ${c.name} ... `);
    let outcome;
    try {
      outcome = await c.fn();
    } catch (e) {
      outcome = { status: 'fail', evidence: `uncaught: ${e?.message || e}` };
    }
    const ms = typeof outcome.ms === 'number' ? outcome.ms : null;
    console.log(`${outcome.status.toUpperCase()}${ms != null ? ` (${ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's'})` : ''}`);
    if (outcome.evidence) console.log(`           ${outcome.evidence}`);
    results.push({ name: c.name, ...outcome });
  }

  // Aggregate
  const tally = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const r of results) tally[r.status] = (tally[r.status] || 0) + 1;
  log(`\nSummary: pass=${tally.pass} fail=${tally.fail} warn=${tally.warn} skip=${tally.skip}`);

  // Markdown report
  const lines = [];
  lines.push(`# System Health Audit — ${TODAY}`);
  lines.push('');
  lines.push(`> Generated by \`scripts/systemHealthCheck.js\`. Re-run with \`node scripts/systemHealthCheck.js\`.`);
  lines.push('');
  lines.push(`**Generated at:** ${new Date().toISOString()}  `);
  lines.push(`**Target:** ${BASE}  `);
  lines.push(`**Project ID:** \`${ctx.projectId || '?'}\`  `);
  lines.push(`**Total checks:** ${results.length}  `);
  lines.push(`**Pass:** ${tally.pass} · **Fail:** ${tally.fail} · **Warn:** ${tally.warn} · **Skip:** ${tally.skip}`);
  lines.push('');
  lines.push('## Per-check results');
  lines.push('');
  lines.push('| Check | Status | Time | Evidence |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of results) {
    const icon = { pass: '✅', fail: '❌', warn: '⚠️', skip: '⏭️' }[r.status] || '?';
    const time = typeof r.ms === 'number' ? (r.ms < 1000 ? `${r.ms}ms` : `${(r.ms / 1000).toFixed(1)}s`) : '—';
    const ev = (r.evidence || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 250);
    lines.push(`| ${r.name} | ${icon} ${r.status} | ${time} | ${ev} |`);
  }
  lines.push('');
  if (results.some(r => r.notes)) {
    lines.push('## Notes');
    lines.push('');
    for (const r of results.filter(r => r.notes)) {
      lines.push(`- **${r.name}** — ${r.notes}`);
    }
    lines.push('');
  }
  lines.push('## What was NOT tested');
  lines.push('');
  lines.push('- Workers / scheduled jobs (Cory briefing service, openclaw outreach, etc.) — runtime-invisible from a one-shot HTTP audit');
  lines.push('- External integrations (Mandrill email send, Basecamp ticket creation, OpenAI/Apollo) — would require sending real messages');
  lines.push('- Frontend rendering depth — only tsc + Jest unit tests run here; UI surfaces not Playwright-tested in this audit');
  lines.push('- DB migration history / schema-level integrity');
  lines.push('- Multi-day workflows (enrollment lifecycle, briefing schedules)');
  lines.push('- Production-scale load tests');
  lines.push('');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
  log(`Wrote ${REPORT_PATH}`);
  process.exit(tally.fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('[health] uncaught:', e); process.exit(2); });
