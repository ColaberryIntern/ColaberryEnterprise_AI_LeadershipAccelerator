#!/usr/bin/env node
/**
 * CH10.1 A local stand-in for Whapi.Cloud, for the hub's WhatsApp tests. It binds 127.0.0.1 ONLY, so a
 * test can never reach the real service or a real group (phase 3 hard stop).
 *
 *   FAKE_WHAPI_PORT=3299 node tests/systemV2/lib/fakeWhapi.js
 *   backend env: COMMS_HUB_WHATSAPP_ENABLED=true WHAPI_TOKEN=fake-whapi-token WHAPI_BASE_URL=http://127.0.0.1:3299
 *
 * Whapi endpoints served: GET /health, GET /groups, GET /groups/:id, POST /messages/text,
 * POST /messages/image, GET /messages/list/:chat. A wrong or missing bearer token answers 401.
 *
 * Test controls (no token needed):
 *   POST /__script {"path":"/messages/text","status":429,"times":1}   answer that path with a status
 *   POST /__script {"path":"/messages/image","hangAfterSend":true}    record the send, then never answer
 *   POST /__script {"path":"/health","state":"QR"}                     report a health state
 *   GET  /__sent                                                        every message recorded so far
 *   POST /__reset                                                       back to the starting state
 */
const http = require('http');

const PORT = Number(process.env.FAKE_WHAPI_PORT || 3299);
const TOKEN = process.env.FAKE_WHAPI_TOKEN || 'fake-whapi-token';
const OUR_NUMBER = '15550001234';

function initialGroups() {
  return [
    { id: '120363000000000001@g.us', name: 'Comms Hub test group', participants: [{ id: OUR_NUMBER, rank: 'admin' }, { id: '15550009999', rank: 'member' }], participants_count: 2, announcements: false, suspended: false, terminated: false },
    { id: '120363000000000002@g.us', name: 'November cohort', participants: [{ id: OUR_NUMBER, rank: 'member' }, { id: '15550008888', rank: 'member' }], participants_count: 2, announcements: false, suspended: false, terminated: false },
    { id: '120363000000000003@g.us', name: 'Announcements only', participants: [{ id: OUR_NUMBER, rank: 'member' }, { id: '15550007777', rank: 'admin' }], participants_count: 2, announcements: true, suspended: false, terminated: false },
  ];
}

let state;
function reset() { state = { health: 'AUTH', groups: initialGroups(), sent: [], scripts: [], seq: 0 }; }
reset();

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
  });
}
function takeScript(path) {
  const i = state.scripts.findIndex((s) => s.path === path);
  if (i < 0) return null;
  const s = state.scripts[i];
  if (s.times !== undefined) { s.times -= 1; if (s.times <= 0) state.scripts.splice(i, 1); }
  return s;
}
function record(to, kind, text, media) {
  state.seq += 1;
  const m = { id: `fake-${state.seq}`, chat_id: to, from_me: true, timestamp: Math.floor(Date.now() / 1000), type: kind, ...(kind === 'text' ? { text: { body: text } } : { image: { caption: text, link: media } }) };
  state.sent.push(m);
  return m;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  // Test controls.
  if (path === '/__reset' && req.method === 'POST') { reset(); return send(res, 200, { ok: true }); }
  if (path === '/__sent' && req.method === 'GET') return send(res, 200, { messages: state.sent });
  if (path === '/__script' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b || typeof b.path !== 'string') return send(res, 400, { error: 'path required' });
    if (b.path === '/health' && b.state) { state.health = String(b.state); return send(res, 200, { ok: true }); }
    state.scripts.push({ path: b.path, status: b.status, times: b.times ?? 1, hangAfterSend: !!b.hangAfterSend });
    return send(res, 200, { ok: true });
  }

  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: { code: 401, message: 'Unauthorized' } });

  const scriptKey = path.startsWith('/messages/list/') ? '/messages/list' : path.startsWith('/groups/') ? '/groups/:id' : path;
  const script = takeScript(scriptKey);
  if (script && script.status && !script.hangAfterSend) return send(res, script.status, { error: { code: script.status, message: 'scripted' } });

  if (path === '/health' && req.method === 'GET') {
    return send(res, 200, { channel_id: 'FAKE-CHANNEL', start_at: 0, uptime: 1, status: { code: state.health === 'AUTH' ? 4 : 2, text: state.health }, user: { id: OUR_NUMBER } });
  }
  if (path === '/groups' && req.method === 'GET') {
    const count = Math.min(Number(url.searchParams.get('count') || 100), 500);
    const offset = Number(url.searchParams.get('offset') || 0);
    return send(res, 200, { groups: state.groups.slice(offset, offset + count), count, offset, total: state.groups.length });
  }
  if (path.startsWith('/groups/') && req.method === 'GET') {
    const g = state.groups.find((x) => x.id === decodeURIComponent(path.slice('/groups/'.length)));
    return g ? send(res, 200, g) : send(res, 404, { error: { code: 404, message: 'group not found' } });
  }
  if ((path === '/messages/text' || path === '/messages/image') && req.method === 'POST') {
    const b = await readBody(req);
    if (!b || typeof b.to !== 'string') return send(res, 400, { error: { code: 400, message: 'to required' } });
    const g = state.groups.find((x) => x.id === b.to);
    if (!g) return send(res, 404, { error: { code: 404, message: 'chat not found' } });
    const admin = g.participants.some((p) => p.id === OUR_NUMBER && (p.rank === 'admin' || p.rank === 'creator'));
    if (g.announcements && !admin) return send(res, 403, { error: { code: 403, message: 'forbidden to send to this group' } });
    const m = path === '/messages/text' ? record(b.to, 'text', String(b.body ?? '')) : record(b.to, 'image', String(b.caption ?? ''), b.media);
    if (script && script.hangAfterSend) return undefined; // the send happened; the answer never comes
    return send(res, 200, { sent: true, message: m });
  }
  if (path.startsWith('/messages/list/') && req.method === 'GET') {
    const chat = decodeURIComponent(path.slice('/messages/list/'.length));
    const from = Number(url.searchParams.get('time_from') || 0);
    const messages = state.sent.filter((m) => m.chat_id === chat && m.timestamp >= from);
    return send(res, 200, { messages, count: messages.length, total: messages.length, offset: 0 });
  }
  return send(res, 404, { error: { code: 404, message: 'not served by the fake' } });
});

server.listen(PORT, '127.0.0.1', () => console.log(`fakeWhapi listening on http://127.0.0.1:${PORT}`));
module.exports = { server, OUR_NUMBER, TOKEN };
