/**
 * Static contract test for ensureReeseOutreachSchema — asserts the SQL statement
 * array declares the reese_autonomous_outreach table and its required unique
 * constraint, WITHOUT requiring a live database (mirrors
 * ensureOutcomeMeasurementsSchema.test.ts's established convention).
 * sequelize.query is mocked so importing the module never attempts a real
 * connection.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureReeseOutreachSchema } from '../ensureReeseOutreachSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureReeseOutreachSchema', () => {
  it('happy path: issues CREATE TABLE IF NOT EXISTS for reese_autonomous_outreach', async () => {
    await ensureReeseOutreachSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS reese_autonomous_outreach/.test(s))).toBe(true);
  });

  it('boundary: declares a partial unique index backstopping the (enrollment_id, signal_type) active-row dedup', async () => {
    await ensureReeseOutreachSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(
      statements.some((s) =>
        /UNIQUE INDEX.*reese_autonomous_outreach \(enrollment_id, signal_type\)/.test(s) &&
        /WHERE status = 'active'/.test(s),
      ),
    ).toBe(true);
    expect(statements.some((s) => /INDEX.*reese_autonomous_outreach \(enrollment_id\)/.test(s))).toBe(true);
    expect(statements.some((s) => /INDEX.*reese_autonomous_outreach \(status, next_follow_up_due_at\)/.test(s))).toBe(true);
  });

  it('idempotency: a statement failure does not stop the remaining statements, and re-running twice never throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureReeseOutreachSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(4);

    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    await ensureReeseOutreachSchema();
    await expect(ensureReeseOutreachSchema()).resolves.toBeUndefined();
  });

  it('does not touch any existing enrollments/tickets table definition (a REFERENCES foreign key is fine, an ALTER/second CREATE TABLE on one of them is not)', async () => {
    await ensureReeseOutreachSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesExisting = statements.some(
      (s) =>
        /\b(CREATE TABLE|ALTER TABLE)\b/.test(s) &&
        /\b(enrollments|tickets)\b/.test(s) &&
        !/REFERENCES/.test(s),
    );
    expect(touchesExisting).toBe(false);
    expect(statements.filter((s) => /CREATE TABLE/.test(s)).length).toBe(1);
  });
});
