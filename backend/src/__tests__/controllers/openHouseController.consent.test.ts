/**
 * POST /api/v1/open-house/register — marketing consent capture.
 *
 * This is training.colaberry.com's largest signup surface (the sitewide
 * "Start learning AI for free" modal and /start-free both land here), so the
 * consent rules matter most on this route.
 */

const recordConsentMock = jest.fn();
// Keep the real module and override ONLY recordConsent. Mocking it down to a
// single export made this suite fail the moment captureSignupConsent started
// using normalizeEmail/normalizePhone - the mock was narrower than the module.
jest.mock('../../services/consentService', () => {
  const actual = jest.requireActual('../../services/consentService');
  return { ...actual, recordConsent: (...a: unknown[]) => recordConsentMock(...a) };
});
jest.mock('../../services/enrollmentService', () => ({
  createExplorerEnrollment: jest.fn(),
}));

import { createExplorerEnrollment } from '../../services/enrollmentService';
import { handleOpenHouseRegister } from '../../controllers/openHouseController';
import { SIGNUP_CONSENT_TEXT } from '../../services/consent/captureSignupConsent';

const mockCreateExplorer = createExplorerEnrollment as jest.Mock;

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function serviceReq(body: Record<string, unknown>) {
  return { body, ip: '10.1.2.3', get: () => 'node-fetch/1.0' } as any;
}

const BASE = { name: 'Ada Lovelace', email: 'ada@example.com' };

beforeEach(() => {
  jest.clearAllMocks();
  recordConsentMock.mockResolvedValue({ id: 'c1' });
  mockCreateExplorer.mockResolvedValue({ enrollment: { id: 'enr-1' }, created: true, cohort_id: 'explorer-1' });
});

it('records express_written consent with the wording and the end-user IP/UA', async () => {
  const res = mockRes();
  await handleOpenHouseRegister(
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

  expect(recordConsentMock.mock.calls[0][0]).toMatchObject({
    subjectType: 'email',
    channel: 'email',
    status: 'granted',
    basis: 'express_written',
    source: 'training_site:open_house_register',
  });
  expect(recordConsentMock.mock.calls[0][0].evidence).toMatchObject({
    consent_text: SIGNUP_CONSENT_TEXT,
    ip_address: '203.0.113.7',
    user_agent: 'Mozilla/5.0 (iPhone)',
  });
  expect(res.status).toHaveBeenCalledWith(201);
});

it('writes nothing when the box was left unticked, and still registers them', async () => {
  const res = mockRes();
  await handleOpenHouseRegister(serviceReq({ ...BASE }), res, jest.fn());

  expect(recordConsentMock).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
});

it('records a tick on a repeat registration — consent given now is consent', async () => {
  // created === false (already registered). Someone who skipped the box the
  // first time and ticks it now is consenting now; ConsentRecord is append-only.
  mockCreateExplorer.mockResolvedValue({ enrollment: { id: 'enr-1' }, created: false, cohort_id: 'explorer-1' });
  const res = mockRes();
  await handleOpenHouseRegister(serviceReq({ ...BASE, marketing_opt_in: 'on' }), res, jest.fn());

  expect(recordConsentMock).toHaveBeenCalledTimes(1);
  expect(res.status).toHaveBeenCalledWith(200);
});

it('still creates the account when the consent write throws', async () => {
  recordConsentMock.mockRejectedValue(new Error('consent table unreachable'));
  const res = mockRes();
  const next = jest.fn();

  await handleOpenHouseRegister(serviceReq({ ...BASE, marketing_opt_in: true }), res, next);

  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, enrollment_id: 'enr-1' }));
  expect(next).not.toHaveBeenCalled();
});
