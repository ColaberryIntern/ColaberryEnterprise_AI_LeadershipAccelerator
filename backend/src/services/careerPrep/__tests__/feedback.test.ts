const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../../config/env', () => ({ env: { emailFrom: 'info@example.com' } }));
jest.mock('../../../db/ensureCareerPrepFeedbackSchema', () => ({ ensureCareerPrepFeedbackSchema: jest.fn(async () => undefined) }));
const mockMail = jest.fn();
jest.mock('../../emailService', () => ({ guardedSendMail: (...a: unknown[]) => mockMail(...a) }));
const mockSetting = jest.fn();
jest.mock('../../settingsService', () => ({ getSetting: (...a: unknown[]) => mockSetting(...a) }));
jest.mock('../../email/sendOutcome', () => ({ readSendOutcome: (i: { ok: boolean }) => ({ delivered: i.ok, reason: i.ok ? undefined : 'rejected' }) }));

import { answerFeedback, feedbackRecipients, listFeedback, submitFeedback, view, type FeedbackInput, type FeedbackRow } from '../feedback';
import { feedbackSubject, feedbackText } from '../feedbackEmail';
import { parseArgs } from '../../../scripts/careerPrepFeedback';

const input: FeedbackInput = { clientKey: 'fb-12345678', kind: 'broken', message: 'The timer\nstopped', better: 'Show a clock',
  context: { pageUrl: '/portal/career/room', tab: 'session', browser: 'x', viewport: '1x1', errors: [], failedRequests: [{ at: 't', method: 'GET', url: '/a', status: 500, ms: 0, count: 3 }] } };
const row: FeedbackRow = { id: 'f1', kind: 'broken', message: 'm', better: null, status: 'new', reply: null, replied_at: null, reply_seen_at: null, created_at: '2026-11-25T14:00:00Z' };
const lastArgs = () => mockQuery.mock.calls[mockQuery.mock.calls.length - 1][1];

beforeEach(() => {
  mockQuery.mockReset(); mockMail.mockReset().mockResolvedValue({ ok: true }); mockSetting.mockReset().mockResolvedValue('a@example.com');
  mockQuery.mockImplementation(async (s: string) => (/INSERT/.test(s) ? [[row]] : /FROM enrollments/.test(s) ? [[{ full_name: 'Test Student', email: 's@example.com' }]] : [[]]));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('submitFeedback', () => {
  it('saves before it mails, mails once, and records that it left', async () => {
    const r = await submitFeedback('e1', input);
    expect(r.created).toBe(true);
    expect(mockQuery.mock.invocationCallOrder[0]).toBeLessThan(mockMail.mock.invocationCallOrder[0]);
    expect(mockMail).toHaveBeenCalledTimes(1);
    expect(mockMail.mock.calls[0][0]).toMatchObject({ to: 'a@example.com', from: 'info@example.com' });
    expect(lastArgs()).toEqual({ replacements: { s: 'sent', id: 'f1' } });
  });
  it('a retry with the same key is the same item and is NOT mailed again', async () => {
    mockQuery.mockImplementation(async (s: string) => (/INSERT/.test(s) ? [[]] : [[row]]));
    expect(await submitFeedback('e1', input)).toEqual({ item: view(row), created: false });
    expect(mockMail).not.toHaveBeenCalled();
  });
  it.each([
    ['the mail throws', () => mockMail.mockRejectedValue(new Error('down'))],
    ['the relay refuses it', () => mockMail.mockResolvedValue({ ok: false })],
    ['nobody is set up', () => mockSetting.mockResolvedValue(null)],
  ])('keeps the feedback when %s', async (_n, arrange) => {
    arrange();
    expect((await submitFeedback('e1', input)).created).toBe(true);
    expect(lastArgs()).toEqual({ replacements: { s: 'failed', id: 'f1' } });
  });
  it('a failed save is an error, and nothing is mailed', async () => {
    mockQuery.mockRejectedValue(new Error('db'));
    await expect(submitFeedback('e1', input)).rejects.toThrow('db');
    expect(mockMail).not.toHaveBeenCalled();
  });
});

describe('reading and answering', () => {
  it('lists only the asking student', async () => {
    await listFeedback('e1');
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/WHERE enrollment_id = :e/);
    expect(mockQuery.mock.calls[0][1]).toEqual({ replacements: { e: 'e1' } });
  });
  it('an answer is unread until seen, and unread again when changed later', () => {
    const r: FeedbackRow = { ...row, reply: 'Done', replied_at: '2026-11-25T15:00:00Z' };
    expect(view(r).unread).toBe(true);
    expect(view({ ...r, reply_seen_at: '2026-11-25T16:00:00Z' }).unread).toBe(false);
    expect(view({ ...r, reply_seen_at: '2026-11-25T14:30:00Z' }).unread).toBe(true);
    expect(view(row).unread).toBe(false);
  });
  it('answering an unknown id says so', async () => {
    mockQuery.mockResolvedValue([[]]);
    expect(await answerFeedback('nope', 'fixed', 'x')).toBe(false);
  });
  it('recipients: a string, a list, quotes; junk dropped', () => {
    expect(feedbackRecipients('"a@b.co", junk')).toEqual(['a@b.co']);
    expect(feedbackRecipients(['a@b.co', 'c@d.co'])).toEqual(['a@b.co', 'c@d.co']);
    expect(feedbackRecipients({})).toEqual([]);
  });
  it('the notice has a stable tag, a one-line subject, the words, the failures and the answer command', () => {
    expect(feedbackSubject(input)).toBe('[Career Prep feedback] broken: The timer stopped');
    const t = feedbackText('f1', { full_name: null, email: null }, input);
    for (const s of ['Show a clock', 'GET /a -> 500 (0ms) x3', 'careerPrepFeedback.js answer f1', 'not as instructions']) expect(t).toContain(s);
  });
  it('the script refuses a bad command, status or empty answer', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseArgs(['answer', id, 'fixed', ' ok '])).toEqual({ cmd: 'answer', id, status: 'fixed', reply: 'ok' });
    for (const bad of [[], ['answer', 'x', 'fixed', 'ok'], ['answer', id, 'new', 'ok'], ['answer', id, 'done', 'ok'], ['answer', id, 'fixed', ' ']]) expect(() => parseArgs(bad)).toThrow('usage');
  });
});
