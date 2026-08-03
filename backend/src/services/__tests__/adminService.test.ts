jest.mock('bcrypt', () => ({ compare: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'signed-token') }));
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret', jwtExpiresIn: '7d' } }));
jest.mock('../../models', () => ({ AdminUser: { findOne: jest.fn() }, AccountCredit: {} }));
jest.mock('../access/mgmtBridgeService', () => ({ loadStaffPortalLinkByEmail: jest.fn() }));

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AdminUser } from '../../models';
import { loadStaffPortalLinkByEmail } from '../access/mgmtBridgeService';
import { authenticateAdmin } from '../adminService';
import { AppError } from '../../utils/AppError';

const findOne = AdminUser.findOne as jest.Mock;
const compare = bcrypt.compare as unknown as jest.Mock;
const sign = jwt.sign as jest.Mock;
const loadLink = loadStaffPortalLinkByEmail as jest.Mock;

describe('authenticateAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unknown email', async () => {
    findOne.mockResolvedValue(null);
    await expect(authenticateAdmin('nobody@colaberry.com', 'x')).rejects.toBeInstanceOf(AppError);
    expect(loadLink).not.toHaveBeenCalled();
  });

  it('rejects a wrong password', async () => {
    findOne.mockResolvedValue({ id: 'a1', email: 'ram@colaberry.com', role: 'admin', password_hash: 'h' });
    compare.mockResolvedValue(false);
    await expect(authenticateAdmin('ram@colaberry.com', 'wrong')).rejects.toBeInstanceOf(AppError);
    expect(loadLink).not.toHaveBeenCalled();
  });

  it('a plain legacy admin with no staff link gets a token with no portal_enrollment_id or mgmt_role', async () => {
    findOne.mockResolvedValue({ id: 'a1', email: 'plain@colaberry.com', role: 'admin', password_hash: 'h' });
    compare.mockResolvedValue(true);
    loadLink.mockResolvedValue(null);

    await authenticateAdmin('plain@colaberry.com', 'right');

    const payload = sign.mock.calls[0][0];
    expect(payload).toEqual({ sub: 'a1', email: 'plain@colaberry.com', role: 'admin' });
    expect(payload.portal_enrollment_id).toBeUndefined();
    expect(payload.mgmt_role).toBeUndefined();
  });

  it('CRITICAL: a legacy admin linked to a SCOPED staff role (e.g. curriculum) gets portal_enrollment_id but NEVER mgmt_role — stamping mgmt_role would narrow adminAllowedSections() and silently shrink a full-admin login down to that role\'s sections', async () => {
    findOne.mockResolvedValue({ id: 'a1', email: 'swati@colaberry.com', role: 'admin', password_hash: 'h' });
    compare.mockResolvedValue(true);
    loadLink.mockResolvedValue({ enrollmentId: 'enroll-123', mgmtRole: 'curriculum' });

    await authenticateAdmin('swati@colaberry.com', 'right');

    const payload = sign.mock.calls[0][0];
    expect(payload.portal_enrollment_id).toBe('enroll-123');
    expect(payload.mgmt_role).toBeUndefined();
    expect(payload.role).toBe('admin'); // unchanged legacy role, still resolves to full sections
  });

  it('an owner-linked legacy admin also only gets portal_enrollment_id, not mgmt_role', async () => {
    findOne.mockResolvedValue({ id: 'a1', email: 'ali@colaberry.com', role: 'super_admin', password_hash: 'h' });
    compare.mockResolvedValue(true);
    loadLink.mockResolvedValue({ enrollmentId: 'enroll-owner', mgmtRole: 'owner' });

    await authenticateAdmin('ali@colaberry.com', 'right');

    const payload = sign.mock.calls[0][0];
    expect(payload.portal_enrollment_id).toBe('enroll-owner');
    expect(payload.mgmt_role).toBeUndefined();
  });
});
