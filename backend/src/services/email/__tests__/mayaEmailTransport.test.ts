/**
 * The transport behind Maya's `sendEmail` capability (MR2).
 *
 * ── WHY THIS FILE EARNS ITS PLACE ───────────────────────────────────────────
 *
 * `mayaEmailService.test.ts` injects a stubbed `send`, so the service's decisions are covered and
 * the REAL transport is not. That is exactly the hole MR4 found in the welcome path, where every
 * test passed a stubbed `sendDm` and the actual delivery glue had no coverage at all - the glue
 * that runs for the first time on the day the capability is promoted.
 *
 * And this transport has a specific job that is easy to get wrong. `guardedSendMail` does not
 * throw when a send is refused: it returns a `SentMessageInfo`-SHAPED STUB with
 * `response: 'blocked_by_kill_switch'` or `'blocked_by_dev_email_guard'`, `messageId: ''` and
 * `accepted: []`.
 *
 * That is the same shape of trap as the voice path in MR1 T001, where `triggerVoiceCall` returned
 * `{ success: true, data: { skipped: true } }` and the caller read only `success` - which is how
 * two real visitors were told a call was coming that had never been placed. Reading a stub here as
 * a send would put the same lie in writing, and would also mark an `email_send_ledger` row `sent`
 * for mail that never left, permanently blocking the retry that would have delivered it.
 */
export {};

const mockGuardedSendMail = jest.fn();

jest.mock('../../emailService', () => ({
  guardedSendMail: (...a: unknown[]) => mockGuardedSendMail(...(a as [])),
}));
jest.mock('../../../config/env', () => ({ env: { emailFrom: 'info@colaberry.com' } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendMayaEmail } = require('../mayaEmailTransport');

const ARGS = { to: 'dana.reyes@gmail.com', subject: 'Welcome to Colaberry', body: 'Hello there.' };

const DELIVERED = {
  messageId: '<abc@mandrill>',
  accepted: ['dana.reyes@gmail.com'],
  rejected: [],
  response: '250 2.0.0 Ok: queued',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGuardedSendMail.mockResolvedValue(DELIVERED);
});

describe('a refusal that looks like a success is caught', () => {
  it.each([
    ['blocked_by_kill_switch', 'the platform-wide stop'],
    ['blocked_by_dev_email_guard', 'the dev environment backstop'],
  ])('%s is reported as not sent', async (response) => {
    mockGuardedSendMail.mockResolvedValue({
      messageId: '', accepted: [], rejected: [ARGS.to], response,
    });

    const res = await sendMayaEmail(ARGS);

    expect(res.ok).toBe(false);
    expect(res.errorClass).toBe('SendRefused');
    expect(res.error).toBe(response);
  });

  it('an empty accepted list is not a send, whatever the relay said', async () => {
    // Mandrill answers "250 Ok: queued" to a message it then discards when it cannot attribute
    // the sender - the failure three Marketing bug reports hit on 2026-11-11, all of which
    // returned success and none of which was delivered.
    mockGuardedSendMail.mockResolvedValue({
      messageId: '<abc@mandrill>', accepted: [], rejected: [], response: '250 2.0.0 Ok: queued',
    });

    const res = await sendMayaEmail(ARGS);

    expect(res.ok).toBe(false);
    expect(res.errorClass).toBe('RelayAcceptedNothing');
  });

  it('an accepted send with no message id is not reportable as sent', async () => {
    // Without a message id there is nothing to reconcile a bounce or a complaint against later.
    mockGuardedSendMail.mockResolvedValue({ ...DELIVERED, messageId: '' });

    const res = await sendMayaEmail(ARGS);

    expect(res.ok).toBe(false);
    expect(res.errorClass).toBe('NoMessageId');
  });

  it('a throw is reported as a failure with its error class, not swallowed', async () => {
    // Covers the unconfigured environment: `guardedSendMail` ends in `transporter!.sendMail(...)`,
    // a non-null assertion, so no SMTP configuration raises a TypeError rather than returning.
    mockGuardedSendMail.mockRejectedValue(new TypeError('Cannot read properties of null'));

    const res = await sendMayaEmail(ARGS);

    expect(res.ok).toBe(false);
    expect(res.errorClass).toBe('TypeError');
  });
});

describe('the envelope', () => {
  it('always carries a from address, because an empty one is silently discarded', async () => {
    await sendMayaEmail(ARGS);
    const options = mockGuardedSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(String(options.from)).toContain('info@colaberry.com');
    expect(String(options.from)).toContain('Maya at Colaberry');
    expect(options.replyTo).toBe('info@colaberry.com');
  });

  it('sends the body as PLAIN TEXT, never as html', async () => {
    // Standing rule for outbound body copy on this project (C122). It is also the right call for
    // this message: nothing in it needs layout, and a text part makes "no price, no date, no
    // link that could rot" verifiable by reading the source.
    await sendMayaEmail(ARGS);
    const options = mockGuardedSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(options.text).toBe(ARGS.body);
    expect(options.html).toBeUndefined();
  });

  it('refuses before calling the relay when there is no from address configured', async () => {
    jest.resetModules();
    jest.doMock('../../../config/env', () => ({ env: { emailFrom: '   ' } }));
    jest.doMock('../../emailService', () => ({
      guardedSendMail: (...a: unknown[]) => mockGuardedSendMail(...(a as [])),
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sendMayaEmail: fresh } = require('../mayaEmailTransport');

    const res = await fresh(ARGS);

    expect(res.ok).toBe(false);
    expect(res.errorClass).toBe('MissingFromAddress');
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
    jest.resetModules();
  });
});

describe('a genuine delivery is reported as one', () => {
  it('returns ok with the provider message id', async () => {
    // The positive case matters as much as the negatives: a transport that refuses everything
    // would pass every test above and deliver nothing on promotion day.
    const res = await sendMayaEmail(ARGS);

    expect(res).toEqual({ ok: true, messageId: '<abc@mandrill>' });
    expect(mockGuardedSendMail).toHaveBeenCalledTimes(1);
  });
});
