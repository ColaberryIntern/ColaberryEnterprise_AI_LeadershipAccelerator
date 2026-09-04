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

const API = { host: '127.0.0.1', port: 3099 };
const APP = { host: '127.0.0.1', port: 3098 };
const PORT = 3095;

const target = (url) => (url.startsWith('/api/') ? API : APP);

const server = http.createServer((req, res) => {
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
