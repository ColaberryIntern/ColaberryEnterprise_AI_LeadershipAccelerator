jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { CAMPUS_ROOM_VISITS_STATEMENTS, ensureCampusRoomVisitsSchema, __resetCampusRoomVisitsSchemaForTests } from '../ensureCampusRoomVisitsSchema';

describe('ensureCampusRoomVisitsSchema', () => {
  beforeEach(() => __resetCampusRoomVisitsSchemaForTests());

  it('every statement is IF NOT EXISTS (safe to re-run); the table is append-only rows of enrollment, area, time', () => {
    for (const s of CAMPUS_ROOM_VISITS_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/);
    expect(CAMPUS_ROOM_VISITS_STATEMENTS[0]).toMatch(/CREATE TABLE IF NOT EXISTS campus_room_visits/);
    expect(CAMPUS_ROOM_VISITS_STATEMENTS[0]).toMatch(/id BIGSERIAL PRIMARY KEY/);
    expect(CAMPUS_ROOM_VISITS_STATEMENTS[0]).toMatch(/enrollment_id UUID NOT NULL/);
    expect(CAMPUS_ROOM_VISITS_STATEMENTS[0]).toMatch(/entered_at TIMESTAMPTZ NOT NULL/);
    expect(CAMPUS_ROOM_VISITS_STATEMENTS.join('\n')).toMatch(/ON campus_room_visits \(entered_at\)/); // the retention scan
    expect(CAMPUS_ROOM_VISITS_STATEMENTS.join('\n')).not.toMatch(/ALTER TABLE/); // additive only
  });

  it('runs the statements once per process, even across concurrent callers', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    await Promise.all([ensureCampusRoomVisitsSchema(run), ensureCampusRoomVisitsSchema(run)]);
    await ensureCampusRoomVisitsSchema(run);
    expect(run).toHaveBeenCalledTimes(CAMPUS_ROOM_VISITS_STATEMENTS.length);
  });

  it('a failed first run is reported and retried on the next call', async () => {
    const run = jest.fn().mockRejectedValueOnce(Object.assign(new Error('duplicate key value violates unique constraint "pg_type_typname_nsp_index"'), { name: 'SequelizeUniqueConstraintError' }))
      .mockResolvedValue(undefined);
    await expect(ensureCampusRoomVisitsSchema(run)).rejects.toThrow(/pg_type/);
    await expect(ensureCampusRoomVisitsSchema(run)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1 + CAMPUS_ROOM_VISITS_STATEMENTS.length);
  });
});
