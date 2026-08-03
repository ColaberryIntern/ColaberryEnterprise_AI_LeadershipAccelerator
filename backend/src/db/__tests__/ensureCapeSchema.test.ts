/**
 * Static contract test for ensureCapeSchema — asserts the SQL statement array
 * declares the 4 CAPE tables and their required unique constraints, WITHOUT
 * requiring a live database (this repo's unit tests mock the DB; see
 * jest.config.ts comment on isolatedModules and the evidenceService.test.ts
 * convention). sequelize.query is mocked so importing the module never attempts
 * a real connection.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureCapeSchema } from '../ensureCapeSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureCapeSchema', () => {
  it('happy path: issues CREATE TABLE IF NOT EXISTS for all 4 CAPE tables', async () => {
    await ensureCapeSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS architecture_skill_definitions/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS architecture_skill_evidence_band_weights/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS student_skill_evidence/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS student_architecture_skill/.test(s))).toBe(true);
  });

  it('boundary: declares the required unique constraints (idempotency + one-current-row invariants)', async () => {
    await ensureCapeSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    // one-current-version invariants
    expect(statements.some((s) => /UNIQUE INDEX.*architecture_skill_definitions \(skill_id\) WHERE is_current/.test(s))).toBe(true);
    expect(statements.some((s) => /UNIQUE INDEX.*architecture_skill_evidence_band_weights \(is_current\) WHERE is_current/.test(s))).toBe(true);
    // ledger idempotency key
    expect(statements.some((s) => /UNIQUE INDEX.*student_skill_evidence \(idempotency_key\)/.test(s))).toBe(true);
    // derived cache: one row per (enrollment, skill)
    expect(statements.some((s) => /UNIQUE INDEX.*student_architecture_skill \(enrollment_id, skill_id\)/.test(s))).toBe(true);
  });

  it('idempotency: a statement failure (e.g. table already exists under a partial DB state) does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureCapeSchema()).resolves.toBeUndefined();
    // all statements were still attempted despite the first rejecting
    expect(mockQuery.mock.calls.length).toBeGreaterThan(10);
  });

  it('does not touch any existing promotion/XP table', async () => {
    await ensureCapeSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesExisting = statements.some((s) =>
      /\b(xp_events|evidence_records|competency_domains|student_competencies|points_config)\b/.test(s) &&
      !/REFERENCES/.test(s));
    expect(touchesExisting).toBe(false);
  });
});
