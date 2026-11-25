/**
 * Upgrade path ownership (VS3.1 hardening from the VS2.6 production check): an upgrade to an unknown
 * path under /api/voice-ws/ hung until the client timed out (nginx 499). It is now refused 404 at
 * once; paths outside the voice prefix are still left for other upgrade listeners.
 */
import http from 'http';
import net from 'net';
import { attachVoiceWsServer, classifyUpgradePath, RELAY_PATH, STREAM_PATH } from '../../voiceWsServer';

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
