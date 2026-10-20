// Run: node --test tests/systemV2/lib/localOnly.test.js
const test = require('node:test');
const assert = require('node:assert');
const { checkLocalUrl } = require('./localOnly');

test('accepts plain http on the three local hosts', () => {
  for (const u of ['http://localhost:3150', 'http://127.0.0.1:3101/api', 'http://[::1]:3150/portal']) {
    assert.strictEqual(checkLocalUrl(u).ok, true, u);
  }
});

test('refuses production, look-alikes, tunnels, wildcard and https', () => {
  for (const u of [
    'https://enterprise.colaberry.ai',
    'http://enterprise.colaberry.ai',
    'http://localhost.evil.com:3150',
    'https://abc123.ngrok-free.app',
    'http://abc123.ngrok.io',
    'http://0.0.0.0:3150',
    'http://[::ffff:7f00:1]:3150',
    'https://localhost:3150',
    'http://127.0.0.2:3150',
  ]) {
    assert.strictEqual(checkLocalUrl(u).ok, false, u);
  }
});

test('refuses unset, blank and malformed', () => {
  for (const u of [undefined, '', '   ', 'not a url']) assert.strictEqual(checkLocalUrl(u).ok, false, String(u));
});
