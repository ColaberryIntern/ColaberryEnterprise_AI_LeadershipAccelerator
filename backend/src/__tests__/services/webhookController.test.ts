/**
 * PaySimple Webhook Controller Tests
 *
 * Tests the webhook handler for PaySimple payment events.
 * PaySimple sends event_type: "payment_created" with data.order_external_id
 */

import { Request, Response } from 'express';

// Mock dependencies
jest.mock('../../services/paysimpleService', () => ({
  verifyWebhookSignature: jest.fn(),
}));

jest.mock('../../services/enrollmentService', () => ({
  markEnrollmentPaid: jest.fn(),
  markEnrollmentFailed: jest.fn(),
  enrollInClassReadinessCampaign: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../models', () => ({
  Cohort: {
    findByPk: jest.fn(),
  },
  EnrollmentLead: {
    findOrCreate: jest.fn(),
  },
}));

jest.mock('../../services/automationService', () => ({
  runEnrollmentAutomation: jest.fn().mockResolvedValue(undefined),
}));

import { handlePaySimpleWebhook } from '../../controllers/webhookController';
import { verifyWebhookSignature } from '../../services/paysimpleService';
import { markEnrollmentPaid, markEnrollmentFailed } from '../../services/enrollmentService';
import { Cohort, EnrollmentLead } from '../../models';
import { runEnrollmentAutomation } from '../../services/automationService';

function mockRequest(body: any, headers: Record<string, string> = {}): Partial<Request> {
  return { body, headers };
}

function mockResponse(): Partial<Response> & { statusCode?: number; jsonData?: any } {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockImplementation((data) => {
    res.jsonData = data;
    return res;
  });
  return res;
}

const PAYMENT_CREATED_EVENT = {
  event_type: 'payment_created',
  event_id: 'evt_123',
  merchant_id: 1234,
  data: {
    order_external_id: 'CB-42620872-1710700000000',
    payment_id: 29124495,
    amount: 4500,
    payment_status: 'authorized',
    payment_type: 'credit_card',
    customer_id: 42620872,
  },
};

const MOCK_ENROLLMENT = {
  id: 'enroll-123',
  email: 'user@test.com',
  full_name: 'Test User',
  phone: '555-1234',
  cohort_id: 'cohort-abc',
  payment_status: 'paid',
};

const MOCK_COHORT = {
  name: 'Cohort Alpha',
  start_date: '2026-04-01',
  core_day: 'Tuesday',
  core_time: '1:00 PM EST',
  optional_lab_day: null,
};

describe('handlePaySimpleWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Default happy-path mocks
    (EnrollmentLead.findOrCreate as jest.Mock).mockResolvedValue([
      { status: 'enrolled', save: jest.fn() },
      true,
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads signature from paysimple-hmac-sha256 header', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(false);

    const req = mockRequest(
      { event_type: 'payment_created' },
      { 'paysimple-hmac-sha256': 'test-sig' }
    );
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(verifyWebhookSignature).toHaveBeenCalledWith(
      expect.any(String),
      'test-sig'
    );
  });

  it('rejects requests with invalid signature', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(false);

    const req = mockRequest({ event_type: 'payment_created' });
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Webhook signature verification failed' })
    );
  });

  it('processes payment_created event: marks enrollment paid with payment details', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    (markEnrollmentPaid as jest.Mock).mockResolvedValue(MOCK_ENROLLMENT);
    (Cohort.findByPk as jest.Mock).mockResolvedValue(MOCK_COHORT);

    const req = mockRequest(PAYMENT_CREATED_EVENT);
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(markEnrollmentPaid).toHaveBeenCalledWith(
      'CB-42620872-1710700000000',
      { paymentId: 29124495, amount: 4500 }
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('creates EnrollmentLead on payment_created', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    (markEnrollmentPaid as jest.Mock).mockResolvedValue(MOCK_ENROLLMENT);
    (Cohort.findByPk as jest.Mock).mockResolvedValue(MOCK_COHORT);

    const req = mockRequest(PAYMENT_CREATED_EVENT);
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(EnrollmentLead.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'user@test.com' },
        defaults: expect.objectContaining({
          name: 'Test User',
          email: 'user@test.com',
          status: 'enrolled',
          enrollment_id: 'enroll-123',
        }),
      })
    );
  });

  it('updates existing EnrollmentLead status to enrolled when not already enrolled', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    (markEnrollmentPaid as jest.Mock).mockResolvedValue(MOCK_ENROLLMENT);
    (Cohort.findByPk as jest.Mock).mockResolvedValue(MOCK_COHORT);

    const mockLead = { status: 'prospect', enrollment_id: null, save: jest.fn().mockResolvedValue(undefined) };
    (EnrollmentLead.findOrCreate as jest.Mock).mockResolvedValue([mockLead, false]);

    const req = mockRequest(PAYMENT_CREATED_EVENT);
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    // Wait for the non-blocking .then() to settle
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockLead.status).toBe('enrolled');
    expect(mockLead.enrollment_id).toBe('enroll-123');
    expect(mockLead.save).toHaveBeenCalled();
  });

  it('triggers enrollment automation after confirmed payment', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    (markEnrollmentPaid as jest.Mock).mockResolvedValue(MOCK_ENROLLMENT);
    (Cohort.findByPk as jest.Mock).mockResolvedValue(MOCK_COHORT);

    const req = mockRequest(PAYMENT_CREATED_EVENT);
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(Cohort.findByPk).toHaveBeenCalledWith('cohort-abc');
    expect(runEnrollmentAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'enroll-123',
        email: 'user@test.com',
        full_name: 'Test User',
      })
    );
  });

  it('handles payment_failed event', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    (markEnrollmentFailed as jest.Mock).mockResolvedValue(null);

    const req = mockRequest({
      event_type: 'payment_failed',
      event_id: 'evt_456',
      data: {
        order_external_id: 'CB-42620872-1710700000000',
        failure_reason: 'Card declined',
        is_decline: true,
      },
    });
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(markEnrollmentFailed).toHaveBeenCalledWith('CB-42620872-1710700000000');
    expect(markEnrollmentPaid).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('handles missing external ID in payment event', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);

    const req = mockRequest({
      event_type: 'payment_created',
      event_id: 'evt_789',
      data: {
        payment_id: 12345,
        amount: 100,
        // No order_external_id
      },
    });
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(markEnrollmentPaid).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ received: true, warning: 'No external ID found' })
    );
  });

  it('ignores non-payment events gracefully', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);

    const req = mockRequest({
      event_type: 'customer_created',
      event_id: 'evt_000',
      data: { customer_id: 100 },
    });
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(markEnrollmentPaid).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('handles enrollment not found for external ID', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    (markEnrollmentPaid as jest.Mock).mockResolvedValue(null);

    const req = mockRequest({
      event_type: 'payment_created',
      event_id: 'evt_999',
      data: {
        order_external_id: 'CB-UNKNOWN-9999999',
        payment_id: 99999,
        amount: 0.01,
      },
    });
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(markEnrollmentPaid).toHaveBeenCalledWith('CB-UNKNOWN-9999999', { paymentId: 99999, amount: 0.01 });
    // Should still return 200 — acknowledged even if not found
    expect(res.json).toHaveBeenCalledWith({ received: true });
    // EnrollmentLead should NOT be created when enrollment not found
    expect(EnrollmentLead.findOrCreate).not.toHaveBeenCalled();
  });

  it('idempotency: duplicate payment returns early without triggering automation again', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    // markEnrollmentPaid returns the already-paid enrollment (status=paid, no changes)
    (markEnrollmentPaid as jest.Mock).mockResolvedValue({
      ...MOCK_ENROLLMENT,
      payment_status: 'paid',
      paysimple_payment_id: '29124495', // already stored from first call
    });
    (Cohort.findByPk as jest.Mock).mockResolvedValue(MOCK_COHORT);

    const req = mockRequest(PAYMENT_CREATED_EVENT);
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    // Still responds 200 (PaySimple will retry otherwise)
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});
