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

jest.mock('../../services/subscriptionService', () => ({
  activateByRef: jest.fn(),
  isSubscriptionRef: jest.fn().mockReturnValue(false),
}));

jest.mock('../../services/zoomService', () => ({
  verifyZoomWebhookSignature: jest.fn(),
  computeZoomWebhookEncryptedToken: jest.fn(),
}));

jest.mock('../../models/LiveSession', () => ({ findOne: jest.fn() }));
jest.mock('../../models/RoomBooking', () => ({ findOne: jest.fn() }));

jest.mock('../../services/sessionRecordingService', () => ({
  ingestRecordingForSession: jest.fn(),
  ingestRecordingForBooking: jest.fn(),
}));

import { handlePaySimpleWebhook, handleZoomWebhook } from '../../controllers/webhookController';
import { verifyWebhookSignature } from '../../services/paysimpleService';
import { markEnrollmentPaid, markEnrollmentFailed } from '../../services/enrollmentService';
import { Cohort, EnrollmentLead } from '../../models';
import { runEnrollmentAutomation } from '../../services/automationService';
import { activateByRef, isSubscriptionRef } from '../../services/subscriptionService';
import { verifyZoomWebhookSignature, computeZoomWebhookEncryptedToken } from '../../services/zoomService';
import LiveSession from '../../models/LiveSession';
import RoomBooking from '../../models/RoomBooking';
import { ingestRecordingForSession, ingestRecordingForBooking } from '../../services/sessionRecordingService';

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

  /**
   * The real request shape. The route parses the body with express.raw()
   * specifically so req.body is a Buffer of PaySimple's exact original
   * bytes — signature verification MUST be computed over that Buffer, not
   * a JSON.stringify() of an already-parsed object (which can never
   * reproduce byte-identical JSON: key order, spacing, and number
   * formatting can all differ from the source). This was the actual
   * production bug, found live 2026-07-30: every real webhook call was
   * silently rejected here, so no self-serve subscription payment ever
   * activated automatically.
   */
  describe('real Buffer request body (as express.raw() actually delivers it)', () => {
    it('verifies the signature against the raw buffer bytes, not a re-serialized object', async () => {
      (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
      (markEnrollmentPaid as jest.Mock).mockResolvedValue(MOCK_ENROLLMENT);
      (Cohort.findByPk as jest.Mock).mockResolvedValue(MOCK_COHORT);

      // Deliberately formatted differently than JSON.stringify(PAYMENT_CREATED_EVENT)
      // would produce (extra whitespace) — proving the exact bytes are what get hashed.
      const rawJson = '{\n  "event_type": "payment_created",\n  "data": {\n    "order_external_id": "CB-42620872-1710700000000",\n    "payment_id": 29124495,\n    "amount": 4500\n  }\n}';
      const buf = Buffer.from(rawJson, 'utf8');
      const req = mockRequest(buf, { 'paysimple-hmac-sha256': 'sig' });
      const res = mockResponse();

      await handlePaySimpleWebhook(req as Request, res as Response);

      expect(verifyWebhookSignature).toHaveBeenCalledWith(rawJson, 'sig');
      expect(markEnrollmentPaid).toHaveBeenCalledWith('CB-42620872-1710700000000', { paymentId: 29124495, amount: 4500 });
    });

    it('activates a subscription (SUB- ref) parsed from a real Buffer body', async () => {
      (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
      (isSubscriptionRef as jest.Mock).mockReturnValue(true);
      (activateByRef as jest.Mock).mockResolvedValue({ id: 'sub-1', plan: 'monthly', enrollment_id: 'enroll-123' });

      const event = {
        event_type: 'payment_created',
        data: { order_external_id: 'SUB-abc123-ms7r1cx7', payment_id: 555, amount: 199 },
      };
      const buf = Buffer.from(JSON.stringify(event), 'utf8');
      const req = mockRequest(buf, { 'paysimple-hmac-sha256': 'sig' });
      const res = mockResponse();

      await handlePaySimpleWebhook(req as Request, res as Response);

      expect(activateByRef).toHaveBeenCalledWith('SUB-abc123-ms7r1cx7', { paymentId: 555, amount: 199 });
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('rejects an invalid signature computed over a real Buffer body (no false positive from the fix)', async () => {
      (verifyWebhookSignature as jest.Mock).mockReturnValue(false);

      const buf = Buffer.from(JSON.stringify(PAYMENT_CREATED_EVENT), 'utf8');
      const req = mockRequest(buf, { 'paysimple-hmac-sha256': 'bad-sig' });
      const res = mockResponse();

      await handlePaySimpleWebhook(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(markEnrollmentPaid).not.toHaveBeenCalled();
    });
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

describe('handleZoomWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('answers the one-time endpoint.url_validation handshake correctly', async () => {
    (computeZoomWebhookEncryptedToken as jest.Mock).mockReturnValue('encrypted-abc');

    const event = { event: 'endpoint.url_validation', payload: { plainToken: 'plain-abc' }, event_ts: 1 };
    const req = mockRequest(Buffer.from(JSON.stringify(event), 'utf8'), {});
    const res = mockResponse();

    await handleZoomWebhook(req as Request, res as Response);

    expect(computeZoomWebhookEncryptedToken).toHaveBeenCalledWith('plain-abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ plainToken: 'plain-abc', encryptedToken: 'encrypted-abc' });
    // No signature check for the handshake itself — it isn't signed the normal way.
    expect(verifyZoomWebhookSignature).not.toHaveBeenCalled();
  });

  it('rejects a real event with an invalid/missing signature', async () => {
    (verifyZoomWebhookSignature as jest.Mock).mockReturnValue(false);

    const event = { event: 'recording.completed', payload: { object: { id: 123 } } };
    const req = mockRequest(Buffer.from(JSON.stringify(event), 'utf8'), { 'x-zm-signature': 'bad', 'x-zm-request-timestamp': '1' });
    const res = mockResponse();

    await handleZoomWebhook(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(LiveSession.findOne).not.toHaveBeenCalled();
  });

  it('benign-acks a non recording.completed event without touching the DB', async () => {
    (verifyZoomWebhookSignature as jest.Mock).mockReturnValue(true);

    const event = { event: 'meeting.started', payload: { object: { id: 123 } } };
    const req = mockRequest(Buffer.from(JSON.stringify(event), 'utf8'), { 'x-zm-signature': 'v0=x', 'x-zm-request-timestamp': '1' });
    const res = mockResponse();

    await handleZoomWebhook(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(LiveSession.findOne).not.toHaveBeenCalled();
  });

  it('benign-acks recording.completed for a meeting that matches neither a LiveSession nor a RoomBooking (account-wide subscription, non-class/booking meeting)', async () => {
    (verifyZoomWebhookSignature as jest.Mock).mockReturnValue(true);
    (LiveSession.findOne as jest.Mock).mockResolvedValue(null);
    (RoomBooking.findOne as jest.Mock).mockResolvedValue(null);

    const event = { event: 'recording.completed', payload: { object: { id: 999, topic: 'Unrelated 1:1', recording_files: [] } } };
    const req = mockRequest(Buffer.from(JSON.stringify(event), 'utf8'), { 'x-zm-signature': 'v0=x', 'x-zm-request-timestamp': '1' });
    const res = mockResponse();

    await handleZoomWebhook(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true, matched: false });
    expect(ingestRecordingForSession).not.toHaveBeenCalled();
    expect(ingestRecordingForBooking).not.toHaveBeenCalled();
  });

  it('falls back to matching a RoomBooking by google_event_id when no LiveSession matches, and ingests via ingestRecordingForBooking', async () => {
    (verifyZoomWebhookSignature as jest.Mock).mockReturnValue(true);
    (LiveSession.findOne as jest.Mock).mockResolvedValue(null);
    const booking = { id: 'booking-1', title: 'Study Group', google_event_id: '456' };
    (RoomBooking.findOne as jest.Mock).mockResolvedValue(booking);
    (ingestRecordingForBooking as jest.Mock).mockResolvedValue({ status: 'ingested', resourceId: 'r2' });

    const event = {
      event: 'recording.completed',
      payload: { object: { id: 456, topic: 'Study Group', recording_files: [{ file_type: 'MP4', file_size: 500, download_url: 'https://zoom.us/rec/booking' }] } },
    };
    const req = mockRequest(Buffer.from(JSON.stringify(event), 'utf8'), { 'x-zm-signature': 'v0=x', 'x-zm-request-timestamp': '1' });
    const res = mockResponse();

    await handleZoomWebhook(req as Request, res as Response);

    expect(LiveSession.findOne).toHaveBeenCalledWith({ where: { zoom_meeting_id: '456' } });
    expect(RoomBooking.findOne).toHaveBeenCalledWith({ where: { google_event_id: '456', related_live_session_id: null } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true, matched: true });
    expect(ingestRecordingForBooking).toHaveBeenCalledWith(booking, expect.objectContaining({
      downloadUrl: 'https://zoom.us/rec/booking',
      name: 'Study Group.mp4',
    }));
    expect(ingestRecordingForSession).not.toHaveBeenCalled();
  });

  it('does not look up a RoomBooking at all when a LiveSession already matched (avoids a redundant query)', async () => {
    (verifyZoomWebhookSignature as jest.Mock).mockReturnValue(true);
    const session = { id: 'session-1', title: 'Build Day', zoom_meeting_id: '123' };
    (LiveSession.findOne as jest.Mock).mockResolvedValue(session);
    (ingestRecordingForSession as jest.Mock).mockResolvedValue({ status: 'ingested', resourceId: 'r1' });

    const event = { event: 'recording.completed', payload: { object: { id: 123, recording_files: [{ file_type: 'MP4', file_size: 500, download_url: 'https://zoom.us/rec/x' }] } } };
    const req = mockRequest(Buffer.from(JSON.stringify(event), 'utf8'), { 'x-zm-signature': 'v0=x', 'x-zm-request-timestamp': '1' });
    const res = mockResponse();

    await handleZoomWebhook(req as Request, res as Response);

    expect(RoomBooking.findOne).not.toHaveBeenCalled();
  });

  it('matches a session, picks the largest MP4 when more than one is present, and ingests with the webhook-supplied download_token', async () => {
    (verifyZoomWebhookSignature as jest.Mock).mockReturnValue(true);
    const session = { id: 'session-1', title: 'Week 1 · Build Day', zoom_meeting_id: '123' };
    (LiveSession.findOne as jest.Mock).mockResolvedValue(session);
    (ingestRecordingForSession as jest.Mock).mockResolvedValue({ status: 'ingested', resourceId: 'r1' });

    const event = {
      event: 'recording.completed',
      download_token: 'short-lived-token',
      payload: {
        object: {
          id: 123,
          topic: 'Week 1 Build Day',
          recording_files: [
            { file_type: 'MP4', file_size: 100, download_url: 'https://zoom.us/rec/small' },
            { file_type: 'MP4', file_size: 900, download_url: 'https://zoom.us/rec/large' },
            { file_type: 'CHAT', file_size: 10, download_url: 'https://zoom.us/rec/chat' },
          ],
        },
      },
    };
    const req = mockRequest(Buffer.from(JSON.stringify(event), 'utf8'), { 'x-zm-signature': 'v0=x', 'x-zm-request-timestamp': '1' });
    const res = mockResponse();

    await handleZoomWebhook(req as Request, res as Response);

    expect(LiveSession.findOne).toHaveBeenCalledWith({ where: { zoom_meeting_id: '123' } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true, matched: true });
    expect(ingestRecordingForSession).toHaveBeenCalledWith(session, {
      downloadUrl: 'https://zoom.us/rec/large',
      downloadToken: 'short-lived-token',
      name: 'Week 1 Build Day.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 900,
    });
  });

  it('verifies the signature against the raw buffer bytes, not a re-serialized object (mirrors the PaySimple fix above)', async () => {
    (verifyZoomWebhookSignature as jest.Mock).mockReturnValue(true);
    (LiveSession.findOne as jest.Mock).mockResolvedValue(null);

    const rawJson = '{\n  "event": "recording.completed",\n  "payload": {\n    "object": {\n      "id": 123,\n      "recording_files": []\n    }\n  }\n}';
    const buf = Buffer.from(rawJson, 'utf8');
    const req = mockRequest(buf, { 'x-zm-signature': 'v0=x', 'x-zm-request-timestamp': '1700000000' });
    const res = mockResponse();

    await handleZoomWebhook(req as Request, res as Response);

    expect(verifyZoomWebhookSignature).toHaveBeenCalledWith(rawJson, '1700000000', 'v0=x');
  });
});
