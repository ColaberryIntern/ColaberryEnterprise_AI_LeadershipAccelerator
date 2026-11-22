/**
 * CP8.1 (kit F4): interview events become placement interviews (or review items), once. The database is an in-memory
 * stand-in answering each statement as Postgres would: UNIQUE keys are checked atomically, and a transaction holds its
 * row lock (one at a time) and rolls back on a throw. The same rules run on Postgres in interviewIngest.integration.
 */
type Interview = { id: string; enrollment_id: string; source_event_id: string; company: string | null; position: string | null; state: string; type: string | null; created_at: number; booking_link_round?: string | null };
type Ev = { subject_id: string; event: string; from_state: string | null; to_state: string; source_event_id: string | null };
const db = { inboxes: new Map<string, string>(), interviews: [] as Interview[], events: [] as Ev[], items: [] as Array<{ kind: string; source_event_id: string; enrollment_id: string | null; summary?: Record<string, unknown> }>, tick: 0, failOn: '' };
type R = Record<string, string | number | boolean | null | undefined>;
function answer(sql: string, r: R): [unknown[], number] {
  if (db.failOn && sql.includes(db.failOn)) throw Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' });
  if (sql.includes('FROM job_search_inboxes WHERE mailbox')) { const e = db.inboxes.get(String(r.m)); return [e ? [{ enrollment_id: e }] : [], 0]; }
  if (sql.includes('INSERT INTO placement_review_items')) {
    if (db.items.some((i) => i.kind === r.k && i.source_event_id === r.s)) return [[], 0];
    db.items.push({ kind: String(r.k), source_event_id: String(r.s), enrollment_id: (r.e as string) ?? null, summary: JSON.parse(String(r.sum)) });
    return [[{ id: db.items.length }], 1];
  }
  if (sql.includes('INSERT INTO placement_interviews')) {
    if (db.interviews.some((i) => i.source_event_id === r.src)) return [[], 0];
    const id = `iv-${db.interviews.length + 1}`;
    db.interviews.push({ id, enrollment_id: String(r.e), source_event_id: String(r.src), company: (r.company as string) ?? null, position: (r.position as string) ?? null, state: String(r.state), booking_link_round: (r.round as string) ?? null, type: (r.type as string) ?? null, created_at: (db.tick += 1) });
    return [[{ id }], 1];
  }
  if (sql.includes('INSERT INTO placement_events')) {
    if (r.src && db.events.some((e) => e.source_event_id === r.src)) return [[], 0];
    db.events.push({ subject_id: String(r.id), event: String(r.event), from_state: (r.from as string) ?? null, to_state: String(r.to), source_event_id: (r.src as string) ?? null });
    return [[{ id: db.events.length }], 1];
  }
  if (sql.includes('SELECT id, state, company, position FROM placement_interviews')) {
    // Only what the SQL itself filters on (the learner and an open state, asserted in a test below); the company and
    // position match is matchInterview's, tested on its own.
    const open = db.interviews.filter((i) => i.enrollment_id === r.e && !['done', 'cancelled'].includes(i.state));
    return [open.sort((a, b) => a.id.localeCompare(b.id)).map((i) => ({ id: i.id, state: i.state, company: i.company, position: i.position })), 0];
  }
  if (sql.includes('SELECT 1 FROM placement_events')) return [db.events.filter((e) => e.source_event_id === r.src).map(() => ({ '?column?': 1 })), 0];
  if (sql.includes('SET booking_link_round = :round')) { (db.interviews.find((x) => x.id === r.id) as Interview).booking_link_round = String(r.round); return [[], 1]; }
  if (sql.includes('UPDATE placement_interviews SET state')) { const i = db.interviews.find((x) => x.id === r.id) as Interview; i.state = String(r.to); return [[], 1]; }
  throw new Error(`unexpected SQL: ${sql.slice(0, 70)}`);
}
const mockQuery = jest.fn(async (sql: string, o: { replacements?: R } = {}) => answer(sql, o.replacements ?? {}));
let lock: Promise<unknown> = Promise.resolve();
const mockTransaction = (fn: (t: unknown) => Promise<unknown>) => {
  const run = lock.then(async () => {
    const snap = JSON.stringify({ i: db.interviews, e: db.events });
    try { return await fn('tx'); } catch (err) { const s = JSON.parse(snap); db.interviews = s.i; db.events = s.e; throw err; }
  });
  lock = run.catch(() => undefined);
  return run;
};
jest.mock('../../../config/database', () => ({ sequelize: { query: (s: string, o: { replacements?: R }) => mockQuery(s, o), transaction: (f: (t: unknown) => Promise<unknown>) => mockTransaction(f) } }));

const mockSendLink = jest.fn();
const mockRecordBooking = jest.fn();
jest.mock('../bookingReply', () => ({ sendBookingLink: (...a: unknown[]) => mockSendLink(...a), recordBookingEvent: (...a: unknown[]) => mockRecordBooking(...a) }));

import { ingestInterviewEvent, matchInterview, updateTarget } from '../interviewIngest';
import { InboxEventSchema, type InboxEvent } from '../inboxEventSchema';

const ev = (over: Record<string, unknown> = {}): InboxEvent => InboxEventSchema.parse({ event_id: 'evt-1', message_id: '<m1@acme.example>', type: 'interview.detected',
  to_address: 'Ann.Lee.Careers@gmail.com', received_at: '2026-11-21T18:00:00Z', company: 'Acme', position: 'Data Analyst', sub_type: 'Phone Screen', confidence: 0.97,
  contact: { name: 'Pat Doe', email: 'pat@acme.example' }, ...over });
const upd = (subType: string, over: Record<string, unknown> = {}) => ev({ type: 'interview.updated', message_id: `<u-${subType}@acme.example>`, sub_type: subType, ...over });

beforeEach(() => {
  db.inboxes = new Map([['annleecareers@gmail.com', 'enr-ann']]); db.interviews = []; db.events = []; db.items = []; db.tick = 0; db.failOn = '';
  mockQuery.mockClear();
  mockSendLink.mockReset().mockResolvedValue({ status: 'held' }); mockRecordBooking.mockReset().mockResolvedValue(undefined);
  for (const k of ['log', 'warn'] as const) jest.spyOn(console, k).mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('interview.detected', () => {
  it('confidence 0.95: an interview in state new, its learner found by canonical mailbox, and ONE detected event row', async () => {
    const r = await ingestInterviewEvent(ev({ confidence: 0.95 }));
    expect(r).toEqual({ status: 'ingested', interviewId: 'iv-1', state: 'new' });
    expect(db.interviews[0]).toMatchObject({ enrollment_id: 'enr-ann', company: 'Acme', state: 'new', type: 'recruiter', source_event_id: 'interview.detected:<m1@acme.example>' });
    expect(db.events).toEqual([{ subject_id: 'iv-1', event: 'detected', from_state: null, to_state: 'new', source_event_id: 'interview.detected:<m1@acme.example>' }]);
  });
  it('0.94: state review; 0.95 but flagged needs_review: review too', async () => {
    expect((await ingestInterviewEvent(ev({ confidence: 0.94 }))).status).toBe('ingested');
    expect(db.interviews[0].state).toBe('review');
    await ingestInterviewEvent(ev({ message_id: '<m2@x>', confidence: 0.99, needs_review: true }));
    expect(db.interviews[1].state).toBe('review');
  });
  it('0.69: NO interview row, a low_confidence review item for a human', async () => {
    expect(await ingestInterviewEvent(ev({ confidence: 0.69 }))).toEqual({ status: 'review', kind: 'low_confidence' });
    expect(db.interviews).toHaveLength(0);
    expect(db.events).toHaveLength(0);
    expect(db.items).toMatchObject([{ kind: 'low_confidence', source_event_id: 'interview.detected:<m1@acme.example>', enrollment_id: 'enr-ann' }]);
  });
  it('the same event twice: one interview, one event row; the second is a duplicate', async () => {
    await ingestInterviewEvent(ev());
    expect(await ingestInterviewEvent(ev({ event_id: 'evt-1-resent' }))).toEqual({ status: 'duplicate' });
    expect([db.interviews.length, db.events.length]).toEqual([1, 1]);
  });
  it('carried (T12): two CONCURRENT dispatches of one event: one interview and one event row', async () => {
    const both = await Promise.all([ingestInterviewEvent(ev()), ingestInterviewEvent(ev())]);
    expect(both.map((r) => r.status).sort()).toEqual(['duplicate', 'ingested']);
    expect([db.interviews.length, db.events.length]).toEqual([1, 1]);
  });
  it('an address no learner uses: an unmatched_learner review item, once', async () => {
    const e = ev({ to_address: 'nobody@gmail.com' });
    expect(await ingestInterviewEvent(e)).toEqual({ status: 'review', kind: 'unmatched_learner' });
    expect(await ingestInterviewEvent(e)).toEqual({ status: 'duplicate' });
    expect(db.items).toHaveLength(1);
    expect(db.interviews).toHaveLength(0);
  });
  it('a failure after the interview insert rolls the whole thing back (no interview without its event row)', async () => {
    db.failOn = 'INSERT INTO placement_events';
    await expect(ingestInterviewEvent(ev())).rejects.toThrow('connection reset');
    expect([db.interviews.length, db.events.length]).toEqual([0, 0]);
    db.failOn = '';
    expect((await ingestInterviewEvent(ev())).status).toBe('ingested');
  });
});

describe('interview.updated', () => {
  async function bookedInterview(): Promise<string> {
    const r = await ingestInterviewEvent(ev());
    const id = r.status === 'ingested' ? r.interviewId : '';
    (db.interviews.find((i) => i.id === id) as Interview).state = 'booked';
    return id;
  }
  it('Interview Cancelled: the learner\'s open interview with that company is cancelled, with ONE event row', async () => {
    const id = await bookedInterview();
    expect(await ingestInterviewEvent(upd('Interview Cancelled', { company: 'ACME' }))).toEqual({ status: 'ingested', interviewId: id, state: 'cancelled' });
    expect(db.events.filter((e) => e.event === 'cancelled')).toEqual([{ subject_id: id, event: 'cancelled', from_state: 'booked', to_state: 'cancelled', source_event_id: 'interview.updated:<u-Interview Cancelled@acme.example>' }]);
  });
  it('Interview Rescheduled of a booked interview goes back to new (the link is offered again)', async () => {
    await bookedInterview();
    expect(await ingestInterviewEvent(upd('Interview Rescheduled'))).toMatchObject({ status: 'ingested', state: 'new' });
  });
  it('another update is recorded on the interview without moving it', async () => {
    await ingestInterviewEvent(ev());
    expect(await ingestInterviewEvent(upd('Interview Request'))).toMatchObject({ status: 'ingested', state: 'new' });
    expect(db.events[1]).toMatchObject({ event: 'updated', from_state: 'new', to_state: 'new' });
  });
  it('the same update twice, even concurrently: one event row, one state change', async () => {
    await bookedInterview();
    const both = await Promise.all([ingestInterviewEvent(upd('Interview Cancelled')), ingestInterviewEvent(upd('Interview Cancelled'))]);
    // The 2nd finds no OPEN interview left, and must still know it is a copy: a duplicate, never an unmatched review item.
    expect(both.map((r) => r.status).sort()).toEqual(['duplicate', 'ingested']);
    expect(db.events.filter((e) => e.event === 'cancelled')).toHaveLength(1);
    expect(db.items).toHaveLength(0);
  });
  it('a repeated update of a still-open interview is a duplicate (no second event row)', async () => {
    await ingestInterviewEvent(ev());
    await ingestInterviewEvent(upd('Interview Request'));
    expect(await ingestInterviewEvent(upd('Interview Request'))).toEqual({ status: 'duplicate' });
    expect(db.events).toHaveLength(2);
  });
  it('T15 fix (a): TWO open interviews at one company: a cancellation changes NEITHER and opens one ambiguous_update item', async () => {
    await ingestInterviewEvent(ev({ position: 'Data Analyst' }));
    await ingestInterviewEvent(ev({ message_id: '<m2@acme.example>', position: 'Data Engineer' }));
    const r = await ingestInterviewEvent(upd('Interview Cancelled', { position: null }));
    expect(r).toEqual({ status: 'review', kind: 'ambiguous_update' });
    expect(db.interviews.map((i) => i.state)).toEqual(['new', 'new']);
    expect(db.events.filter((e) => e.event !== 'detected')).toHaveLength(0);
    expect(db.items).toHaveLength(1);
    expect(db.items[0]).toMatchObject({ kind: 'ambiguous_update', summary: { candidate_interview_ids: ['iv-1', 'iv-2'] } });
    expect(await ingestInterviewEvent(upd('Interview Cancelled', { position: null }))).toEqual({ status: 'duplicate' }); // once
  });
  it('the same two interviews: a cancellation that names the position cancels exactly that one', async () => {
    await ingestInterviewEvent(ev({ position: 'Data Analyst' }));
    await ingestInterviewEvent(ev({ message_id: '<m2@acme.example>', position: 'Data Engineer' }));
    expect(await ingestInterviewEvent(upd('Interview Cancelled', { position: '  data   ENGINEER ' }))).toEqual({ status: 'ingested', interviewId: 'iv-2', state: 'cancelled' });
    expect(db.interviews.map((i) => i.state)).toEqual(['new', 'cancelled']);
  });
  it('T15 fix (b): an update for a DONE interview writes zero placement_events rows and changes nothing', async () => {
    await ingestInterviewEvent(ev());
    db.interviews[0].state = 'done';
    expect(await ingestInterviewEvent(upd('Interview Cancelled'))).toEqual({ status: 'review', kind: 'unmatched_update' });
    expect(db.interviews[0].state).toBe('done');
    expect(db.events.filter((e) => e.event !== 'detected')).toHaveLength(0);
  });
  it('the update query locks only the learner\'s OPEN interviews, in id order; the company match is not left to SQL', async () => {
    await ingestInterviewEvent(ev());
    mockQuery.mockClear();
    await ingestInterviewEvent(upd('Interview Cancelled'));
    const [sql, opts] = mockQuery.mock.calls.find((c) => String(c[0]).includes('FROM placement_interviews WHERE enrollment_id')) as [string, { replacements: R }];
    expect(sql).toMatch(/WHERE enrollment_id = :e\s+AND state NOT IN \('done','cancelled'\) ORDER BY id FOR UPDATE/);
    expect(sql).not.toMatch(/company\s*\)?\s*=|LIMIT/i); // no SQL-side company pick, no "newest one wins"
    expect(opts.replacements).toEqual({ e: 'enr-ann' });
  });
  it('an update for no open interview: an unmatched_update review item', async () => {
    expect(await ingestInterviewEvent(upd('Interview Cancelled', { company: 'Globex' }))).toEqual({ status: 'review', kind: 'unmatched_update' });
    expect(db.items[0].kind).toBe('unmatched_update');
  });
});

describe('T16: the booking-link reply after the commit', () => {
  it('a new interview (0.95) offers the link once, round "first"; a review one (0.94) and a duplicate do not', async () => {
    await ingestInterviewEvent(ev());
    expect(mockSendLink.mock.calls).toEqual([['iv-1', { round: 'first' }]]);
    await ingestInterviewEvent(ev());
    await ingestInterviewEvent(ev({ message_id: '<m2@x>', confidence: 0.94 }));
    expect(mockSendLink).toHaveBeenCalledTimes(1);
  });
  it('a booked interview rescheduled back to new offers it again, its round the update\'s Message-ID; a cancel does not', async () => {
    await ingestInterviewEvent(ev());
    db.interviews[0].state = 'booked';
    mockSendLink.mockClear();
    await ingestInterviewEvent(upd('Interview Rescheduled'));
    expect(mockSendLink.mock.calls).toEqual([['iv-1', { round: '<u-Interview Rescheduled@acme.example>' }]]);
    db.interviews[0].state = 'booked';
    await ingestInterviewEvent(upd('Interview Cancelled'));
    expect(mockSendLink).toHaveBeenCalledTimes(1);
  });
  it('a throwing reply never undoes the interview, and is recorded at once as one keyed booking_link_failed row', async () => {
    mockSendLink.mockRejectedValueOnce(Object.assign(new Error('db'), { name: 'SequelizeConnectionError' }));
    expect(await ingestInterviewEvent(ev())).toEqual({ status: 'ingested', interviewId: 'iv-1', state: 'new' });
    expect(db.interviews).toHaveLength(1);
    expect(mockRecordBooking.mock.calls).toEqual([['iv-1', 'failed', 'first', { first_error_class: 'SequelizeConnectionError', thrown: true }]]);
  });
  it('the reply owed is stored IN the ingest transaction (so a crash before the send leaves it to the sweep): new owes "first", review owes none', async () => {
    await ingestInterviewEvent(ev());
    await ingestInterviewEvent(ev({ message_id: '<m2@x>', confidence: 0.9, position: 'Data Engineer' }));
    expect(db.interviews.map((i) => i.booking_link_round)).toEqual(['first', null]);
    db.interviews[0].state = 'booked';
    await ingestInterviewEvent(upd('Interview Rescheduled'));
    expect(db.interviews[0].booking_link_round).toBe('<u-Interview Rescheduled@acme.example>');
  });
});

describe('matchInterview (pure)', () => {
  const open = [
    { id: 'a', state: 'new', company: 'Acme', position: 'Data Analyst' },
    { id: 'b', state: 'booked', company: ' acme ', position: 'Data Engineer' },
    { id: 'c', state: 'review', company: 'Globex', position: null },
  ];
  it('exactly one on the company (trimmed, case and spacing ignored), or on company AND position when given', () => {
    expect(matchInterview(open, 'GLOBEX', null)).toEqual({ kind: 'one', row: open[2] });
    expect(matchInterview(open, 'acme', 'data  engineer')).toEqual({ kind: 'one', row: open[1] });
  });
  it('more than one is ambiguous (with every candidate); none, or no company at all, is none', () => {
    expect(matchInterview(open, 'Acme', null)).toEqual({ kind: 'ambiguous', ids: ['a', 'b'] });
    expect(matchInterview(open, 'Acme', '')).toEqual({ kind: 'ambiguous', ids: ['a', 'b'] });
    expect(matchInterview(open, 'Acme', 'Designer')).toEqual({ kind: 'none' });
    expect(matchInterview(open, 'Initech', null)).toEqual({ kind: 'none' });
    expect(matchInterview(open, '  ', null)).toEqual({ kind: 'none' });
    expect(matchInterview([], 'Acme', null)).toEqual({ kind: 'none' });
  });
});

describe('updateTarget (pure)', () => {
  it('cancel from anywhere open; reschedule only moves a booked interview', () => {
    expect(updateTarget('Interview Cancelled', 'review')).toBe('cancelled');
    expect(updateTarget('Interview Rescheduled', 'booked')).toBe('new');
    expect(updateTarget('Interview Rescheduled', 'awaiting')).toBeNull();
    expect(updateTarget('Phone Screen', 'new')).toBeNull();
  });
});
