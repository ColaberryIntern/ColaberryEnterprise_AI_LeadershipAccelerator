/**
 * CP8.2 (kit F4 step 3): the booking page's data and its one write. The database is an in-memory stand-in for the
 * statements bookingService sends (each change applied only as the statement says it); a transaction holds the locks it
 * takes (one at a time) and rolls back on a throw. The Hire profile's held times and the availability are spies.
 * The same race runs on Postgres in bookingService.integration.test.ts (CI integration tier).
 */
type Iv = { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; minutes: number | null; booking_token_hash: string | null;
  token_expires_at: Date | null; token_used_at: Date | null; starts_at: Date | null; full_name: string | null; interviewer_emails: string[]; booker_tz: string | null; room_url: string | null; providerEventId: string | null };
type R = { h?: string; id?: string; to?: string; event?: string; from?: string; src?: string; e?: string; self?: string; at?: Date; m?: number; now?: Date; emails?: string[]; tz?: string; k?: string };
const db = { iv: [] as Iv[], events: [] as Array<{ id: string; event: string; from: string | null; to: string; src: string }>, locks: [] as string[], cancelOnLock: '' };
const byId = (id: unknown) => db.iv.find((x) => x.id === id) as Iv;
function answer(sql: string, r: R): [unknown[], number] {
  if (sql.includes('WHERE i.booking_token_hash = :h')) {
    if (/FOR UPDATE/.test(sql)) db.locks.push('row');
    const i = db.iv.find((x) => x.booking_token_hash === r.h);
    if (i && db.cancelOnLock === i.id && /FOR UPDATE/.test(sql)) i.state = 'cancelled'; // ingest cancelled it just before the lock
    return [i ? [{ ...i }] : [], 0];
  }
  if (sql.includes('pg_advisory_xact_lock')) { db.locks.push(`advisory:${r.k}`); return [[], 0]; }
  if (sql.includes('SELECT state FROM placement_interviews WHERE id = :id FOR UPDATE')) return [[{ state: byId(r.id).state }], 0];
  if (sql.includes('UPDATE placement_interviews SET state = :to')) { byId(r.id).state = String(r.to); return [[], 1]; }
  if (sql.includes("SET state = 'booked'")) {
    Object.assign(byId(r.id), { state: 'booked', starts_at: r.at, minutes: r.m, token_used_at: r.now, booker_tz: r.tz, interviewer_emails: /'\{\}'::text\[\]/.test(sql) ? [] : r.emails });
    return [[], 1];
  }
  if (sql.includes('INSERT INTO placement_events')) {
    if (db.events.some((e) => e.src === r.src)) return [[], 0];
    db.events.push({ id: String(r.id), event: sql.includes("'booked', :from, 'booked'") ? 'booked' : String(r.event), from: (r.from as string) ?? null, to: sql.includes("'booked', :from, 'booked'") ? 'booked' : String(r.to), src: String(r.src) });
    return [[], 1];
  }
  throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
}
let lock: Promise<unknown> = Promise.resolve();
jest.mock('../../../config/database', () => ({ sequelize: {
  query: async (s: string, o: { replacements?: R } = {}) => answer(s, o.replacements ?? {}),
  transaction: (fn: (t: unknown) => Promise<unknown>) => {
    const run = lock.then(async () => { const snap = JSON.stringify(db.iv); try { return await fn('tx'); } catch (e) { db.iv = JSON.parse(snap); throw e; } });
    lock = run.catch(() => undefined);
    return run;
  },
} }));
const mockHireHeld = jest.fn();
jest.mock('../../hire/hireInterviews', () => ({ heldTimes: (...a: unknown[]) => mockHireHeld(...a) }));
const mockAvailability = jest.fn();
jest.mock('../../hire/hireStudioSettings', () => ({ readAvailability: (...a: unknown[]) => mockAvailability(...a) }));

import { bookingView, confirmBooking, BUFFER_MINUTES, RECORDING_NOTICE } from '../bookingService';
import { hashBookingToken, newBookingToken } from '../bookingToken';
import { verifyRoomLink } from '../roomLink';
import { expectNoRoomUrl, SENTINEL_PROVIDER_URL } from './helpers/noRoomUrl';

const NOW = new Date('2026-11-20T18:00:00Z'); // Fri 12:00 PM CST
const TOKEN = newBookingToken(NOW).token;
const OTHER = newBookingToken(NOW).token;
const MON9 = '2026-11-23T15:00:00.000Z'; // Mon 9:00 AM CST
const iv = (over: Partial<Iv> = {}): Iv => ({ id: 'iv-1', enrollment_id: 'enr-ann', state: 'new', company: 'Acme', position: 'Data Analyst', minutes: null,
  booking_token_hash: hashBookingToken(TOKEN), token_expires_at: new Date(NOW.getTime() + 14 * 86_400_000), token_used_at: null, starts_at: null, full_name: 'Ann Marie Lee',
  interviewer_emails: [], booker_tz: null,
  // Seeded on purpose: the stored provider link and id ride in every row the stand-in returns for a broad select, so a
  // response built by spreading a row would carry them and expectNoRoomUrl would fail.
  room_url: SENTINEL_PROVIDER_URL, providerEventId: 'zoom-123', ...over });
const avail = (over: Record<string, unknown> = {}) => ({ enabled: true, tz: 'America/Chicago', blocks: ['Mon-morning'], formats: ['intro'], maxPerWeek: null, minNoticeHours: 0, autoConfirm: false, ...over });
let hireExtra: Array<{ startsAt: Date; minutes: number }> = [];
const confirmIn = (slot = MON9) => ({ slot, tz: 'America/New_York', interviewers: ['pat@acme.example'] });

beforeEach(() => {
  db.iv = [iv()]; db.events = []; db.locks = []; db.cancelOnLock = ''; hireExtra = [];
  // heldTimes (hireInterviews.ts) reads the Hire interviews AND the booked placement interviews; the stand-in does the same.
  mockHireHeld.mockReset().mockImplementation(async (eid: string) => [...hireExtra,
    ...db.iv.filter((i) => i.enrollment_id === eid && i.state === 'booked' && i.starts_at).map((i) => ({ startsAt: new Date(i.starts_at as Date), minutes: Number(i.minutes ?? 30) }))]);
  mockAvailability.mockReset().mockResolvedValue(avail());
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('bookingView', () => {
  it('the first name, the role, 30 minutes by default, the recording notice and the open times in Central (+ the booker zone)', async () => {
    const r = await bookingView(TOKEN, { now: NOW, tz: 'America/New_York' });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.view).toMatchObject({ candidate: 'Ann', company: 'Acme', position: 'Data Analyst', minutes: 30, recordingNotice: RECORDING_NOTICE, reason: null });
    expect(r.view.slots[0]).toEqual({ startsAt: MON9, central: 'Mon, Nov 23, 9:00 AM CST', local: 'Mon, Nov 23, 10:00 AM EST' });
    expect(r.view.slots.map((s) => s.startsAt)).toEqual(['2026-11-23T15:00:00.000Z', '2026-11-23T15:30:00.000Z', '2026-11-23T16:00:00.000Z', '2026-11-23T16:30:00.000Z', '2026-11-23T17:00:00.000Z', '2026-11-23T17:30:00.000Z']);
    expectNoRoomUrl(r);
    expect(JSON.stringify(r)).not.toMatch(/@|Marie|Lee/); // no email, no phone, no full name
  });
  it('opening the link moves new -> awaiting, once', async () => {
    await bookingView(TOKEN, { now: NOW });
    await bookingView(TOKEN, { now: NOW });
    expect(db.iv[0].state).toBe('awaiting');
    expect(db.events).toEqual([{ id: 'iv-1', event: 'link_opened', from: 'new', to: 'awaiting', src: 'link_opened:iv-1' }]);
  });
  it('a slot ten minutes after an existing interview ends is removed (the 15-minute buffer), across both kinds of held time', async () => {
    expect(BUFFER_MINUTES).toBe(15);
    hireExtra = [{ startsAt: new Date(MON9), minutes: 20 }]; // a Hire interview 9:00-9:20
    db.iv.push(iv({ id: 'iv-2', state: 'booked', booking_token_hash: null, starts_at: new Date('2026-11-23T17:00:00Z'), minutes: 20 })); // placement 11:00-11:20
    const r = await bookingView(TOKEN, { now: NOW });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.view.slots.map((s) => s.startsAt)).toEqual(['2026-11-23T16:00:00.000Z']); // 10:00 only (10:30 ends 11:00, 15 min before 11:00 is not free)
  });
  it('DST: the week of 2026-11-01 keeps 9 AM Central on both sides of the change', async () => {
    mockAvailability.mockResolvedValue(avail({ blocks: ['Fri-morning', 'Mon-morning'] }));
    const r = await bookingView(TOKEN, { now: new Date('2026-10-29T12:00:00Z') });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.view.slots.filter((s) => s.central.includes('9:00 AM')).map((s) => s.startsAt)).toEqual(['2026-10-30T14:00:00.000Z', '2026-11-02T15:00:00.000Z']);
  });
  it('availability off: no times, reason "arranging", and the interview goes to review (once)', async () => {
    mockAvailability.mockResolvedValue(avail({ enabled: false }));
    const r = await bookingView(TOKEN, { now: NOW });
    expect(r).toMatchObject({ status: 'ok', view: { slots: [], reason: 'arranging' } });
    await bookingView(TOKEN, { now: NOW });
    expect(db.iv[0].state).toBe('review');
    expect(db.events.map((e) => e.event)).toEqual(['booking_arranging']);
  });
  it('unknown or malformed token: not_found (malformed without a database read); used, expired, closed: gone', async () => {
    expect(await bookingView(OTHER, { now: NOW })).toEqual({ status: 'not_found' });
    expect(await bookingView('junk', { now: NOW })).toEqual({ status: 'not_found' });
    db.iv = [iv({ token_used_at: NOW })];
    expect(await bookingView(TOKEN, { now: NOW })).toEqual({ status: 'gone', reason: 'used' });
    db.iv = [iv()];
    expect(await bookingView(TOKEN, { now: new Date(NOW.getTime() + 14 * 86_400_000 + 1000) })).toEqual({ status: 'gone', reason: 'expired' });
    db.iv = [iv({ state: 'cancelled' })];
    expect(await bookingView(TOKEN, { now: NOW })).toEqual({ status: 'gone', reason: 'closed' });
  });
});

describe('confirmBooking', () => {
  it('books an open time: state booked, the token used, interviewers and zone kept, one booked event; the room PAGE link, signed', async () => {
    const r = await confirmBooking(TOKEN, confirmIn(), NOW);
    expect(r).toMatchObject({ status: 'booked', startsAt: MON9, minutes: 30, replay: false });
    expect(db.iv[0]).toMatchObject({ state: 'booked', starts_at: new Date(MON9), token_used_at: NOW, interviewer_emails: ['pat@acme.example'], booker_tz: 'America/New_York' });
    expect(db.events.filter((e) => e.event === 'booked')).toHaveLength(1);
    expectNoRoomUrl(r);
    const u = new URL((r as { roomPage: string }).roomPage);
    expect(verifyRoomLink({ i: String(u.searchParams.get('i')), e: String(u.searchParams.get('e')), t: String(u.searchParams.get('t')), now: NOW })).toBe(true);
    expect(Number(u.searchParams.get('e'))).toBe(Date.parse(MON9) + 30 * 60_000); // the link ends with the interview (+2 h grace)
  });
  it('the interview row is locked BEFORE the per-learner advisory lock (the Hire profile uses the same key)', async () => {
    await confirmBooking(TOKEN, confirmIn(), NOW);
    expect(db.locks).toEqual(['row', 'advisory:hire_interviews:enr-ann']);
  });
  it('the same confirm again (a double click) answers the same booking; another time with the used token is gone', async () => {
    await confirmBooking(TOKEN, confirmIn(), NOW);
    expect(await confirmBooking(TOKEN, confirmIn(), NOW)).toMatchObject({ status: 'booked', startsAt: MON9, replay: true });
    expect(await confirmBooking(TOKEN, confirmIn('2026-11-23T16:00:00.000Z'), NOW)).toEqual({ status: 'gone', reason: 'used' });
    expect(db.events.filter((e) => e.event === 'booked')).toHaveLength(1);
  });
  it('two bookers racing for one time (two interviews of one learner): one wins, the other is told it was taken', async () => {
    db.iv.push(iv({ id: 'iv-2', booking_token_hash: hashBookingToken(OTHER) }));
    const both = await Promise.all([confirmBooking(TOKEN, confirmIn(), NOW), confirmBooking(OTHER, confirmIn(), NOW)]);
    expect(both.map((r) => r.status).sort()).toEqual(['booked', 'taken']);
    expect(db.iv.filter((i) => i.state === 'booked')).toHaveLength(1);
  });
  it('carried (T15 c): cancelled by ingest between the page load and the lock: refused, nothing written', async () => {
    db.cancelOnLock = 'iv-1';
    expect(await confirmBooking(TOKEN, confirmIn(), NOW)).toEqual({ status: 'gone', reason: 'closed' });
    expect([db.iv[0].state, db.iv[0].token_used_at, db.events.length]).toEqual(['cancelled', null, 0]);
  });
  it('a time not open (outside the blocks, within the buffer, past, or beyond the grid) is taken; availability off is arranging', async () => {
    for (const slot of ['2026-11-24T15:00:00.000Z', '2026-11-23T15:10:00.000Z', '2026-11-20T15:00:00.000Z', '2026-12-07T15:00:00.000Z']) {
      expect(await confirmBooking(TOKEN, confirmIn(slot), NOW)).toEqual({ status: 'taken' });
    }
    hireExtra = [{ startsAt: new Date('2026-11-23T14:30:00Z'), minutes: 20 }]; // ends 8:50, buffer to 9:05
    expect(await confirmBooking(TOKEN, confirmIn(), NOW)).toEqual({ status: 'taken' });
    hireExtra = [];
    mockAvailability.mockResolvedValueOnce(avail({ enabled: false }));
    expect(await confirmBooking(TOKEN, confirmIn(), NOW)).toEqual({ status: 'arranging' });
    expect(db.iv[0].state).toBe('new');
  });
  it('no interviewer emails is fine (stored as an empty list), unknown and expired tokens are refused', async () => {
    expect((await confirmBooking(TOKEN, { slot: MON9, tz: 'America/Chicago', interviewers: [] }, NOW)).status).toBe('booked');
    expect(db.iv[0].interviewer_emails).toEqual([]);
    expect(await confirmBooking(OTHER, confirmIn(), NOW)).toEqual({ status: 'not_found' });
    db.iv = [iv()];
    expect(await confirmBooking(TOKEN, confirmIn(), new Date(NOW.getTime() + 15 * 86_400_000))).toEqual({ status: 'gone', reason: 'expired' });
  });
});
