/**
 * The Gov Studio "Report a problem" core: validation, recipient gating, the email subject the Gov tab
 * matches on, and the double-send dedupe. The email transport, the settings store, and Marketing's
 * shared screenshot/recipient helpers are mocked so this stays a fast unit test.
 */
import { buildGovStudioSubject, handleGovStudioBugReport, __resetDedupeForTests } from '../studioBugReport';
import { guardedSendMail } from '../../emailService';
import { getSetting } from '../../settingsService';

jest.mock('../../emailService', () => ({ guardedSendMail: jest.fn().mockResolvedValue({ messageId: 'x' }) }));
jest.mock('../../settingsService', () => ({ getSetting: jest.fn() }));
jest.mock('../../../routes/admin/marketingBugReportRoutes', () => ({
  decodeScreenshot: () => null,
  parseRecipients: (v: unknown) => (Array.isArray(v) ? (v as string[]) : String(v ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))),
}));

const mockSend = guardedSendMail as jest.Mock;
const mockGetSetting = getSetting as jest.Mock;

const validBody = (over: Record<string, unknown> = {}) => ({
  summary: 'Needs-you chip shows 0',
  whatHappened: 'Opened the studio and the Needs you chip stayed at 0 even with open questions.',
  pageUrl: 'https://enterprise.colaberry.ai/admin/internship/gov-contract/abc',
  routePath: '/admin/internship/gov-contract/abc',
  reportedAtCentral: 'Nov 5, 2026, 3:40 PM Central',
  browser: 'Chrome', viewport: '1440x900 @ 1x',
  contractName: 'Enterprise Work Order Management System',
  ...over,
});

beforeEach(() => { jest.clearAllMocks(); __resetDedupeForTests(); mockGetSetting.mockResolvedValue('ali@colaberry.com'); });

describe('buildGovStudioSubject', () => {
  it('tags the subject so the Gov tab email check matches, and names the contract', () => {
    expect(buildGovStudioSubject('X broke', 'Saratoga Springs WOMS', 'p1')).toBe('[Gov Studio bug] X broke — Saratoga Springs WOMS');
  });
  it('falls back to the project id when there is no contract name', () => {
    expect(buildGovStudioSubject('X broke', null, 'p1')).toBe('[Gov Studio bug] X broke — project p1');
  });
});

describe('handleGovStudioBugReport', () => {
  it('rejects an invalid body with 400 and never emails', async () => {
    const r = await handleGovStudioBugReport('p1', 'ali@colaberry.com', { summary: 'no' });
    expect(r.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 503 when no recipient is configured', async () => {
    mockGetSetting.mockResolvedValue(null);
    const r = await handleGovStudioBugReport('p1', 'ali@colaberry.com', validBody());
    expect(r.status).toBe(503);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('emails the recipients with the tagged subject and returns 201', async () => {
    const r = await handleGovStudioBugReport('p1', 'ali@colaberry.com', validBody());
    expect(r.status).toBe(201);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const sent = mockSend.mock.calls[0][0];
    expect(sent.subject).toContain('[Gov Studio bug]');
    expect(sent.to).toContain('ali@colaberry.com');
    expect(String(sent.text)).toContain('Enterprise Work Order Management System');
  });

  it('dedupes an identical report from the same reporter within the window (no second email)', async () => {
    await handleGovStudioBugReport('p1', 'ali@colaberry.com', validBody());
    const second = await handleGovStudioBugReport('p1', 'ali@colaberry.com', validBody());
    expect(second.body.deduped).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('prefers the dedicated gov recipient setting over admin_notification_emails', async () => {
    mockGetSetting.mockImplementation(async (key: string) => (key === 'gov_studio_bug_report_emails' ? 'gov@colaberry.com' : 'admin@colaberry.com'));
    const r = await handleGovStudioBugReport('p1', 'ali@colaberry.com', validBody());
    expect(r.status).toBe(201);
    expect(mockSend.mock.calls[0][0].to).toBe('gov@colaberry.com');
  });
});
