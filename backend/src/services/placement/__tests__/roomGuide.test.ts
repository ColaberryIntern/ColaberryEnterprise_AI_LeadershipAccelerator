import { makeGuideDb, guideIv, END_MS, START } from './helpers/fakeGuideDb';

const mockDb = { current: makeGuideDb() };
jest.mock('../../../config/database', () => ({ sequelize: {
  query: (...a: unknown[]) => (mockDb.current.query as (...x: unknown[]) => unknown)(...a),
  transaction: (fn: (t: unknown) => Promise<unknown>) => mockDb.current.transaction(fn as never),
} }));

import { addNote, cleanQuestions, employerGuide, guideGate, MAX_NOTES, MAX_QUESTIONS } from '../roomGuide';
import { expectNoRoomUrl, SENTINEL_PROVIDER_URL } from './helpers/noRoomUrl';

/**
 * CP9.1 (kit F5, the employer's side panel): the interview guide = this role's questions, and the private notes. The
 * database is a stand-in that applies only what each statement says (fakeGuideDb), with the row lock, READ COMMITTED
 * visibility and the notes' UNIQUE (interview_id, client_key) modeled.
 */
const ID = '11111111-1111-4111-8111-111111111111';
const K1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const K2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const QS = ['Tell me about a model you shipped.', 'How do you check a forecast before it reaches a customer?'];
const fake = () => mockDb.current.fake;

beforeEach(() => {
  mockDb.current = makeGuideDb();
  fake().iv.push(guideIv({ room_url: SENTINEL_PROVIDER_URL } as never));
  fake().prep.push({ placement_interview_id: ID, enrollment_id: 'enr-ann', questions: QS });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the guide', () => {
  it("answers the role's questions from the learner's prep row, the company and role, and no notes yet", async () => {
    const r = await employerGuide(ID, END_MS);
    expect(r).toEqual({ status: 'ok', guide: { company: 'Acme', role: 'Data Analyst', questions: QS, notes: [] } });
    expectNoRoomUrl(r); // the interview row holds the provider link; the guide never carries it
  });
  it('[] when no questions are on file (the page says so); questions of another learner never count', async () => {
    fake().prep.length = 0;
    fake().prep.push({ placement_interview_id: ID, enrollment_id: 'enr-bob', questions: QS });
    expect(await employerGuide(ID, END_MS)).toMatchObject({ status: 'ok', guide: { questions: [] } });
  });
  it('null (could not be read) when the prep read fails, logged, and the notes still answer', async () => {
    fake().prepFails = true;
    const r = await employerGuide(ID, END_MS);
    expect(r).toMatchObject({ status: 'ok', guide: { questions: null, notes: [] } });
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('placement_room_guide_questions_failed');
  });
  it('cleanQuestions keeps trimmed strings only, at most 8', () => {
    expect(cleanQuestions(null)).toEqual([]);
    expect(cleanQuestions({ a: 1 })).toEqual([]);
    expect(cleanQuestions([' a ', 3, '', '   ', null, 'b'])).toEqual(['a', 'b']);
    expect(cleanQuestions(Array.from({ length: 12 }, (_, i) => `q${i}`))).toHaveLength(MAX_QUESTIONS);
  });
});

describe('the gate (the link was signed for the current booking)', () => {
  it('not_found, moved (a link from before a reschedule), not_booked (cancelled, back to new); booked and done are open', () => {
    expect(guideGate(undefined, END_MS)).toEqual({ status: 'not_found' });
    expect(guideGate(guideIv({ starts_at: new Date(START.getTime() + 3_600_000) }), END_MS)).toEqual({ status: 'moved' });
    expect(guideGate(guideIv({ minutes: 45 }), END_MS)).toEqual({ status: 'moved' });
    expect(guideGate(guideIv({ starts_at: null }), END_MS)).toEqual({ status: 'moved' });
    for (const state of ['cancelled', 'new', 'awaiting', 'review']) expect(guideGate(guideIv({ state }), END_MS)).toEqual({ status: 'not_booked' });
    expect(guideGate(guideIv(), END_MS)).toBeNull();
    expect(guideGate(guideIv({ state: 'done' }), END_MS)).toBeNull();
    expect(guideGate(guideIv({ minutes: null }), END_MS)).toBeNull(); // no length = 30 minutes, as everywhere else
  });
  it('a moved link neither reads nor writes', async () => {
    expect(await employerGuide(ID, END_MS - 60_000)).toEqual({ status: 'moved' });
    expect(await addNote(ID, END_MS - 60_000, K1, 'x')).toEqual({ status: 'moved' });
    expect(fake().notes).toHaveLength(0);
  });
});

describe('notes', () => {
  it('saves a note and answers it with the whole guide', async () => {
    const r = await addNote(ID, END_MS, K1, 'Strong on forecasting.');
    expect(r).toMatchObject({ status: 'ok', replay: false, note: { body: 'Strong on forecasting.' }, guide: { questions: QS } });
    expect(r.status === 'ok' && r.guide.notes.map((n) => n.body)).toEqual(['Strong on forecasting.']);
    expect(fake().notes).toHaveLength(1);
  });
  it('the same Save twice (double click, retry) stores ONE note and answers the stored one as a replay', async () => {
    const a = await addNote(ID, END_MS, K1, 'First words.');
    const b = await addNote(ID, END_MS, K1, 'First words.');
    expect(fake().notes).toHaveLength(1);
    expect(b).toMatchObject({ status: 'ok', replay: true });
    expect(a.status === 'ok' && b.status === 'ok' && b.note.id === a.note.id).toBe(true);
  });
  it('two concurrent Saves with the same key store one note (the row lock, then the key)', async () => {
    const [a, b] = await Promise.all([addNote(ID, END_MS, K1, 'Same.'), addNote(ID, END_MS, K1, 'Same.')]);
    expect(fake().notes).toHaveLength(1);
    expect([a, b].map((x) => x.status === 'ok' && x.replay).sort()).toEqual([false, true]);
  });
  it('different keys are different notes, listed oldest first', async () => {
    await addNote(ID, END_MS, K1, 'one');
    await addNote(ID, END_MS, K2, 'two');
    const g = await employerGuide(ID, END_MS);
    expect(g.status === 'ok' && g.guide.notes.map((n) => n.body)).toEqual(['one', 'two']);
  });
  it(`at ${MAX_NOTES} notes the next is refused (full), and two racing saves at the cap cannot both pass`, async () => {
    for (let i = 0; i < MAX_NOTES - 1; i += 1) fake().notes.push({ id: 1000 + i, interview_id: ID, client_key: `k${i}`, body: 'n', created_at: new Date() });
    const [a, b] = await Promise.all([addNote(ID, END_MS, K1, 'last'), addNote(ID, END_MS, K2, 'one too many')]);
    expect([a.status, b.status].sort()).toEqual(['full', 'ok']);
    expect(fake().notes).toHaveLength(MAX_NOTES);
  });
  it('locks the interview row FIRST, before any notes statement', async () => {
    await addNote(ID, END_MS, K1, 'x');
    const first = fake().sql.findIndex((s) => /interview_notes/.test(s));
    expect(fake().sql.findIndex((s) => /FROM placement_interviews i WHERE i\.id = :id FOR UPDATE/.test(s))).toBeLessThan(first);
  });
  it('not_found and not_booked write nothing', async () => {
    expect(await addNote('22222222-2222-4222-8222-222222222222', END_MS, K1, 'x')).toEqual({ status: 'not_found' });
    fake().iv[0].state = 'cancelled';
    expect(await addNote(ID, END_MS, K1, 'x')).toEqual({ status: 'not_booked' });
    expect(fake().notes).toHaveLength(0);
  });
});
