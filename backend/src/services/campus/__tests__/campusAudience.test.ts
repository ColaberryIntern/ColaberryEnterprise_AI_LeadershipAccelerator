const mockPage = jest.fn();
const mockFreePreview = jest.fn();
const mockOrgManager = jest.fn();
const mockMgmt = jest.fn();
const mockEnrollment = jest.fn();
const mockAdmin = jest.fn();
jest.mock('../../access/contentEntitlement', () => ({ resolveContentPageAccess: (...a: unknown[]) => mockPage(...a), isFreePreviewTier: (...a: unknown[]) => mockFreePreview(...a) }));
jest.mock('../../portalSettingsService', () => ({ isOrgManager: (...a: unknown[]) => mockOrgManager(...a) }));
jest.mock('../../access/mgmtBridgeService', () => ({ getMgmtStatus: (...a: unknown[]) => mockMgmt(...a) }));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findByPk: (...a: unknown[]) => mockEnrollment(...a) } }));
jest.mock('../../../models/AdminUser', () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => mockAdmin(...a) } }));

import { campusAudienceFor, hasAdminLogin } from '../campusAudience';

/**
 * C13 (round 3): Ali (employee and admin, who also manages an org) was getting the business campus. Staff now includes an account
 * whose email has an admin_users login, ahead of business; every source fails closed.
 */
beforeEach(() => {
  jest.clearAllMocks();
  mockPage.mockResolvedValue({ isStaff: false });
  mockFreePreview.mockResolvedValue(false);
  mockOrgManager.mockResolvedValue(false);
  mockMgmt.mockResolvedValue({ is_mgmt: false });
  mockEnrollment.mockResolvedValue({ email: 'Ali@Colaberry.com' });
  mockAdmin.mockResolvedValue(null);
});

describe('campusAudienceFor', () => {
  it('an org manager whose email has an admin login is STAFF, not business', async () => {
    mockOrgManager.mockResolvedValue(true);
    mockAdmin.mockResolvedValue({ id: 'adm-1' });
    expect(await campusAudienceFor('enr-1')).toBe('staff');
  });
  it('keeps the old precedence otherwise: mgmt -> staff, org manager -> business, free tier -> explorer, else member', async () => {
    mockMgmt.mockResolvedValueOnce({ is_mgmt: true });
    expect(await campusAudienceFor('enr-1')).toBe('staff');
    mockOrgManager.mockResolvedValueOnce(true);
    expect(await campusAudienceFor('enr-1')).toBe('business');
    mockFreePreview.mockResolvedValueOnce(true);
    expect(await campusAudienceFor('enr-1')).toBe('explorer');
    expect(await campusAudienceFor('enr-1')).toBe('member');
  });
});

describe('hasAdminLogin', () => {
  it('matches the enrollment email case-insensitively', async () => {
    mockAdmin.mockResolvedValue({ id: 'adm-1' });
    expect(await hasAdminLogin('enr-1')).toBe(true);
    expect(JSON.stringify(mockAdmin.mock.calls[0][0])).toContain('ali@colaberry.com');
  });
  it('no enrollment email: no admin, and no lookup', async () => {
    mockEnrollment.mockResolvedValue(null);
    expect(await hasAdminLogin('enr-1')).toBe(false);
    expect(mockAdmin).not.toHaveBeenCalled();
  });
  it('a failed read is "no" (fail closed) and is logged', async () => {
    mockAdmin.mockRejectedValue(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await hasAdminLogin('enr-1')).toBe(false);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'campus_admin_login_check_failed', error_class: 'SequelizeConnectionError' });
    warn.mockRestore();
  });
});
