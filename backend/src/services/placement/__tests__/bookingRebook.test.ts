/**
 * CP8.2b: a booked interview rescheduled and booked again. The REAL confirmBooking and the REAL finishBooking run
 * against one stand-in database whose booked UPDATE is applied from the statement's own SET list (every assignment is
 * read from the SQL text; one it does not understand fails the test), so the resets the test relies on are exactly the
 * ones confirmBooking sends. Expected: a NEW time gets a new room (and its invites point at it); the SAME time keeps its
 * room, whether by a double-click replay or a rebook at that time.
 */
type Row = Record<string, unknown> & { id: string; state: string; starts_at: Date | null; room_provider_id: string | null };
type R = Record<string, unknown>;
const db = { iv: [] as Row[], events: new Set<string>(), clock: new Date('2026-11-20T18:00:00Z') };
const byId = (id: unknown) => db.iv.find((x) => x.id === id) as Row;

/** One SET assignment's value, evaluated against the OLD row (SQL semantics). */
function value(expr: string, old: Row, r: R): unknown {
  const e = expr.trim();
  if (e === 'NULL') return null;
  if (e === '0') return 0;
  if (e === 'NOW()') return db.clock;
  if (/^'[a-z]+'$/.test(e)) return e.slice(1, -1);
  if (/^:\w+$/.test(e)) return r[e.slice(1)];
  if (e === 'ARRAY[:emails]::text[]') return r.emails;
  if (e === "'{}'::text[]") return [];
  const c = /^CASE WHEN starts_at IS DISTINCT FROM :at THEN NULL ELSE (\w+) END$/.exec(e);
  if (c) return (old.starts_at as Date | null)?.getTime() !== (r.at as Date).getTime() ? null : old[c[1]];
  throw new Error(`the stand-in does not understand: ${e}`);
}
function applySet(sql: string, r: R): void {
  const i = byId(r.id);
  const set = sql.slice(sql.indexOf(' SET ') + 5, sql.lastIndexOf(' WHERE id = :id')).replace(/\s+/g, ' ');
  const pairs = set.split(/, (?=\w+ = )/).map((p) => { const k = p.indexOf(' = '); return [p.slice(0, k).trim(), p.slice(k + 3)] as const; });
  const next = Object.fromEntries(pairs.map(([k, v]) => [k, value(v, i, r)]));
  Object.assign(i, next);
}
function answer(sql: string, r: R): [unknown[], number] {
  const i = byId(r.id);
  if (sql.includes('WHERE i.booking_token_hash = :h')) return [db.iv.filter((x) => x.booking_token_hash === r.h).map((x) => ({ ...x })), 0];
  if (sql.includes('pg_advisory_xact_lock')) return [[], 0];
  if (sql.includes("SET state = 'booked'")) { applySet(sql, r); return [[], 1]; }
  if (sql.includes('INSERT INTO placement_events')) { db.events.add(String(r.src)); return [[], 1]; }
  if (sql.includes('LEFT JOIN job_search_inboxes j')) return [i ? [{ ...i, room_url: undefined }] : [], 0];
  if (sql.includes('SET confirm_attempts = confirm_attempts + 1')) {
    if (!i || i.state !== 'booked' || i.confirm_done_at || (i.starts_at as Date).getTime() !== (r.start as Date).getTime()) return [[], 0];
    if (i.confirm_last_attempt_at && (i.confirm_last_attempt_at as Date).getTime() >= db.clock.getTime() - 120_000) return [[], 0];
    Object.assign(i, { confirm_attempts: Number(i.confirm_attempts) + 1, confirm_last_attempt_at: db.clock });
    return [[{ confirm_attempts: i.confirm_attempts }], 1];
  }
  if (sql.includes('SET room_provider_id = :pid')) { if (!i.room_provider_id) Object.assign(i, { room_provider_id: r.pid, room_url: r.url }); return [[], 1]; }
  if (sql.includes('SET confirm_done_at = :now')) { if (!i.confirm_done_at) i.confirm_done_at = r.now; return [[], 1]; }
  throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
}
jest.mock('../../../config/database', () => ({ sequelize: {
  query: async (s: string, o: { replacements?: R } = {}) => answer(s, o.replacements ?? {}),
  transaction: async (fn: (t: unknown) => Promise<unknown>) => fn('tx'),
} }));
jest.mock('../../../config/env', () => ({ env: { emailFrom: 'team@refactored.example', frontendUrl: 'https://enterprise.colaberry.ai', jwtSecret: 'test-secret' } }));
jest.mock('../../hire/hireInterviews', () => ({ heldTimes: async () => [] }));
jest.mock('../../hire/hireStudioSettings', () => ({ readAvailability: async () => ({ enabled: true, tz: 'America/Chicago', blocks: ['Mon-morning', 'Tue-morning'], maxPerWeek: null, minNoticeHours: 0 }) }));
const mockCreate = jest.fn();
jest.mock('../../communityRooms/meetingProvider', () => ({ getMeetingProvider: () => ({ createMeeting: (i: unknown) => mockCreate(i) }) }));
const mockSent = new Set<string>();
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (id: { recipient: string; subject: string; businessEventId: string }, send: () => Promise<unknown>) => {
    const key = `${id.recipient}|${id.subject}|${id.businessEventId}`;
    if (mockSent.has(key)) return { outcome: 'skipped', reason: 'already_sent', idempotencyKey: key };
    mockSent.add(key); await send();
    return { outcome: 'sent', ledgerId: key, idempotencyKey: key };
  },
}));
const mockMail = jest.fn(async (_m: unknown) => ({ messageId: 'm' }));
jest.mock('../../emailService', () => ({ guardedSendMail: (m: unknown) => mockMail(m), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
jest.mock('../../caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
jest.mock('../../careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: async () => true }));
jest.mock('../../settingsService', () => ({ getSetting: async () => true }));

import { confirmBooking } from '../bookingService';
import { finishBooking } from '../bookingConfirm';
import { newBookingToken } from '../bookingToken';

const NOW = new Date('2026-11-20T18:00:00Z');
const MON9 = '2026-11-23T15:00:00.000Z';
const TUE9 = '2026-11-24T15:00:00.000Z';
const input = (slot: string) => ({ slot, tz: 'America/Chicago', interviewers: [] as string[] });
/** The reschedule (interviewIngest: booked -> new) and the new booking link (bookingReply): their own suites cover them. */
function rescheduleWithNewLink(): string {
  const t = newBookingToken(NOW);
  Object.assign(db.iv[0], { state: 'new', booking_token_hash: t.hash, token_expires_at: t.expiresAt, token_used_at: null });
  return t.token;
}
const later = (min: number) => { db.clock = new Date(db.clock.getTime() + min * 60_000); return db.clock; };
const ids = () => mockCreate.mock.calls.map((c) => (c[0] as { requestId: string }).requestId);

beforeEach(() => {
  const t = newBookingToken(NOW);
  db.iv = [{ id: 'iv-1', enrollment_id: 'enr-ann', state: 'new', company: 'Acme', position: 'Data Analyst', minutes: null, contact_email: 'pat@acme.example',
    full_name: 'Ann Lee', personal_email: 'ann.personal@mail.example', job_address: 'ann.jobs@mail.example', booking_token_hash: t.hash, token_expires_at: t.expiresAt,
    token_used_at: null, starts_at: null, interviewer_emails: [], booker_tz: null, room_provider_id: null, room_url: null, confirm_attempts: 0,
    confirm_last_attempt_at: null, confirm_done_at: null }];
  db.events.clear(); db.clock = NOW; mockSent.clear(); mockMail.mockClear();
  let n = 0;
  mockCreate.mockReset().mockImplementation(async () => ({ providerEventId: `zm-${++n}`, joinUrl: `https://zoom.example/j/${n}` }));
  first = t.token;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
let first = '';
const firstToken = () => first;

describe('reschedule, then book again', () => {
  it('a NEW time: the old meeting is dropped by the booking itself, a new room is made for the new time, and the invites carry it', async () => {
    expect((await confirmBooking(firstToken(), input(MON9), NOW)).status).toBe('booked');
    await finishBooking('iv-1', { now: NOW });
    expect(db.iv[0].room_provider_id).toBe('zm-1');
    const second = rescheduleWithNewLink();
    expect((await confirmBooking(second, input(TUE9), later(10))).status).toBe('booked');
    expect([db.iv[0].room_provider_id, db.iv[0].room_url, db.iv[0].confirm_done_at, db.iv[0].confirm_attempts]).toEqual([null, null, null, 0]);
    expect((await finishBooking('iv-1', { now: db.clock })).status).toBe('done');
    expect(ids()).toEqual([`placement-interview-iv-1-${MON9}`, `placement-interview-iv-1-${TUE9}`]);
    expect(db.iv[0].room_provider_id).toBe('zm-2');
    expect(mockMail.mock.calls.slice(2).every((c) => /Tue, Nov 24, 9:00 AM CST/.test((c[0] as { text: string }).text))).toBe(true);
  });
  it('the SAME time keeps its room: a double-click replay, and a rebook at that time after a reschedule', async () => {
    await confirmBooking(firstToken(), input(MON9), NOW);
    await finishBooking('iv-1', { now: NOW });
    expect(await confirmBooking(firstToken(), input(MON9), NOW)).toMatchObject({ status: 'booked', replay: true });
    expect(db.iv[0].room_provider_id).toBe('zm-1');
    const second = rescheduleWithNewLink();
    expect((await confirmBooking(second, input(MON9), later(10))).status).toBe('booked');
    expect(db.iv[0].room_provider_id).toBe('zm-1');
    await finishBooking('iv-1', { now: db.clock });
    expect([mockCreate.mock.calls.length, mockMail.mock.calls.length]).toEqual([1, 2]); // no new room; the messages for that time already went
  });
});
