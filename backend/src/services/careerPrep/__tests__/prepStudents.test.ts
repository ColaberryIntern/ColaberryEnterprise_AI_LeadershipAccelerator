const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { listPrepStudents } from '../prepStudents';

describe('listPrepStudents', () => {
  it('maps rows, turns Postgres numerics into numbers and omits a missing readiness (never 0)', async () => {
    mockQuery.mockResolvedValue([[
      { enrollment_id: 'e1', full_name: 'Ann Lee', last_observed: '2026-11-15T10:00:00Z', observations: 12, readiness: '71.50' },
      { enrollment_id: 'e2', full_name: null, last_observed: '2026-11-14T10:00:00Z', observations: 2, readiness: null },
    ], 2]);
    expect(await listPrepStudents()).toEqual([
      { enrollmentId: 'e1', name: 'Ann Lee', lastObserved: '2026-11-15T10:00:00.000Z', observations: 12, readiness: 71.5 },
      { enrollmentId: 'e2', name: '', lastObserved: '2026-11-14T10:00:00.000Z', observations: 2 },
    ]);
    expect(String(mockQuery.mock.calls[0][0])).toContain('LIMIT 500');
  });

  it('lets a database error reach the route', async () => {
    mockQuery.mockRejectedValue(new Error('db'));
    await expect(listPrepStudents()).rejects.toThrow('db');
  });
});
