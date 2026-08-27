/**
 * POST /api/v1/leads — marketing consent capture for training.colaberry.com.
 *
 * These tests exercise the REAL captureSignupConsent and mock only
 * `recordConsent`, because the guarantees worth protecting are end-to-end:
 * what actually reaches ConsentRecord, and what pointedly does not.
 */

const recordConsentMock = jest.fn();
// Keep the real module and override ONLY recordConsent. Mocking it down to a
// single export made this suite fail the moment captureSignupConsent started
// using normalizeEmail/normalizePhone - the mock was narrower than the module.
jest.mock('../../services/consentService', () => {
  const actual = jest.requireActual('../../services/consentService');
  return { ...actual, recordConsent: (...a: unknown[]) => recordConsentMock(...a) };
});
jest.mock('../../services/externalLeadIngestService', () => ({
  ingestExternalLead: jest.fn(),
}));

import { ingestExternalLead } from '../../services/externalLeadIngestService';
import { createExternalLead } from '../../controllers/v1LeadController';
import { SIGNUP_CONSENT_TEXT } from '../../services/consent/captureSignupConsent';

const mockIngest = ingestExternalLead as jest.Mock;

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/** A service-to-service request: `req.ip` is the training server, not a person. */
function serviceReq(body: Record<string, unknown>) {
  return { body, ip: '10.1.2.3', get: () => 'node-fetch/1.0' } as any;
}

const BASE = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  source: 'contact',
};

beforeEach(() => {
  jest.clearAllMocks();
  recordConsentMock.mockResolvedValue({ id: 'c1' });
  mockIngest.mockResolvedValue({ id: 7, created_at: new Date('2026-08-25T00:00:00Z'), was_duplicate: false });
});

describe('a ticked box records express consent', () => {
  it('writes express_written with the wording, the end-user IP and the user agent', async () => {
    const res = mockRes();
    await createExternalLead(
      serviceReq({
        ...BASE,
        marketing_opt_in: true,
        marketing_consent_text: SIGNUP_CONSENT_TEXT,
        ip_address: '203.0.113.7',
        user_agent: 'Mozilla/5.0 (iPhone)',
      }),
      res,
      jest.fn()
    );

    expect(recordConsentMock).toHaveBeenCalledTimes(1);
    expect(recordConsentMock.mock.calls[0][0]).toMatchObject({
      subjectType: 'email',
      subjectId: 'ada@example.com',
      channel: 'email',
      status: 'granted',
      // express_written is what lifts a person off the CAN-SPAM default rule.
      basis: 'express_written',
      source: 'training_site:contact',
    });
    expect(recordConsentMock.mock.calls[0][0].evidence).toMatchObject({
      consent_text: SIGNUP_CONSENT_TEXT,
      ip_address: '203.0.113.7',
      user_agent: 'Mozilla/5.0 (iPhone)',
      captured_via: 'signup_checkbox',
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('records the forwarded IP, never the calling server it arrived from', async () => {
    // req.ip here is 10.1.2.3 — the training site's Cloud Run instance. Storing
    // that as evidence would be worse than storing nothing: it looks like a
    // person's IP and is not one.
    await createExternalLead(
      serviceReq({ ...BASE, marketing_opt_in: true, ip_address: '203.0.113.7', user_agent: 'Mozilla/5.0' }),
      mockRes(),
      jest.fn()
    );
    const evidence = recordConsentMock.mock.calls[0][0].evidence;
    expect(evidence.ip_address).toBe('203.0.113.7');
    expect(evidence.user_agent).toBe('Mozilla/5.0');
    expect(evidence.ip_address).not.toBe('10.1.2.3');
    expect(evidence.user_agent).not.toBe('node-fetch/1.0');
  });

  it('accepts the string forms a checkbox can arrive as', async () => {
    for (const v of [true, 'true', 'on']) {
      recordConsentMock.mockClear();
      await createExternalLead(serviceReq({ ...BASE, marketing_opt_in: v }), mockRes(), jest.fn());
      expect(recordConsentMock).toHaveBeenCalledTimes(1);
    }
  });
});

describe('an unticked box records NOTHING — it is not a revocation', () => {
  it.each([undefined, false, 'false', '', 'off'])('writes no consent record for %p', async (v) => {
    const res = mockRes();
    await createExternalLead(
      serviceReq(v === undefined ? { ...BASE } : { ...BASE, marketing_opt_in: v }),
      res,
      jest.fn()
    );

    // Nothing at all — not a `revoked` row. Recording a revocation for someone
    // who simply did not tick would suppress a person we are currently
    // permitted to email.
    expect(recordConsentMock).not.toHaveBeenCalled();
    // And the lead itself still lands.
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('does not 400 the lead when marketing_opt_in is an unrecognised string', async () => {
    const res = mockRes();
    const next = jest.fn();
    await createExternalLead(serviceReq({ ...BASE, marketing_opt_in: 'yes please' }), res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(recordConsentMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('consent capture can never break the lead it rode in on', () => {
  it('still creates the lead and answers 201 when the consent write throws', async () => {
    recordConsentMock.mockRejectedValue(new Error('consent table unreachable'));
    const res = mockRes();
    const next = jest.fn();

    await createExternalLead(serviceReq({ ...BASE, marketing_opt_in: true }), res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: '7' }));
    expect(next).not.toHaveBeenCalled();
  });
});
