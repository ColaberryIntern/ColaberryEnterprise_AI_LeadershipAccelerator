jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { CAMPUS_PRESENCE_STATEMENTS, ensureCampusPresenceSchema, __resetCampusPresenceSchemaForTests } from '../ensureCampusPresenceSchema';

describe('ensureCampusPresenceSchema', () => {
  beforeEach(() => __resetCampusPresenceSchemaForTests());

  it('every statement is IF NOT EXISTS (safe to re-run)', () => {
    expect(CAMPUS_PRESENCE_STATEMENTS.length).toBeGreaterThanOrEqual(3);
    for (const s of CAMPUS_PRESENCE_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/);
    expect(CAMPUS_PRESENCE_STATEMENTS[0]).toMatch(/enrollment_id UUID PRIMARY KEY/);
  });

  it('runs the statements once per process, even across concurrent callers', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    await Promise.all([ensureCampusPresenceSchema(run), ensureCampusPresenceSchema(run)]);
    await ensureCampusPresenceSchema(run);
    expect(run).toHaveBeenCalledTimes(CAMPUS_PRESENCE_STATEMENTS.length);
  });

  it('a failed run is reported and retried on the next call', async () => {
    const run = jest.fn().mockRejectedValueOnce(Object.assign(new Error('duplicate key value violates unique constraint "pg_type_typname_nsp_index"'), { name: 'SequelizeUniqueConstraintError' }))
      .mockResolvedValue(undefined);
    await expect(ensureCampusPresenceSchema(run)).rejects.toThrow(/pg_type/);
    await expect(ensureCampusPresenceSchema(run)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1 + CAMPUS_PRESENCE_STATEMENTS.length);
  });
});
