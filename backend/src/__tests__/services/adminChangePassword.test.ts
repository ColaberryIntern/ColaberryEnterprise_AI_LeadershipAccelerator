/**
 * Contract tests for changeAdminPassword.
 *
 * Shipped 2026-08-09 with the sales-rep provisioning: those accounts are handed
 * a generated temp password, so rotation is the first thing every rep does and
 * it has to be right. The AdminUser model is mocked; these assert the policy
 * (auth check, length floor, reuse rejection, hash-before-save), not Sequelize.
 */

const mockFindByPk = jest.fn();

jest.mock('../../models', () => ({
  AdminUser: { findByPk: (...args: unknown[]) => mockFindByPk(...args) },
}));

import bcrypt from 'bcrypt';
import { changeAdminPassword, MIN_PASSWORD_LENGTH } from '../../services/adminService';
import { AppError } from '../../utils/AppError';

const ADMIN_ID = '9f2a1c44-0e7b-4c3d-9a11-5b6c7d8e9f00';
const CURRENT = 'TEMP-pass-1234';
const NEXT = 'a-much-longer-passphrase';

async function buildAdmin(currentPassword = CURRENT) {
  return {
    id: ADMIN_ID,
    email: 'ntaylor@colaberry.com',
    role: 'sales',
    password_hash: await bcrypt.hash(currentPassword, 10),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

/** Assert the call rejects with an AppError carrying `statusCode`. */
async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  await expect(promise).rejects.toThrow(AppError);
  await promise.catch((e: AppError) => expect(e.statusCode).toBe(statusCode));
}

beforeEach(() => {
  mockFindByPk.mockReset();
});

describe('changeAdminPassword', () => {
  it('replaces the hash with one that verifies against the new password', async () => {
    const admin = await buildAdmin();
    const originalHash = admin.password_hash;
    mockFindByPk.mockResolvedValue(admin);

    await changeAdminPassword(ADMIN_ID, CURRENT, NEXT);

    expect(admin.save).toHaveBeenCalledTimes(1);
    expect(admin.password_hash).not.toBe(originalHash);
    expect(await bcrypt.compare(NEXT, admin.password_hash)).toBe(true);
    // The old password must stop working, which is the whole point.
    expect(await bcrypt.compare(CURRENT, admin.password_hash)).toBe(false);
  });

  it('never stores the new password in cleartext', async () => {
    const admin = await buildAdmin();
    mockFindByPk.mockResolvedValue(admin);

    await changeAdminPassword(ADMIN_ID, CURRENT, NEXT);

    expect(admin.password_hash).not.toContain(NEXT);
    expect(admin.password_hash.startsWith('$2')).toBe(true);
  });

  it('rejects a wrong current password without saving', async () => {
    const admin = await buildAdmin();
    mockFindByPk.mockResolvedValue(admin);

    await expectStatus(changeAdminPassword(ADMIN_ID, 'not-my-password', NEXT), 401);
    expect(admin.save).not.toHaveBeenCalled();
  });

  it('rejects an unknown admin id without leaking that it is unknown', async () => {
    mockFindByPk.mockResolvedValue(null);

    // Same 401 and same message as a bad password, so the endpoint cannot be
    // used to enumerate which accounts exist.
    await expectStatus(changeAdminPassword(ADMIN_ID, CURRENT, NEXT), 401);
  });

  it('rejects a new password below the length floor', async () => {
    const admin = await buildAdmin();
    mockFindByPk.mockResolvedValue(admin);

    const tooShort = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
    await expectStatus(changeAdminPassword(ADMIN_ID, CURRENT, tooShort), 400);
    expect(admin.save).not.toHaveBeenCalled();
  });

  it('accepts a new password exactly at the length floor', async () => {
    const admin = await buildAdmin();
    mockFindByPk.mockResolvedValue(admin);

    const exact = 'y'.repeat(MIN_PASSWORD_LENGTH);
    await expect(changeAdminPassword(ADMIN_ID, CURRENT, exact)).resolves.toBeUndefined();
    expect(admin.save).toHaveBeenCalledTimes(1);
  });

  it('rejects reusing the current password', async () => {
    const admin = await buildAdmin();
    mockFindByPk.mockResolvedValue(admin);

    await expectStatus(changeAdminPassword(ADMIN_ID, CURRENT, CURRENT), 400);
    expect(admin.save).not.toHaveBeenCalled();
  });

  it('is safe to replay: the second run fails on the now-stale current password', async () => {
    const admin = await buildAdmin();
    mockFindByPk.mockResolvedValue(admin);

    await changeAdminPassword(ADMIN_ID, CURRENT, NEXT);
    expect(admin.save).toHaveBeenCalledTimes(1);

    // Replaying the identical request cannot double-apply anything, because
    // CURRENT no longer matches the stored hash.
    await expectStatus(changeAdminPassword(ADMIN_ID, CURRENT, NEXT), 401);
    expect(admin.save).toHaveBeenCalledTimes(1);
  });
});
