/**
 * The frontend for the campus e2e, the way production serves it: the built SPA, with /api proxied to the backend.
 *
 * Production nginx serves frontend/build and proxies /api to the backend on the same origin; several portal calls use relative
 * /api URLs, so the CRA dev server (no proxy configured in this repo) would 404 them. This does the same with node's own http
 * module (no new dependency), bound to 127.0.0.1 only, proxying only to a backend that passes the localhost guard.
 *
 * Usage: node tests/systemV2/lib/localServe.js   (env: SERVE_PORT=3150, API_URL=http://127.0.0.1:3101, BUILD_DIR=frontend/build)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { assertLocalOnly } = require('./localOnly');

const PORT = Number(process.env.SERVE_PORT || 3150);
const { api } = assertLocalOnly({ api: process.env.API_URL || 'http://127.0.0.1:3101' });
const BUILD = path.resolve(process.env.BUILD_DIR || path.join(__dirname, '..', '..', '..', 'frontend', 'build'));
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json', '.txt': 'text/plain' };

if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
  console.error(JSON.stringify({ event: 'campus_e2e_serve_failed', outcome: 'failure', error_class: 'ConfigError', reason: `no build at ${BUILD}` }));
  process.exit(2);
}
const target = new URL(api);

function proxy(req, res) {
  const up = http.request({ host: target.hostname.replace(/^\[|\]$/g, ''), port: target.port, method: req.method, path: req.url,
    headers: { ...req.headers, host: target.host }, timeout: 30_000 }, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
  up.on('timeout', () => up.destroy(new Error('upstream timeout')));
  up.on('error', (e) => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'UpstreamUnavailable', message: e.message })); });
  req.pipe(up);
}

function serveStatic(req, res) {
  const clean = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.normalize(path.join(BUILD, clean));
  if (!file.startsWith(BUILD)) { res.writeHead(403); res.end(); return; } // no path traversal
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(BUILD, 'index.html'); // SPA fallback
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => ((req.url || '').startsWith('/api/') ? proxy(req, res) : serveStatic(req, res)))
  .listen(PORT, '127.0.0.1', () => console.log(JSON.stringify({ event: 'campus_e2e_serve_ready', outcome: 'success', url: `http://localhost:${PORT}`, api })));
