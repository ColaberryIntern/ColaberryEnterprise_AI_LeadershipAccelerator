// The employer accounts as in-memory rows that apply the same rules as clientStore.ts's SQL (which runs on Postgres in
// clientStore.integration.test.ts): tokens by hash, spent once by a conditional update, expiry checked at spend time.
const mockDb = {
  members: [] as Array<{ member_id: string; client_id: string; client_name: string; email: string }>,
  tokens: [] as Array<{ id: string; email: string; token_hash: string; expires_at: Date; consumed_at: Date | null; created_at: Date }>,
  now: new Date('2026-11-22T15:00:00Z'),
};
jest.mock('../clientStore', () => ({
  membershipsFor: async (email: string) => mockDb.members.filter((m) => m.email === email),
  memberById: async (id: string, c: string) => mockDb.members.find((m) => m.member_id === id && m.client_id === c),
  // Read and insert in one synchronous step, as the advisory lock makes them one step in Postgres.
  reserveSigninToken: async (email: string, token_hash: string, expires_at: Date, allow: (recent: Date[]) => boolean) => {
    const recent = mockDb.tokens.filter((t) => t.email === email && mockDb.now.getTime() - t.created_at.getTime() < 3_600_000).map((t) => t.created_at);
    if (!allow(recent)) return undefined;
    const id = String(mockDb.tokens.length + 1);
    mockDb.tokens.push({ id, email, token_hash, expires_at, consumed_at: null, created_at: new Date(mockDb.now) });
    return id;
  },
  consumeSigninToken: async (h: string) => {
    const t = mockDb.tokens.find((x) => x.token_hash === h && !x.consumed_at && x.expires_at > mockDb.now);
    if (!t) return undefined;
    t.consumed_at = new Date(mockDb.now);
    return t.email;
  },
}));
const mockSend = jest.fn();
jest.mock('../../emailService', () => ({ guardedSendMail: (...a: unknown[]) => mockSend(...a), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
jest.mock('../../email/idempotentSend', () => ({ sendOnce: async (_id: unknown, send: () => Promise<{ ok: boolean; errorClass?: string }>) => {
  const r = await send();
  return r.ok ? { outcome: 'sent' } : { outcome: 'failed', errorClass: r.errorClass };
} }));
jest.mock('../bookingReply', () => ({ bookingLinkBase: () => 'https://hire.refactored.ai' }));

import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { env } from '../../../config/env';
import { requireAdmin } from '../../../middlewares/authMiddleware';
import { HIRE_CLIENT_AUDIENCE, redeemLink, requestLink, requireHireClient, signinEmailText, type ClientRequest } from '../clientAuth';

/** CP10.2: employer sign-in by emailed link (clientMagicLink rules) and the session guard. DARK unless the switch is on. */
const ON = async () => true;
const OFF = async () => false;
const ANN = 'ann@acme.example';
const sentLink = (): string => /https:\/\/hire\.refactored\.ai\/client\/\?t=([0-9a-f-]{36})/.exec(String(mockSend.mock.calls.at(-1)?.[0]?.text))?.[1] ?? '';
const guardRun = async (auth: string | undefined, read = ON) => {
  const req = { headers: auth ? { authorization: auth } : {} } as ClientRequest;
  const res = { code: 0, status(c: number) { this.code = c; return this; }, json() { return this; } };
  const next = jest.fn();
  await requireHireClient(read)(req, res as never, next);
  return { passed: next.mock.calls.length === 1, code: res.code, session: req.hireClient };
};

beforeEach(() => {
  mockDb.members = [{ member_id: 'm-1', client_id: 'c-1', client_name: 'Acme', email: ANN }];
  mockDb.tokens = []; mockDb.now = new Date('2026-11-22T15:00:00Z');
  mockSend.mockReset().mockResolvedValue({ messageId: 'mid-1' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.useFakeTimers({ now: mockDb.now, doNotFake: ['setImmediate', 'nextTick'] });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('request a link', () => {
  it('switch off: nothing is written and nothing is sent', async () => {
    expect(await requestLink(ANN, { read: OFF })).toBe('off');
    expect([mockDb.tokens.length, mockSend.mock.calls.length]).toEqual([0, 0]);
  });
  it('a member: one token row (stored HASHED) and one plain-text email with the one-hour link', async () => {
    expect(await requestLink(' Ann@Acme.example ', { read: ON })).toBe('sent');
    const token = sentLink();
    expect(token).not.toBe('');
    expect(mockDb.tokens).toHaveLength(1);
    expect(mockDb.tokens[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(mockDb.tokens)).not.toContain(token);
    expect(mockSend.mock.calls[0][0]).toMatchObject({ to: ANN, subject: 'Your Refactored.ai sign-in link' });
    expect(signinEmailText('L')).not.toMatch(new RegExp('[\\u2013\\u2014]')); // no en or em dash in the copy
  });
  it('an unknown or malformed address: no row, no email (the route answers the same message)', async () => {
    expect(await requestLink('bob@other.example', { read: ON })).toBe('no_access');
    expect(await requestLink('not-an-address', { read: ON })).toBe('invalid');
    expect(await requestLink(42, { read: ON })).toBe('invalid');
    expect([mockDb.tokens.length, mockSend.mock.calls.length]).toEqual([0, 0]);
  });
  it('rate limited per address: a second request within a minute sends nothing more', async () => {
    await requestLink(ANN, { read: ON });
    expect(await requestLink(ANN, { read: ON, now: new Date(mockDb.now.getTime() + 30_000) })).toBe('limited');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
  it('two requests at the same moment: at most ONE link (the limit and the insert are one locked step)', async () => {
    const both = await Promise.all([requestLink(ANN, { read: ON }), requestLink(ANN, { read: ON })]);
    expect(both.sort()).toEqual(['limited', 'sent']);
    expect([mockDb.tokens.length, mockSend.mock.calls.length]).toEqual([1, 1]);
  });
  it('a failed send or a store error is reported as failed, never thrown', async () => {
    mockSend.mockResolvedValue(undefined);
    expect(await requestLink(ANN, { read: ON })).toBe('failed');
    mockDb.members = null as never;
    expect(await requestLink(ANN, { read: ON, now: new Date(mockDb.now.getTime() + 120_000) })).toBe('failed');
  });
});

describe('redeem a link', () => {
  const issue = async () => { await requestLink(ANN, { read: ON }); return sentLink(); };
  it('a fresh link: a hire-client session with NO role claim; the same link again is refused', async () => {
    const t = await issue();
    const r = await redeemLink(t, { read: ON });
    if (!r.ok) throw new Error('expected a session');
    const claims = jwt.verify(r.token, env.jwtSecret, { audience: HIRE_CLIENT_AUDIENCE }) as Record<string, unknown>;
    expect(claims).toMatchObject({ kind: 'hire_client_session', mid: 'm-1', cid: 'c-1', aud: 'hire-client' });
    expect(claims.role).toBeUndefined();
    expect(r.clientName).toBe('Acme');
    expect(await redeemLink(t, { read: ON })).toEqual({ ok: false });
  });
  it('expired, unknown, malformed or switched off: one refusal', async () => {
    const t = await issue();
    expect(await redeemLink(t, { read: OFF })).toEqual({ ok: false });
    mockDb.now = new Date(mockDb.now.getTime() + 3_600_001);
    expect(await redeemLink(t, { read: ON })).toEqual({ ok: false });
    expect(await redeemLink('11111111-1111-4111-8111-111111111111', { read: ON })).toEqual({ ok: false });
    expect(await redeemLink('x'.repeat(5000), { read: ON })).toEqual({ ok: false });
  });
  it('a link for an address whose membership was removed meanwhile gives no session', async () => {
    const t = await issue();
    mockDb.members = [];
    expect(await redeemLink(t, { read: ON })).toEqual({ ok: false });
  });
});

describe('the session guard', () => {
  const session = async () => { await requestLink(ANN, { read: ON }); const r = await redeemLink(sentLink(), { read: ON }); if (!r.ok) throw new Error('no'); return `Bearer ${r.token}`; };
  it('a live session passes and carries the client from the database', async () => {
    expect(await guardRun(await session())).toMatchObject({ passed: true, session: { memberId: 'm-1', clientId: 'c-1', clientName: 'Acme', email: ANN } });
  });
  it('switch off, no header, a participant or admin token, a removed member: 401', async () => {
    const s = await session();
    expect(await guardRun(s, OFF)).toMatchObject({ passed: false, code: 401 });
    expect(await guardRun(undefined)).toMatchObject({ passed: false, code: 401 });
    expect(await guardRun(`Bearer ${jwt.sign({ sub: 'enr-1', role: 'participant' }, env.jwtSecret)}`)).toMatchObject({ passed: false, code: 401 });
    expect(await guardRun(`Bearer ${jwt.sign({ sub: 'a-1', role: 'admin', kind: 'hire_client_session', mid: 'm-1', cid: 'c-1' }, env.jwtSecret)}`)).toMatchObject({ passed: false, code: 401 });
    mockDb.members = [];
    expect(await guardRun(s)).toMatchObject({ passed: false, code: 401 });
  });
  it('a hire-client session cannot pass the admin guard (no role claim)', async () => {
    const res = { code: 0, status(c: number) { this.code = c; return this; }, json() { return this; } };
    const next = jest.fn();
    requireAdmin({ headers: { authorization: await session() }, ip: '1.1.1.1' } as never, res as never, next);
    expect([next.mock.calls.length, res.code]).toEqual([0, 403]);
  });
});
