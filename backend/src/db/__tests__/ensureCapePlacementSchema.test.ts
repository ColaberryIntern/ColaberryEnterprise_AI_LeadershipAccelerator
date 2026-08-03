/**
 * Static contract test for ensureCapePlacementSchema — asserts the SQL
 * statement array declares the 2 new tables + the 2 onboarding_profiles
 * columns, WITHOUT requiring a live database (mocked sequelize.query, same
 * convention as ensureCapeSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureCapePlacementSchema } from '../ensureCapePlacementSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureCapePlacementSchema', () => {
  it('happy path: adds the 2 onboarding_profiles columns and creates the 2 new tables', async () => {
    await ensureCapePlacementSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /ALTER TABLE onboarding_profiles ADD COLUMN IF NOT EXISTS resume_version/.test(s))).toBe(true);
    expect(statements.some((s) => /ALTER TABLE onboarding_profiles ADD COLUMN IF NOT EXISTS extractor_version/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS resume_skill_claims/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS diagnostic_attempts/.test(s))).toBe(true);
  });

  it('boundary: declares the required idempotency-key unique constraints', async () => {
    await ensureCapePlacementSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /UNIQUE INDEX.*resume_skill_claims \(idempotency_key\)/.test(s))).toBe(true);
    expect(statements.some((s) => /UNIQUE INDEX.*diagnostic_attempts \(idempotency_key\)/.test(s))).toBe(true);
  });

  it('idempotency: a statement failure (e.g. column already exists under a partial DB state) does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureCapePlacementSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBeGreaterThan(5);
  });

  it('does not touch student_skill_evidence, student_architecture_skill, or any promotion/XP table', async () => {
    await ensureCapePlacementSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesExisting = statements.some((s) =>
      /\b(student_skill_evidence|student_architecture_skill|xp_events|evidence_records|competency_domains|student_competencies|points_config)\b/.test(s) &&
      !/REFERENCES/.test(s));
    expect(touchesExisting).toBe(false);
  });

  it('onboarding_profiles ALTERs run before the new-table CREATEs (table-existence ordering)', async () => {
    await ensureCapePlacementSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const alterIdx = statements.findIndex((s) => /ALTER TABLE onboarding_profiles/.test(s));
    const createIdx = statements.findIndex((s) => /CREATE TABLE IF NOT EXISTS resume_skill_claims/.test(s));
    expect(alterIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeGreaterThan(alterIdx - 1); // alters listed at/near the top, both present
  });
});
