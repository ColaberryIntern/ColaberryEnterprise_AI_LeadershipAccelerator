/**
 * THE MISSING `from` THAT SWALLOWED THREE BUG REPORTS.
 *
 * 2026-11-11. Sohail filed three reports from the Marketing composer at 09:11, 09:17 and
 * 09:19 Central, one per step of the wizard. All three returned 201, all three logged
 * `outcome: "success"`, and not one was delivered or even appeared in Mandrill's message
 * log. Nothing was retried, nothing errored, and nobody knew for the rest of the day.
 *
 * The cause was a single absent field. With no `from`, nodemailer hands the relay an
 * EMPTY envelope sender. Mandrill answers `250 2.0.0 Ok: queued as ...` - so the send
 * resolves and looks perfect - and then discards a message it cannot attribute to a
 * sending domain. It was proved from production by sending the same mail twice, once
 * without `from` and once with it; only the second appeared in the message log.
 *
 * Two properties are pinned here, and the second is what makes the first safe:
 *   1. A send with no `from` acquires one before it reaches the transport.
 *   2. `readSendOutcome` can tell a real delivery from a 250-then-dropped one. That
 *      half lives in services/email/__tests__/sendOutcome.test.ts, because the function
 *      is pure and does not need this file's transport mocks.
 */

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

const mockEnv = {
  mandrillApiKey: 'test-key', // non-empty so the module builds a (mocked) transporter
  smtpUser: '',
  smtpPass: '',
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  emailFrom: 'info@colaberry.com',
  trainingWelcomeFromEmail: 'training@colaberry.com',
  trainingWelcomeFromName: 'Colaberry Training',
  frontendUrl: 'https://enterprise.colaberry.ai',
  databaseUrl: 'postgres://u:p@localhost:5432/test',
  nodeEnv: 'test',
};
jest.mock('../../config/env', () => ({ env: mockEnv }));

const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (...a: unknown[]) => mockSendMail(...a) }) },
}));

jest.mock('../settingsService', () => ({
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false, email: '', phone: '' }),
  getSetting: jest.fn().mockResolvedValue('ali@colaberry.com'),
  setSetting: jest.fn().mockResolvedValue(undefined),
  getSettingUpdatedAt: jest.fn().mockResolvedValue(null),
}));

const mockKillSwitch = jest.fn().mockResolvedValue(false);
jest.mock('../launchSafety', () => ({ isKillSwitchActive: (...a: unknown[]) => mockKillSwitch(...a) }));

// isDev false: applyDevEmailGuard passes options straight through, so what the transport
// receives is exactly what production would send.
jest.mock('../../config/featureFlags', () => ({ isDev: false }));

jest.mock('../email/idempotentSend', () => ({ sendOnce: jest.fn(), computeIdempotencyKey: jest.fn() }));
jest.mock('../communicationLogService', () => ({
  logCommunication: jest.fn().mockResolvedValue({ id: 'log-1' }),
}));

import { guardedSendMail } from '../emailService';
import { readSendOutcome } from '../email/sendOutcome';

/** And what it returned for the identical send WITH a from address. Verbatim. */
const PRODUCTION_DELIVERED = {
  response: '250 2.0.0 Ok: queued as 53ED6100508D',
  messageId: '<41a1dd01-d6a2-859d-f286-10aa1fd5cdf3@colaberry.com>',
  accepted: ['ali@colaberry.com'],
  rejected: [],
  envelope: { from: 'info@colaberry.com', to: ['ali@colaberry.com'] },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockKillSwitch.mockResolvedValue(false);
  mockSendMail.mockResolvedValue(PRODUCTION_DELIVERED);
});

describe('guardedSendMail supplies a sender when the caller forgot one', () => {
  it('defaults `from` so the message cannot leave with an empty envelope sender', async () => {
    await guardedSendMail({ to: 'ali@colaberry.com', subject: 'no from here', text: 'body' });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({ from: 'info@colaberry.com' });
  });

  it('CONTROL: a caller that passes `from` keeps its own, unchanged', async () => {
    // Without this, the case above would also pass if the default were applied
    // unconditionally and clobbered every deliberate sender in the file.
    await guardedSendMail({
      from: 'training@colaberry.com',
      to: 'ali@colaberry.com',
      subject: 's',
      text: 'b',
    });
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({ from: 'training@colaberry.com' });
  });

  it('leaves the rest of the message untouched while repairing the sender', async () => {
    const attachments = [{ filename: 'screenshot.png', content: Buffer.from('x') }];
    await guardedSendMail({
      to: 'a@b.com',
      subject: 'keep me',
      text: 't',
      html: '<p>h</p>',
      attachments,
    });
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({
      to: 'a@b.com',
      subject: 'keep me',
      text: 't',
      html: '<p>h</p>',
      attachments,
    });
  });

  it('says so out loud, so a defaulted send is findable in the logs', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await guardedSendMail({ to: 'a@b.com', subject: 'quiet failure', text: 'b' });
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('email.from_missing');
    expect(logged).toContain('MissingFromAddress');
  });

  it('still blocks on the kill switch rather than sending a repaired message', async () => {
    // The repair must not become a way around the one switch that stops outbound mail.
    mockKillSwitch.mockResolvedValue(true);
    const info = await guardedSendMail({ to: 'a@b.com', subject: 's', text: 'b' });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(readSendOutcome(info).delivered).toBe(false);
  });
});
