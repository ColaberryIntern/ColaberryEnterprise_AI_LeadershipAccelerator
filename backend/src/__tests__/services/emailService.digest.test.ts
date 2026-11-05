/**
 * emailService.sendCommunityDigestEmail() content tests (offline-DM-
 * notification fix, item 3): the daily digest must render a real, correct
 * "N new messages" line when there are unread DMs, matching the existing
 * per-bucket-count line pattern (see the newPostCount line) — not just a
 * count threaded through, and not a snapshot-only assertion. No real SMTP
 * I/O — nodemailer and the settings/kill-switch dependencies are mocked.
 *
 * UPDATED 2026-11-05 for Aleem's accepted digest redesign (UX Team to-do
 * 10478732232). The three behaviours these tests were written to protect are
 * unchanged and still asserted — a real pluralised DM line when there are
 * DMs, nothing at all when there are none, and the mention/post counts still
 * rendering alongside it. Only the markup they live in changed: the counts are
 * now stat tiles, so the assertions read the tile instead of a <strong> run.
 */

const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'm1', accepted: ['x@y.com'], rejected: [] });

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: sendMailMock })) },
}));
jest.mock('../../config/env', () => ({
  env: {
    mandrillApiKey: 'test-key',
    emailFrom: 'noreply@colaberry.com',
    smtpUser: undefined,
    smtpPass: undefined,
    smtpHost: undefined,
    smtpPort: undefined,
  },
}));
jest.mock('../../services/settingsService', () => ({
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false, email: null }),
  getSetting: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../services/launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => s }));

import { sendCommunityDigestEmail, CommunityDigestEmailData } from '../../services/emailService';

const baseData: CommunityDigestEmailData = {
  to: 'ada@example.com',
  fullName: 'Ada Lovelace',
  digestDate: '2026-08-11',
  unreadNotificationCount: 0,
  unreadDmCount: 0,
  newPostCount: 0,
  upcomingEvents: [],
};

function sentHtml(): string {
  return sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1][0].html as string;
}

beforeEach(() => {
  sendMailMock.mockClear();
  sendMailMock.mockResolvedValue({ messageId: 'm1', accepted: ['x@y.com'], rejected: [] });
});

describe('sendCommunityDigestEmail — DM content (offline-DM-notification fix)', () => {
  it('happy/content: unreadDmCount 3 renders the real plural line "3 new messages", not just a count field', async () => {
    await sendCommunityDigestEmail({ ...baseData, unreadDmCount: 3 });
    const html = sentHtml();
    expect(html).toContain('>3</p>');
    expect(html).toContain('new messages in your inbox');
  });

  it('boundary: unreadDmCount 1 renders the singular form "1 new message"', async () => {
    await sendCommunityDigestEmail({ ...baseData, unreadDmCount: 1 });
    const html = sentHtml();
    expect(html).toContain('new message in your inbox');
    expect(html).not.toContain('new messages in your inbox');
  });

  it('boundary: unreadDmCount 0 omits the DM line entirely (no "0 new messages" noise)', async () => {
    await sendCommunityDigestEmail({ ...baseData, unreadDmCount: 0 });
    expect(sentHtml()).not.toContain('new message');
  });

  it('regression: the existing unread-notification and new-post lines still render unchanged alongside the new DM line', async () => {
    await sendCommunityDigestEmail({ ...baseData, unreadNotificationCount: 2, newPostCount: 5, unreadDmCount: 1 });
    const html = sentHtml();
    expect(html).toContain('unread mentions and replies');
    expect(html).toContain('new posts in your cohort since yesterday');
    expect(html).toContain('new message in your inbox');
    // The counts themselves, as their own tiles.
    expect(html).toContain('>2</p>');
    expect(html).toContain('>5</p>');
  });
});
