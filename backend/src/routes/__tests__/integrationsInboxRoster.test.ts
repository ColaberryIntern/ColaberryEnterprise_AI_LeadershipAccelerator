const mockLookup = jest.fn();
jest.mock('../../services/placement/inboxRoster', () => ({ lookupRoster: (...a: unknown[]) => mockLookup(...a) }));
jest.mock('../../services/placement/inboxEvents', () => ({ acceptInboxEvent: jest.fn() }));

import express from 'express';
import request from 'supertest';
import { signInboxRequest } from '../../services/placement/inboxSignature';
import { RosterResponse } from '../integrationsInboxRoutes';

/** CP6.2 (kit F3): GET /api/integrations/inbox/roster: signed over the raw query, exactly four fields, cached 15 minutes. */
const SECRET = ['roster', 'route', 'secret'].join('-');
const PATH = '/api/integrations/inbox/roster';
const ENTRY = { participant_id: 'enr-ali', display_name: 'Ann L.', recruiter: null, notify_ok: true };
function app(): express.Express {
  const a = express();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../integrationsInboxRoutes').default);
  return a;
}
const ts = () => String(Math.floor(Date.now() / 1000));
function get(query: string, opts: { ts?: string; sig?: string } = {}) {
  const t = opts.ts ?? ts();
  return request(app()).get(`${PATH}?${query}`).set('X-Timestamp', t).set('X-Signature', opts.sig ?? signInboxRequest(SECRET, t, query));
}
const Q = `address=${encodeURIComponent('ann.lee.careers@gmail.com')}`;
let logs: string[] = [];
beforeEach(() => {
  process.env.INBOX_INTEGRATION_SECRET = SECRET;
  mockLookup.mockReset().mockResolvedValue(ENTRY);
  logs = [];
  for (const k of ['log', 'warn', 'error'] as const) jest.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
});
afterEach(() => { delete process.env.INBOX_INTEGRATION_SECRET; jest.restoreAllMocks(); });

describe('GET /api/integrations/inbox/roster', () => {
  it('an address on the roster: 200 with EXACTLY the four keys (no email, no phone) and a 15-minute private cache', async () => {
    const res = await get(Q);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['display_name', 'notify_ok', 'participant_id', 'recruiter']);
    expect(res.body).toEqual(ENTRY);
    expect(JSON.stringify(res.body)).not.toMatch(/@|phone|email/i);
    expect(res.headers['cache-control']).toBe('private, max-age=900');
    expect(mockLookup).toHaveBeenCalledWith('ann.lee.careers@gmail.com');
  });
  it('the response schema itself refuses any extra key (an email can never slip through)', () => {
    expect(RosterResponse.safeParse({ ...ENTRY, email: 'ann@x.example' }).success).toBe(false);
    expect(RosterResponse.safeParse({ ...ENTRY, phone: '555' }).success).toBe(false);
  });
  it('a service that returned an extra field is a 503, never a leak', async () => {
    mockLookup.mockResolvedValue({ ...ENTRY, email: 'ann.personal@example.com' });
    const res = await get(Q);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('ann.personal');
  });
  it('an unknown address: 404, not cached', async () => {
    mockLookup.mockResolvedValue(null);
    const res = await get(`address=${encodeURIComponent('nobody@gmail.com')}`);
    expect([res.status, res.headers['cache-control']]).toEqual([404, 'no-store']);
  });
  it('secret unset: 503 integration not configured, no lookup', async () => {
    const t = ts(); const sig = signInboxRequest(SECRET, t, Q);
    delete process.env.INBOX_INTEGRATION_SECRET;
    const res = await get(Q, { ts: t, sig });
    expect([res.status, res.body]).toEqual([503, { error: 'integration not configured' }]);
    expect(mockLookup).not.toHaveBeenCalled();
  });
  it('unsigned, wrongly signed, stale, or a different query under the same signature: 401, no lookup', async () => {
    expect((await request(app()).get(`${PATH}?${Q}`)).status).toBe(401);
    expect((await get(Q, { sig: signInboxRequest('other', ts(), Q) })).status).toBe(401);
    const old = String(Math.floor(Date.now() / 1000) - 301);
    expect((await get(Q, { ts: old })).status).toBe(401);
    const t = ts();
    expect((await get(`address=${encodeURIComponent('someone.else@gmail.com')}`, { ts: t, sig: signInboxRequest(SECRET, t, Q) })).status).toBe(401);
    expect(mockLookup).not.toHaveBeenCalled();
  });
  it('signed but malformed query (missing, extra or repeated keys): 400', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get(`${Q}&participant_id=x`)).status).toBe(400);
    expect((await get(`${Q}&${Q}`)).status).toBe(400);
    expect(mockLookup).not.toHaveBeenCalled();
  });
  it('a lookup failure: 503 with no detail, and the secret is never logged', async () => {
    mockLookup.mockRejectedValue(Object.assign(new Error(`db down ${SECRET}`), { name: 'SequelizeConnectionError' }));
    const res = await get(Q);
    expect([res.status, res.body]).toEqual([503, { error: 'Roster unavailable. Retry.' }]);
    expect(logs.join('\n')).not.toContain(SECRET);
  });
});
