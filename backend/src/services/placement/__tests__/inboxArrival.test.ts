/**
 * CP6.1c (kit F2): recordArrival, the one place an arrival changes an inbox. The database is a small in-memory stand-in
 * that answers the three statements recordArrival sends (locked read, idempotent insert, update) the way Postgres
 * would; the same rules run against a real Postgres in inboxArrival.integration.test.ts (CI integration tier).
 */
type Row = { id: string; enrollment_id: string; mailbox: string; verified_at: Date | null; last_received_at: Date | null; last_test_at: Date | null;
  last_test_token: string | null; last_test_ms: number | null; broken_since: Date | null; broken_alerted_at: Date | null; broken_alert_attempts: number };
const db = { inboxes: [] as Row[], received: new Map<string, Record<string, unknown>>(), fail: '' };
type Opts = { replacements: Record<string, any>; transaction?: unknown };
const mockQuery = jest.fn(async (sql: string, o: Opts) => {
  const r = o.replacements;
  if (db.fail && sql.includes(db.fail)) throw Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' });
  if (sql.includes('FOR UPDATE')) return [db.inboxes.filter((i) => i.mailbox === r.m).map((i) => ({ ...i })), 0];
  if (sql.includes('INSERT INTO inbox_received')) {
    if (db.received.has(r.mid)) return [[], 0];
    db.received.set(r.mid, { ...r });
    return [[{ id: db.received.size }], 1];
  }
  if (sql.startsWith('UPDATE job_search_inboxes')) {
    const i = db.inboxes.find((x) => x.id === r.id) as Row;
    Object.assign(i, { last_received_at: r.lr, verified_at: r.v });
    if (r.tested) Object.assign(i, { last_test_ms: r.ms, broken_since: null, broken_alerted_at: null, broken_alert_attempts: 0 });
    return [[], 1];
  }
  throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
});
// One transaction: a throw inside rolls back everything written in it (what Postgres does).
const mockTransaction = jest.fn(async (fn: (t: unknown) => Promise<unknown>) => {
  const snap = { inboxes: db.inboxes.map((i) => ({ ...i })), received: new Map(db.received) };
  try { return await fn('tx'); } catch (e) { db.inboxes = snap.inboxes; db.received = snap.received; throw e; }
});
jest.mock('../../../config/database', () => ({ sequelize: { query: (s: string, o: Opts) => mockQuery(s, o), transaction: (f: (t: unknown) => Promise<unknown>) => mockTransaction(f) } }));

import { arrivalEffect, recordArrival, testTokenIn } from '../inboxArrival';
import { inboxHealth } from '../inboxHealth';

const SENT = new Date('2026-11-21T15:00:00Z'); // 9:00 AM CST
const TOKEN = 'a1b2c3d4e5f60718293a4b5c';
const OLD = 'ffffeeeeddddccccbbbbaaaa';
const inbox = (over: Partial<Row> = {}): Row => ({ id: 'ib-1', enrollment_id: 'enr-1', mailbox: 'annleecareers@gmail.com', verified_at: new Date('2026-11-10T00:00:00Z'),
  last_received_at: new Date('2026-11-20T00:00:00Z'), last_test_at: SENT, last_test_token: TOKEN, last_test_ms: null, broken_since: null, broken_alerted_at: null, broken_alert_attempts: 0, ...over });
const arrival = (over: Record<string, unknown> = {}) => ({ toAddress: 'Ann.Lee.Careers+jobs@gmail.com', subject: `Forwarding test for your job-search inbox [test:${TOKEN}]`,
  receivedAt: new Date(SENT.getTime() + 42_000), messageId: '<t1@mail.colaberry.com>', ...over });
const facts = (i: Row) => ({ address: 'ann.lee.careers@gmail.com', verifiedAt: i.verified_at, lastReceivedAt: i.last_received_at, lastTestAt: i.last_test_at, lastTestMs: i.last_test_ms, brokenSince: i.broken_since });

beforeEach(() => {
  db.inboxes = [inbox()]; db.received = new Map(); db.fail = '';
  mockQuery.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('testTokenIn', () => {
  it('finds the token, also behind a test-mode prefix; anything else is null', () => {
    expect(testTokenIn(`[TEST -> x] Forwarding test [test:${TOKEN}]`)).toBe(TOKEN);
    expect(testTokenIn('Interview with Acme')).toBeNull();
    expect(testTokenIn('[test:short]')).toBeNull();
    expect(testTokenIn(null)).toBeNull();
  });
});

describe('recordArrival', () => {
  it('the test arriving 42 s after the send: last_test_ms = 42000, one row, and health is Healthy', async () => {
    expect(await recordArrival(arrival())).toEqual({ status: 'recorded', enrollmentId: 'enr-1', testMs: 42_000 });
    const i = db.inboxes[0];
    expect(i.last_test_ms).toBe(42_000);
    expect(i.last_received_at).toEqual(new Date(SENT.getTime() + 42_000));
    expect(db.received.size).toBe(1);
    expect(inboxHealth(facts(i), new Date(SENT.getTime() + 20 * 60_000))).toBe('healthy');
  });
  it('the same arrival twice: one row, and the second changes nothing', async () => {
    await recordArrival(arrival());
    const after = { ...db.inboxes[0] };
    expect(await recordArrival(arrival({ receivedAt: new Date(SENT.getTime() + 99_000) }))).toEqual({ status: 'duplicate' });
    expect(db.received.size).toBe(1);
    expect(db.inboxes[0]).toEqual(after);
  });
  it('carried (T09): an OLDER test arriving late cannot make the new, unarrived test look arrived', async () => {
    const r = await recordArrival(arrival({ subject: `Forwarding test [test:${OLD}]`, messageId: '<old@x>' }));
    expect(r).toEqual({ status: 'recorded', enrollmentId: 'enr-1', testMs: null });
    expect(db.inboxes[0].last_test_ms).toBeNull();
    expect(inboxHealth(facts(db.inboxes[0]), new Date(SENT.getTime() + 11 * 60_000))).toBe('broken');
  });
  it('the latest test arriving after it already arrived once (a second copy) keeps the first time', async () => {
    db.inboxes = [inbox({ last_test_ms: 42_000 })];
    expect(await recordArrival(arrival({ messageId: '<copy@x>', receivedAt: new Date(SENT.getTime() + 300_000) }))).toEqual({ status: 'recorded', enrollmentId: 'enr-1', testMs: null });
    expect(db.inboxes[0].last_test_ms).toBe(42_000);
  });
  it('an arrival for an unknown address is ignored and logged without the address', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await recordArrival(arrival({ toAddress: 'nobody.here@gmail.com' }))).toEqual({ status: 'ignored', reason: 'unknown_address' });
    expect(await recordArrival(arrival({ toAddress: 'ann@yahoo.com' }))).toEqual({ status: 'ignored', reason: 'unknown_address' });
    expect(db.received.size).toBe(0);
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines.every((l) => l.includes('inbox_arrival_unknown_address'))).toBe(true);
    expect(lines.join(' ')).not.toMatch(/nobody|yahoo|@/);
  });
  it('invalid input (no Message-ID, a bad date) writes nothing', async () => {
    expect(await recordArrival(arrival({ messageId: '  ' }))).toEqual({ status: 'ignored', reason: 'invalid' });
    expect(await recordArrival(arrival({ receivedAt: new Date('nope') }))).toEqual({ status: 'ignored', reason: 'invalid' });
    expect(mockQuery).not.toHaveBeenCalled();
  });
  it('the first arrival marks the address verified; ordinary mail moves last_received_at forward only', async () => {
    db.inboxes = [inbox({ verified_at: null, last_test_at: null, last_test_token: null, last_received_at: new Date('2026-11-21T16:00:00Z') })];
    await recordArrival(arrival({ subject: 'Interview request from Acme', messageId: '<m1@x>', receivedAt: new Date('2026-11-21T15:30:00Z') }));
    expect(db.inboxes[0].verified_at).toEqual(new Date('2026-11-21T15:30:00Z'));
    expect(db.inboxes[0].last_received_at).toEqual(new Date('2026-11-21T16:00:00Z'));
  });
  it('the latest test arriving ends a broken spell (so a later spell alerts again)', async () => {
    db.inboxes = [inbox({ broken_since: new Date('2026-11-20T15:00:00Z'), broken_alerted_at: new Date('2026-11-20T15:15:00Z'), broken_alert_attempts: 1 })];
    await recordArrival(arrival());
    expect(db.inboxes[0]).toMatchObject({ broken_since: null, broken_alerted_at: null, broken_alert_attempts: 0, last_test_ms: 42_000 });
  });
  it('a database failure after the insert rolls the whole arrival back, so a retry records it', async () => {
    db.fail = 'UPDATE job_search_inboxes';
    await expect(recordArrival(arrival())).rejects.toThrow('connection reset');
    expect(db.received.size).toBe(0);
    db.fail = '';
    expect((await recordArrival(arrival())).status).toBe('recorded');
    expect(db.inboxes[0].last_test_ms).toBe(42_000);
  });
  it('clips long fields to their columns and drops an out-of-range confidence', async () => {
    await recordArrival(arrival({ subject: `x [test:${TOKEN}] ${'y'.repeat(400)}`, fromName: 'z'.repeat(200), confidence: 1.4, category: 'interview' }));
    const row = [...db.received.values()][0];
    expect(String(row.subj).length).toBe(300);
    expect(String(row.from).length).toBe(160);
    expect(row.conf).toBeNull();
    expect(row.cat).toBe('interview');
  });
});

describe('arrivalEffect (pure)', () => {
  it('a clock-skewed arrival before the send counts as 0 ms, never negative', () => {
    expect(arrivalEffect(inbox(), { subject: `[test:${TOKEN}]`, receivedAt: new Date(SENT.getTime() - 5000) }).testMs).toBe(0);
  });
});
