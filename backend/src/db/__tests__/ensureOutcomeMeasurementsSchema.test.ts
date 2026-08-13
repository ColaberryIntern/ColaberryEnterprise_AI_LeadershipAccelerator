/**
 * Static contract test for ensureOutcomeMeasurementsSchema — asserts the SQL
 * statement array declares the outcome_measurements table and its required unique
 * constraint, WITHOUT requiring a live database (this repo's unit tests mock the DB;
 * see ensureCapeSchema.test.ts for the established convention this file follows).
 * sequelize.query is mocked so importing the module never attempts a real connection.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureOutcomeMeasurementsSchema } from '../ensureOutcomeMeasurementsSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureOutcomeMeasurementsSchema', () => {
  it('happy path: issues CREATE TABLE IF NOT EXISTS for outcome_measurements', async () => {
    await ensureOutcomeMeasurementsSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS outcome_measurements/.test(s))).toBe(true);
  });

  it('boundary: declares the (ticket_id, measurement_type) unique index — the scheduling idempotency key', async () => {
    await ensureOutcomeMeasurementsSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(
      statements.some((s) => /UNIQUE INDEX.*outcome_measurements \(ticket_id, measurement_type\)/.test(s)),
    ).toBe(true);
    expect(statements.some((s) => /INDEX.*outcome_measurements \(ticket_id\)/.test(s))).toBe(true);
    expect(statements.some((s) => /INDEX.*outcome_measurements \(scheduled_for\)/.test(s))).toBe(true);
  });

  it('idempotency: a statement failure (e.g. table already exists under a partial DB state) does not stop the remaining statements from running, and re-running the whole function twice never throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureOutcomeMeasurementsSchema()).resolves.toBeUndefined();
    // all statements were still attempted despite the first rejecting
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(4);

    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    // a second full run (simulating a second boot) is also a clean no-op
    await ensureOutcomeMeasurementsSchema();
    await expect(ensureOutcomeMeasurementsSchema()).resolves.toBeUndefined();
  });

  it('does not touch any existing ticket/evidence/work-graph table definition (a REFERENCES foreign key is fine, an ALTER/second CREATE TABLE on one of them is not)', async () => {
    await ensureOutcomeMeasurementsSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesExisting = statements.some(
      (s) =>
        /\b(CREATE TABLE|ALTER TABLE)\b/.test(s) &&
        /\b(tickets|evidence_artifacts|ticket_work_units|work_ledger_events|approval_requests)\b/.test(s) &&
        !/REFERENCES/.test(s),
    );
    expect(touchesExisting).toBe(false);
    // exactly one CREATE TABLE statement in this whole ensure function (the new table only)
    expect(statements.filter((s) => /CREATE TABLE/.test(s)).length).toBe(1);
  });
});
