/**
 * Shared harness for the hire.refactored.ai browser checks.
 *
 * WHAT IT RUNS AGAINST. The BUILT app (apps/hire-refactored-public/dist, built here with
 * PLATFORM_API_BASE pointed at a fake origin) served by a tiny static server that applies
 * the SAME fall-through rules as nginx/hire-refactored.conf. The platform API is answered
 * from recorded fixtures by Playwright route interception - nothing here can reach
 * production, write a lead or send a notification.
 *
 * IT MUST BE ABLE TO FAIL. Checks are scored; nothing counts as a pass unless its assertion
 * actually evaluated, and `selfTest()` proves each script's checker goes red on a page that
 * should fail it (the repo's "a browser check that goes green against a dead server is worse
 * than no check").
 *
 * Usage (from repo root):  PW_PATH=playwright node tests/systemV2/hire-refactored/<name>.e2e.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const APP = path.join(ROOT, 'apps', 'hire-refactored-public');
const DIST = path.join(APP, 'dist');
const API_ORIGIN = 'https://hire-api.test';

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

function build() {
  execFileSync(process.execPath, [path.join(APP, 'build.js')], { env: { ...process.env, PLATFORM_API_BASE: API_ORIGIN }, stdio: 'pipe' });
}

/** The nginx rules, restated for the test server and kept in step by nginxConf.test.js. */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (/^\/ws-/.test(clean) || clean.startsWith('/api/')) return { status: 410, json: '{"error":"retired"}' };
  const tryFile = (p) => { const f = path.join(DIST, p); return f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
  const direct = tryFile(clean) || tryFile(path.join(clean, 'index.html'));
  if (direct) return { file: direct };
  if (clean.startsWith('/talent/')) return { file: path.join(DIST, 'talent', 'record', 'index.html') };
  if (clean.startsWith('/case-studies/')) return { file: path.join(DIST, 'case-studies', 'record', 'index.html') };
  return { status: 404 };
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const r = resolveFile(req.url);
      if (r.json) { res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(r.json); return; }
      if (!r.file) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(r.file)] || 'application/octet-stream' });
      fs.createReadStream(r.file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

/* ---------------------------------------------------------------- fixtures --- */
const person = (slug, name, over = {}) => ({
  slug, name, avatarUrl: null, role: 'AI Systems Architect', track: 'architect', headline: null,
  location: 'Dallas, TX', cohort: 'July 2026', availability: null, caseStudyCount: 1, verifiedCommitCount: 4,
  capabilities: [{ name: 'Agent Skills', proven: true }],
  signature: { slug: `${slug}-case`, title: `${name}'s claims triage`, industry: 'Insurance', heroMetric: null },
  spotlight: false, ...over,
});
const directory = (talent) => ({
  ok: true, totals: { listed: talent.length, caseStudies: talent.length, verifiedCommits: 4 * talent.length, industries: talent.length ? 1 : 0 },
  spotlight: talent.slice(0, 3), spotlightSource: 'latest', talent, facets: {}, nextCursor: null,
});
const portfolio = (slug, name) => ({
  ok: true,
  portfolio: {
    identity: { full_name: name, headline: 'AI Systems Architect', cohort_name: 'July 2026', avatar_data_url: null, linkedin_url: null, location: 'Dallas, TX', github_url: null },
    about: ['Ships agent workflows.'], stats: { files_committed: 412 }, capabilities: [{ name: 'Agent Skills', count: 3, proven: true }],
    projects: [{ title: 'Claims Triage', organization: 'Acme', industry: 'Insurance', case_study_slug: `${slug}-case` }, { title: 'Intake Router', organization: 'Acme', industry: null, case_study_slug: null }],
    verified_commits: [{ story_id: 's1', title: 'Flags late claims', commit_sha_short: 'abc1234', committed_at: null, criteria_passed: 3, criteria_total: 3, commit_url: 'https://github.com/x/y/commit/abc1234' }],
    experience: [], records: [], repositories: [], private_repository_count: 0, generated_at: '2026-11-06T00:00:00Z',
  },
  hire: {
    signature: { slug: `${slug}-case`, title: `${name}'s claims triage`, summary: 'Late claims surface first.', industry: 'Insurance', outcomes: [{ value: '3', label: 'queues merged' }] },
    caseStudies: [{ slug: `${slug}-case`, title: `${name}'s claims triage`, summary: 'Late claims surface first.', industry: 'Insurance' }],
    availability: null, spotlight: false, indexable: true,
  },
});
const caseStudy = (slug, builderSlug, builderName) => ({
  surface: { key: 'hire', sectionOrder: ['hero', 'builder', 'contributors', 'build', 'measurement', 'artifacts', 'repositories', 'architecture', 'decisions', 'situation', 'roadmap', 'closing', 'cta'], hiddenSections: [], requiredSections: ['contributors', 'repositories', 'cta'], hero: { eyebrow: 'Hire · proven talent' }, cta: {} },
  caseStudy: {
    slug, title: `${builderName}'s claims triage`, standfirst: 'Late claims surface first.', industry: 'Insurance',
    heroMetrics: [{ label: 'queues merged', valueDisplay: '3', unit: null }],
    builder: { name: builderName, roleTitle: 'AI Systems Architect', photoUrl: null },
    repositories: [{ label: 'x/y', url: 'https://github.com/x/y', role: 'primary' }], contributors: [], artifacts: [], decisions: [], roadmap: [], timeline: [],
  },
  builderPortfolioSlug: builderSlug,
});

/**
 * Route the fake API origin. `routes` maps a pathname prefix to a JSON body (status 200),
 * `{ status, body }`, or 'abort' (the API is down).
 */
async function routeApi(context, routes) {
  await context.route(`${API_ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => url.pathname.startsWith(k));
    const spec = key ? routes[key] : { status: 404, body: { error: 'Not found' } };
    if (spec === 'abort') return route.abort('connectionrefused');
    const status = spec && spec.status ? spec.status : 200;
    const body = spec && spec.status ? spec.body : spec;
    return route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
}

/* ----------------------------------------------------------------- scoring --- */
function scorer(name) {
  const results = [];
  const check = (label, ok, detail = '') => { results.push({ label, ok: ok === true, detail }); };
  const report = () => {
    const failed = results.filter((r) => !r.ok);
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.detail ? '  (' + r.detail + ')' : ''}`);
    console.log(`\n${name}: ${results.length - failed.length}/${results.length} passed`);
    return results.length > 0 && failed.length === 0;
  };
  return { check, report, results };
}

async function launch() {
  const { chromium } = require(process.env.PW_PATH || 'playwright');
  return chromium.launch({ headless: true });
}

module.exports = { ROOT, API_ORIGIN, build, serve, resolveFile, person, directory, portfolio, caseStudy, routeApi, scorer, launch };
