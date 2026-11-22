/**
 * CP11.1a: the staff interview desk API through the REAL router, guard, schemas, service, actions and views. The two
 * stores are a HOSTILE stand-in (helpers/fakeDeskStore.ts: every row carries the sentinel provider link and the
 * learner's personal email and phone), so every response is deep-scanned with expectNoRoomUrl. The booking-link sender is
 * a stand-in that reads the REAL dark-switch rule; Send test runs the REAL inboxTestJob.sendTest guard while its switch
 * is off (the mailer and send ledger are spies: nothing leaves the process). The SQL runs on Postgres in
 * careerDeskStore.integration.test.ts.
 */
jest.mock('../../../services/placement/careerDeskStore', () => require('../../../services/placement/__tests__/helpers/fakeDeskStore').storeModule);
jest.mock('../../../services/placement/careerDeskOpsStore', () => require('../../../services/placement/__tests__/helpers/fakeDeskStore').opsModule);
const mockSettings: Record<string, unknown> = {};
jest.mock('../../../services/settingsService', () => ({ getSetting: async (k: string) => {
  if (mockSettings[k] === 'THROW') throw Object.assign(new Error('db'), { name: 'SequelizeConnectionError' });
  return mockSettings[k] ?? null;
} }));
const mockCp: string[] = [];
jest.mock('../../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: async (e: string) => mockCp.includes(e), careerPrepEnrollmentIds: async () => [...mockCp] }));
const mockMailer = jest.fn();
jest.mock('../../../services/emailService', () => ({ guardedSendMail: (...a: unknown[]) => mockMailer(...a), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
const mockLedger = jest.fn();
jest.mock('../../../services/email/idempotentSend', () => ({ sendOnce: (...a: unknown[]) => mockLedger(...a) }));
const mockSendOne = jest.fn();
jest.mock('../../../services/placement/bookingConfirm', () => ({ MAX_CONFIRM_ATTEMPTS: 3, EMAIL: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/, sendOne: (...a: unknown[]) => mockSendOne(...a) }));
const mockLinks: string[] = [];
jest.mock('../../../services/placement/bookingReply', () => ({
  sendBookingLink: async (id: string, o: { read?: (k: string) => Promise<unknown> }) => {
    const { deskDb } = require('../../../services/placement/__tests__/helpers/fakeDeskStore');
    const { isSwitchOn } = jest.requireActual('../../../services/placement/darkSwitches');
    const x = deskDb.interviews.find((r: { id: string }) => r.id === id);
    if (!x || x.state !== 'new') return { status: 'not_new' };
    if (x.booking_link_sent_at) return { status: 'not_owed' };
    if (!(await isSwitchOn('career_prep_employer_mail_enabled', o.read))) {
      const src = `booking_link_held:${id}:${x.booking_link_round}`;
      if (!deskDb.events.some((e: { src: string }) => e.src === src)) deskDb.events.push({ src });
      return { status: 'held' };
    }
    if (!x.contact_email) { x.state = 'review'; return { status: 'no_contact' }; }
    mockLinks.push(id); x.booking_link_sent_at = new Date(); return { status: 'sent' };
  },
}));
let mockTestImpl: ((...a: unknown[]) => Promise<unknown>) | null = null;
jest.mock('../../../services/placement/inboxTestJob', () => {
  const actual = jest.requireActual('../../../services/placement/inboxTestJob');
  return { ...actual, sendTest: (...a: unknown[]) => (mockTestImpl ? mockTestImpl(...a) : actual.sendTest(...a)) };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import { deskDb, resetDeskDb } from '../../../services/placement/__tests__/helpers/fakeDeskStore';
import { SENTINEL_PROVIDER_URL, expectNoRoomUrl } from '../../../services/placement/__tests__/helpers/noRoomUrl';
import { pathToSection } from '../../../middlewares/mgmtSectionGate';

const B = '/api/admin/placement/desk';
const ANN = '11111111-0000-4000-8000-000000000001'; const BOB = '22222222-0000-4000-8000-000000000002';
const IV = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CL = 'cccccccc-0000-4000-8000-000000000001';
const sign = (p: Record<string, unknown>) => `Bearer ${jwt.sign({ sub: 'staff-1', email: 's@example.com', ...p }, env.jwtSecret)}`;
const owner = () => sign({ role: 'admin', mgmt_role: 'owner' });
const noPlacement = () => sign({ role: 'admin', mgmt_role: 'support' });
const extra = () => sign({ role: 'admin', mgmt_role: 'support', mgmt_extra_sections: ['placement'] });
const T0 = new Date('2026-11-19T15:00:00Z');

function app(): express.Express {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use(require('../careerDeskRoutes').default);
  return a;
}
const DIRTY = { room_url: SENTINEL_PROVIDER_URL, meeting_link: SENTINEL_PROVIDER_URL, joinUrl: SENTINEL_PROVIDER_URL };

function seed(): void {
  resetDeskDb();
  mockCp.splice(0, mockCp.length, ANN, BOB);
  const item = (id: string, kind: string, extraFields: Record<string, unknown> = {}) => ({ id, kind, source_event_id: `interview.detected:<m${id}@x>`, enrollment_id: ANN,
    interview_id: null, status: 'open', created_at: new Date(T0.getTime() + Number(id) * 60_000), summary: { company: 'Acme', position: 'Analyst', subject: `Interview invite ${SENTINEL_PROVIDER_URL}`, confidence: 0.5, ...DIRTY }, ...extraFields });
  deskDb.items.push(item('1', 'low_confidence'), item('2', 'unmatched_learner', { enrollment_id: null }), item('3', 'unmatched_update'),
    item('4', 'ambiguous_update', { summary: { company: 'Acme', candidate_interview_ids: [IV(7), IV(8)], ...DIRTY } }),
    item('5', 'not_booked', { interview_id: IV(7), summary: { title: 'Not booked in 24 h', company: 'Acme', link_sent_at: '2026-11-18T15:00:00.000Z', ...DIRTY } }),
    item('6', 'recording_mismatch', { interview_id: IV(8), summary: { title: 'x', seen: 'on', expected: 'off', company: 'Acme', ...DIRTY } }),
    item('9', 'low_confidence', { status: 'resolved' }));
  const iv = (n: number, f: Record<string, unknown>) => ({ id: IV(n), enrollment_id: ANN, company: 'Acme', position: 'Analyst', contact_email: 'pat@acme.example', contact_name: 'Pat Doe',
    booking_link_round: null, booking_link_sent_at: null, ...DIRTY, ...f });
  deskDb.interviews.push(iv(1, { state: 'review', confidence: 0.78, reason: null }), iv(2, { state: 'review', reason: 'booking_link_gave_up', booking_link_round: 'first' }),
    iv(3, { state: 'review', reason: 'booking_link_no_contact', contact_email: null }), iv(4, { state: 'new', booking_link_round: 'first' }),
    iv(5, { state: 'booked', starts_at: new Date('2026-11-23T15:00:00Z'), minutes: 45, type: 'technical', interviewer_emails: ['kim@acme.example'], recording_consent: 'unavailable', confirm_done_at: T0 }),
    iv(6, { state: 'booked', starts_at: new Date('2026-11-24T15:00:00Z'), confirm_attempts: 3, confirm_done_at: null }),
    iv(7, { state: 'awaiting', booking_link_round: 'first', booking_link_sent_at: T0 }), iv(8, { state: 'booked', readback_recording: 'on' }));
  deskDb.events.push({ src: `booking_link_held:${IV(4)}:first` },
    { inbox_src: 'interview.detected:<m1@x>', payload: { event_id: 'e1', message_id: '<m1@x>', type: 'interview.detected', to_address: 'ann.jobs@gmail.com', received_at: '2026-11-19T15:00:00Z',
      company: 'Acme', position: 'Analyst', sub_type: 'Technical Interview', confidence: 0.5, contact: { name: 'Pat', email: 'pat@acme.example' }, meeting_link: SENTINEL_PROVIDER_URL } },
    { inbox_src: 'interview.detected:<m2@x>', payload: { event_id: 'e2', message_id: '<m2@x>', type: 'interview.detected', to_address: 'who@gmail.com', received_at: '2026-11-19T15:00:00Z', company: 'Beta', contact: { email: 'hr@beta.example' } } });
  deskDb.inboxes.push({ enrollment_id: ANN, address: 'ann.jobs@gmail.com', verified_at: T0, last_received_at: new Date(), last_test_at: null, last_test_ms: null, last30: 4,
    forwarding_link: 'https://mail-settings.google.com/mail/vf-abc', forwarding_code: '123456', confirm_pending: true });
  deskDb.offers.push({ id: 'o1', enrollment_id: ANN, client_name: 'Acme Corp', company: 'Acme', role: 'Analyst', pay_basis: 'yearly', salary_cents: '10500000', hourly_rate_cents: null,
    hours_per_week: null, first_year_cents: '10500000', fee_rate_bp: 11000, fee_cents: '11550000', start_date: '2026-12-07', status: 'accepted', created_at: T0, invoice_id: '1', invoice_status: 'not_invoiced' });
  deskDb.invoices.push({ id: '1', status: 'not_invoiced', fee_cents: '11550000' });
  deskDb.clients.push({ id: CL, name: 'Acme Corp' });
  for (const k of Object.keys(mockSettings)) delete mockSettings[k];
  mockLinks.splice(0); mockMailer.mockReset(); mockLedger.mockReset(); mockSendOne.mockReset().mockResolvedValue('sent'); mockTestImpl = null;
}
beforeEach(() => { seed(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

// Always three cells: jest treats a test function with more parameters than the row has as a done-callback test.
const ENDPOINTS: Array<[string, string, Record<string, unknown>]> = [
  ['get', B, {}], ['get', `${B}/queue`, {}], ['get', `${B}/inboxes`, {}], ['get', `${B}/bookings`, {}], ['get', `${B}/placements`, {}],
  ['post', `${B}/review-items/1/actions`, { action: 'dismiss' }], ['post', `${B}/interviews/${IV(1)}/actions`, { action: 'send_link' }],
  ['post', `${B}/interviews/${IV(1)}/type`, { type: 'technical' }], ['post', `${B}/inboxes/${ANN}/test`, {}], ['post', `${B}/inboxes/${ANN}/forwarding`, { action: 'open' }],
  ['post', `${B}/invoices/1/status`, { status: 'paid' }], ['post', `${B}/clients/${CL}/candidates`, { enrollmentId: ANN }],
];
const call = (m: string, url: string, body?: Record<string, unknown>, auth?: string) => {
  const r = m === 'get' ? request(app()).get(url) : request(app()).post(url).send(body ?? {});
  return auth ? r.set('Authorization', auth) : r;
};

describe('every desk endpoint is behind admin auth + requireSection(placement)', () => {
  it('the test matrix names every route the router has', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const stack = require('../careerDeskRoutes').default.stack as Array<{ route?: { path: string } }>;
    expect(stack.filter((l) => l.route).length).toBe(ENDPOINTS.length);
  });
  it.each(ENDPOINTS)('%s %s: 401 without a token, 403 for staff without placement, and neither touches anything', async (m, url, body) => {
    expect((await call(m, url, body)).status).toBe(401);
    const denied = await call(m, url, body, noPlacement());
    expect(denied.status).toBe(403);
    expect(deskDb.audits).toHaveLength(0);
    expect(mockLinks).toHaveLength(0);
    expect(mockMailer).not.toHaveBeenCalled();
  });
  it.each(ENDPOINTS)('%s %s: the path sits under the placement section for mgmtSectionGate (deny-by-default when the section is off)', (_m, url) => {
    expect(pathToSection(url)).toBe('placement');
  });
  it('adminRoutes.ts mounts the desk router (one import, one use)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'adminRoutes.ts'), 'utf8') as string;
    expect(src).toContain("import careerDeskRoutes from './admin/careerDeskRoutes';");
    expect(src).toMatch(/^router\.use\(careerDeskRoutes\);/m);
  });
  it('staff granted placement as an extra section can read the desk', async () => {
    expect((await call('get', `${B}/queue`, undefined, extra())).status).toBe(200);
  });
});

describe('reads: no provider link anywhere, no personal email or phone, honest empty states', () => {
  it.each(ENDPOINTS.filter(([m]) => m === 'get'))('GET %s %s passes expectNoRoomUrl and carries no personal email or phone', async (_m, url) => {
    const res = await call('get', url, undefined, owner());
    expect(res.status).toBe(200);
    expectNoRoomUrl(res.body);
    expect(JSON.stringify(res.body)).not.toMatch(/ann\.personal@mail\.example|555 0100/);
  });

  it('the queue holds every review kind plus the interviews a person must act on, oldest first, with their actions', async () => {
    const { body } = await call('get', `${B}/queue`, undefined, owner());
    const kinds = body.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['low_confidence', 'unmatched_learner', 'unmatched_update', 'ambiguous_update', 'not_booked', 'recording_mismatch',
      'needs_review', 'booking_gave_up', 'no_contact', 'confirm_gave_up']));
    expect(body.items.filter((i: { id: string }) => i.id === '9')).toHaveLength(0); // resolved
    const r78 = body.items.find((i: { interviewId: string; kind: string }) => i.interviewId === IV(1) && i.kind === 'needs_review');
    expect(r78).toMatchObject({ confidence: 0.78, actions: [{ action: 'send_link', label: 'Send booking link' }, { action: 'not_interview', label: 'Not an interview' }] });
    expect(body.items.find((i: { kind: string }) => i.kind === 'no_contact').needsContact).toBe(true);
    expect(body.items.find((i: { kind: string }) => i.kind === 'recording_mismatch').detail).toBe('Zoom says recording is on; everyone\'s choice means off. The join link is withheld until a person checks the Zoom meeting.');
    expect(body.items.find((i: { kind: string }) => i.kind === 'low_confidence').subject).toBe('Interview invite [link removed]');
    expect(body.items.find((i: { kind: string }) => i.kind === 'ambiguous_update').related.map((r: { interviewId: string }) => r.interviewId).sort()).toEqual([IV(7), IV(8)]);
    expect(body.items.find((i: { kind: string }) => i.kind === 'unmatched_update').related.length).toBeGreaterThan(2);
    const since = body.items.map((i: { since: string }) => i.since);
    expect([...since].sort()).toEqual(since);
  });

  it('held booking links are listed with Send booking link and the note that a switch-read failure also holds one, for good', async () => {
    const { body } = await call('get', `${B}/queue`, undefined, owner());
    expect(body.held).toEqual([expect.objectContaining({ interviewId: IV(4), hasContact: true, action: { action: 'send_link', label: 'Send booking link' } })]);
    expect(body.heldNote).toBe('A booking link is held when employer email was switched off when it was due, or when the switch could not be read at that moment. A held link is never sent later on its own: it waits here until you send it.');
  });

  it('the overview names the recruiters Karthik and Vivek, reads each switch as on / off / unreadable, and shows the Zoom permission notice', async () => {
    mockSettings.career_prep_employer_mail_enabled = true; mockSettings.career_prep_inbox_tests_enabled = 'THROW';
    deskDb.scopeMissing = { created_at: T0 };
    const { body } = await call('get', B, undefined, owner());
    expect(body.recruiters).toEqual([{ name: 'Karthik' }, { name: 'Vivek' }]);
    expect(body.switches).toEqual({ employerMail: 'on', inboxTests: 'unreadable' });
    expect(body.recording).toEqual({ status: 'scope_missing', note: 'Recording unavailable: Zoom permission missing', since: T0.toISOString() });
    delete mockSettings.career_prep_inbox_tests_enabled; deskDb.scopeMissing = null;
    const again = await call('get', B, undefined, owner());
    expect(again.body.switches.inboxTests).toBe('off');
    expect(again.body.recording).toBeNull();
  });

  it('empty desk: empty lists, nothing invented', async () => {
    resetDeskDb(); mockCp.splice(0);
    const q = await call('get', `${B}/queue`, undefined, owner());
    expect(q.body).toEqual({ items: [], held: [], heldNote: expect.any(String) });
    expect((await call('get', `${B}/inboxes`, undefined, owner())).body).toEqual({ testsSwitch: 'off', learners: [] });
    expect((await call('get', `${B}/bookings`, undefined, owner())).body).toEqual({ bookings: [], recording: null });
    const p = (await call('get', `${B}/placements`, undefined, owner())).body;
    expect(p).toMatchObject({ offers: [], clients: [], kpis: { openOffers: 0, accepted: 0, fees: '$0' } });
  });

  it('inbox health lists every Career Prep learner (none set up reads Not set up yet) with the 30-day count and a pending Gmail confirmation, never the link', async () => {
    const { body } = await call('get', `${B}/inboxes`, undefined, owner());
    expect(body.learners.map((l: { enrollmentId: string }) => l.enrollmentId).sort()).toEqual([ANN, BOB]);
    expect(body.learners.find((l: { enrollmentId: string }) => l.enrollmentId === BOB)).toMatchObject({ address: null, health: 'setup', healthLabel: 'Not set up yet', canSendTest: false });
    expect(body.learners.find((l: { enrollmentId: string }) => l.enrollmentId === ANN)).toMatchObject({ address: 'ann.jobs@gmail.com', last30Days: 4, confirmationPending: true, canSendTest: true });
    expect(JSON.stringify(body)).not.toContain('mail-settings.google.com');
  });

  it('bookings show Central time, the type line with the interviewers, and the recording note', async () => {
    const { body } = await call('get', `${B}/bookings`, undefined, owner());
    expect(body.bookings.find((b: { interviewId: string }) => b.interviewId === IV(5))).toMatchObject({
      startsLabel: 'Mon, Nov 23, 9:00 AM CST', typeLine: 'Technical interview, 45 min, with Pat Doe, kim@acme.example', interviewers: ['Pat Doe', 'kim@acme.example'],
      recording: 'Recording unavailable: Zoom permission missing. The interview goes ahead unrecorded, with no replay.', stateLabel: 'Booked' });
  });

  it('placements show the fee rate from the setting (110% by default), KPIs and the invoice record', async () => {
    let { body } = await call('get', `${B}/placements`, undefined, owner());
    expect(body.feeRate).toEqual({ rate: 1.1, label: '110%' });
    expect(body.offers[0]).toMatchObject({ pay: '$105,000 a year', fee: '$115,500', feeRate: '110%', statusLabel: 'Accepted', client: 'Acme Corp', invoice: { id: '1', status: 'not_invoiced', statusLabel: 'Not invoiced' } });
    expect(body.kpis).toMatchObject({ accepted: 1, fees: '$115,500' });
    mockSettings.placement_fee_rate = 1.25;
    ({ body } = await call('get', `${B}/placements`, undefined, owner()));
    expect(body.feeRate).toEqual({ rate: 1.25, label: '125%' });
  });

  it('a database failure is an honest 500', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    deskDb.fail = true;
    for (const [, url] of ENDPOINTS.filter(([m]) => m === 'get').slice(1)) expect((await call('get', url, undefined, owner())).status).toBe(500);
  });
});

describe('400 on malformed input, before anything runs', () => {
  it.each([
    [`${B}/review-items/abc/actions`, { action: 'dismiss' }], [`${B}/review-items/1/actions`, { action: 'explode' }], [`${B}/review-items/1/actions`, { action: 'dismiss', extra: 1 }],
    [`${B}/review-items/2/actions`, { action: 'match' }], [`${B}/interviews/nope/actions`, { action: 'send_link' }], [`${B}/interviews/${IV(3)}/actions`, { action: 'send_link', contactEmail: 'not-an-email' }],
    [`${B}/interviews/${IV(1)}/type`, { type: 'lunch' }], [`${B}/inboxes/abc/test`, {}], [`${B}/inboxes/${ANN}/forwarding`, { action: 'click' }],
    [`${B}/invoices/1/status`, { status: 'refunded' }], [`${B}/clients/${CL}/candidates`, { enrollmentId: 'x' }],
  ])('POST %s %j -> 400', async (url, body) => {
    expect((await call('post', url, body, owner())).status).toBe(400);
    expect(deskDb.audits).toHaveLength(0);
  });
});

describe('actions over HTTP: switch-gated, one audit row each, never a provider link', () => {
  const post = async (url: string, body: Record<string, unknown> = {}) => { const r = await call('post', url, body, owner()); expectNoRoomUrl(r.body); return r; };
  const audits = (event: string) => deskDb.audits.filter((a) => a.event === event);

  it.each([[undefined], [false], ['THROW']])('Send test with the inbox-tests switch %s: 409 {error:"Inbox tests are switched off"}, no mail, the refusal audited', async (v) => {
    if (v !== undefined) mockSettings.career_prep_inbox_tests_enabled = v;
    const res = await post(`${B}/inboxes/${ANN}/test`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Inbox tests are switched off' });
    expect(mockMailer).not.toHaveBeenCalled(); expect(mockLedger).not.toHaveBeenCalled();
    expect(audits('desk_send_test')).toEqual([expect.objectContaining({ subjectId: ANN, actor: 'staff-1', payload: { outcome: 'switched_off' } })]);
  });

  it('Send test with the switch on: one test, then a second click the same Central day sends nothing new (both audited)', async () => {
    const sent: string[] = [];
    mockTestImpl = async (e: unknown) => { if (sent.includes(String(e))) return { status: 'already_today' }; sent.push(String(e)); return { status: 'sent', sentAt: T0.toISOString() }; };
    expect((await post(`${B}/inboxes/${ANN}/test`)).body.outcome).toBe('sent');
    const again = await post(`${B}/inboxes/${ANN}/test`);
    expect([again.status, again.body.outcome]).toEqual([200, 'already_today']);
    expect(sent).toEqual([ANN]);
    expect(audits('desk_send_test').map((a) => (a.payload as { outcome: string }).outcome)).toEqual(['sent', 'already_today']);
  });

  it('0.78 confidence: Send booking link with employer mail off is HELD (listed, nothing sent, audited); on, it is sent ONCE', async () => {
    const off = await post(`${B}/interviews/${IV(1)}/actions`, { action: 'send_link' });
    expect([off.status, off.body.outcome]).toEqual([200, 'held']);
    expect(mockLinks).toEqual([]);
    expect((await call('get', `${B}/queue`, {}, owner())).body.held.map((h: { interviewId: string }) => h.interviewId)).toContain(IV(1));
    mockSettings.career_prep_employer_mail_enabled = true;
    const on = await post(`${B}/interviews/${IV(1)}/actions`, { action: 'send_link' });
    expect([on.status, on.body.outcome, on.body.interviewId]).toEqual([200, 'sent', IV(1)]);
    const twice = await post(`${B}/interviews/${IV(1)}/actions`, { action: 'send_link' });
    expect(twice.status).toBe(409);
    expect(mockLinks).toEqual([IV(1)]);
    expect(audits('desk_send_link').map((a) => [a.actor, (a.payload as { outcome: string }).outcome])).toEqual([['staff-1', 'held'], ['staff-1', 'sent'], ['staff-1', 'conflict']]);
  });

  it('404 for what does not exist, 502 when a nudge send fails', async () => {
    expect((await post(`${B}/interviews/${IV(99)}/actions`, { action: 'not_interview' })).status).toBe(404);
    expect((await post(`${B}/review-items/404/actions`, { action: 'dismiss' })).status).toBe(404);
    expect((await post(`${B}/invoices/77/status`, { status: 'paid' })).status).toBe(404);
    expect((await post(`${B}/clients/${CL}/candidates`, { enrollmentId: '33333333-0000-4000-8000-000000000003' })).status).toBe(404);
    mockSettings.career_prep_employer_mail_enabled = true; mockSendOne.mockResolvedValue('failed');
    expect((await post(`${B}/review-items/5/actions`, { action: 'nudge' })).status).toBe(502);
  });
});
