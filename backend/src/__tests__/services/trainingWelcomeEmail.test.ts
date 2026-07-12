/**
 * Branded welcome email (CC-20260712-q7m2 follow-up).
 * Proves the welcome HTML renders + escapes, and that sendTrainingWelcome now goes
 * through guardedSendMail so the global kill switch actually blocks it (the old
 * code used the raw transporter and bypassed the guard).
 */

jest.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

const mockEnv = {
  mandrillApiKey: 'test-key', // non-empty so the module builds a (mocked) transporter
  smtpUser: '',
  smtpPass: '',
  emailFrom: 'enrollment@colaberry.com',
  trainingWelcomeFromEmail: 'training@colaberry.com',
  trainingWelcomeFromName: 'Colaberry Training',
  frontendUrl: 'https://enterprise.colaberry.ai',
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

const mockKillSwitch = jest.fn();
jest.mock('../../services/launchSafety', () => ({ isKillSwitchActive: (...a: any[]) => mockKillSwitch(...a) }));

import { buildTrainingWelcomeHtml, sendTrainingWelcome } from '../../services/emailService';

describe('sendTrainingWelcome — guardedSendMail', () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockKillSwitch.mockReset();
  });
  afterAll(() => jest.restoreAllMocks());

  it('sends (via guardedSendMail) when the kill switch is off', async () => {
    mockKillSwitch.mockResolvedValue(false);
    mockSendMail.mockResolvedValue({ messageId: 'm1', accepted: ['a@b.com'], rejected: [] });
    const res = await sendTrainingWelcome({ to: 'a@b.com', fullName: 'Jane Doe', portalLink: 'https://enterprise.colaberry.ai/portal/verify?token=t' });
    expect(res.sent).toBe(true);
    expect(res.messageId).toBe('m1');
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].from).toContain('training@colaberry.com');
  });

  it('does NOT send and reports sent:false when the kill switch is active', async () => {
    mockKillSwitch.mockResolvedValue(true);
    const res = await sendTrainingWelcome({ to: 'a@b.com', fullName: 'Jane', portalLink: 'https://x/portal/verify?token=t' });
    expect(res.sent).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('buildTrainingWelcomeHtml', () => {
  const link = 'https://enterprise.colaberry.ai/portal/verify?token=abc-123';
  it('renders first name + portal CTA + footer', () => {
    const html = buildTrainingWelcomeHtml({ to: 'x@y.com', fullName: 'Jane Doe', portalLink: link });
    expect(html).toContain('Jane');
    expect(html).toContain(link);
    expect(html).toContain('Access Your Portal');
    expect(html).toContain('training.colaberry.com');
  });
  it('escapes untrusted name input', () => {
    const html = buildTrainingWelcomeHtml({ to: 'x@y.com', fullName: '<script>alert(1)</script>', portalLink: link });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
