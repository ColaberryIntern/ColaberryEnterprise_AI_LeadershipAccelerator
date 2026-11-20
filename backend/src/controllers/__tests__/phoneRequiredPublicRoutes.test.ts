import type { Request, Response, NextFunction } from 'express';

/**
 * PH1 (Ali, 2026-11-19): every public signup/lead form requires a phone number, and the
 * permission to call or text it stays optional.
 *
 * Schema-level coverage lives in `schemas/__tests__/phoneConsentSchemas.test.ts`. These drive the
 * three public handlers whose schemas are private to their controllers - org registration (/try),
 * the /enroll seat-code redemption, and POST /api/leads - and pin both halves at the HTTP edge:
 * no phone is a 400 that creates nothing, and a phone with no tick is accepted with the consent
 * helper told "no tick" (which writes no record; see capturePhoneConsent.test.ts).
 */

const registerManager = jest.fn();
const createLead = jest.fn();
const capturePhoneConsent = jest.fn();

jest.mock('../../services/orgService', () => ({
  registerManager: (...a: unknown[]) => registerManager(...a),
  inviteMembers: jest.fn(), getOverview: jest.fn(), getRoster: jest.fn(), getMemberDetail: jest.fn(), getFeed: jest.fn(),
}));
jest.mock('../../services/leadService', () => ({
  ...jest.requireActual('../../services/leadService'),
  createLead: (...a: unknown[]) => createLead(...a),
}));
jest.mock('../../services/consent/capturePhoneConsent', () => ({
  capturePhoneConsent: (...a: unknown[]) => capturePhoneConsent(...a),
}));

import { handleOrgRegister } from '../orgController';
import { handleRedeemSeat } from '../sponsorController';
import { submitLead } from '../leadController';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const run = async (handler: Handler, body: unknown) => {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();
  const next = jest.fn();
  await handler({ body, ip: '1.2.3.4', get: () => 'ua' } as unknown as Request, { status, json } as unknown as Response, next as unknown as NextFunction);
  return { status, json, next, body: json.mock.calls[0]?.[0] };
};

const PHONE = '(214) 555-0100';

beforeEach(() => {
  jest.clearAllMocks();
  capturePhoneConsent.mockResolvedValue(0);
  registerManager.mockResolvedValue({ jwt: 'new.jwt', existing_account: false, organization: { id: 'org-1' } });
  createLead.mockResolvedValue({ lead: { id: 9 }, isDuplicate: false });
});

describe('POST /api/portal/org/register (/try)', () => {
  it.each([
    ['no phone', {}],
    ['a blank phone', { phone: '  ' }],
    ['a phone under 10 digits', { phone: '555-0100' }],
  ])('400s with %s and creates nothing', async (_l, extra) => {
    const r = await run(handleOrgRegister, { name: 'Dana', email: 'dana@example.com', ...extra });
    expect(r.status).toHaveBeenCalledWith(400);
    expect(registerManager).not.toHaveBeenCalled();
    expect(capturePhoneConsent).not.toHaveBeenCalled();
  });

  it('accepts a phone with NO consent tick, and tells the consent helper nobody ticked', async () => {
    const r = await run(handleOrgRegister, { name: 'Dana', email: 'dana@example.com', phone: PHONE });
    expect(r.status).toHaveBeenCalledWith(201);
    expect(registerManager).toHaveBeenCalledWith(expect.objectContaining({ phone: PHONE }));
    // The consent flag never reaches the account service: it is not an account field.
    expect(registerManager.mock.calls[0][0]).not.toHaveProperty('phone_consent');
    expect(capturePhoneConsent).toHaveBeenCalledWith(expect.objectContaining({ phone: PHONE, phoneConsent: undefined }));
  });

  it('passes a real tick through to the consent helper', async () => {
    await run(handleOrgRegister, { name: 'Dana', email: 'dana@example.com', phone: PHONE, phone_consent: true });
    expect(capturePhoneConsent).toHaveBeenCalledWith(expect.objectContaining({ phoneConsent: true, source: 'org_register' }));
  });
});

describe('POST /api/sponsor/redeem (/enroll seat code)', () => {
  it.each([
    ['no phone', {}],
    ['a phone under 10 digits', { phone: '555-0100' }],
  ])('400s with %s before touching a seat', async (_l, extra) => {
    const r = await run(handleRedeemSeat, { code: 'ACME-1', full_name: 'Dana', email: 'dana@example.com', ...extra });
    expect(r.status).toHaveBeenCalledWith(400);
    expect(capturePhoneConsent).not.toHaveBeenCalled();
  });
});

describe('POST /api/leads', () => {
  it('400s a lead with no phone and creates nothing', async () => {
    const r = await run(submitLead, { name: 'Dana', email: 'dana@example.com' });
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.body.details.some((d: { field: string }) => d.field === 'phone')).toBe(true);
    expect(createLead).not.toHaveBeenCalled();
  });

  it('accepts a phone with no consent tick; the grant is recorded as "not given"', async () => {
    const r = await run(submitLead, { name: 'Dana', email: 'dana@example.com', phone: PHONE });
    expect(r.status).toHaveBeenCalledWith(201);
    expect(capturePhoneConsent).toHaveBeenCalledWith(expect.objectContaining({ phone: PHONE, phoneConsent: false }));
  });
});
