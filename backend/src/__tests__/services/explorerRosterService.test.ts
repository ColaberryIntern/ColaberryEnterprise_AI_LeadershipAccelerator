/**
 * explorerRosterService unit tests.
 *
 * sequelize.query is mocked for the enrollments+deposit query; pointsService's
 * getTotalsForEnrollments is mocked (it does its own DB I/O via a model, not
 * raw SQL) while levelForPoints runs for real so the level ladder is verified too.
 */

const mockQuery = jest.fn();
const mockGetTotals = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: mockQuery, define: jest.fn() },
}));

// pointsService imports the real StudentPointsEvent model at module scope,
// which calls Model.init() against the mocked sequelize above — stub the
// model out entirely since getTotalsForEnrollments is mocked below anyway.
jest.mock('../../models/StudentPointsEvent', () => ({ __esModule: true, default: {} }));

jest.mock('../../services/pointsService', () => {
  const actual = jest.requireActual('../../services/pointsService');
  return { ...actual, getTotalsForEnrollments: mockGetTotals };
});

import { getExplorerRoster } from '../../services/explorerRosterService';

describe('getExplorerRoster', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetTotals.mockReset();
  });

  it('returns an empty roster when there are no explorers', async () => {
    mockQuery.mockResolvedValue([]);
    mockGetTotals.mockResolvedValue(new Map());

    const result = await getExplorerRoster();

    expect(result).toEqual([]);
    expect(mockGetTotals).toHaveBeenCalledWith([]);
  });

  it('attaches points + the correct level name to each explorer, sorted most-engaged first', async () => {
    mockQuery.mockResolvedValue([
      { enrollment_id: 'enr-a', full_name: 'Ana Lopez', email: 'ana@example.com', created_at: '2026-06-01T00:00:00.000Z' },
      { enrollment_id: 'enr-b', full_name: 'Ben Ito', email: 'ben@example.com', created_at: '2026-07-01T00:00:00.000Z' },
      { enrollment_id: 'enr-c', full_name: null, email: 'noname@example.com', created_at: null },
    ]);
    mockGetTotals.mockResolvedValue(new Map([
      ['enr-a', 50],   // Apprentice (min 0)
      ['enr-b', 420],  // Architect (min 400)
      // enr-c has no points row at all -> defaults to 0
    ]));

    const result = await getExplorerRoster();

    expect(result.map((r) => r.enrollment_id)).toEqual(['enr-b', 'enr-a', 'enr-c']); // sorted by points desc
    expect(result[0]).toEqual(expect.objectContaining({ enrollment_id: 'enr-b', points: 420, level_name: 'Architect' }));
    expect(result[1]).toEqual(expect.objectContaining({ enrollment_id: 'enr-a', points: 50, level_name: 'Apprentice' }));
    expect(result[2]).toEqual(expect.objectContaining({ enrollment_id: 'enr-c', points: 0, level_name: 'Apprentice', full_name: 'noname@example.com', signed_up_at: null }));
  });

  it('passes only real enrollment ids from the query into the points lookup', async () => {
    mockQuery.mockResolvedValue([
      { enrollment_id: 'enr-x', full_name: 'X', email: 'x@example.com', created_at: null },
    ]);
    mockGetTotals.mockResolvedValue(new Map());

    await getExplorerRoster();

    expect(mockGetTotals).toHaveBeenCalledWith(['enr-x']);
  });

  it('queries only active, non-staff explorers (excludes withdrawn duplicates and internal staff signups)', async () => {
    mockQuery.mockResolvedValue([]);
    mockGetTotals.mockResolvedValue(new Map());

    await getExplorerRoster();

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("e.status = 'active'");
    expect(sql).toContain('cm.mgmt_role'); // IS_STAFF_SQL is inlined into the WHERE clause
  });
});
