/**
 * PaySimple Service Tests
 *
 * Tests the PaySimple API service layer including customer management,
 * hosted payment link creation, and webhook verification.
 */

// Mock fetch globally before importing the service
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock env config
jest.mock('../../config/env', () => ({
  env: {
    paysimpleApiUser: 'test-api-user',
    paysimpleApiKey: 'test-api-key',
    paysimpleEnv: 'sandbox',
    paysimpleWebhookSecret: 'test-webhook-secret',
    paymentMode: 'test',
  },
}));

import {
  createCustomer,
  findCustomerByEmail,
  findOrCreateCustomer,
  createPaymentLink,
  deletePaymentLink,
  createEnrollmentInvoice,
  verifyWebhookSignature,
} from '../../services/paysimpleService';

describe('PaySimple Service', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /* -------------------------------------------------------- */
  /*  Customer Management                                      */
  /* -------------------------------------------------------- */

  describe('createCustomer', () => {
    it('creates a customer with first/last name split', async () => {
      const mockCustomer = { Id: 123, FirstName: 'Jane', LastName: 'Doe', Email: 'jane@acme.com', Company: 'Acme' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Response: mockCustomer }),
      });

      const result = await createCustomer({
        fullName: 'Jane Doe',
        email: 'jane@acme.com',
        company: 'Acme',
        phone: '5551234567',
      });

      expect(result).toEqual(mockCustomer);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://sandbox-api.paysimple.com/v4/customer');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.FirstName).toBe('Jane');
      expect(body.LastName).toBe('Doe');
      expect(body.Email).toBe('jane@acme.com');
      expect(body.Company).toBe('Acme');
    });

    it('handles single-name customers with dash as last name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Response: { Id: 1, FirstName: 'Cher', LastName: '-' } }),
      });

      await createCustomer({ fullName: 'Cher', email: 'cher@example.com', company: 'Solo' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.FirstName).toBe('Cher');
      expect(body.LastName).toBe('-');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });

      await expect(
        createCustomer({ fullName: 'Test', email: 'test@test.com', company: 'X' })
      ).rejects.toThrow('PaySimple API error 400');
    });
  });

  describe('findCustomerByEmail', () => {
    it('returns customer when found', async () => {
      // Email is required in the fixture: findCustomerByEmail only accepts a row whose
      // Email actually matches, because PaySimple does not honor its own ?email= filter
      // and otherwise returns page 1 of the whole merchant account. Without it this test
      // asserted the guard's rejection path while claiming to test the match path.
      const customer = { Id: 456, FirstName: 'John', LastName: 'Smith', Email: 'john@smith.com' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Response: [customer] }),
      });

      const result = await findCustomerByEmail('john@smith.com');
      expect(result).toEqual(customer);
    });

    it('returns null when no customer found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Response: [] }),
      });

      const result = await findCustomerByEmail('nobody@example.com');
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await findCustomerByEmail('error@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findOrCreateCustomer', () => {
    it('returns existing customer if found', async () => {
      const existing = { Id: 789, FirstName: 'Existing', LastName: 'User', Email: 'existing@co.com', Company: 'Co' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Response: [existing] }),
      });

      const result = await findOrCreateCustomer({
        fullName: 'Existing User',
        email: 'existing@co.com',
        company: 'Co',
      });

      expect(result).toEqual(existing);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('creates customer if not found', async () => {
      const newCustomer = { Id: 999, FirstName: 'New', LastName: 'User', Email: 'new@co.com', Company: 'Co' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Response: [] }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Response: newCustomer }),
      });

      const result = await findOrCreateCustomer({
        fullName: 'New User',
        email: 'new@co.com',
        company: 'Co',
      });

      expect(result).toEqual(newCustomer);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  /* -------------------------------------------------------- */
  /*  Hosted Payment Links                                     */
  /* -------------------------------------------------------- */

  describe('createPaymentLink', () => {
    it('creates payment link with test mode amount ($0.01)', async () => {
      const mockLink = { id: 'link_abc123', payment_link: 'https://colaberry.mypaysimple.com/s/pay/xyz' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockLink }),
      });

      const result = await createPaymentLink({
        externalId: 'CB-100-1234567890',
        cohortName: 'Cohort Alpha',
        amount: 4500,
        customerFirstName: 'Test',
        customerLastName: 'User',
        customerEmail: 'test@co.com',
      });

      expect(result).toEqual(mockLink);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://sandbox-api.paysimple.com/ps/payment_link');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.item.price).toBe(0.01); // Test mode
      expect(body.item.name).toContain('Cohort Alpha');
      expect(body.external_id).toBe('CB-100-1234567890');
      expect(body.customer.email).toBe('test@co.com');
    });

    it('clamps item.name to 50 chars when a long cohortName would overflow PaySimple\'s limit', async () => {
      // Regression test: found live 2026-07-31 -- "Monthly plan (-$50 credit)" as
      // cohortName produced a 54-char item.name and PaySimple returned a 400
      // ("must be 50 characters or fewer") for every credit-holding student's checkout.
      const mockLink = { id: 'link_def456', payment_link: 'https://colaberry.mypaysimple.com/s/pay/abc' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockLink }),
      });

      await createPaymentLink({
        externalId: 'SUB-100-1234567890',
        cohortName: 'Monthly plan (−$50 credit)', // 26 chars -> 54 combined with the name prefix
        amount: 149,
        customerFirstName: 'Test',
        customerLastName: 'User',
        customerEmail: 'test@co.com',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.item.name.length).toBeLessThanOrEqual(50);
      expect(body.item.name).toBe('AI Leadership Accelerator - Monthly plan (−$50');
    });

    it('leaves a short item.name unchanged (no unnecessary truncation)', async () => {
      const mockLink = { id: 'link_ghi789', payment_link: 'https://colaberry.mypaysimple.com/s/pay/ghi' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockLink }),
      });

      await createPaymentLink({
        externalId: 'SUB-101-1234567890',
        cohortName: 'Monthly plan',
        amount: 199,
        customerFirstName: 'Test',
        customerLastName: 'User',
        customerEmail: 'test@co.com',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.item.name).toBe('AI Leadership Accelerator - Monthly plan');
    });
  });

  describe('deletePaymentLink', () => {
    it('deletes payment link by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await deletePaymentLink('link_abc123');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/ps/payment_link/link_abc123');
      expect(options.method).toBe('DELETE');
    });
  });

  /* -------------------------------------------------------- */
  /*  Full Enrollment Flow                                     */
  /* -------------------------------------------------------- */

  describe('createEnrollmentInvoice', () => {
    it('executes full flow: find/create customer → create payment link', async () => {
      // 1. findCustomerByEmail (search)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Response: [] }),
      });

      // 2. createCustomer
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          Response: { Id: 100, FirstName: 'Test', LastName: 'User', Email: 'test@co.com', Company: 'TestCo' },
        }),
      });

      // 3. createPaymentLink
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { id: 'link_xyz', payment_link: 'https://colaberry.mypaysimple.com/s/pay/abc' },
        }),
      });

      const result = await createEnrollmentInvoice({
        fullName: 'Test User',
        email: 'test@co.com',
        company: 'TestCo',
        phone: '5550000000',
        cohortName: 'Cohort Beta',
      });

      expect(result.customerId).toBe(100);
      expect(result.paymentLinkId).toBe('link_xyz');
      expect(result.externalId).toMatch(/^CB-100-/);
      expect(result.amount).toBe(0.01); // Test mode
      expect(result.paymentLink).toBe('https://colaberry.mypaysimple.com/s/pay/abc');
      expect(result.mode).toBe('test');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  /* -------------------------------------------------------- */
  /*  Webhook Signature Verification                           */
  /* -------------------------------------------------------- */

  describe('verifyWebhookSignature', () => {
    it('returns false when signature is missing', () => {
      const result = verifyWebhookSignature('{"test": true}', undefined);
      expect(result).toBe(false);
    });

    it('verifies valid HMAC signature', () => {
      const crypto = require('crypto');
      const payload = '{"event_type":"payment_created","data":{"payment_id":123}}';
      const validSig = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(payload)
        .digest('hex');

      const result = verifyWebhookSignature(payload, validSig);
      expect(result).toBe(true);
    });

    it('rejects invalid signature', () => {
      const result = verifyWebhookSignature('{"test": true}', 'deadbeef');
      expect(result).toBe(false);
    });

    /*
     * The load-bearing case. PaySimple sends the digest as UPPERCASE hex; Node's
     * digest('hex') is lowercase. Comparing the digest TEXT therefore rejected every
     * real webhook ('5F' is 0x35,0x46 vs '5f' 0x35,0x66) while the lowercase test
     * above still passed, which is how this reached production and stayed there.
     * Verified against a captured live delivery on 2026-08-12.
     */
    it('accepts the UPPERCASE hex digest PaySimple actually sends', () => {
      const crypto = require('crypto');
      const payload = '{"event_type":"payment_created","data":{"payment_id":123}}';
      const sig = crypto.createHmac('sha256', 'test-webhook-secret').update(payload).digest('hex');

      expect(sig).toBe(sig.toLowerCase());          // guards the premise of this test
      expect(verifyWebhookSignature(payload, sig.toUpperCase())).toBe(true);
    });

    it('accepts a base64 digest (encoding-agnostic byte comparison)', () => {
      const crypto = require('crypto');
      const payload = '{"event_type":"payment_created","data":{"payment_id":123}}';
      const sig = crypto.createHmac('sha256', 'test-webhook-secret').update(payload).digest('base64');

      expect(verifyWebhookSignature(payload, sig)).toBe(true);
    });

    it('tolerates surrounding whitespace on the header value', () => {
      const crypto = require('crypto');
      const payload = '{"event_type":"payment_created","data":{"payment_id":123}}';
      const sig = crypto.createHmac('sha256', 'test-webhook-secret').update(payload).digest('hex');

      expect(verifyWebhookSignature(payload, `  ${sig.toUpperCase()} `)).toBe(true);
    });

    it('still rejects a well-formed digest for a DIFFERENT payload', () => {
      const crypto = require('crypto');
      const sig = crypto.createHmac('sha256', 'test-webhook-secret').update('{"a":1}').digest('hex');

      expect(verifyWebhookSignature('{"a":2}', sig.toUpperCase())).toBe(false);
    });

    it('still rejects a digest computed with the WRONG secret', () => {
      const crypto = require('crypto');
      const payload = '{"event_type":"payment_created","data":{"payment_id":123}}';
      const sig = crypto.createHmac('sha256', 'not-the-secret').update(payload).digest('hex');

      expect(verifyWebhookSignature(payload, sig.toUpperCase())).toBe(false);
    });

    it('rejects a malformed header rather than comparing a truncated buffer', () => {
      const payload = '{"test": true}';
      expect(verifyWebhookSignature(payload, 'not-hex-at-all')).toBe(false);
      expect(verifyWebhookSignature(payload, 'abc123')).toBe(false);        // too short
      expect(verifyWebhookSignature(payload, '')).toBe(false);
      expect(verifyWebhookSignature(payload, 'z'.repeat(64))).toBe(false);  // right length, not hex
    });
  });
});
