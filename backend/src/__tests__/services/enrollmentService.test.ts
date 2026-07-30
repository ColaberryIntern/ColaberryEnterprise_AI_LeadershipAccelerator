/**
 * markEnrollmentPaid — confirmed self-serve payment must grant portal access.
 * Regression for the "paid but locked out" bug: requestMagicLink (participantService)
 * gates strictly on portal_enabled, not payment_status, so a webhook that only flips
 * payment_status leaves a paying student stuck on "pending admin approval" forever.
 */

jest.spyOn(console, 'error').mockImplementation(() => undefined);
jest.spyOn(console, 'log').mockImplementation(() => undefined);

jest.mock('../../config/env', () => ({
  env: { frontendUrl: 'https://enterprise.colaberry.ai', trainingWelcomeTokenTtlDays: 30, trainingWelcomeFromEmail: 'ali@colaberry.com' },
}));

jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  Cohort: { increment: jest.fn() },
  Lead: { findOne: jest.fn(), findOrCreate: jest.fn() },
  Campaign: { findOne: jest.fn() },
}));

const mockGetOrCreateExplorerCohort = jest.fn();
jest.mock('../../services/cohortService', () => ({
  getOrCreateExplorerCohort: (...a: any[]) => mockGetOrCreateExplorerCohort(...a),
}));

const mockSendTrainingWelcome = jest.fn();
jest.mock('../../services/emailService', () => ({
  sendTrainingWelcome: (...a: any[]) => mockSendTrainingWelcome(...a),
}));

const mockLogCommunication = jest.fn();
jest.mock('../../services/communicationLogService', () => ({
  logCommunication: (...a: any[]) => mockLogCommunication(...a),
}));

import { Enrollment, Cohort, Campaign, Lead } from '../../models';
import { markEnrollmentPaid, createExplorerEnrollment } from '../../services/enrollmentService';

const enrFindOne = Enrollment.findOne as jest.Mock;
const enrFindAll = Enrollment.findAll as jest.Mock;
const enrCreate = Enrollment.create as jest.Mock;
const leadFindOrCreate = Lead.findOrCreate as jest.Mock;
const cohortIncrement = Cohort.increment as jest.Mock;
const campaignFindOne = Campaign.findOne as jest.Mock;

function pendingEnrollment(over: any = {}) {
  return {
    id: 'enr-1',
    email: 'student@example.com',
    payment_status: 'pending',
    portal_enabled: false,
    cohort_id: 'cohort-1',
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  cohortIncrement.mockResolvedValue(undefined);
  campaignFindOne.mockResolvedValue(null); // no readiness campaign configured -> exitPaymentCampaign no-ops
  enrFindAll.mockResolvedValue([]); // no stray Explorer rows -> retireRedundantExplorerAccounts no-ops
  mockGetOrCreateExplorerCohort.mockResolvedValue({ id: 'explorer-cohort-1' });
  leadFindOrCreate.mockResolvedValue([{ id: 42 }]);
  mockSendTrainingWelcome.mockResolvedValue({ sent: true, messageId: 'msg-1' });
  mockLogCommunication.mockResolvedValue(undefined);
});

describe('markEnrollmentPaid', () => {
  it('grants portal access on confirmed payment, not just payment_status', async () => {
    const enrollment = pendingEnrollment();
    enrFindOne.mockResolvedValue(enrollment);

    const result = await markEnrollmentPaid('CB-123-456');

    expect(result?.payment_status).toBe('paid');
    expect(result?.portal_enabled).toBe(true);
    expect(enrollment.save).toHaveBeenCalledTimes(1);
    expect(cohortIncrement).toHaveBeenCalledWith(
      'seats_taken',
      expect.objectContaining({ by: 1, where: { id: 'cohort-1' } }),
    );
  });

  it('is idempotent — re-processing an already-paid enrollment does not double-increment seats', async () => {
    const enrollment = pendingEnrollment({ payment_status: 'paid', portal_enabled: true });
    enrFindOne.mockResolvedValue(enrollment);

    const result = await markEnrollmentPaid('CB-123-456');

    expect(result).toBe(enrollment);
    expect(enrollment.save).not.toHaveBeenCalled();
    expect(cohortIncrement).not.toHaveBeenCalled();
  });

  it('returns null when no enrollment matches the external id', async () => {
    enrFindOne.mockResolvedValue(null);

    const result = await markEnrollmentPaid('CB-UNKNOWN-999');

    expect(result).toBeNull();
    expect(cohortIncrement).not.toHaveBeenCalled();
  });
});

describe('createExplorerEnrollment', () => {
  it('stores company/title/company_size and a custom source label (regression for the /enroll free-signup path)', async () => {
    enrFindOne.mockResolvedValue(null); // no existing enrollment for this email
    enrCreate.mockResolvedValue({ id: 'enr-free-1', email: 'new@example.com' });

    const result = await createExplorerEnrollment({
      name: 'Jane Doe',
      email: 'NEW@Example.com',
      company: 'Acme Inc',
      title: 'VP Data',
      company_size: '50-249',
      phone: '5551234567',
      source: 'Free signup (/enroll)',
    });

    expect(result.created).toBe(true);
    expect(result.cohort_id).toBe('explorer-cohort-1');
    expect(enrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        company: 'Acme Inc',
        title: 'VP Data',
        company_size: '50-249',
        enrollment_type: 'explorer',
        portal_enabled: true,
        notes: 'Free signup (/enroll)',
      }),
    );
  });

  it('defaults to the Open House source label and empty company when not provided (back-compat)', async () => {
    enrFindOne.mockResolvedValue(null);
    enrCreate.mockResolvedValue({ id: 'enr-oh-1', email: 'guest@example.com' });

    await createExplorerEnrollment({ name: 'Guest', email: 'guest@example.com' });

    expect(enrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ company: '', notes: 'Open House Explorer' }),
    );
  });

  it('is idempotent — an existing enrollment for the email is reused, not duplicated', async () => {
    const existing = { id: 'enr-existing', email: 'again@example.com' };
    enrFindOne.mockResolvedValue(existing);

    const result = await createExplorerEnrollment({ name: 'Again', email: 'again@example.com' });

    expect(result).toEqual({ enrollment: existing, created: false, cohort_id: 'explorer-cohort-1' });
    expect(enrCreate).not.toHaveBeenCalled();
  });
});
