/**
 * CP11.1a: the staff desk's actions (careerDeskActions.ts, careerDeskService.ts) and its pure views, against the HOSTILE
 * store stand-in (helpers/fakeDeskStore.ts). Every action writes exactly ONE audit row (actor = the staff id); a replay
 * changes nothing; employer email goes only with career_prep_employer_mail_enabled on (the booking-link sender here is a
 * stand-in that reads the REAL switch rule; bookingReply.test.ts covers the real one). Nothing leaves the process.
 */
jest.mock('../careerDeskStore', () => require('./helpers/fakeDeskStore').storeModule);
jest.mock('../careerDeskOpsStore', () => require('./helpers/fakeDeskStore').opsModule);
const mockSettings: Record<string, unknown> = {};
jest.mock('../../settingsService', () => ({ getSetting: async (k: string) => { if (mockSettings[k] === 'THROW') throw new Error('db'); return mockSettings[k] ?? null; } }));
const mockCp: string[] = [];
jest.mock('../../careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: async (e: string) => mockCp.includes(e), careerPrepEnrollmentIds: async () => [...mockCp] }));
const mockSendOne = jest.fn();
jest.mock('../bookingConfirm', () => ({ MAX_CONFIRM_ATTEMPTS: 3, EMAIL: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/, sendOne: (...a: unknown[]) => mockSendOne(...a) }));
const mockLinks: string[] = [];
jest.mock('../bookingReply', () => ({
  sendBookingLink: async (id: string, o: { read?: (k: string) => Promise<unknown> }) => {
    const { deskDb: db } = require('./helpers/fakeDeskStore');
    const { isSwitchOn } = jest.requireActual('../darkSwitches');
    const x = db.interviews.find((r: { id: string }) => r.id === id);
    if (!x || x.state !== 'new' || x.booking_link_sent_at) return { status: 'not_owed' };
    if (!(await isSwitchOn('career_prep_employer_mail_enabled', o.read))) { db.events.push({ src: `booking_link_held:${id}:${x.booking_link_round}` }); return { status: 'held' }; }
    mockLinks.push(id); x.booking_link_sent_at = new Date(); return { status: 'sent' };
  },
}));
let mockTest: () => Promise<unknown> = async () => ({ status: 'sent', sentAt: 'x' });
jest.mock('../inboxTestJob', () => ({ sendTest: () => mockTest() }));

import { deskDb, resetDeskDb } from './helpers/fakeDeskStore';
import { interviewAction, itemAction, sendLink, setInterviewType } from '../careerDeskActions';
import { deskSendTest, forwardingAction, putForward, setInvoiceStatus, switchState } from '../careerDeskService';
import { ACTIONS_FOR, ITEM_KINDS, plain } from '../careerDeskQueue';
import { offerLine, percent } from '../careerDeskViews';

const ANN = '11111111-0000-4000-8000-000000000001'; const BOB = '22222222-0000-4000-8000-000000000002';
const IV = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CL = 'cccccccc-0000-4000-8000-000000000001';
const S = { staff: 'staff-1' };
const audits = () => deskDb.audits as Array<{ event: string; actor: string; from?: string | null; to?: string | null; subjectId: string; payload: Record<string, unknown> }>;

beforeEach(() => {
  resetDeskDb(); mockCp.splice(0, mockCp.length, ANN, BOB); mockLinks.splice(0); mockSendOne.mockReset().mockResolvedValue('sent');
  for (const k of Object.keys(mockSettings)) delete mockSettings[k];
  const item = (id: string, kind: string, f: Record<string, unknown> = {}) => ({ id, kind, source_event_id: `interview.detected:<m${id}@x>`, enrollment_id: ANN, interview_id: null, status: 'open', summary: {}, created_at: new Date(), ...f });
  deskDb.items.push(item('1', 'low_confidence'), item('2', 'unmatched_learner', { enrollment_id: null }), item('3', 'low_confidence'),
    item('5', 'not_booked', { interview_id: IV(7) }), item('6', 'recording_mismatch', { interview_id: IV(8) }));
  const iv = (n: number, f: Record<string, unknown>) => ({ id: IV(n), enrollment_id: ANN, company: 'Acme', position: 'Analyst', contact_email: 'pat@acme.example', booking_link_round: null, booking_link_sent_at: null, ...f });
  deskDb.interviews.push(iv(1, { state: 'review', confidence: 0.78 }), iv(2, { state: 'review', booking_link_round: 'first' }), iv(3, { state: 'review', contact_email: null }),
    iv(6, { state: 'booked', confirm_attempts: 3, confirm_done_at: null }), iv(7, { state: 'awaiting', booking_link_round: 'first', booking_link_sent_at: new Date() }),
    iv(8, { state: 'booked', readback_recording: 'on' }));
  const payload = (mid: string) => ({ event_id: `e-${mid}`, message_id: mid, type: 'interview.detected', to_address: 'x@gmail.com', received_at: '2026-11-19T15:00:00Z', company: 'Beta', sub_type: 'Phone Screen', confidence: 0.6, contact: { email: 'hr@beta.example' } });
  deskDb.events.push({ inbox_src: 'interview.detected:<m1@x>', payload: payload('<m1@x>') }, { inbox_src: 'interview.detected:<m2@x>', payload: payload('<m2@x>') });
  deskDb.inboxes.push({ enrollment_id: ANN, forwarding_link: 'https://mail-settings.google.com/mail/vf-abc', forwarding_code: '123456', forwarding_confirmed_at: null },
    { enrollment_id: BOB, forwarding_link: 'https://evil.example/vf', forwarding_code: null, forwarding_confirmed_at: null });
  deskDb.invoices.push({ id: '1', status: 'not_invoiced', fee_cents: 100 }); deskDb.clients.push({ id: CL, name: 'Acme Corp' });
});

describe('pure parts', () => {
  it('the queue offers actions for every review kind the table allows (no kind can be stranded)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'db', 'ensurePlacementSchema.ts'), 'utf8') as string;
    const allowed = /kind IN \(([^)]+)\)/.exec(src)?.[1].split(',').map((s) => s.trim().replace(/'/g, '')) ?? [];
    expect([...ITEM_KINDS].sort()).toEqual(allowed.sort());
    for (const k of ITEM_KINDS) expect(ACTIONS_FOR[k].length).toBeGreaterThan(0);
  });
  it('email text loses every link; money, rates and hourly pay read plainly', () => {
    expect(plain('Join https://zoom.example/j/SECRET or www.meet.example/x now')).toBe('Join [link removed] or [link removed] now');
    expect(plain('   ')).toBeNull();
    expect(percent(1.1)).toBe('110%');
    expect(offerLine({ id: 'o', enrollment_id: ANN, full_name: 'Ann Lee', client_name: null, company: 'Acme', role: 'Dev', pay_basis: 'hourly', salary_cents: null, hourly_rate_cents: 5000,
      hours_per_week: '40.0', first_year_cents: '10400000', fee_rate_bp: 11000, fee_cents: '11440000', start_date: null, status: 'sent', created_at: new Date(), invoice_id: null, invoice_status: null }))
      .toMatchObject({ pay: '$50 an hour, 40 h a week', firstYear: '$104,000', fee: '$114,400', invoice: null });
  });
  it('a switch reads on only when exactly true; a failed read says unreadable (the platform treats it as off)', async () => {
    expect(await switchState('k', async () => true)).toBe('on');
    expect(await switchState('k', async () => 'yes')).toBe('off');
    expect(await switchState('k', async () => { throw new Error('db'); })).toBe('unreadable');
  });
});

describe('review-queue actions', () => {
  it('Not an interview resolves once; a second click changes nothing; each click is one audit row', async () => {
    expect(await itemAction('1', 'dismiss', S)).toMatchObject({ status: 'ok', outcome: 'resolved' });
    expect(await itemAction('1', 'dismiss', S)).toMatchObject({ status: 'ok', outcome: 'already_resolved' });
    expect(audits().map((a) => [a.event, a.actor, a.from, a.to, a.payload.outcome])).toEqual([['desk_dismiss', 'staff-1', 'open', 'resolved', 'resolved'], ['desk_dismiss', 'staff-1', 'resolved', 'resolved', 'already_resolved']]);
  });
  it('an action that does not fit the kind is refused (409) and audited; the item stays open', async () => {
    expect((await itemAction('1', 'nudge', S)).status).toBe('conflict');
    expect(deskDb.items[0].status).toBe('open');
    expect(audits()).toHaveLength(1);
  });
  it('I checked the Zoom meeting forgets the stored read-back (the next join asks Zoom again) and resolves', async () => {
    expect((await itemAction('6', 'recheck_recording', S)).status).toBe('ok');
    expect(deskDb.interviews.find((x) => x.id === IV(8))).toMatchObject({ readback_recording: null, readback_forgotten: true });
  });
  it('Send a nudge: held with employer mail off (nothing sent, item open); on, sent ONCE with the scheduler\'s own key', async () => {
    expect(await itemAction('5', 'nudge', S)).toMatchObject({ outcome: 'held' });
    expect(mockSendOne).not.toHaveBeenCalled();
    expect(deskDb.items.find((i) => i.id === '5')?.status).toBe('open');
    mockSettings.career_prep_employer_mail_enabled = true;
    expect(await itemAction('5', 'nudge', S)).toMatchObject({ outcome: 'sent' });
    expect(mockSendOne.mock.calls.map((c) => [c[0], c[2]])).toEqual([['pat@acme.example', `placement_interview:${IV(7)}:booking_nudge:first`]]);
    expect(await itemAction('5', 'nudge', S)).toMatchObject({ outcome: 'already_resolved' });
    expect(mockSendOne).toHaveBeenCalledTimes(1);
  });
  it('Low confidence Send booking link: one interview from the stored email, held while mail is off, ONE audit row; a replay makes none', async () => {
    const r = await itemAction('1', 'make_interview', S);
    expect(r).toMatchObject({ status: 'ok', outcome: 'held' });
    const made = deskDb.interviews.filter((x) => x.source_event_id === 'interview.detected:<m1@x>');
    expect(made).toEqual([expect.objectContaining({ state: 'new', booking_link_round: 'first', company: 'Beta', contact_email: 'hr@beta.example' })]);
    expect(audits()).toEqual([expect.objectContaining({ event: 'desk_make_interview', to: 'resolved', payload: expect.objectContaining({ outcome: 'held', interview_id: made[0].id }) })]);
    expect((await itemAction('1', 'make_interview', S)).status).toBe('ok');
    expect(deskDb.interviews.filter((x) => x.source_event_id === 'interview.detected:<m1@x>')).toHaveLength(1);
    expect(mockLinks).toEqual([]);
  });
  it('No learner matched: Match and send for a Career Prep learner; refused (404) for anyone else; no stored email = 409', async () => {
    expect((await itemAction('2', 'match', { ...S, enrollmentId: '33333333-0000-4000-8000-000000000003' })).status).toBe('not_found');
    mockSettings.career_prep_employer_mail_enabled = true;
    expect(await itemAction('2', 'match', { ...S, enrollmentId: BOB })).toMatchObject({ outcome: 'sent' });
    expect(deskDb.interviews.find((x) => x.source_event_id === 'interview.detected:<m2@x>')?.enrollment_id).toBe(BOB);
    expect((await itemAction('3', 'make_interview', S)).status).toBe('conflict');
  });
});

describe('interview actions', () => {
  it('Send booking link: no-contact takes the address staff add; gave-up goes again; each is one audit row', async () => {
    mockSettings.career_prep_employer_mail_enabled = true;
    expect(await sendLink(IV(3), { ...S, contactEmail: 'hr@acme.example' })).toMatchObject({ outcome: 'sent' });
    expect(deskDb.interviews.find((x) => x.id === IV(3))?.contact_email).toBe('hr@acme.example');
    expect(await sendLink(IV(2), S)).toMatchObject({ outcome: 'sent' });
    expect(mockLinks).toEqual([IV(3), IV(2)]);
    expect(audits().map((a) => [a.event, a.from, a.payload.approved_by])).toEqual([['desk_send_link', 'review', 'staff-1'], ['desk_send_link', 'review', 'staff-1']]);
  });
  it('Not an interview cancels once; Try again resets a given-up booking once; the type is set once', async () => {
    expect((await interviewAction(IV(1), 'not_interview', S)).status).toBe('ok');
    expect((await interviewAction(IV(1), 'not_interview', S)).status).toBe('conflict');
    expect((await interviewAction(IV(6), 'retry_confirm', S)).status).toBe('ok');
    expect(deskDb.interviews.find((x) => x.id === IV(6))?.confirm_attempts).toBe(0);
    expect((await interviewAction(IV(6), 'retry_confirm', S)).status).toBe('conflict');
    expect(await setInterviewType(IV(7), 'technical', S)).toMatchObject({ outcome: 'changed' });
    expect(await setInterviewType(IV(7), 'technical', S)).toMatchObject({ outcome: 'unchanged' });
    expect(audits()).toHaveLength(6);
  });
});

describe('a 404 refusal is still one audit row', () => {
  it('unknown interview or item, on every queue action', async () => {
    const GONE = IV(99);
    expect((await sendLink(GONE, S)).status).toBe('not_found');
    expect((await interviewAction(GONE, 'not_interview', S)).status).toBe('not_found');
    expect((await setInterviewType(GONE, 'technical', S)).status).toBe('not_found');
    expect((await itemAction('404', 'dismiss', S)).status).toBe('not_found');
    expect(audits().map((a) => [a.event, a.subjectId, a.actor, a.payload.outcome])).toEqual([
      ['desk_send_link', GONE, 'staff-1', 'not_found'], ['desk_not_interview', GONE, 'staff-1', 'not_found'],
      ['desk_set_type', GONE, 'staff-1', 'not_found'], ['desk_dismiss', '404', 'staff-1', 'not_found']]);
  });
});

describe('inbox and placement actions', () => {
  it('Send test maps the guard\'s answers and is audited every time', async () => {
    mockTest = async () => ({ status: 'failed', errorClass: 'SendBlocked' });
    expect((await deskSendTest(ANN, 'staff-1')).status).toBe('failed');
    mockTest = async () => ({ status: 'no_inbox' });
    expect((await deskSendTest(ANN, 'staff-1')).status).toBe('not_found');
    expect(audits().map((a) => a.payload.outcome)).toEqual(['failed', 'no_inbox']);
  });
  it('Gmail forwarding: the link is handed to the clicking staff member only when it is a Google https link; Mark confirmed records it once', async () => {
    expect(await forwardingAction(ANN, 'open', 'staff-1')).toMatchObject({ outcome: 'opened', link: 'https://mail-settings.google.com/mail/vf-abc', code: '123456' });
    expect(await forwardingAction(BOB, 'open', 'staff-1')).toMatchObject({ outcome: 'opened', link: null });
    expect(await forwardingAction(ANN, 'confirm', 'staff-1')).toMatchObject({ outcome: 'confirmed' });
    expect(await forwardingAction(ANN, 'confirm', 'staff-1')).toMatchObject({ outcome: 'already_confirmed' });
    expect(await forwardingAction(ANN, 'open', 'staff-1')).toMatchObject({ outcome: 'already_confirmed' });
    expect(audits()).toHaveLength(5);
  });
  it('invoice status and put forward: changed then unchanged, each audited with from and to', async () => {
    expect(await setInvoiceStatus('1', 'invoiced', 'staff-1')).toMatchObject({ outcome: 'changed' });
    expect(await setInvoiceStatus('1', 'invoiced', 'staff-1')).toMatchObject({ outcome: 'unchanged' });
    expect(audits().slice(0, 2).map((a) => [a.from, a.to])).toEqual([['not_invoiced', 'invoiced'], ['invoiced', 'invoiced']]);
    expect(await putForward(CL, ANN, 'staff-1')).toMatchObject({ outcome: 'added' });
    expect(await putForward(CL, ANN, 'staff-1')).toMatchObject({ outcome: 'already' });
    expect(deskDb.candidates).toHaveLength(1);
    expect(audits()).toHaveLength(4);
  });
});
