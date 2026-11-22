// Loop T33 (carried from T05): every Basecamp call in the attach tool is bounded; a hung server rejects, never hangs.
// Run: node --test scripts/artifacts/__tests__/
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { timedFetch, TIMEOUT_MS } = require('../attachArtifactToTicket');

test('the default bound is 30 seconds', () => {
  assert.equal(TIMEOUT_MS, 30000);
});

test('a server that never answers makes the call reject with a TimeoutError', async () => {
  const sockets = new Set();
  const server = http.createServer(() => { /* never respond */ });
  server.on('connection', (s) => sockets.add(s));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const started = Date.now();
  try {
    await assert.rejects(timedFetch(`http://127.0.0.1:${server.address().port}/x`, { method: 'GET' }, 150), (e) => e.name === 'TimeoutError');
    assert.ok(Date.now() - started < 5000, 'rejected promptly');
  } finally {
    sockets.forEach((s) => s.destroy());
    server.close();
  }
});

test('no bare fetch is left in the tool (every call goes through timedFetch)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'attachArtifactToTicket.js'), 'utf8');
  assert.equal((src.match(/await fetch\(/g) || []).length, 0);
  assert.equal((src.match(/await timedFetch\(/g) || []).length, 2);
});
