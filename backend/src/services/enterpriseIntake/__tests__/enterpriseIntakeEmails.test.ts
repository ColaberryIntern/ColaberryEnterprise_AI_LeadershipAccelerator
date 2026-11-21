const mockEnv: Record<string, unknown> = { mandrillApiKey: 'k', emailFrom: 'info@colaberry.com' };
const mockSendMail = jest.fn();
const mockResolve = jest.fn();

jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../emailService', () => ({
  guardedSendMail: (o: any) => mockSendMail(o),
  resolveEmailRecipient: (...a: any[]) => mockResolve(...a),
  htmlToPlainText: (h: string) => h.replace(/<[^>]+>/g, ''),
  emailHeaders: (tag: string) => ({ 'X-Tag': tag }),
}));

import { FREE_WORD_RULE } from '../../content/bannedCopyRule';
import { EmailNotSent, REMINDER_SUBJECT, buildReminderHtml, sendAliBrief, sendInterviewReminder } from '../enterpriseIntakeEmails';

const DATA = { to: 'pat@acme.com', fullName: 'Pat Doe', company: 'Acme <Co>', link: 'https://enterprise.colaberry.ai/demo-pilot?intake=x', meetingWhen: 'Monday, November 23 at 9:00 AM Central' };

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.mandrillApiKey = 'k';
  mockResolve.mockImplementation(async (to: string, subject: string) => ({ to, subject }));
  mockSendMail.mockResolvedValue({ messageId: 'm1', response: '250 ok' });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('interview reminder', () => {
  it('carries the link, the meeting, escapes their text, and keeps the copy rules', () => {
    const html = buildReminderHtml(DATA);
    expect(html).toContain('Hi Pat,');
    expect(html).toContain('href="https://enterprise.colaberry.ai/demo-pilot?intake=x"');
    expect(html).toContain('Monday, November 23 at 9:00 AM Central');
    expect(html).toContain('Acme &lt;Co&gt;');
    expect(html).not.toMatch(new RegExp(`\\b${FREE_WORD_RULE.word}\\b`, 'i'));
    expect(html).not.toMatch(/[–—]/);
    expect(buildReminderHtml({ ...DATA, meetingWhen: null })).not.toContain('Your meeting with Ali');
  });

  it('is never redirected (it carries their working link)', async () => {
    await sendInterviewReminder(DATA);
    expect(mockResolve).toHaveBeenCalledWith('pat@acme.com', REMINDER_SUBJECT, { neverRedirect: true });
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({ to: 'pat@acme.com', subject: REMINDER_SUBJECT, from: '"Colaberry Enterprise AI" <info@colaberry.com>' });
  });

  it('throws when it did not send: no SMTP, kill switch, or transport error', async () => {
    mockEnv.mandrillApiKey = '';
    await expect(sendInterviewReminder(DATA)).rejects.toBeInstanceOf(EmailNotSent);
    mockEnv.mandrillApiKey = 'k';
    mockSendMail.mockResolvedValue({ response: 'blocked_by_kill_switch' });
    await expect(sendInterviewReminder(DATA)).rejects.toBeInstanceOf(EmailNotSent);
    mockSendMail.mockRejectedValue(new Error('ECONNRESET'));
    await expect(sendInterviewReminder(DATA)).rejects.toThrow('ECONNRESET');
  });
});

describe("Ali's brief", () => {
  it('goes to ali@colaberry.com and follows the normal test-mode redirect', async () => {
    await sendAliBrief('Meeting Monday: Acme', '<p>x</p>');
    expect(mockResolve).toHaveBeenCalledWith('ali@colaberry.com', 'Meeting Monday: Acme', { neverRedirect: false });
  });
});
