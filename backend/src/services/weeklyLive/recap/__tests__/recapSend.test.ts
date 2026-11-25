jest.mock('../recapStore');
jest.mock('../recapRecipients');
jest.mock('../../../emailService', () => ({
  guardedSendMail: jest.fn(),
  resolveEmailRecipient: jest.fn(async (to: string, subject: string) => ({ to, subject })),
}));

import * as store from '../recapStore';
import { loadRecipientPlan } from '../recapRecipients';
import { guardedSendMail } from '../../../emailService';
import { sendAll, sendTest, dryRun, loadReady, RecapError } from '../recapSendService';
import { draftSummary } from '../recapDraft';

const SID = '11111111-1111-4111-8111-111111111111';
const summary = { headline: 'It Works While You Sleep', intro: '', ideas: [{ icon: '', title: 'One skill, one job', text: '' }], steps: [], quote: '', homework: '' };
const session = { id: SID, title: 'Weekly Live Ep 2', session_date: '2026-11-30', start_time: '18:30', kit_config_json: null, description: null };
const m = store as jest.Mocked<typeof store>;
const send = guardedSendMail as jest.Mock;
const plan = loadRecipientPlan as jest.Mock;
const noSleep = async () => undefined;

beforeEach(() => {
  jest.resetAllMocks();
  m.getSession.mockResolvedValue(session as never);
  m.getRecap.mockResolvedValue({ session_id: SID, summary, next_event_url: 'https://www.eventbrite.com/e/123', test_sent_at: new Date() } as never);
  m.sentEmails.mockResolvedValue(new Set());
  m.ensureSendRows.mockResolvedValue(undefined);
  m.finishSend.mockResolvedValue(undefined);
  m.markTestSent.mockResolvedValue(undefined);
  plan.mockResolvedValue({
    recipients: [{ guestId: 'g1', name: 'Ana', email: 'ana@x.com', emailLower: 'ana@x.com' }, { guestId: 'g2', name: 'Bo', email: 'bo@x.com', emailLower: 'bo@x.com' }],
    skipped: [{ guestId: 'g3', emailLower: 'q@example.com', reason: 'test_guest' }],
  });
  send.mockResolvedValue({ messageId: 'mid' });
  (jest.requireMock('../../../emailService').resolveEmailRecipient as jest.Mock).mockImplementation(async (to: string, subject: string) => ({ to, subject }));
});

describe('recap send', () => {
  it('sends once per claimed recipient from ali@ with the opt-out header', async () => {
    m.claimSend.mockResolvedValue(true);
    const r = await sendAll(SID, noSleep);
    expect(r).toEqual({ sent: 2, failed: 0, skippedNow: 1, alreadySent: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    const opts = send.mock.calls[0][0];
    expect(opts.from).toContain('ali@colaberry.com');
    expect(opts.headers['List-Unsubscribe']).toMatch(/^<https?:\/\/.+\/api\/live\/recap\/unsubscribe\?t=/);
    expect(m.ensureSendRows).toHaveBeenCalledWith(SID, expect.arrayContaining([expect.objectContaining({ emailLower: 'q@example.com', status: 'skipped', skipReason: 'test_guest' })]));
  });
  it('a rerun sends nothing when every row is already claimed or sent (idempotent)', async () => {
    m.claimSend.mockResolvedValue(false);
    const r = await sendAll(SID, noSleep);
    expect(r.sent).toBe(0);
    expect(r.alreadySent).toBe(2);
    expect(send).not.toHaveBeenCalled();
  });
  it('a provider failure marks that row failed and the run continues', async () => {
    m.claimSend.mockResolvedValue(true);
    send.mockRejectedValueOnce(Object.assign(new Error('550'), { name: 'SmtpError' })).mockResolvedValueOnce({ messageId: 'ok' });
    const r = await sendAll(SID, noSleep);
    expect(r).toMatchObject({ sent: 1, failed: 1 });
    expect(m.finishSend).toHaveBeenCalledWith(SID, 'ana@x.com', false, expect.objectContaining({ errorClass: 'SendError' }));
  });
  it('refuses the real send until the test copy went to Ali', async () => {
    m.getRecap.mockResolvedValue({ session_id: SID, summary, next_event_url: 'https://www.eventbrite.com/e/123', test_sent_at: null } as never);
    await expect(sendAll(SID, noSleep)).rejects.toMatchObject({ status: 409, code: 'test_first' });
    expect(send).not.toHaveBeenCalled();
  });
  it('test copy goes to Ali only and marks the recap test-sent', async () => {
    const r = await sendTest(SID);
    expect(r.to).toBe('ali@colaberry.com');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe('ali@colaberry.com');
    expect(send.mock.calls[0][0].subject).toMatch(/^\[TEST\] /);
    expect(m.markTestSent).toHaveBeenCalledWith(SID);
  });
  it('dry run counts without sending or writing', async () => {
    m.sentEmails.mockResolvedValue(new Set(['bo@x.com']));
    expect(await dryRun(SID)).toEqual({ toSend: 1, alreadySent: 1, skipped: { test_guest: 1 }, checkedIn: 3 });
    expect(send).not.toHaveBeenCalled();
    expect(m.ensureSendRows).not.toHaveBeenCalled();
  });
});

describe('recap readiness', () => {
  it('needs an overview, an https next-event link and clean copy', async () => {
    m.getRecap.mockResolvedValue({ session_id: SID, summary: null, next_event_url: null, test_sent_at: null } as never);
    await expect(loadReady(SID)).rejects.toMatchObject({ code: 'no_summary' });
    m.getRecap.mockResolvedValue({ session_id: SID, summary, next_event_url: 'http://insecure.example', test_sent_at: null } as never);
    await expect(loadReady(SID)).rejects.toMatchObject({ code: 'no_next_event' });
    m.getRecap.mockResolvedValue({ session_id: SID, summary: { ...summary, headline: 'Join free tonight' }, next_event_url: 'https://www.eventbrite.com/e/1', test_sent_at: null } as never);
    await expect(loadReady(SID)).rejects.toBeInstanceOf(RecapError);
    m.getSession.mockResolvedValue(null);
    await expect(loadReady(SID)).rejects.toMatchObject({ status: 404 });
  });
});

describe('recap draft', () => {
  it('returns the AI overview when it matches the shape', async () => {
    const call = jest.fn().mockResolvedValue({ parsed: summary, runtime_ms: 5, cost_usd: 0 });
    const d = await draftSummary(session, call);
    expect(d.source).toBe('ai');
    expect(d.summary.headline).toBe('It Works While You Sleep');
  });
  it('falls back to the safe default on malformed output', async () => {
    const call = jest.fn().mockResolvedValue({ parsed: { headline: 'x' }, runtime_ms: 5, cost_usd: 0 });
    const d = await draftSummary(session, call);
    expect(d).toMatchObject({ source: 'default', errorClass: 'ContractViolation' });
  });
  it('falls back on an upstream error without throwing', async () => {
    const call = jest.fn().mockRejectedValue(new Error('503'));
    expect(await draftSummary(session, call)).toMatchObject({ source: 'default', errorClass: 'UpstreamUnavailable' });
  });
});
