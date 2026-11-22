/**
 * CP10.3 (kit F8): the follow-up scheduler. The store is an in-memory stand-in that applies each statement's rule as
 * followUpStore.ts writes it (that SQL runs on Postgres in followUpStore.integration.test.ts); the send ledger mirrors
 * sendOnce; the mailer is a spy. Nothing leaves the process.
 */
type Row = {
  id: string; status: string; send_on: Date; next_attempt_at: Date | null; last_attempt_at: Date | null; attempts: number; subject: string; body: string;
  booking_link: string | null; only_if: string; full_name: string | null; to_email: string | null; member_email: string | null; display_name: string | null;
  company: string; put_forward: boolean; replied: boolean; status_reason: string | null; mandrill_id: string | null; sent_at: Date | null; link: string | null;
  last_error_class: string | null;
};
const mockRows = new Map<string, Row>();
const mockCalls = { claimLimit: [] as number[], throwFinishOnce: false, throwContextFor: '' };
jest.mock('../followUpStore', () => ({
  holdDue: async (now: Date, stale: Date, limit: number) => [...mockRows.values()].filter((r) => (r.status === 'scheduled' && r.send_on <= now)
    || (r.status === 'sending' && r.last_attempt_at !== null && r.last_attempt_at < stale)).slice(0, limit)
    .map((r) => { r.status = 'held'; r.status_reason = 'employer_mail_off'; return r.id; }),
  claimDue: async (now: Date, stale: Date, limit: number) => {
    mockCalls.claimLimit.push(limit);
    return [...mockRows.values()].filter((r) => (r.status === 'scheduled' && r.send_on <= now && (!r.next_attempt_at || r.next_attempt_at <= now))
      || (r.status === 'sending' && r.last_attempt_at !== null && r.last_attempt_at < stale)).slice(0, limit)
      .map((r) => { r.status = 'sending'; r.attempts += 1; r.last_attempt_at = now; return { id: r.id, attempts: r.attempts }; });
  },
  sendContext: async (id: string) => { if (id === mockCalls.throwContextFor) throw Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }); return mockRows.get(id); },
  finish: async (id: string, f: Record<string, unknown>) => {
    if (mockCalls.throwFinishOnce) { mockCalls.throwFinishOnce = false; throw Object.assign(new Error('db timeout'), { name: 'SequelizeTimeoutError' }); }
    const r = mockRows.get(id);
    if (!r || r.status !== 'sending') return false;
    r.status = String(f.status);
    if (f.status === 'sent') Object.assign(r, { sent_at: f.now, mandrill_id: f.messageId, to_email: f.to, link: f.link, next_attempt_at: null });
    else if (f.status === 'scheduled') Object.assign(r, { next_attempt_at: f.nextAttemptAt, last_error_class: f.errorClass });
    else Object.assign(r, { status_reason: f.reason, ...(f.status === 'failed' ? { last_error_class: f.reason } : {}) });
    return true;
  },
}));
jest.mock('../../../config/env', () => ({ env: { emailFrom: 'team@refactored.example' } }));
jest.mock('../../settingsService', () => ({ getSetting: async () => null }));
const mockLedger = new Map<string, string>();
const mockSendOnce = jest.fn();
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (id: { recipient: string; subject: string; businessEventId: string }, send: () => Promise<{ ok: boolean; errorClass?: string; messageId?: string }>) => {
    mockSendOnce(id);
    const key = `${id.recipient}|${id.subject}|${id.businessEventId}`;
    const st = mockLedger.get(key);
    if (st && st !== 'failed') return { outcome: 'skipped', reason: st === 'sent' ? 'already_sent' : 'in_flight', idempotencyKey: key };
    mockLedger.set(key, 'claimed');
    try {
      const r = await send();
      mockLedger.set(key, r.ok ? 'sent' : 'failed');
      return r.ok ? { outcome: 'sent', ledgerId: key, idempotencyKey: key, messageId: r.messageId } : { outcome: 'failed', ledgerId: key, idempotencyKey: key, errorClass: r.errorClass ?? 'ProviderRejected', error: '' };
    } catch (err) { mockLedger.set(key, 'failed'); throw err; }
  },
}));
const mockMail = jest.fn();
jest.mock('../../emailService', () => ({ guardedSendMail: (m: unknown) => mockMail(m), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));

import { BATCH, runFollowUpPass, STALE_MS } from '../followUpScheduler';
import { centralInstant } from '../followUpRules';

const ID = 'f0000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-22T15:00:00Z');
const on = async () => true;
const off = async () => false;
const at = (ms: number) => new Date(NOW.getTime() + ms);
function seed(over: Partial<Row> = {}, id = ID): Row {
  const r: Row = { id, status: 'scheduled', send_on: at(-60_000), next_attempt_at: null, last_attempt_at: null, attempts: 0, subject: 'Next steps',
    body: 'Hi {first},\n\nPick a time here: {booking link}\n\nDana', booking_link: 'https://cal.example/dana', only_if: 'always', full_name: 'Ann Lee',
    to_email: 'ann@learner.example', member_email: 'dana@northgate.example', display_name: 'Dana Ruiz', company: 'Northgate Logistics', put_forward: true, replied: false,
    status_reason: null, mandrill_id: null, sent_at: null, link: null, last_error_class: null, ...over };
  mockRows.set(id, r);
  return r;
}

beforeEach(() => {
  mockRows.clear(); mockLedger.clear(); mockMail.mockReset().mockResolvedValue({ messageId: '<m1@mandrill>' }); mockSendOnce.mockReset();
  mockCalls.claimLimit = []; mockCalls.throwFinishOnce = false; mockCalls.throwContextFor = '';
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the dark switch', () => {
  it('off: zero transport calls; due follow-ups are held (not later sent when it turns on); later ones wait', async () => {
    const due = seed(); const later = seed({ send_on: at(3_600_000) }, 'f0000000-0000-4000-8000-000000000002');
    expect((await runFollowUpPass(NOW, off)).held).toBe(1);
    expect(mockMail).not.toHaveBeenCalled(); expect(mockSendOnce).not.toHaveBeenCalled();
    expect([due.status, due.status_reason, later.status]).toEqual(['held', 'employer_mail_off', 'scheduled']);
    await runFollowUpPass(at(60_000), on);
    expect(mockMail).not.toHaveBeenCalled();
    expect(due.status).toBe('held');
  });
  it('a row left `sending` by a pass that died is never resumed after an off-to-on flip: held while off, nothing sent after', async () => {
    const r = seed();
    mockCalls.throwContextFor = ID; // the pass dies after claiming it (claimed while on), before any send
    await runFollowUpPass(NOW, on);
    expect([r.status, r.attempts]).toEqual(['sending', 1]);
    mockCalls.throwContextFor = '';
    await runFollowUpPass(at(5 * 60_000), off); // not stale yet: left alone
    expect(r.status).toBe('sending');
    expect((await runFollowUpPass(at(STALE_MS + 60_000), off)).held).toBe(1);
    expect([r.status, r.status_reason]).toEqual(['held', 'employer_mail_off']);
    await runFollowUpPass(at(STALE_MS + 10 * 60_000), on);
    expect(mockMail).not.toHaveBeenCalled(); expect(mockSendOnce).not.toHaveBeenCalled();
  });
  it('re-read at send time: on for the pass, off for the send, Then held with zero transport calls', async () => {
    const r = seed();
    let n = 0;
    expect((await runFollowUpPass(NOW, async () => { n += 1; return n === 1; })).held).toBe(1);
    expect(mockMail).not.toHaveBeenCalled(); expect(mockSendOnce).not.toHaveBeenCalled();
    expect(r.status).toBe('held');
  });
});

describe('sending', () => {
  it('sends as "<person> at <company> via Refactored.ai", Reply-To the employer, plain text merged, tracked by follow_up_id', async () => {
    const r = seed();
    expect((await runFollowUpPass(NOW, on)).sent).toBe(1);
    const m = mockMail.mock.calls[0][0];
    expect(m).toMatchObject({ from: '"Dana Ruiz at Northgate Logistics via Refactored.ai" <team@refactored.example>', to: 'ann@learner.example', replyTo: 'dana@northgate.example',
      subject: 'Next steps', text: 'Hi Ann,\n\nPick a time here: https://cal.example/dana\n\nDana' });
    expect(m.html).toBeUndefined(); expect(m.attachments).toBeUndefined();
    expect(JSON.parse(m.headers['X-MC-Metadata'])).toEqual({ follow_up_id: ID });
    expect(m.headers['X-MC-Track']).toBe('clicks_textonly'); // plain text: opens cannot be measured, so none are asked for
    expect(mockSendOnce.mock.calls[0][0]).toEqual({ recipient: 'ann@learner.example', subject: 'Next steps', businessEventId: `employer_follow_up:${ID}` });
    expect([r.status, r.link, r.mandrill_id, r.sent_at]).toEqual(['sent', 'https://cal.example/dana', '<m1@mandrill>', NOW]);
    await runFollowUpPass(at(600_000), on);
    expect(mockMail).toHaveBeenCalledTimes(1);
  });
  it('DST: send_on 2026-11-01 09:00 Central waits at 14:59Z and goes at 15:00Z', async () => {
    const r = seed({ send_on: centralInstant('2026-11-01', '09:00') as Date });
    await runFollowUpPass(new Date('2026-11-01T14:59:00Z'), on);
    expect(mockMail).not.toHaveBeenCalled();
    await runFollowUpPass(new Date('2026-11-01T15:00:00Z'), on);
    expect(mockMail).toHaveBeenCalledTimes(1);
    expect(r.status).toBe('sent');
  });
  it('claims at most BATCH per pass', async () => {
    await runFollowUpPass(NOW, on);
    expect(mockCalls.claimLimit).toEqual([BATCH]);
    expect(BATCH).toBeLessThanOrEqual(50);
  });
});

describe('the condition and the checks, at send time', () => {
  it('"only if they haven\'t replied" and a reply arrived: Cancelled, nothing sent; "always" still sends', async () => {
    const r = seed({ only_if: 'no_reply', replied: true });
    expect((await runFollowUpPass(NOW, on)).cancelled).toBe(1);
    expect([r.status, r.status_reason]).toEqual(['cancelled', 'replied']);
    expect(mockMail).not.toHaveBeenCalled();
    seed({ only_if: 'always', replied: true }, 'f0000000-0000-4000-8000-000000000003');
    expect((await runFollowUpPass(NOW, on)).sent).toBe(1);
  });
  it('the candidate no longer put forward, or the sender gone: Cancelled; no address: Failed; nothing sent', async () => {
    const a = seed({ put_forward: false }, 'f0000000-0000-4000-8000-00000000000a');
    const b = seed({ member_email: null }, 'f0000000-0000-4000-8000-00000000000b');
    const c = seed({ to_email: null }, 'f0000000-0000-4000-8000-00000000000c');
    await runFollowUpPass(NOW, on);
    expect([a.status_reason, b.status_reason, c.status, c.status_reason]).toEqual(['candidate_removed', 'sender_removed', 'failed', 'NoRecipient']);
    expect(mockMail).not.toHaveBeenCalled();
  });
  it('a stored message with an em dash (however it got there) is never sent', async () => {
    const r = seed({ body: `Hi {first} ${String.fromCharCode(0x2014)} hello` });
    await runFollowUpPass(NOW, on);
    expect([r.status, r.status_reason]).toEqual(['failed', 'ContractViolation']);
    expect(mockSendOnce).not.toHaveBeenCalled();
  });
  it('the MERGED message is checked too: a name that adds a second link is never sent', async () => {
    const r = seed({ full_name: 'www.not-a-name.example Lee' });
    await runFollowUpPass(NOW, on);
    expect([r.status, r.status_reason]).toEqual(['failed', 'ContractViolation']);
    expect(mockSendOnce).not.toHaveBeenCalled();
  });
});

describe('retries, capped, and one email', () => {
  it('a retry after a timeout: waits 5 minutes, then one email goes', async () => {
    const r = seed();
    let delivered = 0;
    mockMail.mockReset().mockRejectedValueOnce(Object.assign(new Error('socket'), { name: 'TimeoutError' }))
      .mockImplementation(async () => { delivered += 1; return { messageId: '<m2@mandrill>' }; });
    expect((await runFollowUpPass(NOW, on)).retry).toBe(1);
    expect([r.status, r.last_error_class, r.next_attempt_at]).toEqual(['scheduled', 'TimeoutError', at(5 * 60_000)]);
    await runFollowUpPass(at(4 * 60_000), on);
    expect(mockMail).toHaveBeenCalledTimes(1);
    await runFollowUpPass(at(5 * 60_000), on);
    expect(r.status).toBe('sent');
    await runFollowUpPass(at(60 * 60_000), on);
    expect(delivered).toBe(1);
  });
  it('the pass dies after Mandrill took it (status never written): the stale claim finds it already sent, no second email', async () => {
    const r = seed();
    mockCalls.throwFinishOnce = true;
    await runFollowUpPass(NOW, on);
    expect(r.status).toBe('sending');
    await runFollowUpPass(at(STALE_MS - 60_000), on);
    expect(mockSendOnce).toHaveBeenCalledTimes(1);
    await runFollowUpPass(at(STALE_MS + 60_000), on);
    expect(mockMail).toHaveBeenCalledTimes(1);
    expect([r.status, r.attempts]).toEqual(['sent', 2]);
  });
  it('the first try and 3 retries, then Failed with the error class; nothing more after that', async () => {
    const r = seed();
    mockMail.mockReset().mockResolvedValue({});
    let t = NOW.getTime();
    for (let i = 0; i < 6; i += 1) { await runFollowUpPass(new Date(t), on); t += 60 * 60_000; }
    expect(mockMail).toHaveBeenCalledTimes(4);
    expect([r.status, r.status_reason, r.attempts]).toEqual(['failed', 'SendBlocked', 4]);
  });
  it('one row\'s database error is logged and does not stop the others', async () => {
    seed({}, 'f0000000-0000-4000-8000-0000000000e1'); seed({}, 'f0000000-0000-4000-8000-0000000000e2');
    mockCalls.throwContextFor = 'f0000000-0000-4000-8000-0000000000e1';
    expect((await runFollowUpPass(NOW, on)).sent).toBe(1);
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('"error_class":"SequelizeConnectionError"');
  });
});
