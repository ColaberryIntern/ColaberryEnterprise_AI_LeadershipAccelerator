/**
 * CP8.2c (kit F4): reminders 24 h and 1 h before a booked interview, and the nudge (plus one review item) for a booking
 * link unused for 24 h. The database is an in-memory stand-in for the statements the scheduler sends (each applied only
 * as the statement says it); the send ledger mirrors sendOnce; the mailer is a spy. Nothing leaves the process.
 */
import { SENTINEL_PROVIDER_URL, expectNoRoomUrl } from './helpers/noRoomUrl';

type Iv = { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; contact_email: string | null; starts_at: Date | null;
  minutes: number | null; interviewer_emails: string[]; booker_tz: string | null; confirm_done_at: Date | null; room_url: string | null;
  booking_link_round: string | null; booking_link_sent_at: Date | null; full_name: string | null; personal_email: string | null; job_address: string | null };
type R = { id?: string; ids?: string[]; now?: Date; horizon?: Date; cutoff?: Date; name?: string; src?: string; payload?: string; e?: string; sum?: string };
const db = { iv: [] as Iv[], events: new Map<string, { name: string; payload: Record<string, unknown> }>(), items: new Map<string, Record<string, unknown>>(), sql: [] as string[] };
const t = (d: Date | null | undefined) => (d ? d.getTime() : NaN);
function answer(sql: string, r: R): [unknown[], number] {
  db.sql.push(sql);
  if (sql.includes("WHERE i.state = 'booked' AND i.confirm_done_at IS NOT NULL AND i.starts_at > :now AND i.starts_at <= :horizon")) {
    // the stored provider link only if the statement selects it (it must not)
    return [db.iv.filter((i) => i.state === 'booked' && i.confirm_done_at && t(i.starts_at) > t(r.now) && t(i.starts_at) <= t(r.horizon))
      .map(({ room_url, ...i }) => ({ ...i, ...(/i\.room_url/.test(sql) ? { room_url } : {}) })), 0];
  }
  if (sql.includes("WHERE event = 'reminder_done'") && sql.includes('subject_id IN (:ids)')) {
    return [[...db.events.entries()].filter(([, v]) => v.name === 'reminder_done').map(([k]) => ({ source_event_id: k })).filter((x) => (r.ids ?? []).some((id) => x.source_event_id.includes(`:${id}:`))), 0];
  }
  if (sql.includes("WHERE i.state IN ('new', 'awaiting')")) {
    return [db.iv.filter((i) => ['new', 'awaiting'].includes(i.state) && i.booking_link_round && i.booking_link_sent_at && t(i.booking_link_sent_at) < t(r.cutoff)
      && !(/NOT EXISTS/.test(sql) && db.events.has(`booking_nudge_done:${i.id}:${i.booking_link_round}`))), 0];
  }
  if (sql.includes('INSERT INTO placement_events') && sql.includes('DO UPDATE SET payload')) {
    const cur = db.events.get(String(r.src));
    const tries = cur ? Number(cur.payload.tries) + 1 : 1;
    db.events.set(String(r.src), { name: 'reminder_try', payload: { tries } });
    return [[{ tries }], 1];
  }
  if (sql.includes('INSERT INTO placement_events')) {
    if (!/ON CONFLICT DO NOTHING/.test(sql)) throw new Error('events must be keyed');
    if (!db.events.has(String(r.src))) db.events.set(String(r.src), { name: String(r.name), payload: JSON.parse(String(r.payload)) });
    return [[], 1];
  }
  if (sql.includes('INSERT INTO placement_review_items')) {
    if (!/ON CONFLICT \(kind, source_event_id\) DO NOTHING/.test(sql)) throw new Error('review items must be keyed');
    if (!db.items.has(String(r.src))) db.items.set(String(r.src), { kind: /'not_booked'/.test(sql) ? 'not_booked' : '?', interview_id: r.id, summary: JSON.parse(String(r.sum)) });
    return [[], 1];
  }
  throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
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
    const r = await send();
    mockLedger.set(key, r.ok ? 'sent' : 'failed');
    return r.ok ? { outcome: 'sent', ledgerId: key, idempotencyKey: key } : { outcome: 'failed', ledgerId: key, idempotencyKey: key, errorClass: r.errorClass ?? 'ProviderRejected', error: '' };
  },
}));
const mockMail = jest.fn();
jest.mock('../../emailService', () => ({ guardedSendMail: (m: unknown) => mockMail(m), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
jest.mock('../../communityRooms/meetingProvider', () => ({ getMeetingProvider: () => ({ createMeeting: async () => { throw new Error('no room here'); } }) }));
jest.mock('../../caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
jest.mock('../../careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: async () => false }));
jest.mock('../../settingsService', () => ({ getSetting: async () => null }));

import { dueReminders, MAX_TRIES, runBookingScheduler } from '../bookingScheduler';
import { EMPLOYER_REMINDER_SUBJECT, LEARNER_REMINDER_SUBJECT, NUDGE_SUBJECT, learnerReminderEmail, employerReminderEmail, nudgeEmail } from '../bookingReminderEmail';

const START = new Date('2026-11-24T15:00:00Z'); // Tue 9:00 AM CST
const H = 3_600_000;
const at = (ms: number) => new Date(START.getTime() + ms);
const ON = async () => true;
const allowed = async () => true;
const opts = { read: ON, learnerAllowed: allowed };
const iv = (over: Partial<Iv> = {}): Iv => ({ id: 'iv-1', enrollment_id: 'enr-ann', state: 'booked', company: 'Acme', position: 'Data Analyst', contact_email: 'pat@acme.example',
  starts_at: START, minutes: 30, interviewer_emails: ['kim@acme.example'], booker_tz: 'America/New_York', confirm_done_at: at(-3 * 24 * H), room_url: SENTINEL_PROVIDER_URL,
  booking_link_round: 'first', booking_link_sent_at: at(-4 * 24 * H), full_name: 'Ann Lee', personal_email: 'ann.personal@mail.example', job_address: 'ann.jobs@mail.example', ...over });
type Sent = { to: string; subject: string; text: string; replyTo?: string; icalEvent?: unknown };
const sent = () => mockMail.mock.calls.map((c) => c[0] as Sent);

beforeEach(() => {
  db.iv = [iv()]; db.events.clear(); db.items.clear(); db.sql = []; mockLedger.clear();
  mockMail.mockReset().mockImplementation(async () => ({ messageId: 'm' }));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('dueReminders (pure, UTC instants)', () => {
  const booked = at(-3 * 24 * H);
  it('24 h from 24 h before until 1 h before; 1 h from 1 h before until the start; nothing after', () => {
    expect(dueReminders(START, booked, at(-24 * H - 1))).toEqual([]);
    expect(dueReminders(START, booked, at(-24 * H))).toEqual(['24h']);
    expect(dueReminders(START, booked, at(-H - 1))).toEqual(['24h']);
    expect(dueReminders(START, booked, at(-H))).toEqual(['1h']);
    expect(dueReminders(START, booked, at(0))).toEqual([]);
  });
  it('a confirmation sent after a mark replaces that reminder (it is the fresher message)', () => {
    expect(dueReminders(START, at(-5 * H), at(-2 * H))).toEqual([]);
    expect(dueReminders(START, at(-5 * H), at(-30 * 60_000))).toEqual(['1h']);
    expect(dueReminders(START, at(-30 * 60_000), at(-10 * 60_000))).toEqual([]);
  });
  it('DST fall-back: an interview at 1:30 AM CST on Nov 1 (the second 1:30) is reminded at 06:30Z, the first 1:30 (CDT)', () => {
    const start = new Date('2026-11-01T07:30:00Z');
    expect(dueReminders(start, new Date('2026-10-28T12:00:00Z'), new Date('2026-11-01T06:29:59Z'))).toEqual(['24h']);
    expect(dueReminders(start, new Date('2026-10-28T12:00:00Z'), new Date('2026-11-01T06:30:00Z'))).toEqual(['1h']);
    expect(learnerReminderEmail('1h', { candidateName: 'Ann', company: 'Acme', position: null, startsAt: start, minutes: 30, bookerTz: null }, 'x').text).toContain('Sun, Nov 1, 1:30 AM CST');
  });
});

describe('reminders', () => {
  it('run twice inside the window: ONE reminder per recipient; each carries its consent-room page and never the provider link', async () => {
    await runBookingScheduler(at(-23 * H), opts);
    await runBookingScheduler(at(-22 * H), opts);
    expect(sent().map((m) => [m.to, m.subject])).toEqual([['ann.personal@mail.example', LEARNER_REMINDER_SUBJECT['24h']],
      ['pat@acme.example', EMPLOYER_REMINDER_SUBJECT['24h']], ['kim@acme.example', EMPLOYER_REMINDER_SUBJECT['24h']]]);
    for (const m of sent()) expectNoRoomUrl({ subject: m.subject, text: m.text, replyTo: m.replyTo, ics: m.icalEvent });
    expect(sent()[0].text).toContain('https://enterprise.colaberry.ai/portal/career/interview/iv-1');
    expect(sent()[1].text).toMatch(/https:\/\/hire\.refactored\.ai\/room\/\?i=iv-1&e=\d+&t=[A-Za-z0-9_-]{43}/);
    expect(db.events.has(`reminder_done:24h:iv-1:${START.toISOString()}`)).toBe(true);
    expect(db.sql.find((s) => s.includes(":now AND i.starts_at <= :horizon"))).not.toMatch(/room_url/);
  });
  it('then the 1 h reminder; a rescheduled interview gets FRESH reminders for its new time', async () => {
    await runBookingScheduler(at(-23 * H), opts);
    await runBookingScheduler(at(-30 * 60_000), opts);
    expect(sent().filter((m) => m.subject === LEARNER_REMINDER_SUBJECT['1h'])).toHaveLength(1);
    const NEW = new Date(START.getTime() + 2 * 24 * H);
    Object.assign(db.iv[0], { starts_at: NEW, confirm_done_at: at(-H) }); // rebooked two days later
    await runBookingScheduler(new Date(NEW.getTime() - 20 * H), opts);
    expect(sent().filter((m) => m.subject === LEARNER_REMINDER_SUBJECT['24h'])).toHaveLength(2);
    expect(sent().at(-1)?.text).toContain('Thu, Nov 26');
  });
  it('employer switch OFF: the learner is reminded, the employer side is HELD (one keyed row); not allow-listed: no learner mail', async () => {
    await runBookingScheduler(at(-23 * H), { read: async () => null, learnerAllowed: allowed });
    expect(sent().map((m) => m.to)).toEqual(['ann.personal@mail.example']);
    expect(db.events.get(`reminder_held:24h:iv-1:${START.toISOString()}`)?.payload.reason).toBe('held: employer email is switched off');
    db.iv = [iv({ id: 'iv-2' })];
    await runBookingScheduler(at(-23 * H), { read: ON });
    expect(sent().filter((m) => m.subject === LEARNER_REMINDER_SUBJECT['24h'])).toHaveLength(1);
  });
  it('a failing send is retried on the next passes, then given up ONCE after MAX_TRIES; the ones that went are never repeated', async () => {
    mockMail.mockImplementation(async (m: Sent) => (m.to === 'kim@acme.example' ? { messageId: undefined } : { messageId: 'ok' }));
    for (let i = 0; i < MAX_TRIES + 2; i++) await runBookingScheduler(at(-23 * H + i * 5 * 60_000), opts);
    expect(sent().filter((m) => m.to === 'kim@acme.example')).toHaveLength(MAX_TRIES);
    expect(sent().filter((m) => m.to === 'pat@acme.example')).toHaveLength(1);
    expect(db.events.get(`reminder_done:24h:iv-1:${START.toISOString()}`)?.payload).toEqual({ gave_up: true });
    expect(console.error).toHaveBeenCalledTimes(1);
  });
  it('not booked, not confirmed yet, already past, or more than 24 h away: nothing', async () => {
    db.iv = [iv({ id: 'a', state: 'cancelled' }), iv({ id: 'b', confirm_done_at: null }), iv({ id: 'c', starts_at: at(-24 * H) }), iv({ id: 'd', starts_at: at(26 * H) })];
    await runBookingScheduler(at(-23 * H), opts);
    expect(mockMail).not.toHaveBeenCalled();
  });
});

describe('the 24 h nudge', () => {
  const link = (over: Partial<Iv> = {}) => iv({ state: 'awaiting', starts_at: null, confirm_done_at: null, booking_link_sent_at: at(-25 * H), ...over });
  it('a link unused for 24 h: ONE review item "Not booked in 24 h" and ONE nudge, however many passes', async () => {
    db.iv = [link()];
    await runBookingScheduler(START, opts);
    await runBookingScheduler(at(5 * 60_000), opts);
    expect([...db.items.values()]).toEqual([{ kind: 'not_booked', interview_id: 'iv-1', summary: expect.objectContaining({ title: 'Not booked in 24 h', company: 'Acme' }) }]);
    expect(sent().map((m) => [m.to, m.subject, m.replyTo])).toEqual([['pat@acme.example', NUDGE_SUBJECT, 'ann.jobs@mail.example']]);
    expectNoRoomUrl({ text: sent()[0].text });
  });
  it('switch OFF: the review item still appears, the nudge is held; under 24 h, or booked: nothing', async () => {
    db.iv = [link()];
    await runBookingScheduler(START, { read: async () => null });
    expect([db.items.size, mockMail.mock.calls.length, db.events.has('booking_nudge_held:iv-1:first')]).toEqual([1, 0, true]);
    db.iv = [link({ id: 'iv-2', booking_link_sent_at: at(-23 * H) }), link({ id: 'iv-3', state: 'booked', starts_at: at(48 * H) })];
    db.items.clear();
    await runBookingScheduler(START, opts);
    expect([db.items.size, mockMail.mock.calls.length]).toEqual([0, 0]);
  });
});

describe('the pass', () => {
  it('overlapping ticks: the second returns at once; the flag is released after a crash', async () => {
    const [a, b] = await Promise.all([runBookingScheduler(at(-23 * H), opts), runBookingScheduler(at(-23 * H), opts)]);
    expect([a.reminded, b]).toEqual([1, { reminded: 0, nudged: 0, overlapped: true }]);
    const push = db.sql.push;
    db.sql.push = () => { throw Object.assign(new Error('db gone'), { name: 'SequelizeConnectionError' }); };
    await expect(runBookingScheduler(at(-22 * H), opts)).rejects.toThrow('db gone');
    db.sql.push = push;
    expect((await runBookingScheduler(at(-22 * H), opts)).overlapped).toBeUndefined();
  });
  it('copy: no en or em dash and never the word "free"', () => {
    const DASH_OR_FREE = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\bfree\\b`, 'i');
    const f = { candidateName: 'Ann', company: 'Acme', position: 'Analyst', startsAt: START, minutes: 30, bookerTz: 'America/New_York' };
    for (const m of [learnerReminderEmail('24h', f, 'x'), learnerReminderEmail('1h', f, 'x'), employerReminderEmail('24h', f, 'x'), employerReminderEmail('1h', f, 'x'), nudgeEmail(f)]) {
      expect(`${m.subject}\n${m.text}`).not.toMatch(DASH_OR_FREE);
    }
  });
});
