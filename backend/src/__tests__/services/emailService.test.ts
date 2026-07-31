/**
 * Materials rendering for accelerator session emails: seeded materials_json
 * entries are `{ title, type }` with no `url`, which previously rendered as
 * `<a href="undefined">` (visible to recipients as a stray "[undefined]").
 */

jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

const mockEnv = {
  mandrillApiKey: '',
  smtpUser: '',
  smtpPass: '',
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  emailFrom: 'info@colaberry.com',
};
jest.mock('../../config/env', () => ({ env: mockEnv }));

jest.mock('../../services/settingsService', () => ({
  __esModule: true,
  getTestOverrides: jest.fn().mockResolvedValue(null),
  getSetting: jest.fn().mockResolvedValue(null),
}));

import { buildSessionReminderHtml, buildMissedSessionHtml } from '../../services/emailService';

const baseReminder = {
  to: 'student@example.com',
  fullName: 'Jordan Lee',
  sessionTitle: 'The Enterprise AI Mandate',
  sessionNumber: 1,
  sessionDate: '2026-08-01',
  startTime: '2:00 PM',
  meetingLink: null,
  isOneHour: false,
};

describe('buildSessionReminderHtml materials rendering', () => {
  it('renders title-only materials as plain text, not a broken link', () => {
    const html = buildSessionReminderHtml({
      ...baseReminder,
      materialsJson: [{ title: 'AI Maturity Assessment Template', type: 'template' }],
    });
    expect(html).toContain('<li>AI Maturity Assessment Template</li>');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('href="undefined"');
  });

  it('still renders a real link when a material has a url', () => {
    const html = buildSessionReminderHtml({
      ...baseReminder,
      materialsJson: [{ title: 'Session 1 Slides', url: 'https://example.com/slides.pdf' }],
    });
    expect(html).toContain('<a href="https://example.com/slides.pdf">Session 1 Slides</a>');
  });

  it('omits the materials section entirely when there are none', () => {
    const html = buildSessionReminderHtml({ ...baseReminder, materialsJson: null });
    expect(html).not.toContain('Session Materials');
  });
});

describe('buildMissedSessionHtml materials rendering', () => {
  it('renders title-only materials as plain text, not a broken link', () => {
    const html = buildMissedSessionHtml({
      to: 'student@example.com',
      fullName: 'Jordan Lee',
      sessionTitle: 'The Enterprise AI Mandate',
      sessionNumber: 1,
      sessionDate: '2026-08-01',
      recordingUrl: null,
      consecutiveMisses: 1,
      materialsJson: [{ title: 'Use Case Prioritization Scorecard', type: 'template' }],
    });
    expect(html).toContain('<li>Use Case Prioritization Scorecard</li>');
    expect(html).not.toContain('href="undefined"');
  });
});
