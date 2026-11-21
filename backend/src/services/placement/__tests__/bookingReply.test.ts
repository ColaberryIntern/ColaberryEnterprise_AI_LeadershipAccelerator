/**
 * CP8.1b (kit F4 step 2): the booking-link reply to the employer, DARK behind career_prep_employer_mail_enabled, and its
 * recovery sweep. The database is an in-memory stand-in for the statements both send (each change applied only as the
 * statement says it); the send ledger mirrors sendOnce (one claim per key, taken before the send; a failed claim may
 * retry); the mailer is a spy. Nothing leaves the process.
 */
type Iv = { id: string; state: string; company: string | null; position: string | null; contact_name: string | null; contact_email: string | null;
  source_event_id: string; full_name: string | null; job_address: string | null; booking_token_hash: string | null; token_expires_at: Date | null;
  booking_link_round: string | null; booking_link_sent_at: Date | null; booking_link_attempts: number; booking_link_last_attempt_at: Date | null; updated_at: Date; created_at: Date };
type R = { id?: string; h?: string; x?: Date; event?: string; to?: string; payload?: string; src?: string; now?: Date; grace?: Date; after1?: Date; after2?: Date };
const db = { iv: [] as Iv[], events: [] as Array<{ event: string; from: string; to: string; src: string; payload: string }>, cancelBeforeDeliver: false };
const byId = (id: unknown) => db.iv.find((x) => x.id === id) as Iv;
function answer(sql: string, r: R): [unknown[], number] {
  if (sql.includes('FROM placement_interviews i JOIN enrollments')) return [db.iv.filter((i) => i.id === r.id).map((i) => ({ ...i })), 0];
  if (sql.includes('SET booking_link_attempts = booking_link_attempts + 1')) {
    const i = byId(r.id);
    if (!/state = 'new'/.test(sql) || i.state !== 'new') return [[], 0];
    Object.assign(i, { booking_link_attempts: i.booking_link_attempts + 1, booking_link_last_attempt_at: r.now });
    return [[{ booking_link_attempts: i.booking_link_attempts }], 1];
  }
  if (sql.includes('SET booking_token_hash')) {
    const i = byId(r.id);
    if (db.cancelBeforeDeliver) i.state = 'cancelled'; // a cancellation lands between the load and the send
    if (i.state !== 'new' || !/state = 'new'/.test(sql)) return [[], 0];
    Object.assign(i, { booking_token_hash: r.h, token_expires_at: r.x });
    return [[{ id: i.id }], 1];
  }
  if (sql.includes('SET booking_link_sent_at = :now')) { const i = byId(r.id); if (!i.booking_link_sent_at) i.booking_link_sent_at = r.now as Date; return [[], 1]; }
  if (sql.includes('INSERT INTO placement_events')) {
    if (db.events.some((e) => e.src === r.src)) return [[], 0];
    const toReview = /'new', 'review', 'platform'/.test(sql);
    db.events.push({ event: String(r.event), from: 'new', to: toReview ? 'review' : String(r.to), src: String(r.src), payload: String(r.payload) });
    return [[{ id: db.events.length }], 1];
  }
  if (sql.includes('FROM placement_interviews WHERE id = :id FOR UPDATE')) {
    const cols = /SELECT state, booking_link_sent_at/.test(sql); // the stand-in returns only the columns the statement selects
    return [db.iv.filter((i) => i.id === r.id).map((i) => (cols ? { state: i.state, booking_link_sent_at: i.booking_link_sent_at } : { state: i.state })), 0];
  }
  if (sql.includes("SET state = 'review'")) { byId(r.id).state = 'review'; return [[], 1]; }
  if (sql.includes('SELECT i.id, i.booking_link_round, i.booking_link_attempts FROM placement_interviews i')) {
    const t = (d: Date | null) => (d ? d.getTime() : Infinity);
    const owed = db.iv.filter((i) => i.state === 'new' && i.booking_link_round && !i.booking_link_sent_at
      && !db.events.some((e) => e.src === `booking_link_held:${i.id}:${i.booking_link_round}`)
      && ((i.booking_link_attempts === 0 && i.updated_at.getTime() < (r.grace as Date).getTime())
        || (i.booking_link_attempts === 1 && t(i.booking_link_last_attempt_at) < (r.after1 as Date).getTime())
        || (i.booking_link_attempts >= 2 && t(i.booking_link_last_attempt_at) < (r.after2 as Date).getTime())));
    return [owed.map((i) => ({ id: i.id, booking_link_round: i.booking_link_round, booking_link_attempts: i.booking_link_attempts })), 0];
  }
  throw new Error(`unexpected SQL: ${sql.slice(0, 70)}`);
}
const mockQuery = jest.fn(async (s: string, o: { replacements?: R } = {}) => answer(s, o.replacements ?? {}));
jest.mock('../../../config/database', () => ({ sequelize: {
  query: (s: string, o: { replacements?: R }) => mockQuery(s, o),
  transaction: async (f: (t: unknown) => Promise<unknown>) => f('tx'),
} }));
const mockLedger = new Map<string, string>();
let mockLedgerThrows = false;
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (id: { recipient: string; subject: string; businessEventId: string }, send: () => Promise<{ ok: boolean; errorClass?: string; error?: string }>) => {
    if (mockLedgerThrows) throw Object.assign(new Error('ledger down'), { name: 'SequelizeConnectionError' });
    const key = `${id.recipient}|${id.subject}|${id.businessEventId}`;
    const st = mockLedger.get(key);
    if (st && st !== 'failed') return { outcome: 'skipped', reason: st === 'sent' ? 'already_sent' : 'in_flight', idempotencyKey: key };
    mockLedger.set(key, 'claimed'); // the claim is taken BEFORE the send, atomically (the UNIQUE index in Postgres)
    try {
      const r = await send();
      mockLedger.set(key, r.ok ? 'sent' : 'failed');
      return r.ok ? { outcome: 'sent', ledgerId: key, idempotencyKey: key } : { outcome: 'failed', ledgerId: key, idempotencyKey: key, errorClass: r.errorClass ?? 'ProviderRejected', error: '' };
    } catch (e) { mockLedger.set(key, 'failed'); return { outcome: 'failed', ledgerId: key, idempotencyKey: key, errorClass: (e as Error).name, error: '' }; }
  },
}));
jest.mock('../../settingsService', () => ({ getSetting: async () => null })); // absent = OFF; tests pass their own reader
const mockMail = jest.fn();
let mockRedirect: string | null = null;
jest.mock('../../emailService', () => ({
  guardedSendMail: (m: unknown) => mockMail(m),
  resolveEmailRecipient: async (to: string, subject: string) => (mockRedirect ? { to: mockRedirect, subject: `[TEST] ${subject}` } : { to, subject }),
}));

import { MAX_ATTEMPTS, sendBookingLink } from '../bookingReply';
import { sweepBookingLinks } from '../bookingLinkSweep';
import { hashBookingToken } from '../bookingToken';

const ON = async () => true;
const T0 = new Date('2026-11-21T18:00:00Z');
const min = (m: number) => new Date(T0.getTime() + m * 60_000);
const iv = (over: Partial<Iv> = {}): Iv => ({ id: 'iv-1', state: 'new', company: 'Acme', position: 'Data Analyst', contact_name: 'Pat Doe', contact_email: 'pat@acme.example',
  source_event_id: 'interview.detected:<m1@acme.example>', full_name: 'Ann Lee', job_address: 'ann.lee.careers@gmail.com', booking_token_hash: null, token_expires_at: null,
  booking_link_round: 'first', booking_link_sent_at: null, booking_link_attempts: 0, booking_link_last_attempt_at: null, updated_at: T0, created_at: T0, ...over });
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
type Sent = { from: string; to: string; cc?: string; replyTo: string; subject: string; text: string; headers: Record<string, string> };
const sent = () => mockMail.mock.calls.map((c) => c[0] as Sent);
const failedRows = () => db.events.filter((e) => e.event === 'booking_link_failed');

beforeEach(() => {
  db.iv = [iv()]; db.events = []; db.cancelBeforeDeliver = false; mockLedger.clear(); mockRedirect = null; mockLedgerThrows = false;
  mockQuery.mockClear(); mockMail.mockReset().mockResolvedValue({ messageId: 'mc-1' });
  for (const k of ['log', 'warn'] as const) jest.spyOn(console, k).mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('sendBookingLink', () => {
  it('switch OFF (false, absent or unreadable): held, recorded once, nothing sent, no token, no try counted', async () => {
    for (const read of [async () => false, async () => null, async () => { throw new Error('db'); }]) expect(await sendBookingLink('iv-1', { read })).toEqual({ status: 'held' });
    expect(await sendBookingLink('iv-1')).toEqual({ status: 'held' }); // the real default reader: the switch is absent
    expect(mockMail).not.toHaveBeenCalled();
    expect([db.iv[0].booking_token_hash, db.iv[0].booking_link_attempts]).toEqual([null, 0]);
    expect(db.events).toMatchObject([{ event: 'booking_link_held', src: 'booking_link_held:iv-1:first' }]);
    expect(JSON.parse(db.events[0].payload)).toEqual({ reason: 'held: employer email is switched off' });
  });
  it('on: ONE reply from "Ali M. via Refactored.ai", Reply-To and CC the job-search address, threaded, one link; marked sent', async () => {
    expect(await sendBookingLink('iv-1', { read: ON, now: T0 })).toEqual({ status: 'sent' });
    const [m] = sent();
    expect(m.from).toMatch(/^"Ali M\. via Refactored\.ai" </);
    expect([m.to, m.cc, m.replyTo]).toEqual(['pat@acme.example', 'ann.lee.careers@gmail.com', 'ann.lee.careers@gmail.com']);
    expect(m.headers).toMatchObject({ 'In-Reply-To': '<m1@acme.example>', References: '<m1@acme.example>' });
    const token = decodeURIComponent((/\/book\/\?t=([^\s]+)/.exec(m.text) as RegExpExecArray)[1]);
    expect(db.iv[0].booking_token_hash).toBe(hashBookingToken(token));
    expect(`${m.subject}${m.text}`).not.toMatch(DASHES);
    expect(db.iv[0].booking_link_sent_at).toEqual(T0);
    expect(db.events.map((e) => e.event)).toEqual(['booking_link_sent']);
  });
  it('twice, twice at once, or after the learner is renamed: ONE send (the key has no name in it), the first link stays live', async () => {
    await sendBookingLink('iv-1', { read: ON });
    const hash = db.iv[0].booking_token_hash;
    db.iv[0].full_name = 'Ann Renamed'; db.iv[0].booking_link_sent_at = null; // even if the sent mark were lost
    expect(await sendBookingLink('iv-1', { read: ON })).toEqual({ status: 'already_sent' });
    expect([mockMail.mock.calls.length, db.iv[0].booking_token_hash]).toEqual([1, hash]);
    mockLedger.clear(); db.iv = [iv()]; mockMail.mockClear();
    const both = await Promise.all([sendBookingLink('iv-1', { read: ON }), sendBookingLink('iv-1', { read: ON })]);
    expect(both.map((r) => r.status).sort()).toEqual(['in_flight', 'sent']);
    expect(mockMail).toHaveBeenCalledTimes(1);
  });
  it('test mode: the recipient is redirected and the CC to the learner\'s address is dropped', async () => {
    mockRedirect = 'sink@colaberry.example';
    await sendBookingLink('iv-1', { read: ON });
    expect([sent()[0].to, sent()[0].cc]).toEqual(['sink@colaberry.example', undefined]);
  });
  it('no employer email (or no job-search address): no send, new -> review for a recruiter, once', async () => {
    db.iv = [iv({ contact_email: null }), iv({ id: 'iv-2', job_address: null })];
    expect(await sendBookingLink('iv-1', { read: ON })).toEqual({ status: 'no_contact' });
    expect(await sendBookingLink('iv-2', { read: ON })).toEqual({ status: 'no_contact' });
    expect(db.iv.map((i) => i.state)).toEqual(['review', 'review']);
    expect(db.events.filter((e) => e.event === 'booking_link_no_contact' && e.to === 'review')).toHaveLength(2);
    expect(mockMail).not.toHaveBeenCalled();
  });
  it('not new, unknown, already sent or nothing owed: nothing happens', async () => {
    db.iv = [iv({ state: 'review' }), iv({ id: 'iv-2', booking_link_sent_at: T0 }), iv({ id: 'iv-3', booking_link_round: null })];
    expect(await sendBookingLink('iv-1', { read: ON })).toEqual({ status: 'not_new' });
    expect(await sendBookingLink('iv-2', { read: ON })).toEqual({ status: 'not_owed' });
    expect(await sendBookingLink('iv-3', { read: ON })).toEqual({ status: 'not_owed' });
    expect(await sendBookingLink('nope', { read: ON })).toEqual({ status: 'not_found' });
    expect([mockMail.mock.calls.length, db.events.length]).toEqual([0, 0]);
  });
  it('cancelled between the load and the send: no mail and no token', async () => {
    db.cancelBeforeDeliver = true;
    expect(await sendBookingLink('iv-1', { read: ON })).toMatchObject({ status: 'failed', errorClass: 'StateChanged' });
    expect([mockMail.mock.calls.length, db.iv[0].booking_token_hash]).toEqual([0, null]);
  });
});

describe('failure and recovery (the sweep)', () => {
  it('transport rejects: one keyed booking_link_failed row at once, still new, the try counted', async () => {
    mockMail.mockRejectedValueOnce(Object.assign(new Error('mandrill 500'), { name: 'UpstreamUnavailable' }));
    expect(await sendBookingLink('iv-1', { read: ON, now: T0 })).toEqual({ status: 'failed', errorClass: 'UpstreamUnavailable', gaveUp: false });
    expect([db.iv[0].state, db.iv[0].booking_link_attempts, failedRows().length]).toEqual(['new', 1, 1]);
  });
  it('no message id (the send guard blocked it), or the ledger itself throws: a failed try, never "sent"', async () => {
    mockMail.mockResolvedValueOnce({});
    expect(await sendBookingLink('iv-1', { read: ON, now: T0 })).toMatchObject({ status: 'failed', errorClass: 'SendBlocked' });
    mockLedgerThrows = true;
    expect(await sendBookingLink('iv-1', { read: ON, now: min(1) })).toMatchObject({ status: 'failed', errorClass: 'SequelizeConnectionError' });
    expect(db.iv[0].booking_link_sent_at).toBeNull();
    expect(failedRows()).toHaveLength(1); // one keyed row for the round, however many tries fail
  });
  it('crash after the ingest commit, before any send: the sweep finds the owed reply (after the 2-minute grace) and sends it', async () => {
    expect(await sweepBookingLinks(min(1), ON)).toEqual({ tried: 0, sent: 0, gaveUp: 0 }); // the ingest's own try still has its turn
    expect(await sweepBookingLinks(min(3), ON)).toEqual({ tried: 1, sent: 1, gaveUp: 0 });
    expect(mockMail).toHaveBeenCalledTimes(1);
    expect(await sweepBookingLinks(min(60), ON)).toEqual({ tried: 0, sent: 0, gaveUp: 0 }); // sent: never again
  });
  it('failing every time: retried after 5 then 30 minutes, then new -> review with exactly ONE booking_link_failed row', async () => {
    mockMail.mockRejectedValue(Object.assign(new Error('mandrill 500'), { name: 'UpstreamUnavailable' }));
    await sendBookingLink('iv-1', { read: ON, now: T0 }); // the ingest's first try
    expect((await sweepBookingLinks(min(4), ON)).tried).toBe(0); // not yet 5 minutes
    expect((await sweepBookingLinks(min(6), ON)).tried).toBe(1); // try 2
    expect((await sweepBookingLinks(min(30), ON)).tried).toBe(0); // not yet 30 minutes after try 2
    expect(await sweepBookingLinks(min(37), ON)).toEqual({ tried: 1, sent: 0, gaveUp: 1 }); // try 3 = MAX_ATTEMPTS
    expect(MAX_ATTEMPTS).toBe(3);
    expect(db.iv[0].state).toBe('review');
    expect(failedRows()).toHaveLength(1);
    expect(db.events.filter((e) => e.event === 'booking_link_gave_up' && e.to === 'review')).toHaveLength(1);
    expect(mockMail).toHaveBeenCalledTimes(3);
    expect((await sweepBookingLinks(min(200), ON)).tried).toBe(0);
  });
  it('a crash DURING the last try (cap reached, still new): the sweep gives it up to review, once', async () => {
    db.iv = [iv({ booking_link_attempts: 3, booking_link_last_attempt_at: T0 })];
    expect(await sweepBookingLinks(min(31), ON)).toEqual({ tried: 0, sent: 0, gaveUp: 1 });
    expect([db.iv[0].state, failedRows().length, mockMail.mock.calls.length]).toEqual(['review', 1, 0]);
  });
  it('a reply that went out meanwhile (sent mark set before the give-up takes its lock) is never moved to review as "could not be sent"', async () => {
    const { bookingToReview } = jest.requireActual('../bookingReply') as typeof import('../bookingReply');
    db.iv = [iv({ booking_link_sent_at: T0, booking_link_attempts: 3 })];
    expect(await bookingToReview('iv-1', 'first', 'gave_up', 'the booking link could not be sent after 3 tries')).toBe(false);
    expect([db.iv[0].state, db.events.length]).toEqual(['new', 0]);
    db.iv = [iv({ booking_link_attempts: 3 })];
    expect(await bookingToReview('iv-1', 'first', 'gave_up', 'x')).toBe(true);
    expect(db.iv[0].state).toBe('review');
  });
  it('switch off: the sweep does nothing at all (no query, no send); a held reply is never swept later', async () => {
    expect(await sweepBookingLinks(min(60), async () => false)).toEqual({ tried: 0, sent: 0, gaveUp: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
    await sendBookingLink('iv-1', { read: async () => false });
    expect(await sweepBookingLinks(min(60), ON)).toEqual({ tried: 0, sent: 0, gaveUp: 0 });
    expect(mockMail).not.toHaveBeenCalled();
  });
  it('the sweep query names every condition it relies on (the stand-in above applies exactly these)', async () => {
    await sweepBookingLinks(min(60), ON);
    const sql = String(mockQuery.mock.calls.find((c) => String(c[0]).includes('booking_link_round IS NOT NULL'))?.[0]);
    for (const part of ["i.state = 'new'", 'i.booking_link_sent_at IS NULL', "'booking_link_held:' || i.id || ':' || i.booking_link_round", 'i.updated_at < :grace',
      'i.booking_link_last_attempt_at < :after1', 'i.booking_link_last_attempt_at < :after2', 'LIMIT 20']) expect(sql).toContain(part);
  });
});
