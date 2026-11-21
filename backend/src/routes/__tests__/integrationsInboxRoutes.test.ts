const mockAccept = jest.fn();
jest.mock('../../services/placement/inboxEvents', () => ({ acceptInboxEvent: (...a: unknown[]) => mockAccept(...a) }));

import express from 'express';
import request from 'supertest';
import { signInboxRequest } from '../../services/placement/inboxSignature';

/**
 * CP6.2 (kit F3): POST /api/integrations/inbox/events. Signed over the exact bytes, refused in a fixed order, stored once.
 * The app here mounts the router the way server.ts does (before any JSON parser); the real server order is proved in
 * src/boot/__tests__/placementIntegrationsRawBody.test.ts.
 */
const SECRET = ['inbox', 'route', 'secret', 'value'].join('-');
const URL = '/api/integrations/inbox/events';
const EVENT = { event_id: 'evt-1', message_id: '<m1@mail.example>', type: 'email.classified', to_address: 'ann.lee.careers@gmail.com',
  received_at: '2026-11-21T18:00:00Z', category: 'Interview', confidence: 0.97, subject: 'Interview request', contact: { name: 'Pat Doe', email: 'pat@acme.example' } };
function app(): express.Express {
  const a = express();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../integrationsInboxRoutes').default);
  return a;
}
const nowTs = () => String(Math.floor(Date.now() / 1000));
function send(body: string, opts: { ts?: string; sig?: string; type?: string } = {}) {
  const ts = opts.ts ?? nowTs();
  return request(app()).post(URL).set('Content-Type', opts.type ?? 'application/json').set('X-Timestamp', ts)
    .set('X-Signature', opts.sig ?? signInboxRequest(SECRET, ts, body)).send(body);
}
let logs: string[] = [];
beforeEach(() => {
  process.env.INBOX_INTEGRATION_SECRET = SECRET;
  mockAccept.mockReset().mockResolvedValue({ duplicate: false });
  logs = [];
  for (const k of ['log', 'warn', 'error', 'info'] as const) jest.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
});
afterEach(() => { delete process.env.INBOX_INTEGRATION_SECRET; jest.restoreAllMocks(); });

describe('POST /api/integrations/inbox/events', () => {
  it('secret unset: 503 {error:"integration not configured"}, before anything is read, even for a "valid" request', async () => {
    const body = JSON.stringify(EVENT);
    const ts = nowTs(); const sig = signInboxRequest(SECRET, ts, body);
    delete process.env.INBOX_INTEGRATION_SECRET;
    const res = await send(body, { ts, sig });
    expect([res.status, res.body]).toEqual([503, { error: 'integration not configured' }]);
    expect(mockAccept).not.toHaveBeenCalled();
  });
  it('valid: 202 and the event is stored with the parsed body', async () => {
    const res = await send(JSON.stringify(EVENT));
    expect([res.status, res.body]).toEqual([202, { accepted: true, duplicate: false }]);
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept.mock.calls[0][0]).toMatchObject({ event_id: 'evt-1', message_id: '<m1@mail.example>', type: 'email.classified', confidence: 0.97 });
  });
  it('a replay: 200 {duplicate:true}', async () => {
    mockAccept.mockResolvedValue({ duplicate: true });
    const res = await send(JSON.stringify(EVENT));
    expect([res.status, res.body]).toEqual([200, { accepted: true, duplicate: true }]);
  });
  it('a bad signature, a missing one, or the same JSON with different whitespace: 401, nothing stored', async () => {
    const body = JSON.stringify(EVENT);
    expect((await send(body, { sig: signInboxRequest('wrong-secret', nowTs(), body) })).status).toBe(401);
    expect((await request(app()).post(URL).set('Content-Type', 'application/json').send(body)).status).toBe(401);
    const ts = nowTs();
    expect((await send(JSON.stringify(EVENT, null, 2), { ts, sig: signInboxRequest(SECRET, ts, body) })).status).toBe(401);
    expect(mockAccept).not.toHaveBeenCalled();
  });
  it('a stale timestamp (5 min + 1 s): 401; 4 minutes old is fine', async () => {
    const body = JSON.stringify(EVENT);
    const stale = String(Math.floor(Date.now() / 1000) - 301);
    expect((await send(body, { ts: stale })).status).toBe(401);
    expect((await send(body, { ts: String(Math.floor(Date.now() / 1000) - 240) })).status).toBe(202);
  });
  it('signed but not JSON, or not the F3 shape: 400, nothing stored', async () => {
    expect((await send('not json')).status).toBe(400);
    const bad = await send(JSON.stringify({ ...EVENT, type: 'email.deleted' }));
    expect([bad.status, bad.body.fields]).toEqual([400, ['type']]);
    expect((await send(JSON.stringify({ ...EVENT, confidence: 1.5 }))).status).toBe(400);
    expect((await send(JSON.stringify({ ...EVENT, message_id: '' }))).status).toBe(400);
    expect(mockAccept).not.toHaveBeenCalled();
  });
  it('raw bytes are read whatever the Content-Type says', async () => {
    expect((await send(JSON.stringify(EVENT), { type: 'text/plain' })).status).toBe(202);
  });
  it('an empty body is 400 and an oversized one 413, both as JSON', async () => {
    expect((await send('')).status).toBe(400);
    const big = await send(JSON.stringify({ ...EVENT, snippet: 'x'.repeat(300 * 1024) }));
    expect([big.status, big.body.error]).toEqual([413, 'Body too large.']);
  });
  it('a dispatch failure: 503 so the sender retries', async () => {
    mockAccept.mockRejectedValue(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));
    const res = await send(JSON.stringify(EVENT));
    expect([res.status, res.body.error]).toEqual([503, 'Could not process the event. Retry.']);
  });
  it('the secret never appears in any log line or response, whatever happens', async () => {
    const body = JSON.stringify(EVENT);
    const bodies: string[] = [];
    for (const r of [await send(body), await send(body, { sig: 'sha256=00' }), await send('nope'), await send(body, { ts: '1' })]) bodies.push(JSON.stringify(r.body));
    mockAccept.mockRejectedValue(new Error(`boom ${SECRET}`));
    bodies.push(JSON.stringify((await send(body)).body));
    expect(logs.length).toBeGreaterThan(0);
    expect([...logs, ...bodies].join('\n')).not.toContain(SECRET);
  });
});
