jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret', emailFrom: 'Colaberry <info@colaberry.com>' }));
jest.mock('../commsHubEventRoutes', () => ({ actorOf: (req: { admin?: { sub?: string; email?: string } }) => ({ id: req.admin?.sub ?? null, label: req.admin?.email ?? null }) }));
const mockSend = jest.fn();
const mockOutcome = jest.fn();
const mockRecord = jest.fn();
const mockDelivered = jest.fn();
const mockFailed = jest.fn();
const mockActivity = jest.fn();
const mockSetting = jest.fn();
jest.mock('../../../services/emailService', () => ({ guardedSendMail: (...a: unknown[]) => mockSend(...a) }));
jest.mock('../../../services/email/sendOutcome', () => ({ readSendOutcome: (...a: unknown[]) => mockOutcome(...a) }));
jest.mock('../../../services/settingsService', () => ({ getSetting: (...a: unknown[]) => mockSetting(...a) }));
jest.mock('../../../services/marketing/bugReportStore', () => ({
  recordBugReportDetailed: (...a: unknown[]) => mockRecord(...a),
  recordBugReport: jest.fn(),
  markBugReportDelivered: (...a: unknown[]) => mockDelivered(...a),
  markBugReportFailed: (...a: unknown[]) => mockFailed(...a),
}));
jest.mock('../../../services/commsHub/activityLog', () => ({ logActivity: (...a: unknown[]) => mockActivity(...a) }));

import jwt from 'jsonwebtoken';
import router from '../commsHubBugReportRoutes';

/**
 * CH9.1 Report a problem on the Communications Hub. What matters: the two people it is for can
 * reach it (Jackie by role, Taiwo by grant) while staff without the hub cannot; a report is stored
 * before the send and tagged [Comms Hub bug]; every failure is said plainly; and a double submit is
 * emailed once, not twice.
 */
const verify = jwt.verify as unknown as jest.Mock;
const PATH = '/api/admin/comms-hub/bug-report';
const JACKIE = { role: 'admin', mgmt_role: 'community_organizer', sub: 'u-jackie', email: 'jackie@colaberry.com' };
const TAIWO = { role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents', 'comms_hub'], sub: 'u-taiwo', email: 'taiwo@colaberry.com' };
const REPORT = {
  summary: 'Thumbnail never finishes',
  whatHappened: 'Pressed Generate, the spinner ran for five minutes and nothing appeared.',
  whatExpected: 'Three thumbnail options.',
  pageUrl: 'https://enterprise.colaberry.ai/admin/comms-hub/events',
  routePath: '/admin/comms-hub/events',
  brandLabel: 'Communications Hub',
  reportedAtCentral: 'Nov 21, 2026, 4:10:00 PM CST',
  browser: 'Chrome 141',
  viewport: '390x844 @ 3x',
};

async function call(o: { body?: unknown; who?: Record<string, unknown> | null } = {}) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === PATH && l.route.methods.post);
  const req: any = { method: 'POST', headers: o.who === null ? {} : { authorization: 'Bearer t' }, body: o.body ?? REPORT, params: {}, query: {} };
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  verify.mockReturnValue(o.who === undefined ? JACKIE : o.who);
  for (const s of layer.route.stack) { let go = false; await s.handle(req, res, () => { go = true; }); if (!go) break; }
  return res;
}

let logSpy: jest.SpyInstance; let errSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockSetting.mockImplementation(async (k: string) => (k === 'admin_notification_emails' ? 'ali@colaberry.com' : null));
  mockRecord.mockResolvedValue({ id: 'report-1', duplicate: false });
  mockSend.mockResolvedValue({ accepted: ['ali@colaberry.com'] });
  mockOutcome.mockReturnValue({ delivered: true });
  mockActivity.mockResolvedValue(undefined);
});
afterEach(() => { logSpy.mockRestore(); errSpy.mockRestore(); });

describe('who can report', () => {
  it('Jackie (community_organizer) and Taiwo (lead_intake + the comms_hub grant) reach it', async () => {
    expect((await call({ who: JACKIE })).statusCode).toBe(201);
    expect((await call({ who: TAIWO })).statusCode).toBe(201);
  });
  it.each([
    ['no token', null, 401],
    ['plain staff with no role', { role: 'admin', mgmt_role: 'support' }, 403],
    ['revenue', { role: 'admin', mgmt_role: 'revenue' }, 403],
    ['lead_intake without the grant', { role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents'] }, 403],
  ])('%s is refused and nothing is stored or sent', async (_n, who, code) => {
    expect((await call({ who: who as Record<string, unknown> | null })).statusCode).toBe(code);
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('a report', () => {
  it('is stored before the send, tagged [Comms Hub bug], sent from the configured sender, and logged in the hub activity', async () => {
    const res = await call();
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ sent: true, recipients: 1, screenshotAttached: false });
    expect(mockRecord.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0]);
    expect(mockRecord.mock.calls[0][0]).toMatchObject({ summary: REPORT.summary, brandLabel: 'comms-hub', reporterEmail: 'jackie@colaberry.com', recipients: ['ali@colaberry.com'] });
    const mail = mockSend.mock.calls[0][0];
    expect(mail.subject).toBe('[Comms Hub bug] Thumbnail never finishes — /admin/comms-hub/events');
    expect(mail.from).toBe('Colaberry <info@colaberry.com>');
    expect(mail.to).toBe('ali@colaberry.com');
    expect(mail.text).toContain('frontend/src/components/admin/commsHub/EventsTab.tsx');
    expect(mockDelivered).toHaveBeenCalledWith('report-1');
    expect(mockActivity).toHaveBeenCalledWith({ id: 'u-jackie', label: 'jackie@colaberry.com' }, 'bug.reported', 'report', null,
      { summary: REPORT.summary, route: '/admin/comms-hub/events' });
  });

  it('is emailed ONCE when sent twice inside the store window: the duplicate answers 200 and sends nothing', async () => {
    expect((await call()).statusCode).toBe(201);
    mockRecord.mockResolvedValueOnce({ id: 'report-1', duplicate: true });
    const again = await call();
    expect(again.statusCode).toBe(200);
    expect(again.body).toEqual({ sent: false, duplicate: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockActivity).toHaveBeenCalledTimes(1);
  });

  it('still sends when the store could not write the row (a database problem must not stop reporting)', async () => {
    mockRecord.mockResolvedValueOnce({ id: null, duplicate: false });
    expect((await call()).statusCode).toBe(201);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('attaches a pasted screenshot', async () => {
    const png = `data:image/png;base64,${Buffer.from('\x89PNG\r\n\x1a\nfake').toString('base64')}`;
    const res = await call({ body: { ...REPORT, screenshot: png } });
    expect(res.statusCode).toBe(201);
    expect(mockSend.mock.calls[0][0].attachments).toHaveLength(1);
  });
});

describe('failures are said plainly', () => {
  it('no recipients configured: 503 and nothing stored or sent', async () => {
    mockSetting.mockResolvedValue(null);
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(res.body.error_class).toBe('NoRecipient');
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('the mail did not leave: 502, the row is marked failed, no activity row', async () => {
    mockOutcome.mockReturnValue({ delivered: false, reason: 'nothing_accepted' });
    const res = await call();
    expect(res.statusCode).toBe(502);
    expect(res.body.error_class).toBe('BugReportNotDelivered');
    expect(mockFailed).toHaveBeenCalledWith('report-1', 'nothing_accepted', null);
    expect(mockActivity).not.toHaveBeenCalled();
    expect(JSON.parse(errSpy.mock.calls[0][0]).error_class).toBe('BugReportNotDelivered');
  });
  it('the send threw: 500, the row is settled failed', async () => {
    mockSend.mockRejectedValue(new Error('ECONNRESET'));
    const res = await call();
    expect(res.statusCode).toBe(500);
    expect(res.body.error_class).toBe('BugReportSendFailed');
    expect(mockFailed).toHaveBeenCalledWith('report-1', 'ECONNRESET', null);
  });
  it('an activity-log failure after a delivered send still answers 201 and is logged, not swallowed', async () => {
    mockActivity.mockRejectedValue(new Error('pool exhausted'));
    expect((await call()).statusCode).toBe(201);
    expect(errSpy.mock.calls.map((c) => JSON.parse(c[0]).event)).toContain('bug_report_activity_failed');
  });
});

describe('validation (boundaries)', () => {
  it.each([
    ['a 4-character summary', { ...REPORT, summary: 'Hmm.' }],
    ['a 9-character description', { ...REPORT, whatHappened: 'It broke.' }],
    ['no page', { ...REPORT, pageUrl: undefined }],
  ])('%s is a 400 and nothing is stored', async (_n, body) => {
    const res = await call({ body });
    expect(res.statusCode).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(mockRecord).not.toHaveBeenCalled();
  });
  it('the smallest valid report (5-character summary, 10-character description) is accepted', async () => {
    expect((await call({ body: { ...REPORT, summary: 'Stuck', whatHappened: 'It froze..' } })).statusCode).toBe(201);
  });
  it('a screenshot over the size limit is refused before anything is stored', async () => {
    const res = await call({ body: { ...REPORT, screenshot: `data:image/png;base64,${'A'.repeat(12 * 1024 * 1024 + 1)}` } });
    expect(res.statusCode).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
