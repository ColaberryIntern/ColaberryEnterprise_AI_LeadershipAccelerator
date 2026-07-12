/**
 * createExplorerEnrollment welcome wiring (CC-20260712-q7m2 follow-up).
 *
 * Proves the Open House signup now:
 *  - sets the magic-link token on the SPECIFIC new enrollment (not a lossy
 *    email lookup that could target a stale enrollment)
 *  - sends the branded welcome with a /portal/verify link
 *  - records the outcome to CommunicationLog (success AND failure) instead of
 *    silently swallowing send errors
 *  - is idempotent: an existing enrollment returns without re-sending
 */

jest.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
jest.spyOn(console, 'error').mockImplementation(() => {});

const mockEnv = {
  trainingWelcomeTokenTtlDays: 30,
  trainingWelcomeFromEmail: 'training@colaberry.com',
  frontendUrl: 'https://enterprise.colaberry.ai',
};
jest.mock('../../config/env', () => ({ env: mockEnv }));

jest.mock('../../models', () => ({
  __esModule: true,
  Cohort: {},
  Enrollment: { findOne: jest.fn(), create: jest.fn() },
  Lead: { findOrCreate: jest.fn() },
  Campaign: {},
}));

const mockGetLatestOpenCohort = jest.fn();
jest.mock('../../services/cohortService', () => ({ getLatestOpenCohort: (...a: any[]) => mockGetLatestOpenCohort(...a) }));

const mockSendTrainingWelcome = jest.fn();
jest.mock('../../services/emailService', () => ({ sendTrainingWelcome: (...a: any[]) => mockSendTrainingWelcome(...a) }));

const mockLogCommunication = jest.fn();
jest.mock('../../services/communicationLogService', () => ({ logCommunication: (...a: any[]) => mockLogCommunication(...a) }));

import { Enrollment, Lead } from '../../models';
import { createExplorerEnrollment } from '../../services/enrollmentService';

const findOne = Enrollment.findOne as jest.Mock;
const create = Enrollment.create as jest.Mock;
const findOrCreate = Lead.findOrCreate as jest.Mock;

function fakeEnrollment() {
  return { id: 'enr-1', full_name: 'Jane Doe', email: 'jane@acme.com', update: jest.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  findOne.mockReset();
  create.mockReset();
  findOrCreate.mockReset();
  mockGetLatestOpenCohort.mockReset();
  mockSendTrainingWelcome.mockReset();
  mockLogCommunication.mockReset();
  mockGetLatestOpenCohort.mockResolvedValue({ id: 'coh-1' });
  findOrCreate.mockResolvedValue([{ id: 55 }, true]);
  mockLogCommunication.mockResolvedValue({});
});

afterAll(() => jest.restoreAllMocks());

describe('createExplorerEnrollment — new signup', () => {
  it('sets a token on the new enrollment, sends the branded welcome, logs it sent', async () => {
    findOne.mockResolvedValue(null);
    const enrollment = fakeEnrollment();
    create.mockResolvedValue(enrollment);
    mockSendTrainingWelcome.mockResolvedValue({ sent: true, messageId: 'm1' });

    const res = await createExplorerEnrollment({ name: 'Jane Doe', email: 'Jane@Acme.com' });

    expect(res.created).toBe(true);
    expect(res.enrollment).toBe(enrollment);

    // token written to THIS enrollment
    const upd = enrollment.update.mock.calls[0][0];
    expect(upd.portal_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(upd.portal_token_expires_at instanceof Date).toBe(true);

    // welcome sent with the matching /portal/verify link
    const arg = mockSendTrainingWelcome.mock.calls[0][0];
    expect(arg.to).toBe('jane@acme.com');
    expect(arg.fullName).toBe('Jane Doe');
    expect(arg.portalLink).toBe(`https://enterprise.colaberry.ai/portal/verify?token=${upd.portal_token}`);

    // outcome recorded
    const logged = mockLogCommunication.mock.calls[0][0];
    expect(logged.status).toBe('sent');
    expect(logged.to_address).toBe('jane@acme.com');
    expect(logged.lead_id).toBe(55);
    expect(logged.metadata.enrollment_id).toBe('enr-1');
  });

  it('does not throw and logs status=failed when the send throws (retryable, account kept)', async () => {
    findOne.mockResolvedValue(null);
    const enrollment = fakeEnrollment();
    create.mockResolvedValue(enrollment);
    mockSendTrainingWelcome.mockRejectedValue(new Error('SMTP boom'));

    const res = await createExplorerEnrollment({ name: 'Jane Doe', email: 'jane@acme.com' });

    expect(res.created).toBe(true); // account never lost on email failure
    const logged = mockLogCommunication.mock.calls[0][0];
    expect(logged.status).toBe('failed');
    expect(logged.error_message).toContain('SMTP boom');
  });

  it('logs status=failed (no throw) when the send is blocked (sent:false)', async () => {
    findOne.mockResolvedValue(null);
    const enrollment = fakeEnrollment();
    create.mockResolvedValue(enrollment);
    mockSendTrainingWelcome.mockResolvedValue({ sent: false });

    const res = await createExplorerEnrollment({ name: 'Jane Doe', email: 'jane@acme.com' });
    expect(res.created).toBe(true);
    expect(mockLogCommunication.mock.calls[0][0].status).toBe('failed');
  });
});

describe('createExplorerEnrollment — idempotency', () => {
  it('returns the existing enrollment without creating or emailing', async () => {
    findOne.mockResolvedValue({ id: 'existing' });

    const res = await createExplorerEnrollment({ name: 'Jane Doe', email: 'jane@acme.com' });

    expect(res.created).toBe(false);
    expect((res.enrollment as any).id).toBe('existing');
    expect(create).not.toHaveBeenCalled();
    expect(mockSendTrainingWelcome).not.toHaveBeenCalled();
  });
});
