/**
 * `/api/create-invoice` is retired, and these tests are what keep it retired.
 *
 * ## What it used to do
 *
 * Mint a real PaySimple payment link for $4,500. Reported by Victoria
 * Spencer-Auber on 11 Nov 2026 while building Vick's sales capabilities. Three
 * facts made it live rather than theoretical: the route is PUBLIC (mounted
 * before the auth guard, with nginx proxying `/api/` straight through), prod
 * runs `PAYMENT_MODE=live` so the test-mode $0.01 clamp does not apply, and
 * $4,500 is a price retired months earlier.
 *
 * Nobody was ever charged it — 0 of the 8 enrollments that went through the
 * payment-link path, the 2 that paid paid $199, last use 21 July 2026 — so the
 * exposure was prospective. These tests exist so it stays that way.
 *
 * ## What is actually under test
 *
 * That the route cannot reach PaySimple or the enrollment tables AT ALL. The
 * weak version of this test would assert the status code and stop, and it would
 * pass just as well against a handler that created the payment link and then
 * returned 410. So the service layer is mocked and asserted UNCALLED, which is
 * the assertion that would actually catch a revival.
 */

const createEnrollmentInvoice = jest.fn();
const createPendingEnrollment = jest.fn();
const validateCohortAvailability = jest.fn();
const captureSignupConsent = jest.fn();

jest.mock('../../services/paysimpleService', () => ({
  createEnrollmentInvoice: (...a: unknown[]) => createEnrollmentInvoice(...a),
}));
jest.mock('../../services/enrollmentService', () => ({
  createEnrollmentInvoice: jest.fn(),
  createPendingEnrollment: (...a: unknown[]) => createPendingEnrollment(...a),
  validateCohortAvailability: (...a: unknown[]) => validateCohortAvailability(...a),
  createInvoiceEnrollment: jest.fn(),
  createExplorerEnrollment: jest.fn(),
  getEnrollmentByInvoiceId: jest.fn(),
}));
jest.mock('../../services/consent/captureSignupConsent', () => ({
  captureSignupConsent: (...a: unknown[]) => captureSignupConsent(...a),
  SIGNUP_CONSENT_TEXT: 'consent',
}));
jest.mock('../../services/consent/capturePhoneConsent', () => ({
  capturePhoneConsent: jest.fn(),
}));

import express, { type Express } from 'express';
import request from 'supertest';
import { handleCreateInvoice } from '../../controllers/enrollmentController';

function app(): Express {
  const a = express();
  a.use(express.json());
  a.post('/api/create-invoice', handleCreateInvoice);
  return a;
}

/** A body that would have been accepted, so the refusal is not a validation artifact. */
const VALID = {
  full_name: 'Test Person',
  email: 'test@example.com',
  company: 'TestCo',
  phone: '5550000000',
  cohort_id: '11111111-1111-4111-8111-111111111111',
};

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('POST /api/create-invoice — retired', () => {
  it('answers 410 Gone, not 404, so it reads as deliberate rather than broken', async () => {
    const res = await request(app()).post('/api/create-invoice').send(VALID);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('create_invoice_retired');
  });

  /**
   * THE test. A handler that minted the link and then returned 410 would pass
   * every status assertion above while still charging somebody $4,500.
   */
  it('never reaches PaySimple, and never writes an enrollment', async () => {
    await request(app()).post('/api/create-invoice').send(VALID);
    expect(createEnrollmentInvoice).not.toHaveBeenCalled();
    expect(createPendingEnrollment).not.toHaveBeenCalled();
    expect(validateCohortAvailability).not.toHaveBeenCalled();
  });

  it('logs the refusal with the caller, which is the evidence for deleting it later', async () => {
    await request(app()).post('/api/create-invoice').send(VALID);
    const line = JSON.parse((warn.mock.calls[0] as string[])[0]);
    expect(line.event).toBe('create_invoice_route_retired');
    expect(line.error_class).toBe('RouteRetired');
    expect(line.context.email).toBe('test@example.com');
  });

  /**
   * "This route is gone" and "your request was wrong" are different answers, and
   * a caller migrating off this needs to tell them apart.
   */
  it('still answers 400 for a malformed body, rather than masking it as 410', async () => {
    const res = await request(app()).post('/api/create-invoice').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(createEnrollmentInvoice).not.toHaveBeenCalled();
  });

  it('does not capture consent for a request it refuses', async () => {
    // Recording consent for an enrollment that cannot happen would leave a
    // consent record with nothing behind it.
    await request(app()).post('/api/create-invoice').send(VALID);
    expect(captureSignupConsent).not.toHaveBeenCalled();
  });
});
