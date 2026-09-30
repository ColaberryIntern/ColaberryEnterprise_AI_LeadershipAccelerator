/**
 * createAdminEnrollment must grant portal access at creation.
 *
 * Regression guard for the QR check-in failure found after the 2026-07-23
 * Orientation: this path wrote portal_enabled=false, so every manually
 * rostered student was refused at the login screen ("pending admin approval")
 * and could not check in by scanning the class QR. Only /quick-add-student
 * flipped the flag afterwards, which is why some accounts worked and most
 * did not.
 */

jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret', frontendUrl: 'https://enterprise.colaberry.ai' } }));

const mockCreate = jest.fn();
const mockFindOne = jest.fn();
const mockFindByPk = jest.fn();
const mockIncrement = jest.fn();

jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: {
    create: (...a: any[]) => mockCreate(...a),
    findOne: (...a: any[]) => mockFindOne(...a),
  },
  Cohort: {
    findByPk: (...a: any[]) => mockFindByPk(...a),
    increment: (...a: any[]) => mockIncrement(...a),
  },
  Lead: { findOrCreate: jest.fn() },
}));

// Auto-created downstream of enrollment; irrelevant to this contract.
jest.mock('../../services/projectService', () => ({ createProjectForEnrollment: jest.fn().mockResolvedValue(undefined) }));

import { createAdminEnrollment } from '../../services/enrollmentService';

const INPUT = {
  full_name: 'Dana Reed',
  email: 'Dana.Reed@Example.com',
  company: 'Example Co',
  cohort_id: 'cohort-1',
};

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ id: 'enr-1' });
  mockFindOne.mockReset().mockResolvedValue(null);      // no duplicate
  mockFindByPk.mockReset().mockResolvedValue({ id: 'cohort-1', name: 'July 2026' });
  mockIncrement.mockReset().mockResolvedValue(undefined);
});

it('creates the student with portal access already enabled', async () => {
  await createAdminEnrollment(INPUT);

  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockCreate.mock.calls[0][0].portal_enabled).toBe(true);
});

it('still normalizes the email and marks the enrollment active', async () => {
  await createAdminEnrollment(INPUT);

  const created = mockCreate.mock.calls[0][0];
  expect(created.email).toBe('dana.reed@example.com');
  expect(created.status).toBe('active');
});

it('rejects a duplicate enrollment in the same cohort without creating anything', async () => {
  mockFindOne.mockResolvedValue({ id: 'existing' });

  await expect(createAdminEnrollment(INPUT)).rejects.toThrow(/already exists/i);
  expect(mockCreate).not.toHaveBeenCalled();
});

it('rejects an unknown cohort without creating anything', async () => {
  mockFindByPk.mockResolvedValue(null);

  await expect(createAdminEnrollment(INPUT)).rejects.toThrow(/Cohort not found/i);
  expect(mockCreate).not.toHaveBeenCalled();
});
