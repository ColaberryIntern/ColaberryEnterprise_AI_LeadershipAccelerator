jest.mock('../recapStore');
jest.mock('../recapRecipients');
jest.mock('../../../emailService', () => ({
  guardedSendMail: jest.fn(),
  resolveEmailRecipient: jest.fn(),
}));

import * as store from '../recapStore';
import { loadRecipientPlan, loadLeadSuppressed } from '../recapRecipients';
import { guardedSendMail, resolveEmailRecipient } from '../../../emailService';
import { sendAll, classifySendError } from '../recapSendService';
import { sequelize } from '../../../../config/database';

/**
 * WL1.3 attempt 2: the send loop against a fake store that implements the REAL claim rule
 * (claim only rows in queued|failed with attempts < 3, and mark them sending). Proves:
 * a 5xx and a 429 mark the row failed with a stable error class; a second run mails only those
 * failed rows and never a sent one; a database failure after delivery never causes a resend.
 */
const SID = '11111111-1111-4111-8111-111111111111';
const summary = { headline: 'It Works While You Sleep', intro: '', ideas: [{ icon: '', title: 'One skill, one job', text: '' }], steps: [], quote: '', homework: '' };
const m = store as jest.Mocked<typeof store>;
const send = guardedSendMail as jest.Mock;
type Row = { status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'; attempts: number; errorClass?: string };
let rows: Map<string, Row>;
const noSleep = async () => undefined;
const smtp = (responseCode: number) => Object.assign(new Error(`SMTP ${responseCode}`), { responseCode });

beforeEach(() => {
  jest.resetAllMocks();
  rows = new Map();
  (resolveEmailRecipient as jest.Mock).mockImplementation(async (to: string, subject: string) => ({ to, subject }));
  m.getSession.mockResolvedValue({ id: SID, title: 'Ep 2', session_date: '2026-11-30', start_time: '18:30', kit_config_json: null, description: null });
  m.getRecap.mockResolvedValue({ session_id: SID, summary, next_event_url: 'https://www.eventbrite.com/e/1', test_sent_at: new Date() } as never);
  m.ensureSendRows.mockImplementation(async (_s, list) => { for (const r of list) if (!rows.has(r.emailLower)) rows.set(r.emailLower, { status: r.status, attempts: 0 }); });
  m.claimSend.mockImplementation(async (_s, em) => {
    const r = rows.get(em);
    if (!r || !['queued', 'failed'].includes(r.status) || r.attempts >= 3) return false;
    r.status = 'sending'; r.attempts++; return true;
  });
  m.finishSend.mockImplementation(async (_s, em, ok, info) => { const r = rows.get(em)!; r.status = ok ? 'sent' : 'failed'; r.errorClass = info.errorClass; });
  (loadRecipientPlan as jest.Mock).mockResolvedValue({
    recipients: ['a', 'b', 'c'].map((x) => ({ guestId: x, name: x, email: `${x}@x.com`, emailLower: `${x}@x.com` })),
    skipped: [],
  });
});

it('5xx and 429 mark the row failed with a stable class; the next run mails only those rows', async () => {
  send.mockImplementation(async (o: { to: string }) => {
    if (o.to === 'a@x.com') throw smtp(554);
    if (o.to === 'b@x.com') throw smtp(429);
    return { messageId: 'ok' };
  });
  const first = await sendAll(SID, noSleep);
  expect(first).toMatchObject({ sent: 1, failed: 2 });
  expect(rows.get('a@x.com')).toMatchObject({ status: 'failed', errorClass: 'UpstreamUnavailable' });
  expect(rows.get('b@x.com')).toMatchObject({ status: 'failed', errorClass: 'RateLimitError' });

  send.mockReset(); send.mockResolvedValue({ messageId: 'ok2' });
  const second = await sendAll(SID, noSleep);
  expect(send.mock.calls.map((c) => c[0].to).sort()).toEqual(['a@x.com', 'b@x.com']);
  expect(second).toMatchObject({ sent: 2, failed: 0, alreadySent: 1 });

  send.mockReset();
  const third = await sendAll(SID, noSleep);
  expect(send).not.toHaveBeenCalled();
  expect(third.alreadySent).toBe(3);
});

it('a row that keeps failing stops after 3 attempts', async () => {
  send.mockRejectedValue(smtp(503));
  for (let i = 0; i < 5; i++) await sendAll(SID, noSleep);
  expect(rows.get('a@x.com')!.attempts).toBe(3);
  expect(send).toHaveBeenCalledTimes(9);
});

it('a database failure after a successful delivery never causes a resend', async () => {
  send.mockResolvedValue({ messageId: 'ok' });
  m.finishSend.mockImplementation(async (_s, em, ok) => { if (ok && em === 'a@x.com') throw new Error('db down'); const r = rows.get(em)!; r.status = ok ? 'sent' : 'failed'; });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const first = await sendAll(SID, noSleep);
  expect(first.sent).toBe(3);
  expect(rows.get('a@x.com')!.status).toBe('sending');
  expect(warn.mock.calls.some((c) => String(c[0]).includes('StateWriteError'))).toBe(true);
  send.mockClear();
  await sendAll(SID, noSleep);
  expect(send).not.toHaveBeenCalled();
  warn.mockRestore();
});

describe('classifySendError', () => {
  it.each([
    [{ responseCode: 429 }, 'RateLimitError'], [{ responseCode: 421 }, 'RateLimitError'],
    [{ responseCode: 554 }, 'UpstreamUnavailable'], [{ responseCode: 550 }, 'RecipientRejected'],
    [{ code: 'ETIMEDOUT' }, 'UpstreamUnavailable'], [{ code: 'EAUTH' }, 'AuthError'],
    [new Error('x'), 'SendError'], [undefined, 'SendError'],
  ])('%p -> %s', (e, cls) => { expect(classifySendError(e)).toBe(cls); });
});

describe('loadLeadSuppressed', () => {
  let q: jest.SpyInstance;
  beforeEach(() => { q = jest.spyOn(sequelize, 'query'); });
  afterEach(() => q.mockRestore());
  const real = jest.requireActual('../recapRecipients') as typeof import('../recapRecipients');
  it('suppressed status or an email-blocking unsubscribe event suppresses; an sms-only event after the cutoff does not', async () => {
    q.mockResolvedValue([
      { email: 'a@x.com', status: 'unsubscribed', channel: null, created_at: null },
      { email: 'b@x.com', status: 'active', channel: 'email', created_at: new Date('2026-10-01') },
      { email: 'c@x.com', status: 'active', channel: 'sms', created_at: new Date('2026-10-01') },
      { email: 'd@x.com', status: 'active', channel: null, created_at: null },
    ]);
    const s = await real.loadLeadSuppressed(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
    expect([...s].sort()).toEqual(['a@x.com', 'b@x.com']);
  });
  it('no emails means no query', async () => {
    expect((await real.loadLeadSuppressed([])).size).toBe(0);
    expect(q).not.toHaveBeenCalled();
  });
  void loadLeadSuppressed;
});
