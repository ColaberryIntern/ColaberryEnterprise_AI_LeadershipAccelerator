/**
 * CP6.2 (kit F3): one verified inbox event is stored once and dispatched. The database is a small stand-in for the
 * three statements acceptInboxEvent sends; recordArrival and the interview stub are spies.
 */
const db = { events: new Map<string, { id: number; processed_at: Date | null }>(), inboxes: [] as Array<{ mailbox: string; confirmed: boolean; code?: string | null; link?: string | null }> };
type Opts = { replacements: Record<string, any> };
const mockQuery = jest.fn(async (sql: string, o: Opts) => {
  const r = o.replacements;
  if (sql.includes('INSERT INTO inbox_events')) {
    const k = `${r.mid}|${r.type}`;
    if (db.events.has(k)) return [[], 0];
    db.events.set(k, { id: db.events.size + 1, processed_at: null });
    return [[{ id: db.events.size }], 1];
  }
  if (sql.includes('SELECT id, processed_at FROM inbox_events')) { const e = db.events.get(`${r.mid}|${r.type}`); return [e ? [{ ...e }] : [], 0]; }
  if (sql.includes('UPDATE inbox_events SET processed_at')) { for (const e of db.events.values()) if (e.id === r.id) e.processed_at = new Date(); return [[], 1]; }
  if (sql.includes('SET forwarding_code')) {
    const i = db.inboxes.find((x) => x.mailbox === r.m && !x.confirmed);
    if (!i) return [[], 0];
    Object.assign(i, { code: r.c, link: r.l });
    return [[{ id: 'ib' }], 1];
  }
  throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
});
jest.mock('../../../config/database', () => ({ sequelize: { query: (s: string, o: Opts) => mockQuery(s, o) } }));
const mockArrival = jest.fn();
jest.mock('../inboxArrival', () => ({ recordArrival: (...a: unknown[]) => mockArrival(...a) }));
const mockIngest = jest.fn();
jest.mock('../interviewIngest', () => ({ ingestInterviewEvent: (...a: unknown[]) => mockIngest(...a) }));

import { acceptInboxEvent, safeConfirmationLink } from '../inboxEvents';
import { InboxEventSchema, type InboxEvent } from '../inboxEventSchema';

const ev = (over: Partial<InboxEvent> = {}): InboxEvent => InboxEventSchema.parse({ event_id: 'evt-1', message_id: '<m1@x>', type: 'email.classified',
  to_address: 'Ann.Lee.Careers@gmail.com', received_at: '2026-11-21T18:00:00Z', subject: 'Interview request', category: 'Interview', confidence: 0.97,
  contact: { name: 'Pat Doe', email: 'pat@acme.example' }, ...over });

beforeEach(() => {
  db.events.clear(); db.inboxes = [{ mailbox: 'annleecareers@gmail.com', confirmed: false }];
  mockQuery.mockClear(); mockArrival.mockReset().mockResolvedValue({ status: 'recorded' }); mockIngest.mockReset().mockResolvedValue({ status: 'deferred' });
  for (const k of ['log', 'warn'] as const) jest.spyOn(console, k).mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('acceptInboxEvent', () => {
  it('a new email.classified event: one stored row, recordArrival with the mail facts, then marked processed', async () => {
    expect(await acceptInboxEvent(ev())).toEqual({ duplicate: false });
    expect(db.events.size).toBe(1);
    expect(mockArrival).toHaveBeenCalledWith({ toAddress: 'Ann.Lee.Careers@gmail.com', subject: 'Interview request', receivedAt: new Date('2026-11-21T18:00:00Z'),
      messageId: '<m1@x>', fromName: 'Pat Doe', category: 'Interview', confidence: 0.97, outcome: null });
    expect([...db.events.values()][0].processed_at).not.toBeNull();
  });
  it('a replay of a processed event: duplicate, nothing dispatched, no new row', async () => {
    await acceptInboxEvent(ev());
    expect(await acceptInboxEvent(ev({ event_id: 'evt-1-resent' }))).toEqual({ duplicate: true });
    expect(db.events.size).toBe(1);
    expect(mockArrival).toHaveBeenCalledTimes(1);
  });
  it('the same Message-ID with another type is its own event', async () => {
    await acceptInboxEvent(ev());
    expect(await acceptInboxEvent(ev({ type: 'interview.detected' }))).toEqual({ duplicate: false });
    expect(db.events.size).toBe(2);
  });
  it('a dispatch failure leaves the event unprocessed and throws; the sender\'s retry dispatches it again', async () => {
    mockArrival.mockRejectedValueOnce(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));
    await expect(acceptInboxEvent(ev())).rejects.toMatchObject({ name: 'InboxDispatchError', message: 'db down' }); // stored, not processed
    expect([...db.events.values()][0].processed_at).toBeNull();
    expect(await acceptInboxEvent(ev())).toEqual({ duplicate: false });
    expect(mockArrival).toHaveBeenCalledTimes(2);
    expect(db.events.size).toBe(1);
    expect([...db.events.values()][0].processed_at).not.toBeNull();
  });
  it('interview.detected and interview.updated go to ingestInterviewEvent (the T15 stub), not to recordArrival', async () => {
    await acceptInboxEvent(ev({ type: 'interview.detected' }));
    await acceptInboxEvent(ev({ type: 'interview.updated', message_id: '<m2@x>' }));
    expect(mockIngest).toHaveBeenCalledTimes(2);
    expect(mockIngest.mock.calls[0][0]).toMatchObject({ type: 'interview.detected', message_id: '<m1@x>' });
    expect(mockArrival).not.toHaveBeenCalled();
  });
  it('carried (T12): a DEFERRED interview event stays processed_at NULL, so T15 can select exactly those rows', async () => {
    await acceptInboxEvent(ev({ type: 'interview.detected' }));
    expect(db.events.get('<m1@x>|interview.detected')?.processed_at).toBeNull();
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes('SET processed_at'))).toBe(false);
    // A sender retry of it is not a duplicate yet: it is offered to the ingestion again (still one row).
    expect(await acceptInboxEvent(ev({ type: 'interview.detected' }))).toEqual({ duplicate: false });
    expect(db.events.size).toBe(1);
    // Once the ingestion really processes it (T15), it is marked and a replay is a duplicate.
    mockIngest.mockResolvedValueOnce({ status: 'ingested' });
    await acceptInboxEvent(ev({ type: 'interview.detected' }));
    expect(db.events.get('<m1@x>|interview.detected')?.processed_at).not.toBeNull();
    expect(await acceptInboxEvent(ev({ type: 'interview.detected' }))).toEqual({ duplicate: true });
  });
  it('forwarding.confirmation keeps the code and Google link on that learner\'s inbox; it is NOT an arrival', async () => {
    await acceptInboxEvent(ev({ type: 'forwarding.confirmation', confirmation_code: '123456789', confirmation_link: 'https://mail-settings.google.com/mail/vf-abc' }));
    expect(db.inboxes[0]).toMatchObject({ code: '123456789', link: 'https://mail-settings.google.com/mail/vf-abc' });
    expect(mockArrival).not.toHaveBeenCalled();
  });
  it('a confirmation link that is not Google\'s is never stored; an already confirmed inbox is not changed', async () => {
    await acceptInboxEvent(ev({ type: 'forwarding.confirmation', confirmation_code: '123456789', confirmation_link: 'https://evil.example/mail/vf-abc' }));
    expect(db.inboxes[0]).toMatchObject({ code: '123456789', link: null });
    db.inboxes = [{ mailbox: 'annleecareers@gmail.com', confirmed: true, code: 'old', link: null }];
    await acceptInboxEvent(ev({ type: 'forwarding.confirmation', message_id: '<m9@x>', confirmation_code: '999999999' }));
    expect(db.inboxes[0].code).toBe('old');
  });
});

describe('safeConfirmationLink', () => {
  it('only https links on Google\'s mail hosts', () => {
    expect(safeConfirmationLink('https://mail.google.com/mail/vf-1')).toBe('https://mail.google.com/mail/vf-1');
    expect(safeConfirmationLink('http://mail-settings.google.com/mail/vf-1')).toBeNull();
    expect(safeConfirmationLink('https://mail-settings.google.com.evil.example/x')).toBeNull();
    expect(safeConfirmationLink('javascript:alert(1)')).toBeNull();
    expect(safeConfirmationLink(null)).toBeNull();
  });
});
