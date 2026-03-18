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
}));

jest.mock('../../models', () => ({
  Cohort: {
    findByPk: jest.fn(),
  },
}));

jest.mock('../../services/automationService', () => ({
  runEnrollmentAutomation: jest.fn().mockResolvedValue(undefined),
}));

import { handlePaySimpleWebhook } from '../../controllers/webhookController';
import { verifyWebhookSignature } from '../../services/paysimpleService';
import { markEnrollmentPaid, markEnrollmentFailed } from '../../services/enrollmentService';
import { Cohort } from '../../models';
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

describe('handlePaySimpleWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
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

  it('processes payment_created event and marks enrollment paid', async () => {
    (verifyWebhookSignature as jest.Mock).mockReturnValue(true);

    const mockEnrollment = {
      id: 'enroll-123',
      email: 'user@test.com',
      full_name: 'Test User',
      phone: '555-1234',
      cohort_id: 'cohort-abc',
      payment_status: 'paid',
    };

    const mockCohort = {
      name: 'Cohort Alpha',
      start_date: '2026-04-01',
      core_day: 'Tuesday',
      core_time: '1:00 PM EST',
      optional_lab_day: null,
    };

    (markEnrollmentPaid as jest.Mock).mockResolvedValue(mockEnrollment);
    (Cohort.findByPk as jest.Mock).mockResolvedValue(mockCohort);

    const req = mockRequest({
      event_type: 'payment_created',
      event_id: 'evt_123',
      merchant_id: 1234,
      data: {
        order_external_id: 'CB-42620872-1710700000000',
        payment_id: 29124495,
        amount: 0.01,
        payment_status: 'authorized',
        payment_type: 'credit_card',
        customer_id: 42620872,
      },
    });
    const res = mockResponse();

    await handlePaySimpleWebhook(req as Request, res as Response);

    expect(markEnrollmentPaid).toHaveBeenCalledWith('CB-42620872-1710700000000');
    expect(Cohort.findByPk).toHaveBeenCalledWith('cohort-abc');
    expect(runEnrollmentAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'enroll-123',
        email: 'user@test.com',
        full_name: 'Test User',
      })
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
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

    expect(markEnrollmentPaid).toHaveBeenCalledWith('CB-UNKNOWN-9999999');
    // Should still return 200 — acknowledged even if not found
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});
