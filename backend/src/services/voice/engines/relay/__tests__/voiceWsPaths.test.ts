/**
 * Upgrade path ownership (VS3.1 hardening from the VS2.6 production check): an upgrade to an unknown
 * path under /api/voice-ws/ hung until the client timed out (nginx 499). It is now refused 404 at
 * once; paths outside the voice prefix are still left for other upgrade listeners.
 */
import http from 'http';
import net from 'net';
import WebSocket from 'ws';
import { attachVoiceWsServer, classifyUpgradePath, RELAY_PATH, signHandshake, STREAM_PATH } from '../../voiceWsServer';

describe('classifyUpgradePath', () => {
  it.each([
    [RELAY_PATH, 'relay'],
    [STREAM_PATH, 'stream'],
    ['/api/voice-ws/realtime', 'unknown_voice'],
    ['/api/voice-ws/', 'unknown_voice'],
    ['/api/voice-ws', 'unknown_voice'],
    ['/api/voice-ws/relay/extra', 'unknown_voice'],
    ['/socket.io/', 'other'],
    ['/api/voice-wsx', 'other'],
  ])('%s -> %s', (p, kind) => expect(classifyUpgradePath(p)).toBe(kind));
});

function upgrade(port: number, path: string): Promise<string> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => {
      s.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`); // gitleaks:allow (RFC 6455 sample nonce, "the sample nonce")
    });
    let buf = '';
    s.on('data', (d) => { buf += d.toString(); });
    s.on('close', () => resolve(buf));
    setTimeout(() => { s.destroy(); resolve(buf || 'TIMEOUT'); }, 1500);
  });
}

describe('attachVoiceWsServer path handling (real socket)', () => {
  let server: http.Server;
  let port = 0;
  const logs: Array<Record<string, unknown>> = [];
  const otherSeen: string[] = [];
  beforeAll(async () => {
    server = http.createServer();
    attachVoiceWsServer(server, { relay: () => { throw new Error('not used'); }, stream: () => { throw new Error('not used'); } }, (l) => logs.push(l));
    server.on('upgrade', (req, socket) => { if (!(req.url || '').startsWith('/api/voice-ws')) { otherSeen.push(req.url || ''); socket.end('HTTP/1.1 418 Teapot\r\nContent-Length: 0\r\n\r\n'); } });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as net.AddressInfo).port;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it('refuses an unknown voice path with 404 immediately (no hang)', async () => {
    const res = await upgrade(port, '/api/voice-ws/realtime?token=x');
    expect(res.startsWith('HTTP/1.1 404')).toBe(true);
    expect(logs.some((l) => l.error_class === 'UnknownPath' && l.status === 404)).toBe(true);
  });

  it('known voice paths still go through the flag gate (404 NotEnabled with flags off)', async () => {
    const res = await upgrade(port, RELAY_PATH);
    expect(res.startsWith('HTTP/1.1 404')).toBe(true);
    expect(logs.some((l) => l.error_class === 'NotEnabled')).toBe(true);
  });

  it('leaves non-voice upgrades to other listeners', async () => {
    const res = await upgrade(port, '/socket.io/?EIO=4');
    expect(res.startsWith('HTTP/1.1 418')).toBe(true);
    expect(otherSeen).toContain('/socket.io/?EIO=4');
  });
});

describe('as production runs it: no other upgrade listener', () => {
  let server: http.Server;
  let port = 0;
  const sockets: net.Socket[] = [];
  beforeAll(async () => {
    server = http.createServer();
    attachVoiceWsServer(server, { relay: () => { throw new Error('not used'); }, stream: () => { throw new Error('not used'); } }, () => undefined);
    server.on('connection', (s) => sockets.push(s));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as net.AddressInfo).port;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it.each(['/preview/x', '/', '/socket.io/?EIO=4'])('answers an upgrade to %s at once and holds no socket', async (path) => {
    const res = await upgrade(port, path);
    expect(res.startsWith('HTTP/1.1 404')).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(sockets.every((s) => s.destroyed)).toBe(true);
  });

  it.each(['/preview/x', RELAY_PATH, '/api/voice-ws/nope'])('handles socket errors on %s', async (path) => {
    // Prepended and gone before ours runs, so ours is the only listener, as in production.
    const seen = new Promise<number>((r) => { server.prependOnceListener('upgrade', (_q, s) => { setImmediate(() => r(s.listenerCount('error'))); }); });
    await upgrade(port, path);
    expect(await seen).toBeGreaterThan(0);
  });
});

describe('a handler failure', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it.each([[RELAY_PATH], [STREAM_PATH]])('on %s closes that socket with 1011 and is logged, not thrown', async (path) => {
    Object.assign(process.env, { VOICE_STUDIO_ENABLED: 'true', VOICE_WS_BASE_URL: 'wss://ws-test.invalid', VOICE_PUBLIC_BASE_URL: 'https://ws-test.invalid', TWILIO_AUTH_TOKEN: 'not-a-real-token' });
    const logs: Array<Record<string, unknown>> = [];
    const server = http.createServer();
    const boom = () => { throw Object.assign(new Error('x'), { name: 'ConfigError' }); };
    attachVoiceWsServer(server, { relay: boom, stream: boom }, (l) => logs.push(l));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as net.AddressInfo).port}${path}`, { headers: { 'X-Twilio-Signature': signHandshake('not-a-real-token', `wss://ws-test.invalid${path}`) } });
    const code = await new Promise<number>((r) => { ws.on('close', r); ws.on('error', () => undefined); });
    expect(code).toBe(1011);
    expect(logs).toContainEqual(expect.objectContaining({ event: 'voice_ws_handler_failed', error_class: 'ConfigError' }));
    await new Promise<void>((r) => server.close(() => r()));
  });
});
