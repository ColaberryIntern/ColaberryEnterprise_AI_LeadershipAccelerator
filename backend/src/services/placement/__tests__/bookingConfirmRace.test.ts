/**
 * CP8.2b: two after-booking runs at once (a replayed confirm racing the original) PLUS the recovery sweep, through the
 * REAL ZoomMeetAdapter -> createMeetingIdempotent -> zoomService.createMeeting path. Only the HTTP edge (zoomApiRequest,
 * with a slow POST) and the database are stand-ins. The Zoom ledger's claim is atomic (ON CONFLICT), and a meeting is
 * listed by Zoom only once its POST has answered, which is exactly the window where a second run used to create a
 * second, orphaned meeting. Expected: ONE Zoom POST, one stored meeting, one message per recipient.
 */
type Iv = { id: string; enrollment_id: string; state: string; company: string; position: string; contact_email: string; starts_at: Date; minutes: number;
  interviewer_emails: string[]; booker_tz: string; room_provider_id: string | null; room_url: string | null; confirm_attempts: number;
  confirm_last_attempt_at: Date | null; confirm_done_at: Date | null; updated_at: Date; full_name: string; personal_email: string; job_address: string };
type R = Record<string, unknown>;
import { prepLinkAnswer, prepStore } from './helpers/fakePrepLink';
// clock = the DATABASE clock (what NOW() answers); a test moves it to model a slow pass.
const db = { iv: [] as Iv[], events: new Set<string>(), clock: new Date(0), ledger: new Map<string, { state: string; meeting_id: string | null; join_url: string | null; host_email: string }>(), prep: prepStore() };
const t = (d: unknown) => (d as Date).getTime();
function placement(sql: string, r: R): [unknown[], number] | null {
  const linked = prepLinkAnswer(db.prep, sql, r);
  if (linked) return linked;
  const i = db.iv.find((x) => x.id === r.id);
  if (sql.includes('LEFT JOIN job_search_inboxes j')) return [i ? [{ ...i, room_url: undefined }] : [], 0];
  if (sql.includes('SET confirm_attempts = confirm_attempts + 1')) {
    if (!i || i.state !== 'booked' || i.confirm_done_at || t(i.starts_at) !== t(r.start)) return [[], 0];
    // the lease exactly as the statement words it: on the database clock, or on a caller-supplied :lease
    const cutoff = /confirm_last_attempt_at < NOW\(\) - INTERVAL '120 seconds'/.test(sql) ? t(db.clock) - 120_000 : /confirm_last_attempt_at < :lease/.test(sql) ? t(r.lease) : Infinity;
    if (i.confirm_last_attempt_at && t(i.confirm_last_attempt_at) >= cutoff) return [[], 0];
    Object.assign(i, { confirm_attempts: i.confirm_attempts + 1, confirm_last_attempt_at: /confirm_last_attempt_at = NOW\(\)/.test(sql) ? db.clock : r.now });
    return [[{ confirm_attempts: i.confirm_attempts }], 1];
  }
  if (sql.includes('SET room_provider_id = :pid')) {
    if (i && !i.room_provider_id && /room_provider_id IS NULL/.test(sql)) Object.assign(i, { room_provider_id: r.pid, room_url: r.url });
    return [[], 1];
  }
  if (sql.includes('SET confirm_done_at = :now')) { if (i && !i.confirm_done_at) i.confirm_done_at = r.now as Date; return [[], 1]; }
  if (sql.includes('INSERT INTO placement_events')) { db.events.add(String(r.src)); return [[], 1]; }
  if (sql.includes('SELECT i.id FROM placement_interviews i')) {
    return [db.iv.filter((x) => x.state === 'booked' && !x.confirm_done_at && x.confirm_attempts === 0
      && /updated_at < NOW\(\) - INTERVAL '120 seconds'/.test(sql) && t(x.updated_at) < t(db.clock) - 120_000).map((x) => ({ id: x.id })), 0];
  }
  return null;
}
function zoomLedger(sql: string, r: R): [unknown[], number] {
  const rid = String(r.rid);
  if (/INSERT INTO zoom_meeting_requests[\s\S]*ON CONFLICT \(request_id\) DO NOTHING/.test(sql)) {
    if (db.ledger.has(rid)) return [[], 0];
    db.ledger.set(rid, { state: 'pending', meeting_id: null, join_url: null, host_email: String(r.host ?? '') });
    return [[{ request_id: rid }], 1];
  }
  if (sql.includes('FROM zoom_meeting_requests WHERE request_id = :rid')) { const l = db.ledger.get(rid); return [l ? [{ request_id: rid, attempts: 0, ...l }] : [], 0]; }
  if (sql.includes("SET state = 'created'")) { Object.assign(db.ledger.get(rid) ?? {}, { state: 'created', meeting_id: r.mid, join_url: r.url }); return [[], 1]; }
  if (sql.includes('SET attempts = attempts + 1')) return [[], 1];
  throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
}
jest.mock('../../../config/database', () => ({ sequelize: { query: async (s: string, o: { replacements?: R } = {}) => placement(s, o.replacements ?? {}) ?? zoomLedger(s, o.replacements ?? {}) } }));
jest.mock('../../../config/env', () => ({ env: { zoomHostEmail: 'host@refactored.example', emailFrom: 'team@refactored.example', frontendUrl: 'https://enterprise.colaberry.ai', jwtSecret: 'test-secret' } }));
const mockPosts: Array<{ agenda: string; settings: Record<string, unknown> }> = [];
const mockListed: Array<{ id: number; agenda: string; join_url: string }> = [];
/** A test's hook into each POST as it starts (the agenda names the request), e.g. to move the clock or start a racer. */
let mockOnPost: (agenda: string) => void = () => undefined;
jest.mock('../../zoom/zoomApiClient', () => ({
  assertZoomConfigured: () => undefined,
  getZoomAccessToken: async () => 'tok',
  zoomApiRequest: async (method: string, _p: string, body: { agenda: string; settings: Record<string, unknown> }) => {
    if (method === 'GET') return { meetings: [...mockListed] };
    mockPosts.push(body);
    mockOnPost(body.agenda);
    const id = 999 + mockPosts.length;
    await new Promise((res) => setTimeout(res, 150)); // Zoom is slow; the meeting is listed only once the POST answered
    mockListed.push({ id, agenda: body.agenda, join_url: `https://zoom.example/j/${id}` });
    return { id, join_url: `https://zoom.example/j/${id}`, settings: { ...body.settings } };
  },
}));
const mockSent = new Map<string, number>();
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (id: { recipient: string; subject: string; businessEventId: string }, send: () => Promise<{ ok: boolean }>) => {
    const key = `${id.recipient}|${id.subject}|${id.businessEventId}`;
    if (mockSent.has(key)) return { outcome: 'skipped', reason: 'already_sent', idempotencyKey: key };
    mockSent.set(key, 0);
    await send();
    mockSent.set(key, (mockSent.get(key) ?? 0) + 1);
    return { outcome: 'sent', ledgerId: key, idempotencyKey: key };
  },
}));
const mockMail = jest.fn(async (_m: unknown) => ({ messageId: 'm' }));
jest.mock('../../emailService', () => ({ guardedSendMail: (m: unknown) => mockMail(m), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
jest.mock('../../caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
jest.mock('../../careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: async () => true }));
jest.mock('../../settingsService', () => ({ getSetting: async () => true }));

import { finishBooking } from '../bookingConfirm';
import { sweepBookingConfirms } from '../bookingConfirmSweep';

const NOW = new Date('2026-11-20T18:00:00Z');
const LATER = new Date(NOW.getTime() + 3 * 60_000); // past the sweep's 2-minute grace
beforeEach(() => {
  db.iv = [{ id: 'iv-1', enrollment_id: 'enr-ann', state: 'booked', company: 'Acme', position: 'Data Analyst', contact_email: 'pat@acme.example',
    starts_at: new Date('2026-11-23T15:00:00Z'), minutes: 30, interviewer_emails: ['kim@acme.example'], booker_tz: 'America/Chicago', room_provider_id: null,
    room_url: null, confirm_attempts: 0, confirm_last_attempt_at: null, confirm_done_at: null, updated_at: NOW, full_name: 'Ann Lee',
    personal_email: 'ann.personal@mail.example', job_address: 'ann.jobs@mail.example' }];
  db.clock = LATER; mockOnPost = () => undefined; db.prep = prepStore();
  db.events.clear(); db.ledger.clear(); mockPosts.length = 0; mockListed.length = 0; mockSent.clear(); mockMail.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('the original run, a replayed confirm and the sweep at once: ONE Zoom POST, one stored meeting, one message per recipient', async () => {
  const runs = await Promise.all([finishBooking('iv-1', { now: LATER }), finishBooking('iv-1', { now: LATER }), sweepBookingConfirms(LATER)]);
  expect(mockPosts).toHaveLength(1);
  expect(mockPosts[0].settings.auto_recording).toBe('none');
  expect(db.iv[0].room_provider_id).toBe('1000');
  expect([...mockSent.values()]).toEqual([1, 1, 1]); // learner, employer, one interviewer
  expect(mockMail).toHaveBeenCalledTimes(3);
  expect(runs.slice(0, 2).map((r) => (r as { status: string }).status).sort()).toEqual(['busy', 'done']);
  // CP8.3: the learner's prep row (the in-app notice) is ONE row however many runs raced
  expect(db.prep.rows.map((p) => [p.placement_interview_id, p.enrollment_id, p.source])).toEqual([['iv-1', 'enr-ann', 'real']]);
  // and a later run (lease lapsed, booking done) creates nothing more
  await finishBooking('iv-1', { now: new Date(LATER.getTime() + 10 * 60_000) });
  expect(mockPosts).toHaveLength(1);
});

it('a SLOW sweep pass (its first item takes longer than the lease): a racer on a later item, mid-POST, still makes ONE meeting for it', async () => {
  db.iv.push({ ...db.iv[0], id: 'iv-2', contact_email: 'lee@beta.example', interviewer_emails: [] });
  let racer: Promise<unknown> | null = null;
  mockOnPost = (agenda) => {
    // iv-1's create takes 3 minutes on the database clock: the sweep's single `now` is stale for iv-2 by then
    if (agenda.includes('[req:placement-interview-iv-1-')) db.clock = new Date(db.clock.getTime() + 3 * 60_000);
    // while the sweep's own run on iv-2 is mid-POST, a replayed confirm (no `now`) starts a run on iv-2
    if (agenda.includes('[req:placement-interview-iv-2-') && !racer) racer = finishBooking('iv-2');
  };
  await sweepBookingConfirms(LATER);
  await racer;
  expect(racer).not.toBeNull();
  expect(mockPosts.filter((p) => p.agenda.includes('[req:placement-interview-iv-2-'))).toHaveLength(1);
  expect(mockPosts.filter((p) => p.agenda.includes('[req:placement-interview-iv-1-'))).toHaveLength(1);
  expect(db.iv.map((i) => i.room_provider_id)).toEqual(['1000', '1001']);
});
