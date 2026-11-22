/**
 * Shared harness for the Career Prep browser suites (split out of careerPrep.e2e.js in loop task T06, before any new
 * check was added, so every per-area file stays under the size ceiling): serve a built app on 127.0.0.1 with the
 * platform API answered from fixtures (fakeApi.js), a fake camera and recorder, a page factory, the check recorder,
 * fidelity screenshots, and the runner that sets the exit code. Nothing here can reach production or any server.
 *
 * Env: BUILD_DIR (default frontend/build), PORT (default 3161), PW_CHANNEL (default msedge), PW_PATH, CP_E2E_SELFTEST,
 * CP_E2E_DAYS_AHEAD, FIDELITY_DIR.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const { installFakeApi } = require('./fakeApi');

// Self-tests that MUST fail the run: flag-off (Career Prep closed: nothing renders) and wide (a 2000px block in the room), tip (a tooltip pushed off screen) and contrast (a room heading colored near-black).
const SELFTEST = process.env.CP_E2E_SELFTEST || '';
// CP_E2E_DAYS_AHEAD=n runs the whole suite with the browser clock (and the fixtures' "now") n days in the future.
const NOW = Date.now() + Number(process.env.CP_E2E_DAYS_AHEAD || 0) * 86_400_000;

const BUILD = path.resolve(process.env.BUILD_DIR || path.join(__dirname, '..', '..', '..', 'frontend', 'build'));
const PORT = Number(process.env.PORT || 3161);
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
// A participant token that only has to EXIST for the portal's route guard; the fake API never reads it.
const TOKEN = ['e30', Buffer.from(JSON.stringify({ sub: 'e2e', exp: 4102444800 })).toString('base64url'), 'x'].join('.');

function serve() {
  if (!fs.existsSync(path.join(BUILD, 'index.html'))) throw new Error(`no build at ${BUILD}: run the frontend build first`);
  return http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/__iframe') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<!doctype html><iframe id="f" sandbox="allow-scripts allow-same-origin allow-forms" src="/portal/career/room" style="width:1400px;height:860px;border:0"></iframe>`); return; }
    let file = path.normalize(path.join(BUILD, url));
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(BUILD, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT, '127.0.0.1');
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: ok === true, detail }); console.log(`${ok === true ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

/** A fake camera (a REAL MediaStream, drawn on a canvas, so it can be a <video>'s srcObject) and a fake recorder. */
const FAKE_MEDIA = `
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const g = c.getContext('2d'); let k = 0;
    const paint = () => { g.fillStyle = '#2f5f6f'; g.fillRect(0, 0, 320, 180); g.fillStyle = '#c9d8e2'; g.beginPath(); g.arc(160, 80, 34, 0, 7); g.fill(); g.fillRect(105, 120, 110, 60); g.fillStyle = '#e8f0f6'; g.fillRect(10 + (k++ % 40), 8, 6, 6); };
    paint();
    const stream = c.captureStream(10);
    const timer = setInterval(paint, 100);
    window.__cpStream = stream; window.__cpStopped = false;
    stream.getTracks().forEach((t) => { const stop = t.stop.bind(t); t.stop = () => { clearInterval(timer); window.__cpStopped = true; stop(); }; });
    return stream;
  };
  window.MediaRecorder = class { constructor() { this.ondataavailable = null; this.onstop = null; } start() {} stop() { this.ondataavailable && this.ondataavailable({ data: new Blob(['x'], { type: 'video/webm' }) }); this.onstop && this.onstop(); } };
`;

async function newPage(browser, opts = {}) {
  // opts.api: options for the fixture student ({ empty: true } = no data yet).
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.addInitScript(`localStorage.setItem('participant_token', '${TOKEN}'); ${FAKE_MEDIA}`);
  const page = await ctx.newPage();
  await page.clock.setSystemTime(new Date(NOW));
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const api = await installFakeApi(page, NOW, opts.api || {});
  return { ctx, page, errors, api };
}

const tid = (id) => `[data-testid="${id}"]`;

const FIDELITY = process.env.FIDELITY_DIR || '';
async function shot(page, name) {
  if (!FIDELITY) return;
  fs.mkdirSync(FIDELITY, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(FIDELITY, `${name}.png`) });
}

/** One check on its own page: `fn(page, plans)` returns [ok, detail]; any throw is a FAIL that names why. */
async function unit(browser, errors, name, opts, fn) {
  const { ctx, page, errors: e } = await newPage(browser, opts);
  page.setDefaultTimeout(8000);
  const plans = [];
  page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/portal/career-prep/plans') plans.push(r.postDataJSON() || {}); });
  try {
    const [ok, detail] = await fn(page, plans);
    check(name, ok, detail);
  } catch (err) {
    check(name, false, `could not run: ${String(err && err.message).split('\n')[0].slice(0, 160)}`);
  }
  errors.push(...e);
  await ctx.close();
}

/**
 * Serve the build, launch Edge, run `body(browser)`, print the tally, and exit: 0 only when every check ran and passed
 * AND at least `minChecks` checks ran (a suite that silently skipped its checks is a failure).
 */
async function runSuite(minChecks, body) {
  const server = serve();
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
  try {
    await body(browser);
  } catch (e) {
    check('suite ran to the end', false, String(e && e.message).slice(0, 300));
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length || results.length < minChecks ? 1 : 0);
}

module.exports = { SELFTEST, NOW, BUILD, PORT, BASE, TOKEN, serve, results, check, newPage, tid, shot, unit, runSuite };
