const mockEnrollmentFindByPk = jest.fn();
jest.mock('../../../models', () => ({ Enrollment: { findByPk: (...a: any[]) => mockEnrollmentFindByPk(...a) } }));

const mockCohortFindByPk = jest.fn();
jest.mock('../../../models/Cohort', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockCohortFindByPk(...a) } }));

import { getIdentityField } from '../identitySource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getIdentityField', () => {
  it('happy path: real enrollment + real cohort name resolved', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ full_name: 'Sofia Chen', status: 'active', cohort_id: 'cohort-9' });
    mockCohortFindByPk.mockResolvedValue({ name: 'July 2026' });

    const field = await getIdentityField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ fullName: 'Sofia Chen', status: 'active', cohortId: 'cohort-9', cohortName: 'July 2026' });
    expect(field.sourceRecordIds).toEqual(['enrollment-1']);
  });

  it('honesty boundary: no enrollment found is unknown, never a fabricated identity', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null);

    const field = await getIdentityField('does-not-exist');

    expect(field.status).toBe('unknown');
    expect(field.value).toBeNull();
  });

  it('no cohort_id means a real known identity with a null cohort, never a guessed one', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ full_name: 'Guest Student', status: 'active', cohort_id: null });

    const field = await getIdentityField('enrollment-2');

    expect(field.status).toBe('known');
    expect(field.value?.cohortId).toBeNull();
    expect(field.value?.cohortName).toBeNull();
    expect(mockCohortFindByPk).not.toHaveBeenCalled();
  });

  it('fail-safe: a cohort lookup failure does not break identity resolution', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ full_name: 'Sofia Chen', status: 'active', cohort_id: 'cohort-9' });
    mockCohortFindByPk.mockRejectedValue(new Error('DB timeout'));

    const field = await getIdentityField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value?.cohortName).toBeNull();
  });
});
