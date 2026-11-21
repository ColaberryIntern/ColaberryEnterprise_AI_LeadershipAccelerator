/**
 * CP8.2b (kit F4 step 3): the work after a booking commits: one room (recording off), one message per recipient, the
 * employer's part dark behind career_prep_employer_mail_enabled, and the capped recovery sweep. The database is an
 * in-memory stand-in for the statements bookingConfirm and its sweep send (each change applied only as the statement
 * says it); the send ledger mirrors sendOnce; the room provider is a fake that answers the SENTINEL provider link and,
 * like the real adapter's ledger, one meeting per requestId. Nothing leaves the process.
 */
import { SENTINEL_PROVIDER_URL, expectNoRoomUrl } from './helpers/noRoomUrl';

type Iv = { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; contact_email: string | null;
  starts_at: Date | null; minutes: number | null; interviewer_emails: string[]; booker_tz: string | null; room_provider_id: string | null; room_url: string | null;
  confirm_attempts: number; confirm_last_attempt_at: Date | null; confirm_done_at: Date | null; updated_at: Date;
  full_name: string | null; personal_email: string | null; job_address: string | null };
type R = { id?: string; now?: Date; lease?: Date; start?: Date; pid?: string; url?: string; event?: string; payload?: string; src?: string; };
// clock: the DATABASE clock (what NOW() answers); tests move it with at(), which also returns the caller's matching now.
const db = { iv: [] as Iv[], events: [] as Array<{ event: string; src: string; payload: string }>, sql: [] as string[], clock: new Date(0) };
const byId = (id: unknown) => db.iv.find((x) => x.id === id) as Iv;
const same = (a: Date | null, b: Date | undefined) => !!a && !!b && a.getTime() === b.getTime();
function answer(sql: string, r: R): [unknown[], number] {
  db.sql.push(sql);
  if (sql.includes('LEFT JOIN job_search_inboxes j') && sql.includes('WHERE i.id = :id')) {
    // The stored provider link is returned only if the statement selects it (it should not: no message may carry it).
    return [db.iv.filter((i) => i.id === r.id).map(({ room_url, ...i }) => ({ ...i, ...(/i\.room_url/.test(sql) ? { room_url } : {}) })), 0];
  }
  if (sql.includes('SET confirm_attempts = confirm_attempts + 1')) {
    const i = byId(r.id);
    if (!/state = 'booked' AND starts_at = :start AND confirm_done_at IS NULL/.test(sql) || i.state !== 'booked' || !same(i.starts_at, r.start) || i.confirm_done_at) return [[], 0];
    // the lease, applied only as the statement words it: on the database clock (NOW()), or on a caller-supplied :lease
    const dbLease = /AND \(confirm_last_attempt_at IS NULL OR confirm_last_attempt_at < NOW\(\) - INTERVAL '120 seconds'\)/.test(sql);
    const cutoff = dbLease ? db.clock.getTime() - 120_000 : /< :lease\)/.test(sql) ? (r.lease as Date).getTime() : Infinity;
    if (i.confirm_last_attempt_at && i.confirm_last_attempt_at.getTime() >= cutoff) return [[], 0];
    const stamp = /confirm_last_attempt_at = NOW\(\)/.test(sql) ? db.clock : r.now;
    Object.assign(i, { confirm_attempts: i.confirm_attempts + 1, confirm_last_attempt_at: stamp });
    return [[{ confirm_attempts: i.confirm_attempts }], 1];
  }
  if (sql.includes('SET room_provider_id = :pid')) {
    const i = byId(r.id);
    if (!/room_provider_id IS NULL AND state = 'booked' AND starts_at = :start/.test(sql) || i.room_provider_id || i.state !== 'booked' || !same(i.starts_at, r.start)) return [[], 0];
    Object.assign(i, { room_provider_id: r.pid, room_url: r.url });
    return [[], 1];
  }
  if (sql.includes('SET confirm_done_at = :now')) {
    const i = byId(r.id);
    if (/confirm_done_at IS NULL/.test(sql) && !i.confirm_done_at && i.state === 'booked' && same(i.starts_at, r.start)) i.confirm_done_at = r.now as Date;
    return [[], 1];
  }
  if (sql.includes('INSERT INTO placement_events')) {
    if (!/ON CONFLICT DO NOTHING/.test(sql)) throw new Error('events must be keyed');
    if (db.events.some((e) => e.src === r.src)) return [[], 0];
    db.events.push({ event: String(r.event), src: String(r.src), payload: String(r.payload) });
    return [[], 1];
  }
  if (sql.includes('SELECT i.id FROM placement_interviews i')) {
    const t = (d: Date | null) => (d ? d.getTime() : Infinity);
    // each backoff on the DATABASE clock, and only when the statement words it so
    const ago = (secs: number) => (sql.includes(`NOW() - INTERVAL '${secs} seconds'`) ? db.clock.getTime() - secs * 1000 : -Infinity);
    const owed = db.iv.filter((i) => i.state === 'booked' && !i.confirm_done_at && (i.starts_at as Date).getTime() > (r.now as Date).getTime() && i.confirm_attempts < 3
      && ((i.confirm_attempts === 0 && i.updated_at.getTime() < ago(120))
        || (i.confirm_attempts === 1 && t(i.confirm_last_attempt_at) < ago(300))
        || (i.confirm_attempts >= 2 && t(i.confirm_last_attempt_at) < ago(1800))));
    return [owed.map((i) => ({ id: i.id })), 0];
  }
  throw new Error(`unexpected SQL: ${sql.slice(0, 70)}`);
}
jest.mock('../../../config/database', () => ({ sequelize: { query: async (s: string, o: { replacements?: R } = {}) => answer(s, o.replacements ?? {}) } }));
jest.mock('../../../config/env', () => ({ env: { emailFrom: 'team@refactored.example', frontendUrl: 'https://enterprise.colaberry.ai', jwtSecret: 'test-secret' } }));
const mockLedger = new Map<string, string>();
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (id: { recipient: string; subject: string; businessEventId: string }, send: () => Promise<{ ok: boolean; errorClass?: string }>) => {
    const key = `${id.recipient}|${id.subject}|${id.businessEventId}`;
    const st = mockLedger.get(key);
    if (st && st !== 'failed') return { outcome: 'skipped', reason: st === 'sent' ? 'already_sent' : 'in_flight', idempotencyKey: key };
    mockLedger.set(key, 'claimed');
    try {
      const r = await send();
      mockLedger.set(key, r.ok ? 'sent' : 'failed');
      return r.ok ? { outcome: 'sent', ledgerId: key, idempotencyKey: key } : { outcome: 'failed', ledgerId: key, idempotencyKey: key, errorClass: r.errorClass ?? 'ProviderRejected', error: '' };
    } catch (e) { mockLedger.set(key, 'failed'); return { outcome: 'failed', ledgerId: key, idempotencyKey: key, errorClass: (e as Error).name, error: '' }; }
  },
}));
const mockMail = jest.fn();
jest.mock('../../emailService', () => ({ guardedSendMail: (m: unknown) => mockMail(m), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
const mockCreate = jest.fn();
jest.mock('../../communityRooms/meetingProvider', () => ({ getMeetingProvider: () => ({ createMeeting: (i: unknown) => mockCreate(i) }) }));
jest.mock('../../caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
jest.mock('../../careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: async () => false }));
jest.mock('../../settingsService', () => ({ getSetting: async () => null }));

import { finishBooking, finishInBackground, MAX_CONFIRM_ATTEMPTS } from '../bookingConfirm';
import { sweepBookingConfirms } from '../bookingConfirmSweep';
import { EMPLOYER_SUBJECT, LEARNER_SUBJECT, RECORDING_LINE } from '../bookingConfirmEmail';

const NOW = new Date('2026-11-20T18:00:00Z');
const START = new Date('2026-11-23T15:00:00Z'); // Mon 9:00 AM CST
const at = (ms: number): Date => { db.clock = new Date(NOW.getTime() + ms); return db.clock; };
const ON = async () => true;
const OFF = async () => null;
const allowed = async () => true;
const iv = (over: Partial<Iv> = {}): Iv => ({ id: 'iv-1', enrollment_id: 'enr-ann', state: 'booked', company: 'Acme', position: 'Data Analyst', contact_email: 'pat@acme.example',
  starts_at: START, minutes: 30, interviewer_emails: ['kim@acme.example', 'PAT@acme.example'], booker_tz: 'America/New_York', room_provider_id: null, room_url: null,
  confirm_attempts: 0, confirm_last_attempt_at: null, confirm_done_at: null, updated_at: NOW, full_name: 'Ann Marie Lee', personal_email: 'ann.personal@mail.example',
  job_address: 'ann.jobs@mail.example', ...over });
type Sent = { to: string; subject: string; text: string; replyTo?: string; icalEvent: { content: string } };
const sent = () => mockMail.mock.calls.map((c) => c[0] as Sent);
const meetings = new Map<string, { providerEventId: string; joinUrl: string }>();

beforeEach(() => {
  db.iv = [iv()]; db.events = []; db.sql = []; db.clock = NOW; mockLedger.clear(); meetings.clear();
  mockMail.mockReset().mockImplementation(async () => ({ messageId: `m-${mockMail.mock.calls.length}` }));
  mockCreate.mockReset().mockImplementation(async (i: { requestId: string }) => {
    if (!meetings.has(i.requestId)) meetings.set(i.requestId, { providerEventId: `zm-${meetings.size + 1}`, joinUrl: SENTINEL_PROVIDER_URL });
    return meetings.get(i.requestId);
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('finishBooking: room and invites after the commit', () => {
  it('one room with recording OFF; the learner and every employer recipient get one message each; done', async () => {
    const r = await finishBooking('iv-1', { now: NOW, read: ON, learnerAllowed: allowed });
    expect(r).toEqual({ status: 'done', room: 'ok', learner: 'sent', employer: 'sent' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ autoRecording: 'none', requestId: 'placement-interview-iv-1-2026-11-23T15:00:00.000Z', startAt: START, endAt: new Date('2026-11-23T15:30:00Z') });
    expect(db.iv[0]).toMatchObject({ room_provider_id: 'zm-1', room_url: SENTINEL_PROVIDER_URL, confirm_done_at: NOW, confirm_attempts: 1 });
    expect(sent().map((m) => [m.to, m.subject])).toEqual([['ann.personal@mail.example', LEARNER_SUBJECT], ['pat@acme.example', EMPLOYER_SUBJECT], ['kim@acme.example', EMPLOYER_SUBJECT]]);
    expect(sent().slice(1).every((m) => m.replyTo === 'ann.jobs@mail.example')).toBe(true);
    expect(db.events.map((e) => e.src)).toEqual(['booking_confirm_done:iv-1:2026-11-23T15:00:00.000Z']);
  });
  it('NO message or .ics carries the provider link; each carries its consent-room page (learner portal, employer signed page)', async () => {
    await finishBooking('iv-1', { now: NOW, read: ON, learnerAllowed: allowed });
    // and when the room ALREADY exists with its provider link stored (a retry after a failed send, or the sweep)
    db.iv.push(iv({ id: 'iv-9', room_provider_id: 'zm-9', room_url: SENTINEL_PROVIDER_URL, contact_email: 'lee@beta.example', interviewer_emails: [] }));
    await finishBooking('iv-9', { now: NOW, read: ON, learnerAllowed: allowed });
    for (const m of sent().slice(3)) expectNoRoomUrl({ subject: m.subject, text: m.text, ics: m.icalEvent.content, replyTo: m.replyTo });
    expect(sent()).toHaveLength(5);
    mockMail.mock.calls.splice(3);
    for (const m of sent()) {
      expectNoRoomUrl({ subject: m.subject, text: m.text, ics: m.icalEvent.content, replyTo: m.replyTo });
      expect(m.text).toContain(RECORDING_LINE);
    }
    const [learner, ...employer] = sent();
    expect(learner.text).toContain('https://enterprise.colaberry.ai/portal/career/interview/iv-1');
    expect(learner.icalEvent.content).toContain('URL:https://enterprise.colaberry.ai/portal/career/interview/iv-1');
    for (const m of employer) {
      expect(m.text).toMatch(/https:\/\/hire\.refactored\.ai\/room\/\?i=iv-1&e=1795447800000&t=[A-Za-z0-9_-]{43}/);
      expect(m.icalEvent.content.replace(/\r\n /g, '')).toContain('URL:https://hire.refactored.ai/room/?i=iv-1&e=1795447800000&t=');
      expect(m.text).not.toContain('ann.personal@mail.example');
    }
  });
  it('retried, double-clicked or run twice at once: still ONE room and ONE message per recipient', async () => {
    const both = await Promise.all([finishBooking('iv-1', { now: NOW, read: ON, learnerAllowed: allowed }), finishBooking('iv-1', { now: NOW, read: ON, learnerAllowed: allowed })]);
    expect(both.map((r) => r.status).sort()).toEqual(['busy', 'done']); // the second found the first one's lease
    await finishBooking('iv-1', { now: NOW, read: ON, learnerAllowed: allowed });
    db.iv[0].confirm_done_at = null; // even a forced re-run, after the lease lapsed, sends nothing new
    expect((await finishBooking('iv-1', { now: at(60_000), read: ON, learnerAllowed: allowed })).status).toBe('busy'); // lease still live
    await finishBooking('iv-1', { now: at(3 * 60_000), read: ON, learnerAllowed: allowed });
    expect(meetings.size).toBe(1);
    expect(sent().map((m) => m.to).sort()).toEqual(['ann.personal@mail.example', 'kim@acme.example', 'pat@acme.example']);
  });
  it('employer switch OFF: the learner is notified, employer mail is HELD (one keyed row), and the booking is done', async () => {
    const r = await finishBooking('iv-1', { now: NOW, read: OFF, learnerAllowed: allowed });
    expect(r).toMatchObject({ status: 'done', learner: 'sent', employer: 'held' });
    expect(sent().map((m) => m.to)).toEqual(['ann.personal@mail.example']);
    expect(db.events.find((e) => e.event === 'booking_confirm_held')?.payload).toContain('held: employer email is switched off');
    // an unreadable switch is OFF too (darkSwitches rule)
    db.iv = [iv({ id: 'iv-2' })];
    await finishBooking('iv-2', { now: NOW, read: async () => { throw new Error('db'); }, learnerAllowed: allowed });
    expect(sent().filter((m) => m.subject === EMPLOYER_SUBJECT)).toHaveLength(0);
  });
  it('a learner not on the Career Prep allow-list (or with no email) gets no email; the employer still does', async () => {
    expect(await finishBooking('iv-1', { now: NOW, read: ON })).toMatchObject({ status: 'done', learner: 'skipped', employer: 'sent' });
    db.iv = [iv({ id: 'iv-3', personal_email: null })];
    expect(await finishBooking('iv-3', { now: NOW, read: ON, learnerAllowed: allowed })).toMatchObject({ status: 'done', learner: 'skipped' });
    expect(sent().some((m) => m.subject === LEARNER_SUBJECT)).toBe(false);
  });
  it('not booked any more (cancelled before the work ran) or unknown: no room, no message, no attempt counted', async () => {
    db.iv[0].state = 'cancelled';
    expect(await finishBooking('iv-1', { now: NOW, read: ON, learnerAllowed: allowed })).toEqual({ status: 'not_booked' });
    expect(await finishBooking('nope', { now: NOW, read: ON })).toEqual({ status: 'not_found' });
    expect([mockCreate.mock.calls.length, mockMail.mock.calls.length, db.iv[0].confirm_attempts]).toEqual([0, 0, 0]);
  });
  // A rebook at a NEW time (new room, new messages) runs the REAL confirmBooking statement: bookingRebook.test.ts.
});

describe('failure paths and the recovery sweep', () => {
  it('provider down: the messages still go (they never need the room); incomplete; the sweep makes the room later, no second message', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('zoom 503'), { name: 'UpstreamUnavailable' }));
    expect(await finishBooking('iv-1', { now: NOW, read: ON, learnerAllowed: allowed })).toMatchObject({ status: 'incomplete', room: 'failed', learner: 'sent', employer: 'sent', gaveUp: false });
    expect(db.events.map((e) => e.event)).toEqual(['booking_confirm_failed']);
    expect((await sweepBookingConfirms(at(4 * 60_000), { read: ON, learnerAllowed: allowed })).tried).toBe(0); // backoff: 5 min after 1 try
    expect(await sweepBookingConfirms(at(6 * 60_000), { read: ON, learnerAllowed: allowed })).toEqual({ tried: 1, done: 1, gaveUp: 0 });
    expect([db.iv[0].room_provider_id, sent().length]).toEqual(['zm-1', 3]);
  });
  it('a provider that hangs is cut off at 25 seconds (no unbounded wait)', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    mockCreate.mockImplementationOnce(() => new Promise(() => undefined));
    const run = finishBooking('iv-1', { now: NOW, read: ON, learnerAllowed: allowed });
    await jest.advanceTimersByTimeAsync(25_000);
    expect(await run).toMatchObject({ status: 'incomplete', room: 'failed' });
  });
  it('a mail that keeps failing: retried at 5 and 30 minutes, then given up ONCE, and never swept again', async () => {
    mockMail.mockImplementation(async (m: Sent) => (m.to === 'kim@acme.example' ? { messageId: undefined } : { messageId: 'ok' }));
    await finishBooking('iv-1', { now: NOW, read: ON, learnerAllowed: allowed });
    await sweepBookingConfirms(at(6 * 60_000), { read: ON, learnerAllowed: allowed });
    expect((await sweepBookingConfirms(at(20 * 60_000), { read: ON, learnerAllowed: allowed })).tried).toBe(0);
    expect(await sweepBookingConfirms(at(40 * 60_000), { read: ON, learnerAllowed: allowed })).toEqual({ tried: 1, done: 0, gaveUp: 1 });
    expect((await sweepBookingConfirms(at(90 * 60_000), { read: ON, learnerAllowed: allowed })).tried).toBe(0);
    expect(db.iv[0].confirm_attempts).toBe(MAX_CONFIRM_ATTEMPTS);
    expect(db.events.filter((e) => e.event === 'booking_confirm_gave_up')).toHaveLength(1);
    expect(sent().filter((m) => m.to === 'pat@acme.example')).toHaveLength(1); // the ones that went are never repeated
  });
  it('a crash between the commit and the work: the sweep finishes it after the 2-minute grace; past bookings are left alone', async () => {
    expect((await sweepBookingConfirms(at(60_000), { read: ON, learnerAllowed: allowed })).tried).toBe(0);
    expect(await sweepBookingConfirms(at(3 * 60_000), { read: ON, learnerAllowed: allowed })).toEqual({ tried: 1, done: 1, gaveUp: 0 });
    db.iv = [iv({ id: 'iv-old', starts_at: new Date(NOW.getTime() - 60_000) })];
    expect((await sweepBookingConfirms(at(0), { read: ON })).tried).toBe(0);
    const scan = db.sql.find((s) => s.includes('SELECT i.id FROM placement_interviews i')) as string;
    for (const clause of ["i.state = 'booked'", 'i.confirm_done_at IS NULL', 'i.starts_at > :now', `i.confirm_attempts < ${MAX_CONFIRM_ATTEMPTS}`, 'LIMIT 20',
      "i.updated_at < NOW() - INTERVAL '120 seconds'", "i.confirm_last_attempt_at < NOW() - INTERVAL '300 seconds'", "i.confirm_last_attempt_at < NOW() - INTERVAL '1800 seconds'"]) expect(scan).toContain(clause);
  });
  it('overlapping sweep ticks: a tick that starts while a pass runs returns at once; the flag is released even after a crash', async () => {
    const [first, second] = await Promise.all([sweepBookingConfirms(at(3 * 60_000), { read: ON, learnerAllowed: allowed }), sweepBookingConfirms(at(3 * 60_000), { read: ON, learnerAllowed: allowed })]);
    expect([first, second]).toEqual([{ tried: 1, done: 1, gaveUp: 0 }, { tried: 0, done: 0, gaveUp: 0, overlapped: true }]);
    expect(meetings.size).toBe(1);
    db.iv = [iv({ id: 'iv-x' })];
    const scan = db.sql.length;
    db.sql.push = () => { throw Object.assign(new Error('db gone'), { name: 'SequelizeConnectionError' }); }; // the next statement throws
    await expect(sweepBookingConfirms(at(3 * 60_000), { read: ON, learnerAllowed: allowed })).rejects.toThrow('db gone');
    db.sql = db.sql.slice(0, scan);
    expect(await sweepBookingConfirms(at(3 * 60_000), { read: ON, learnerAllowed: allowed })).toEqual({ tried: 1, done: 1, gaveUp: 0 });
  });
  it('finishInBackground never throws into the route; a crash is logged with its class', async () => {
    const err = jest.spyOn(console, 'error');
    finishInBackground('iv-1', async () => { throw Object.assign(new Error('x'), { name: 'SequelizeConnectionError' }); });
    await new Promise((r) => setImmediate(r));
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('"error_class":"SequelizeConnectionError"');
  });
});
