/** VS4.2: what an unproven or stalled peer can make this process hold. Real loopback sockets. */
import http from 'http';
import type { AddressInfo } from 'net';
import WebSocket from 'ws';
import { attachVoiceWsServer, DEFAULT_WS_LIMITS, RELAY_PATH, signHandshake, STREAM_PATH, type WsLimits } from '../voiceWsServer';
import { RelayConnection } from '../conversationRelayEngine';
import { RealtimeBridge } from '../realtime/openaiRealtimeEngine';

const TOKEN = 'not-a-real-token';
const env = { ...process.env };
const closers: Array<() => Promise<void>> = [];

beforeEach(() => { Object.assign(process.env, { VOICE_STUDIO_ENABLED: 'true', VOICE_WS_BASE_URL: 'wss://ws-test.invalid', VOICE_PUBLIC_BASE_URL: 'https://ws-test.invalid', TWILIO_AUTH_TOKEN: TOKEN }); });
afterEach(async () => {
  for (const c of closers.splice(0)) await c(); // eslint-disable-line no-await-in-loop
  process.env = { ...env };
  jest.restoreAllMocks();
});

async function serve(limits: Partial<WsLimits>) {
  const logs: Array<Record<string, unknown>> = [];
  const server = http.createServer();
  const wss = attachVoiceWsServer(server, { relay: () => ({}) as never, stream: () => ({}) as never }, (l) => logs.push(l), { ...DEFAULT_WS_LIMITS, ...limits });
  await new Promise<void>((r) => { server.listen(0, '127.0.0.1', () => r()); });
  closers.push(async () => { for (const c of wss.clients) c.terminate(); await new Promise<void>((r) => { server.close(() => r()); }); });
  const open = (path: string) => new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, { headers: { 'X-Twilio-Signature': signHandshake(TOKEN, `wss://ws-test.invalid${path}`) } });
  return { logs, wss, open };
}
const opened = (ws: WebSocket) => new Promise<void>((r) => { ws.on('open', () => r()); });
const closed = (ws: WebSocket) => new Promise<number>((r) => { ws.on('close', (c) => r(c)); ws.on('error', () => undefined); });

it.each([RELAY_PATH, STREAM_PATH])('%s: a socket that never becomes a session is closed at the deadline', async (path) => {
  const s = await serve({ setupMs: 80 });
  expect(await closed(s.open(path))).toBe(1008);
  expect(s.logs).toContainEqual(expect.objectContaining({ event: 'voice_ws_setup_timeout', error_class: 'SetupTimeout' }));
});

it.each([[RELAY_PATH, RelayConnection], [STREAM_PATH, RealtimeBridge]] as const)('%s: an established session outlives the setup deadline', async (path, cls) => {
  jest.spyOn(cls.prototype as { established: boolean }, 'established', 'get').mockReturnValue(true);
  jest.spyOn(cls.prototype as never, (path === RELAY_PATH ? 'onClose' : 'onTwilioClose') as never).mockImplementation((() => undefined) as never);
  const s = await serve({ setupMs: 50 });
  const ws = s.open(path);
  await opened(ws);
  await new Promise((r) => { setTimeout(r, 150); });
  expect(ws.readyState).toBe(WebSocket.OPEN);
  ws.terminate();
});

it.each([RELAY_PATH, STREAM_PATH])('%s: a frame over 64 KB closes the socket (1009) before any handler sees it', async (path) => {
  const seen = jest.spyOn((path === RELAY_PATH ? RelayConnection : RealtimeBridge).prototype as never, (path === RELAY_PATH ? 'onMessage' : 'onTwilio') as never).mockImplementation((async () => undefined) as never);
  const s = await serve({});
  const ws = s.open(path);
  await opened(ws);
  ws.send('x'.repeat(64 * 1024 + 1));
  expect(await closed(ws)).toBe(1009);
  expect(seen).not.toHaveBeenCalled();
});

it('over the socket limit the upgrade is refused 503, and a freed place is usable again', async () => {
  const s = await serve({ maxSockets: 2 });
  const a = s.open(RELAY_PATH); const b = s.open(STREAM_PATH);
  await Promise.all([opened(a), opened(b)]);
  const status = await new Promise<number>((r) => { const c = s.open(RELAY_PATH); c.on('unexpected-response', (_q, res) => r(res.statusCode ?? 0)); c.on('error', () => undefined); });
  expect(status).toBe(503);
  a.terminate();
  while (s.wss.clients.size > 1) await new Promise((r) => { setTimeout(r, 5); }); // eslint-disable-line no-await-in-loop
  const d = s.open(RELAY_PATH);
  await opened(d);
});

it('a peer that stops reading is dropped instead of buffered without end', async () => {
  let send: (t: string) => void = () => undefined;
  jest.spyOn(RelayConnection.prototype, 'onMessage').mockImplementation(async function grab(this: RelayConnection) { send = (t) => (this as unknown as { t: { send(x: string): void } }).t.send(t); });
  const s = await serve({ maxBufferedBytes: 64 * 1024 });
  const ws = s.open(RELAY_PATH);
  await opened(ws);
  ws.send('{}');
  await new Promise((r) => { setTimeout(r, 50); });
  (ws as unknown as { _socket: { pause(): void } })._socket.pause();
  const big = 'x'.repeat(256 * 1024);
  for (let i = 0; i < 400 && s.wss.clients.size > 0 && !s.logs.some((l) => l.error_class === 'PeerStalled'); i++) { send(big); await new Promise((r) => { setImmediate(r); }); } // eslint-disable-line no-await-in-loop
  expect(s.logs).toContainEqual(expect.objectContaining({ event: 'voice_ws_backpressure', error_class: 'PeerStalled' }));
  ws.terminate();
});

it.each([[RELAY_PATH, RelayConnection, 'onMessage'], [STREAM_PATH, RealtimeBridge, 'onTwilio']] as const)('%s: a rejecting message handler closes that socket and is logged, every time', async (path, cls, method) => {
  jest.spyOn(cls.prototype as never, method as never).mockImplementation((async () => { throw Object.assign(new Error('x'), { name: 'RangeError' }); }) as never);
  const s = await serve({});
  const ws = s.open(path);
  await opened(ws);
  for (let i = 0; i < 5; i++) ws.send('{}');
  expect(await closed(ws)).toBe(1011);
  expect(s.logs.filter((l) => l.event === 'voice_ws_handler_failed' && l.error_class === 'RangeError').length).toBeGreaterThan(0);
});
