/**
 * CP6.1c (kit F2): the daily forwarding test and the once-per-spell "forwarding broken" alert, end to end through
 * the REAL sendTest / runDailyTests / sendBrokenAlerts / recordArrival. The database is an in-memory stand-in that
 * answers each statement the way Postgres would (a transaction holds the row lock: one at a time); the mailer and the
 * send ledger are mocked (nothing leaves). The SQL itself runs on Postgres in inboxTestJob.integration.test.ts (CI).
 */
type Row = { id: string; enrollment_id: string; address: string; mailbox: string; verified_at: Date | null; last_received_at: Date | null;
  last_test_at: Date | null; last_test_token: string | null; last_test_ms: number | null; broken_since: Date | null; broken_alerted_at: Date | null; broken_alert_attempts: number };
const db = { inboxes: [] as Row[], received: new Set<string>(), people: new Map<string, { email: string | null; full_name: string | null }>() };
type Opts = { replacements?: Record<string, any>; transaction?: unknown };
const by = (id: string) => db.inboxes.find((i) => i.id === id) as Row;
const ts = (d: unknown) => new Date(d as Date).getTime();
function answer(sql: string, r: Record<string, any>): [unknown[], number] {
  if (sql.includes('WHERE enrollment_id = :e FOR UPDATE')) return [db.inboxes.filter((i) => i.enrollment_id === r.e).map((i) => ({ ...i })), 0];
  if (sql.includes('WHERE mailbox = :m FOR UPDATE')) return [db.inboxes.filter((i) => i.mailbox === r.m).map((i) => ({ ...i })), 0];
  if (sql.includes('INSERT INTO inbox_received')) { if (db.received.has(r.mid)) return [[], 0]; db.received.add(r.mid); return [[{ id: 1 }], 1]; }
  if (sql.includes('SET last_received_at')) {
    Object.assign(by(r.id), { last_received_at: r.lr, verified_at: r.v });
    if (r.tested) Object.assign(by(r.id), { last_test_ms: r.ms, broken_since: null, broken_alerted_at: null, broken_alert_attempts: 0 });
    return [[], 1];
  }
  if (sql.includes('SET last_test_at = :now')) {
    const i = by(r.id); // applies only what the statement really says (a dropped "last_test_ms = NULL" shows up here)
    Object.assign(i, { last_test_at: r.now, last_test_token: r.tok, last_test_ms: /last_test_ms = NULL/.test(sql) ? null : i.last_test_ms });
    return [[], 1];
  }
  if (sql.includes('SET last_test_at = :at')) { const i = by(r.id); if (i.last_test_token === r.tok) Object.assign(i, { last_test_at: r.at, last_test_token: r.pt, last_test_ms: r.ms }); return [[], 1]; }
  if (sql.includes('SELECT enrollment_id FROM job_search_inboxes')) return [db.inboxes.filter((i) => i.verified_at && r.ids.includes(i.enrollment_id)).map((i) => ({ enrollment_id: i.enrollment_id })), 0];
  if (sql.includes('SET broken_since = last_test_at')) {
    const onlyNew = /WHERE broken_since IS NULL/.test(sql); // a spell is started once, never moved
    for (const i of db.inboxes) if ((!onlyNew || !i.broken_since) && i.verified_at && i.last_test_at && i.last_test_ms === null && ts(i.last_test_at) < ts(r.cut)) i.broken_since = i.last_test_at;
    return [[], 0];
  }
  // The attempt cap is applied only when the statement really carries it.
  const capped = (i: Row) => !/broken_alert_attempts < 3/.test(sql) || i.broken_alert_attempts < 3;
  if (sql.includes('JOIN enrollments')) {
    return [db.inboxes.filter((i) => i.broken_since && !i.broken_alerted_at && capped(i))
      .map((i) => ({ id: i.id, enrollment_id: i.enrollment_id, broken_since: i.broken_since, ...(db.people.get(i.enrollment_id) ?? { email: null, full_name: null }) })), 0];
  }
  if (sql.includes('broken_alert_attempts + 1')) {
    const i = by(r.id);
    if (i.broken_since && ts(i.broken_since) === ts(r.since) && !i.broken_alerted_at && capped(i)) { i.broken_alert_attempts += 1; return [[{ broken_alert_attempts: i.broken_alert_attempts }], 1]; }
    return [[], 0];
  }
  if (sql.includes('SET broken_alert_attempts = 3')) { by(r.id).broken_alert_attempts = 3; return [[], 1]; }
  if (sql.includes('SET broken_alerted_at = :now')) { const i = by(r.id); if (i.broken_since && ts(i.broken_since) === ts(r.since)) i.broken_alerted_at = r.now; return [[], 1]; }
  throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
}
const mockQuery = jest.fn(async (sql: string, o: Opts = {}) => answer(sql, o.replacements ?? {}));
let lock: Promise<unknown> = Promise.resolve();
const mockTransaction = (fn: (t: unknown) => Promise<unknown>) => { const run = lock.then(() => fn('tx')); lock = run.catch(() => undefined); return run; };
jest.mock('../../../config/database', () => ({ sequelize: { query: (s: string, o: Opts) => mockQuery(s, o), transaction: (f: (t: unknown) => Promise<unknown>) => mockTransaction(f) } }));

// The send ledger: one row per (recipient, subject, event); a sent row refuses, a failed row may retry.
const ledger = new Map<string, string>();
// Next ledger answer forced by a test: the ledger itself throws, or refuses with a given reason.
const mockLedgerNext: Array<'throw' | 'in_flight' | 'already_sent'> = [];
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (id: { recipient: string; subject: string; businessEventId: string }, send: () => Promise<{ ok: boolean; errorClass?: string; error?: string }>) => {
    const key = `${id.recipient}|${id.subject}|${id.businessEventId}`;
    const forced = mockLedgerNext.shift();
    if (forced === 'throw') throw Object.assign(new Error('ledger unreachable'), { name: 'SequelizeConnectionError' });
    if (forced) return { outcome: 'skipped', reason: forced, idempotencyKey: key };
    if (ledger.get(key) === 'sent') return { outcome: 'skipped', reason: 'already_sent', idempotencyKey: key };
    try {
      const r = await send();
      ledger.set(key, r.ok ? 'sent' : 'failed');
      return r.ok ? { outcome: 'sent', ledgerId: key, idempotencyKey: key } : { outcome: 'failed', ledgerId: key, idempotencyKey: key, errorClass: r.errorClass ?? 'ProviderRejected', error: r.error ?? '' };
    } catch (e) { ledger.set(key, 'failed'); return { outcome: 'failed', ledgerId: key, idempotencyKey: key, errorClass: (e as Error).name, error: (e as Error).message }; }
  },
}));
const mockMail = jest.fn();
jest.mock('../../emailService', () => ({ guardedSendMail: (m: unknown) => mockMail(m), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
jest.mock('../../settingsService', () => ({ getSetting: async () => null }));
jest.mock('../../careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: async () => true, careerPrepEnrollmentIds: async () => ['enr-1'] }));

import { inboxHealth } from '../inboxHealth';
import { recordArrival } from '../inboxArrival';
import { ALERT_SUBJECT, alertText, centralDay, runDailyTests, sendBrokenAlerts, sendTest, testDecision, testsEnabled, type TestDeps } from '../inboxTestJob';

// en dash, em dash (built from code points so this file holds neither), and the banned word
const DASH_OR_FREE = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\bfree\\b`, 'i');
const ON: TestDeps = { read: async () => true, enabled: async () => true, enabledIds: async () => ['enr-1'] };
const day = (d: number, hhmm = '15:00') => new Date(`2026-11-${String(d).padStart(2, '0')}T${hhmm}:00Z`); // 15:00Z = 9:00 AM CST
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const row = (over: Partial<Row> = {}): Row => ({ id: 'ib-1', enrollment_id: 'enr-1', address: 'ann.lee.careers@gmail.com', mailbox: 'annleecareers@gmail.com',
  verified_at: new Date('2026-11-10T00:00:00Z'), last_received_at: new Date('2026-11-20T00:00:00Z'), last_test_at: null, last_test_token: null, last_test_ms: null,
  broken_since: null, broken_alerted_at: null, broken_alert_attempts: 0, ...over });
const health = (now: Date) => { const i = db.inboxes[0]; return inboxHealth({ address: i.address, verifiedAt: i.verified_at, lastReceivedAt: i.last_received_at, lastTestAt: i.last_test_at, lastTestMs: i.last_test_ms, brokenSince: i.broken_since }, now); };
const sentTo = (to: string) => mockMail.mock.calls.filter((c) => (c[0] as { to: string }).to === to);
const arriveLatest = (at: Date) => recordArrival({ toAddress: 'ann.lee.careers@gmail.com', subject: `Forwarding test [test:${db.inboxes[0].last_test_token}]`, receivedAt: at, messageId: `<${at.toISOString()}@x>` });

beforeEach(() => {
  db.inboxes = [row()]; db.received = new Set(); db.people = new Map([['enr-1', { email: 'ann.personal@example.com', full_name: 'Ann Lee' }]]);
  ledger.clear(); mockLedgerNext.length = 0; mockQuery.mockClear();
  mockMail.mockReset().mockResolvedValue({ messageId: 'mc-1' });
  for (const k of ['log', 'warn', 'error'] as const) jest.spyOn(console, k).mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the switch (career_prep_inbox_tests_enabled), absent = OFF', () => {
  it('off, absent, "false" or unreadable: no test, no alert, no database work, health stays Not tested', async () => {
    db.inboxes = [row({ last_received_at: null })];
    for (const read of [async () => null, async () => false, async () => 'false', async () => { throw new Error('db down'); }]) {
      expect(await testsEnabled(read)).toBe(false);
      expect(await sendTest('enr-1', { now: day(21), deps: { ...ON, read } })).toEqual({ status: 'switched_off' });
      expect(await runDailyTests(day(21), { ...ON, read })).toBe(0);
      expect(await sendBrokenAlerts(day(22), { ...ON, read })).toBe(0);
    }
    expect(await sendTest('enr-1', { now: day(21) })).toEqual({ status: 'switched_off' }); // the real default reader: absent
    expect(mockMail).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(health(day(22))).toBe('untested');
  });
});

describe('sendTest', () => {
  it('on, run twice the same day: ONE test, a token in the subject, sent to the job-search address', async () => {
    expect((await sendTest('enr-1', { now: day(21), deps: ON })).status).toBe('sent');
    expect(await sendTest('enr-1', { now: min(day(21), 1), deps: ON })).toEqual({ status: 'already_today' });
    expect(mockMail).toHaveBeenCalledTimes(1);
    const m = mockMail.mock.calls[0][0] as { to: string; subject: string; text: string; html?: string };
    expect(m.to).toBe('ann.lee.careers@gmail.com');
    expect(m.subject).toContain(`[test:${db.inboxes[0].last_test_token}]`);
    expect(m.html).toBeUndefined();
    expect(m.text).not.toMatch(DASH_OR_FREE);
  });
  it('a double click at the same moment sends ONE test (the row lock decides)', async () => {
    const both = await Promise.all([sendTest('enr-1', { now: day(21), deps: ON }), sendTest('enr-1', { now: day(21), deps: ON })]);
    expect(both.map((r) => r.status).sort()).toEqual(['already_today', 'sent']);
    expect(mockMail).toHaveBeenCalledTimes(1);
  });
  it('carried (T09): a new test resets last_test_ms to NULL with a new token, and the old test arriving late changes nothing', async () => {
    db.inboxes = [row({ last_test_at: day(20), last_test_token: 'ffffeeeeddddccccbbbbaaaa', last_test_ms: 42_000 })];
    await sendTest('enr-1', { now: day(21), deps: ON });
    const i = db.inboxes[0];
    expect(i.last_test_ms).toBeNull();
    expect(i.last_test_token).not.toBe('ffffeeeeddddccccbbbbaaaa');
    expect(i.last_test_at).toEqual(day(21));
    await recordArrival({ toAddress: i.address, subject: 'Forwarding test [test:ffffeeeeddddccccbbbbaaaa]', receivedAt: min(day(21), 1), messageId: '<late-old@x>' });
    expect(db.inboxes[0].last_test_ms).toBeNull();
    expect(health(min(day(21), 11))).toBe('broken');
  });
  it('the test arriving 42 s later: last_test_ms = 42000 and Healthy', async () => {
    await sendTest('enr-1', { now: day(21), deps: ON });
    await arriveLatest(new Date(day(21).getTime() + 42_000));
    expect(db.inboxes[0].last_test_ms).toBe(42_000);
    expect(health(min(day(21), 30))).toBe('healthy');
  });
  it('once per CENTRAL day: 11:30 PM CST and 9 AM the next day are two days; 9 AM and 11 PM CST are one', () => {
    expect(centralDay(new Date('2026-11-21T05:30:00Z'))).toBe('2026-11-20');
    expect(testDecision({ last_test_at: new Date('2026-11-21T05:30:00Z'), last_test_ms: 1000 }, day(21), false)).toBe('send');
    expect(testDecision({ last_test_at: day(21), last_test_ms: 1000 }, new Date('2026-11-22T05:00:00Z'), false)).toBe('already_today');
    expect(testDecision({ last_test_at: null, last_test_ms: null }, day(21), false)).toBe('send');
  });
  it('DST: the Central day turns at local midnight on both sides of each change (CST, the spring-forward day, CDT)', () => {
    const nov1Test = { last_test_at: new Date('2026-11-01T15:00:00Z'), last_test_ms: 40_000 }; // 9:00 AM CST, the fall-back day
    expect(centralDay(new Date('2026-11-02T05:59:00Z'))).toBe('2026-11-01'); // 11:59 PM CST
    expect(testDecision(nov1Test, new Date('2026-11-02T05:59:00Z'), false)).toBe('already_today');
    expect(centralDay(new Date('2026-11-02T06:00:00Z'))).toBe('2026-11-02'); // midnight CST
    expect(testDecision(nov1Test, new Date('2026-11-02T06:00:00Z'), false)).toBe('send');
    expect(centralDay(new Date('2027-03-15T04:59:00Z'))).toBe('2027-03-14'); // 11:59 PM CDT, after spring forward on 03-14
    expect(centralDay(new Date('2027-03-15T05:00:00Z'))).toBe('2027-03-15');
    const julyTest = { last_test_at: new Date('2026-07-14T14:00:00Z'), last_test_ms: 40_000 }; // 9:00 AM CDT
    expect(testDecision(julyTest, new Date('2026-07-15T04:59:00Z'), false)).toBe('already_today'); // 11:59 PM CDT
    expect(testDecision(julyTest, new Date('2026-07-15T05:00:00Z'), false)).toBe('send'); // midnight CDT
  });
  it('the send ledger itself throwing also puts the previous test back (nothing was sent)', async () => {
    db.inboxes = [row({ last_test_at: day(20), last_test_token: 'ffffeeeeddddccccbbbbaaaa', last_test_ms: 42_000 })];
    mockLedgerNext.push('throw');
    expect(await sendTest('enr-1', { now: day(21), deps: ON })).toEqual({ status: 'failed', errorClass: 'SequelizeConnectionError' });
    expect(db.inboxes[0]).toMatchObject({ last_test_at: day(20), last_test_token: 'ffffeeeeddddccccbbbbaaaa', last_test_ms: 42_000 });
    expect(mockMail).not.toHaveBeenCalled();
    expect(health(min(day(21), 30))).toBe('healthy');
  });
  it('the student may re-test the same day only after the latest test MISSED its 10 minutes; the scheduler never', () => {
    const missed = { last_test_at: day(21), last_test_ms: null };
    expect(testDecision(missed, min(day(21), 11), true)).toBe('send');
    expect(testDecision(missed, min(day(21), 5), true)).toBe('already_today');
    expect(testDecision(missed, min(day(21), 11), false)).toBe('already_today');
    expect(testDecision({ last_test_at: day(21), last_test_ms: 40_000 }, min(day(21), 60), true)).toBe('already_today');
  });
  it('a failed send puts the previous test back, so a mail we never sent never reads as broken', async () => {
    db.inboxes = [row({ last_test_at: day(20), last_test_token: 'ffffeeeeddddccccbbbbaaaa', last_test_ms: 42_000 })];
    mockMail.mockRejectedValueOnce(Object.assign(new Error('mandrill 500'), { name: 'UpstreamUnavailable' }));
    expect(await sendTest('enr-1', { now: day(21), deps: ON })).toEqual({ status: 'failed', errorClass: 'UpstreamUnavailable' });
    expect(db.inboxes[0]).toMatchObject({ last_test_at: day(20), last_test_token: 'ffffeeeeddddccccbbbbaaaa', last_test_ms: 42_000 });
    expect(health(min(day(21), 30))).toBe('healthy');
    mockMail.mockResolvedValueOnce({}); // the send guard blocked it: no message id
    expect(await sendTest('enr-1', { now: min(day(21), 1), deps: ON })).toEqual({ status: 'failed', errorClass: 'SendBlocked' });
    expect((await sendTest('enr-1', { now: min(day(21), 2), deps: ON })).status).toBe('sent'); // recovery: the next try goes
  });
  it('no address saved yet: no_inbox, nothing sent', async () => {
    db.inboxes = [];
    expect(await sendTest('enr-1', { now: day(21), deps: ON })).toEqual({ status: 'no_inbox' });
    expect(mockMail).not.toHaveBeenCalled();
  });
});

describe('runDailyTests', () => {
  it('tests only VERIFIED inboxes of Career Prep learners, once a day however often it runs', async () => {
    db.inboxes = [row(), row({ id: 'ib-2', enrollment_id: 'enr-2', address: 'bo@gmail.com', mailbox: 'bo@gmail.com' }), row({ id: 'ib-3', enrollment_id: 'enr-3', address: 'cy@gmail.com', mailbox: 'cy@gmail.com', verified_at: null })];
    const deps = { ...ON, enabledIds: async () => ['enr-1', 'enr-3'] };
    expect(await runDailyTests(day(21), deps)).toBe(1);
    expect(await runDailyTests(min(day(21), 30), deps)).toBe(0);
    expect(mockMail.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(['ann.lee.careers@gmail.com']);
  });
  it('nobody on Career Prep: no query at all', async () => {
    expect(await runDailyTests(day(21), { ...ON, enabledIds: async () => [] })).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('sendBrokenAlerts: ONE alert per broken spell', () => {
  const ALERT = 'ann.personal@example.com';
  async function missedDay(d: number): Promise<void> {
    await runDailyTests(day(d), ON);
    for (const m of [15, 30, 45]) await sendBrokenAlerts(min(day(d), m), ON);
  }
  it('Broken for 3 days: one alert; the inbox reads broken all along, even while a new test is on its way', async () => {
    await missedDay(21);
    expect(health(min(day(21), 15))).toBe('broken');
    await runDailyTests(day(22), ON);
    expect(health(min(day(22), 2))).toBe('broken');
    for (const m of [15, 30]) await sendBrokenAlerts(min(day(22), m), ON);
    await missedDay(23);
    expect(sentTo(ALERT)).toHaveLength(1);
    expect((sentTo(ALERT)[0][0] as { subject: string }).subject).toBe(ALERT_SUBJECT);
    expect(db.inboxes[0].broken_since).toEqual(day(21));
  });
  it('nothing is alerted before the 10 minutes are up (10 min exactly is not yet broken)', async () => {
    await runDailyTests(day(21), ON);
    expect(await sendBrokenAlerts(min(day(21), 10), ON)).toBe(0);
    expect(db.inboxes[0].broken_since).toBeNull();
    expect(await sendBrokenAlerts(min(day(21), 11), ON)).toBe(1);
  });
  it('recovery (a test arrives) then broken again: a second alert, for the new spell', async () => {
    await missedDay(21);
    await runDailyTests(day(22), ON);
    await arriveLatest(min(day(22), 1));
    expect(db.inboxes[0]).toMatchObject({ broken_since: null, broken_alerted_at: null });
    expect(health(min(day(22), 30))).toBe('healthy');
    await missedDay(23);
    expect(sentTo(ALERT)).toHaveLength(2);
    expect(db.inboxes[0].broken_since).toEqual(day(23));
  });
  it('a failing mailer is tried at most 3 times, then gives up loudly for staff', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await runDailyTests(day(21), ON);
    mockMail.mockRejectedValue(Object.assign(new Error('mandrill 500'), { name: 'UpstreamUnavailable' }));
    for (const m of [15, 30, 45, 60, 75]) await sendBrokenAlerts(min(day(21), m), ON);
    expect(sentTo(ALERT)).toHaveLength(3);
    expect(db.inboxes[0].broken_alerted_at).toBeNull();
    expect(err.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/inbox_broken_alert_gave_up/);
  });
  it('a learner with no email on file: no mail, gives up once and says why; Career Prep off: no alert', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await runDailyTests(day(21), ON);
    db.people.set('enr-1', { email: null, full_name: 'Ann Lee' });
    await sendBrokenAlerts(min(day(21), 15), ON);
    await sendBrokenAlerts(min(day(21), 30), ON);
    expect(err.mock.calls.filter((c) => String(c[0]).includes('NoEmail'))).toHaveLength(1);
    db.inboxes = [row({ last_test_at: day(21), last_test_token: 'a1b2c3d4e5f60718293a4b5c' })];
    db.people.set('enr-1', { email: 'ann.personal@example.com', full_name: 'Ann Lee' });
    expect(await sendBrokenAlerts(min(day(21), 15), { ...ON, enabled: async () => false })).toBe(0);
    expect(mockMail.mock.calls.filter((c) => (c[0] as { to: string }).to === ALERT)).toHaveLength(0);
  });
  it('an in_flight ledger refusal does NOT mark the spell alerted; an already_sent one does', async () => {
    await runDailyTests(day(21), ON);
    mockLedgerNext.push('in_flight');
    expect(await sendBrokenAlerts(min(day(21), 15), ON)).toBe(0);
    expect(db.inboxes[0].broken_alerted_at).toBeNull();
    expect(db.inboxes[0].broken_alert_attempts).toBe(1);
    mockLedgerNext.push('already_sent');
    expect(await sendBrokenAlerts(min(day(21), 30), ON)).toBe(0);
    expect(db.inboxes[0].broken_alerted_at).toEqual(min(day(21), 30));
    expect(sentTo(ALERT)).toHaveLength(0);
    expect(await sendBrokenAlerts(min(day(21), 45), ON)).toBe(0); // marked: never tried again
    expect(sentTo(ALERT)).toHaveLength(0);
  });
  it('a spell on an UNVERIFIED inbox is not a broken spell (health is still "set up")', async () => {
    db.inboxes = [row({ verified_at: null, last_test_at: day(21), last_test_token: 'a1b2c3d4e5f60718293a4b5c' })];
    expect(await sendBrokenAlerts(min(day(21), 30), ON)).toBe(0);
    expect(db.inboxes[0].broken_since).toBeNull();
  });
});

describe('alertText', () => {
  it('plain words in Central time with the one link back to step 3; no dashes, no "free"', () => {
    const t = alertText('Ann Lee', day(21));
    expect(t).toMatch(/^Hi Ann,/);
    expect(t).toContain('Saturday, November 21 at 9:00 AM CST');
    expect(t).toMatch(/\/portal\/career\/room#inbox/);
    expect(t).toContain('step 3');
    expect(t).not.toMatch(DASH_OR_FREE);
    expect(alertText(null, day(21))).toMatch(/^Hi,/);
  });
});
