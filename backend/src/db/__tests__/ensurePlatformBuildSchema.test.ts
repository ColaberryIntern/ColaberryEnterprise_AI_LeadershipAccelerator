/**
 * ensurePlatformBuildSchema: applies additive DDL and REJECTS when it cannot, in both halves:
 * a failing statement, and a table missing after a clean apply. Query layer mocked.
 */
jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { sequelize } = require('../../config/database') as { sequelize: { query: jest.Mock } };
const {
  ensurePlatformBuildSchema,
  PlatformBuildSchemaError,
  PLATFORM_BUILD_TABLES,
} = require('../ensurePlatformBuildSchema') as typeof import('../ensurePlatformBuildSchema');

const tablesPresent = (present: boolean[]) => {
  const row: Record<string, boolean> = {};
  present.forEach((p, i) => { row[`t${i}`] = p; });
  return [[row]];
};

beforeEach(() => sequelize.query.mockReset());

describe('ensurePlatformBuildSchema', () => {
  it('resolves when every statement applies and both tables exist', async () => {
    sequelize.query.mockImplementation(async (sql: string) =>
      (sql.includes('information_schema') ? tablesPresent(PLATFORM_BUILD_TABLES.map(() => true)) : [[]]));
    await expect(ensurePlatformBuildSchema()).resolves.toBeUndefined();
  });

  it('every statement is idempotent (IF NOT EXISTS)', async () => {
    sequelize.query.mockImplementation(async (sql: string) =>
      (sql.includes('information_schema') ? tablesPresent(PLATFORM_BUILD_TABLES.map(() => true)) : [[]]));
    await ensurePlatformBuildSchema();
    const ddl = sequelize.query.mock.calls.map((c) => String(c[0])).filter((s) => !s.includes('information_schema'));
    expect(ddl.length).toBeGreaterThan(0);
    for (const s of ddl) expect(s).toMatch(/IF NOT EXISTS/);
  });

  it('allows only one live run per project, so a republish cannot start a second paid run', async () => {
    sequelize.query.mockImplementation(async (sql: string) =>
      (sql.includes('information_schema') ? tablesPresent(PLATFORM_BUILD_TABLES.map(() => true)) : [[]]));
    await ensurePlatformBuildSchema();
    const ddl = sequelize.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(ddl).toMatch(/UNIQUE INDEX IF NOT EXISTS uq_platform_build_runs_live\s+ON platform_build_runs \(project_id\) WHERE status <> 'failed'/);
    expect(ddl).toMatch(/uq_platform_build_artifacts_active\s+ON platform_build_artifacts \(project_id, kind\) WHERE status = 'active'/);
  });

  it('rejects when a statement fails', async () => {
    sequelize.query.mockRejectedValueOnce(new Error('permission denied'));
    await expect(ensurePlatformBuildSchema()).rejects.toBeInstanceOf(PlatformBuildSchemaError);
  });

  it('rejects when a table is missing after a clean apply', async () => {
    sequelize.query.mockImplementation(async (sql: string) =>
      (sql.includes('information_schema') ? tablesPresent([true, false]) : [[]]));
    await expect(ensurePlatformBuildSchema()).rejects.toThrow(/platform_build_artifacts missing/);
  });
});
