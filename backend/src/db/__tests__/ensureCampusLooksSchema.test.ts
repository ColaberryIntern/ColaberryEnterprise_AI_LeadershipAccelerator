jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { CAMPUS_LOOKS_STATEMENTS, ensureCampusLooksSchema, __resetCampusLooksSchemaForTests } from '../ensureCampusLooksSchema';

describe('ensureCampusLooksSchema', () => {
  beforeEach(() => __resetCampusLooksSchemaForTests());

  it('every statement is IF NOT EXISTS (safe to re-run), keyed on the enrollment', () => {
    expect(CAMPUS_LOOKS_STATEMENTS.length).toBeGreaterThanOrEqual(2);
    for (const s of CAMPUS_LOOKS_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/);
    expect(CAMPUS_LOOKS_STATEMENTS[0]).toMatch(/enrollment_id UUID PRIMARY KEY/);
    expect(CAMPUS_LOOKS_STATEMENTS[0]).toMatch(/equipped JSONB NOT NULL/);
  });

  it('runs the statements once per process, even across concurrent callers', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    await Promise.all([ensureCampusLooksSchema(run), ensureCampusLooksSchema(run)]);
    await ensureCampusLooksSchema(run);
    expect(run).toHaveBeenCalledTimes(CAMPUS_LOOKS_STATEMENTS.length);
  });

  it('a failed first run (two processes racing the CREATE) is reported and retried on the next call', async () => {
    const run = jest.fn().mockRejectedValueOnce(Object.assign(new Error('duplicate key value violates unique constraint "pg_type_typname_nsp_index"'), { name: 'SequelizeUniqueConstraintError' }))
      .mockResolvedValue(undefined);
    await expect(ensureCampusLooksSchema(run)).rejects.toThrow(/pg_type/);
    await expect(ensureCampusLooksSchema(run)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1 + CAMPUS_LOOKS_STATEMENTS.length);
  });
});
