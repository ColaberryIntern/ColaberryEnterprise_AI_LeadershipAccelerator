/**
 * The dev guard wired into emailService's actual send funnel.
 *
 * devEmailGuard.test.ts proves the routing RULES. This proves the rules are
 * genuinely in the path: that a real send through guardedSendMail() cannot hand
 * a non-sink address to the transport when APP_ENV=dev, and — just as important
 * — that production behavior is completely unchanged.
 *
 * sendSessionReminder is used as the vehicle because it is the exact path that
 * mailed 55 students on 2026-08-13.
 */

const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'm1', accepted: [], rejected: [] });
const getTestOverridesMock = jest.fn().mockResolvedValue({ enabled: false, email: '' });
const isDevMock = { value: false };

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: sendMailMock })) },
}));
jest.mock('../../config/env', () => ({
  env: {
    mandrillApiKey: 'test-key', emailFrom: 'info@colaberry.com',
    smtpUser: undefined, smtpPass: undefined, smtpHost: undefined, smtpPort: undefined,
  },
}));
jest.mock('../../config/featureFlags', () => ({
  get isDev() { return isDevMock.value; },
  get isProd() { return !isDevMock.value; },
  FLAGS: {},
}));
jest.mock('../../services/settingsService', () => ({
  getTestOverrides: (...a: any[]) => getTestOverridesMock(...a),
  getSetting: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../services/launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => s }));
const logCommunicationMock = jest.fn().mockResolvedValue({});
jest.mock('../../services/communicationLogService', () => ({
  logCommunication: (...a: any[]) => logCommunicationMock(...a),
}));

import { sendSessionReminder } from '../../services/emailService';

const reminder = {
  to: 'student@gmail.com',
  fullName: 'Ada Lovelace',
  sessionTitle: 'Week 3 · Build Day',
  sessionNumber: 7,
  sessionDate: '2026-08-13',
  startTime: '18:30:00',
  meetingLink: null,
  materialsJson: null,
  isOneHour: false,
};

function sentOptions(): any {
  return sendMailMock.mock.calls[0][0];
}

describe('emailService dev guard (in the real send path)', () => {
  const origSink = process.env.DEV_EMAIL_SINK;

  beforeEach(() => {
    jest.clearAllMocks();
    isDevMock.value = false;
    delete process.env.DEV_EMAIL_SINK;
    getTestOverridesMock.mockResolvedValue({ enabled: false, email: '' });
  });
  afterAll(() => {
    if (origSink === undefined) delete process.env.DEV_EMAIL_SINK;
    else process.env.DEV_EMAIL_SINK = origSink;
  });

  it('PRODUCTION: delivers to the real recipient, untouched', () => {
    isDevMock.value = false;
    return sendSessionReminder(reminder as any).then(() => {
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sentOptions().to).toBe('student@gmail.com');
      expect(sentOptions().subject).not.toContain('[DEV');
    });
  });

  it('DEV with DEV_EMAIL_SINK: the transport never sees the student address', async () => {
    isDevMock.value = true;
    process.env.DEV_EMAIL_SINK = 'devsink@colaberry.com';

    await sendSessionReminder(reminder as any);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sentOptions().to).toBe('devsink@colaberry.com');
    expect(JSON.stringify(sentOptions().to)).not.toContain('student@gmail.com');
    expect(sentOptions().subject).toContain('[DEV → student@gmail.com]');
  });

  it('DEV falls back to the test_email setting when no env sink is set', async () => {
    isDevMock.value = true;
    getTestOverridesMock.mockResolvedValue({ enabled: false, email: 'ali@colaberry.com' });

    await sendSessionReminder(reminder as any);

    // Note `enabled: false` — the upstream test-mode redirect did NOT run, which
    // is precisely the state dev1 was in before 2026-08-13. The guard still holds.
    expect(sentOptions().to).toBe('ali@colaberry.com');
  });

  it('DEV prefers the env sink over the database setting', async () => {
    isDevMock.value = true;
    process.env.DEV_EMAIL_SINK = 'devsink@colaberry.com';
    getTestOverridesMock.mockResolvedValue({ enabled: false, email: 'ali@colaberry.com' });

    await sendSessionReminder(reminder as any);

    // The env var is the durable source; the DB row is the one that can vanish.
    expect(sentOptions().to).toBe('devsink@colaberry.com');
  });

  it('DEV with NO sink anywhere: blocks the send entirely', async () => {
    isDevMock.value = true;
    getTestOverridesMock.mockResolvedValue({ enabled: false, email: '' });

    await sendSessionReminder(reminder as any);

    // Fail closed — nothing reached the transport at all.
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('DEV blocks even when the settings lookup itself throws', async () => {
    isDevMock.value = true;
    getTestOverridesMock.mockRejectedValue(new Error('settings db down'));

    await sendSessionReminder(reminder as any);

    // A broken settings table must not become an open door.
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('a blocked dev send does not throw at the caller', async () => {
    isDevMock.value = true;
    // The scheduler treats a throw as a send failure; blocking is not a failure.
    await expect(sendSessionReminder(reminder as any)).resolves.toBeUndefined();
  });

  describe('the audit row must not claim a delivery that never happened', () => {
    it('records a blocked send as blocked, not sent', async () => {
      isDevMock.value = true;
      getTestOverridesMock.mockResolvedValue({ enabled: false, email: '' });

      await sendSessionReminder(reminder as any);

      expect(sendMailMock).not.toHaveBeenCalled();
      const row = logCommunicationMock.mock.calls[0][0];
      // Recording 'sent' here would put 55 phantom deliveries in
      // communication_logs — defeating the audit trail this row exists for.
      expect(row.status).toBe('blocked');
      expect(row.provider_message_id).toBeNull();
    });

    it('still records a real dev redirect as sent, with the sink as recipient', async () => {
      isDevMock.value = true;
      process.env.DEV_EMAIL_SINK = 'devsink@colaberry.com';

      await sendSessionReminder(reminder as any);

      const row = logCommunicationMock.mock.calls[0][0];
      expect(row.status).toBe('sent');
      expect(row.provider_message_id).toBe('m1');
    });

    it('records a production send as sent', async () => {
      isDevMock.value = false;

      await sendSessionReminder(reminder as any);

      expect(logCommunicationMock.mock.calls[0][0].status).toBe('sent');
    });
  });
});
