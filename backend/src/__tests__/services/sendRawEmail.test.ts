/**
 * sendRawEmail — BC #10099862873 (P1, item 3): the EmailSendFn adapter that
 * lets the dormant incident-fanout email subscriber ride the existing
 * guarded/kill-switch-aware transport without knowing about Mandrill.
 */
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

const mockEnv = {
  mandrillApiKey: 'test-key', // non-empty so the module builds a (mocked) transporter
  smtpUser: '',
  smtpPass: '',
  emailFrom: 'ali@colaberry.com',
};
jest.mock('../../config/env', () => ({ env: mockEnv }));

const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (...a: any[]) => mockSendMail(...a) }) },
}));

jest.mock('../../services/settingsService', () => ({
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false, email: '', phone: '' }),
  getSetting: jest.fn().mockResolvedValue(''),
}));

const mockKillSwitch = jest.fn().mockResolvedValue(false);
jest.mock('../../services/launchSafety', () => ({ isKillSwitchActive: (...a: any[]) => mockKillSwitch(...a) }));

import { sendRawEmail } from '../../services/emailService';

const baseInput = { to: ['ali@colaberry.com'], subject: 'Test', html: '<p>hi</p>', text: 'hi' };

describe('sendRawEmail', () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockKillSwitch.mockReset().mockResolvedValue(false);
  });

  it('happy path: sends via guardedSendMail and reports ok:true', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'm1', accepted: ['ali@colaberry.com'], rejected: [] });

    const result = await sendRawEmail(baseInput);

    expect(result).toEqual({ ok: true });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0]).toEqual(
      expect.objectContaining({ to: 'ali@colaberry.com', subject: 'Test', html: '<p>hi</p>', text: 'hi' })
    );
  });

  it('boundary: no recipients — returns ok:false without attempting a send', async () => {
    const result = await sendRawEmail({ ...baseInput, to: [] });

    expect(result).toEqual({ ok: false, error: 'No recipients' });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('failure path: a transport error is caught and reported, not thrown', async () => {
    mockSendMail.mockRejectedValue(new Error('Mandrill down'));

    const result = await sendRawEmail(baseInput);

    expect(result).toEqual({ ok: false, error: 'Mandrill down' });
  });

  it('failure path: a kill-switch-blocked send resolves (not throws) but must report ok:false, not a false success', async () => {
    mockKillSwitch.mockResolvedValue(true);

    const result = await sendRawEmail(baseInput);

    expect(result).toEqual({ ok: false, error: 'blocked by kill switch' });
    expect(mockSendMail).not.toHaveBeenCalled(); // guardedSendMail short-circuits before the real transporter call
  });

  it('multiple recipients are joined into a single To header', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'm2', accepted: [], rejected: [] });

    await sendRawEmail({ ...baseInput, to: ['a@x.com', 'b@x.com'] });

    expect(mockSendMail.mock.calls[0][0].to).toBe('a@x.com, b@x.com');
  });
});
