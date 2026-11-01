import type { Request, Response, NextFunction } from 'express';

const createFreeAccount = jest.fn();
const registerManager = jest.fn();
const requestMagicLink = jest.fn();
jest.mock('../../services/freeSignupService', () => ({
  createFreeAccount: (...a: unknown[]) => createFreeAccount(...a),
}));
jest.mock('../../services/orgService', () => ({
  registerManager: (...a: unknown[]) => registerManager(...a),
  inviteMembers: jest.fn(), getOverview: jest.fn(), getRoster: jest.fn(), getMemberDetail: jest.fn(), getFeed: jest.fn(),
}));
jest.mock('../../services/participantService', () => ({
  ...jest.requireActual('../../services/participantService'),
  requestMagicLink: (...a: unknown[]) => requestMagicLink(...a),
}));

import { handleFreeSignup } from '../participantController';
import { handleOrgRegister } from '../orgController';
import { EXISTING_ACCOUNT_MESSAGE } from '../../services/signup/existingAccountSignIn';

/**
 * C103: the two PUBLIC signup doors must never hand a session to whoever typed an
 * email that already has an account. Before this, both did, so a member's email was
 * enough to sign in as them (their paid or management row first).
 */
type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const run = async (handler: Handler, body: unknown) => {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();
  const next = jest.fn();
  await handler({ body, ip: '1.2.3.4', get: () => 'ua' } as unknown as Request, { status, json } as unknown as Response, next as unknown as NextFunction);
  return { status, json, next, body: json.mock.calls[0]?.[0] };
};

const enrollment = { id: 'e1', full_name: 'Paid Member', email: 'member@example.com', tier: 'member' };

beforeEach(() => {
  jest.clearAllMocks();
  requestMagicLink.mockResolvedValue({ success: true, message: 'If an active enrollment exists for this email, a link has been sent.' });
});

describe('POST /api/portal/free-signup', () => {
  it('existing email: emails a sign-in link and returns no session or account details', async () => {
    createFreeAccount.mockResolvedValue({ jwt: null, enrollment, created: false, disposition: 'reused' });

    const r = await run(handleFreeSignup, { full_name: 'Attacker', email: 'member@example.com' });

    expect(requestMagicLink).toHaveBeenCalledWith('member@example.com');
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.body).toEqual({ check_email: true, message: EXISTING_ACCOUNT_MESSAGE });
    expect(JSON.stringify(r.body)).not.toMatch(/Paid Member|e1|jwt/);
  });

  it('new email: signs them straight in, as before (the ad funnel is not slowed down)', async () => {
    createFreeAccount.mockResolvedValue({ jwt: 'new.jwt', enrollment, created: true, disposition: 'created' });

    const r = await run(handleFreeSignup, { full_name: 'New Person', email: 'new@example.com' });

    expect(requestMagicLink).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.body.jwt).toBe('new.jwt');
  });

  it('a link that fails to send is an error, not a false "we emailed you"', async () => {
    createFreeAccount.mockResolvedValue({ jwt: null, enrollment, created: false, disposition: 'reused' });
    requestMagicLink.mockRejectedValue(new Error('mandrill down'));

    const r = await run(handleFreeSignup, { full_name: 'X', email: 'member@example.com' });

    expect(r.next).toHaveBeenCalledWith(expect.any(Error));
    expect(r.json).not.toHaveBeenCalled();
  });

  it('a portal-disabled account gets the real reason, still with no session', async () => {
    createFreeAccount.mockResolvedValue({ jwt: null, enrollment, created: false, disposition: 'reused' });
    requestMagicLink.mockResolvedValue({ success: false, message: 'Your enrollment is pending admin approval.' });

    const r = await run(handleFreeSignup, { full_name: 'X', email: 'member@example.com' });

    expect(r.body).toEqual({ check_email: true, message: 'Your enrollment is pending admin approval.' });
  });
});

describe('POST /api/portal/org/register', () => {
  const orgResult = { organization: { id: 'org-1', name: 'Acme', owner_enrollment_id: 'e1', organization_type: 'training' }, enrollment, lead_id: 7 };

  it('existing email: emails a sign-in link and returns no session or org details', async () => {
    registerManager.mockResolvedValue({ ...orgResult, jwt: null, existing_account: true });

    const r = await run(handleOrgRegister, { name: 'Attacker', email: 'Member@Example.com' });

    expect(requestMagicLink).toHaveBeenCalledWith('member@example.com');
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.body).toEqual({ check_email: true, message: EXISTING_ACCOUNT_MESSAGE });
  });

  it('new email: returns the session and org, as before', async () => {
    registerManager.mockResolvedValue({ ...orgResult, jwt: 'new.jwt', existing_account: false });

    const r = await run(handleOrgRegister, { name: 'New', email: 'new@example.com' });

    expect(requestMagicLink).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.body.jwt).toBe('new.jwt');
  });
});
