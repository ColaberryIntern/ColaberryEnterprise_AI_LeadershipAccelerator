/**
 * One-origin dev proxy for the walkthrough.
 *
 * In production nginx serves the app and the API from the SAME origin, and some
 * of the app depends on that: AuthContext calls `fetch('/api/admin/me')` with a
 * relative URL, so with the CRA dev server on one port and the backend on
 * another, that call 404s, sections resolve to [], and every admin route bounces
 * to change-password. That is a property of the split-port dev setup, not of the
 * page under test — so this puts both behind one origin, the way the real
 * deployment does.
 *
 *   /api/*  -> backend  :3099
 *   /*      -> CRA      :3098   (including the HMR websocket)
 */
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const API = { host: '127.0.0.1', port: 3099 };
const APP = { host: '127.0.0.1', port: 3098 };
const PORT = 3095;

const target = (url) => (url.startsWith('/api/') ? API : APP);

/**
 * A door for a human to walk through.
 *
 * The app reads its session from localStorage, so a URL alone cannot open an
 * authenticated page in someone's own browser. This serves a tiny page that
 * writes the fixture token to the SAME key the real login writes, then
 * redirects. No guard is bypassed and no login form is stubbed - the app cannot
 * tell the difference between this and signing in.
 *
 * Localhost only, fixture accounts only, against the isolated scratch database.
 */
const WHO = {
  w11:   { key: 'participant_token', file: 'tok_w11.txt',   to: '/portal/cert-prep', label: 'Week 11 student - Cert Prep is open' },
  w6:    { key: 'participant_token', file: 'tok_w6.txt',    to: '/portal/cert-prep', label: 'Week 6 student - before the fence opens' },
  admin: { key: 'admin_token',       file: 'tok_admin.txt', to: '/admin/cert-prep',  label: 'Instructor view' },
};

function devEnter(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const who = WHO[url.searchParams.get('who') || 'w11'];
  if (!who) { res.writeHead(404); res.end('unknown fixture'); return; }
  let token;
  try { token = fs.readFileSync(path.join(__dirname, who.file), 'utf8').trim(); }
  catch { res.writeHead(500); res.end('token file missing - re-mint the fixture tokens'); return; }

  const to = url.searchParams.get('to') || who.to;
  // Clear the OTHER session key first: a stale admin token sitting alongside a
  // participant one is how a portal page ends up rendering an admin bounce.
  const other = who.key === 'admin_token' ? 'participant_token' : 'admin_token';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><meta charset="utf-8"><title>Signing in…</title>
<body style="font:15px system-ui;padding:2rem">Signing in as <b>${who.label}</b>…
<script>
  try { localStorage.removeItem(${JSON.stringify(other)}); } catch (e) {}
  localStorage.setItem(${JSON.stringify(who.key)}, ${JSON.stringify(token)});
  location.replace(${JSON.stringify(to)});
</script></body>`);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/dev-enter')) return devEnter(req, res);
  const t = target(req.url);
  const proxied = http.request(
    { host: t.host, port: t.port, path: req.url, method: req.method, headers: { ...req.headers, host: `${t.host}:${t.port}` } },
    (up) => { res.writeHead(up.statusCode || 502, up.headers); up.pipe(res); },
  );
  proxied.on('error', (err) => { res.writeHead(502); res.end(`proxy error: ${err.message}`); });
  req.pipe(proxied);
});

// CRA's dev client opens a websocket for hot reload; without this the page logs
// a stream of connection errors that would pollute the console-error assertions.
server.on('upgrade', (req, socket, head) => {
  const t = target(req.url);
  const up = net.connect(t.port, t.host, () => {
    up.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n',
    );
    if (head && head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(PORT, '127.0.0.1', () => console.log(`dev proxy on http://localhost:${PORT} -> app :3098, api :3099`));
