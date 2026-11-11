/**
 * The Gov Studio "Report a problem" core: validation, recipient gating, the email subject the Gov tab
 * matches on, and the double-send dedupe. The email transport, the settings store, and Marketing's
 * shared screenshot/recipient helpers are mocked so this stays a fast unit test.
 */
import { buildGovStudioSubject, handleGovStudioBugReport, __resetDedupeForTests } from '../studioBugReport';
import { guardedSendMail } from '../../emailService';
import { getSetting } from '../../settingsService';

// A REALISTIC RESOLVED VALUE, not `{ messageId: 'x' }`.
//
// The route now reads the transport's result, because on 2026-11-11 three Marketing bug
// reports were accepted and silently dropped and the route reported all three as a
// success. `{ messageId: 'x' }` has no `accepted` and no envelope, so it is
// indistinguishable from that drop - the old mock was asserting a success the real
// transport could not have produced. This is the shape production actually returns.
jest.mock('../../emailService', () => ({
  guardedSendMail: jest.fn().mockResolvedValue({
    response: '250 2.0.0 Ok: queued as 53ED6100508D',
    messageId: '<41a1dd01-d6a2-859d-f286-10aa1fd5cdf3@colaberry.com>',
    accepted: ['gov@colaberry.com'],
    rejected: [],
    envelope: { from: 'info@colaberry.com', to: ['gov@colaberry.com'] },
  }),
}));
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

describe('a report that was accepted but not delivered', () => {
  /**
   * The 2026-11-11 defect, from the reporter's side.
   *
   * The relay answers `250 ... Ok: queued` for a message with an empty envelope sender
   * and then discards it, so `accepted` is populated and the send resolves. The route
   * used to return 201 for exactly this. Being thanked for a report that reached nobody
   * is the worst of the outcomes: the problem stays broken AND nobody is looking for it.
   */
  it('answers 502 and tells the reporter to find a person, instead of thanking them', async () => {
    mockSend.mockResolvedValueOnce({
      response: '250 2.0.0 Ok: queued as C066C1005088',
      messageId: '<318e94ff-ceac-9047-4a31-909b5b4cabea@localhost>',
      accepted: ['gov@colaberry.com'],
      rejected: [],
      envelope: { from: '', to: ['gov@colaberry.com'] }, // the whole defect, in one field
    });

    const res = await handleGovStudioBugReport('p1', 'ali@colaberry.com', validBody());

    expect(res.status).toBe(502);
    expect(String(res.body.error)).toContain('tell Ali directly');
    expect(res.body.sent).toBeUndefined();
  });

  it('CONTROL: the identical report WITH a sender returns 201', () => {
    // Without this the case above would also pass if the route had started answering
    // 502 for every send. The suite's beforeEach resets the dedupe, so this is clean.
    return handleGovStudioBugReport('p1', 'ali@colaberry.com', validBody()).then((res) => {
      expect(res.status).toBe(201);
      expect(res.body.sent).toBe(true);
    });
  });
});
