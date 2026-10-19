jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { GAME_SCORES_STATEMENTS, ensureGameScoresSchema, __resetGameScoresSchemaForTests } from '../ensureGameScoresSchema';

describe('ensureGameScoresSchema', () => {
  beforeEach(() => __resetGameScoresSchemaForTests());

  it('every statement is IF NOT EXISTS (safe to re-run); one row per run with seconds and an optional score', () => {
    for (const s of GAME_SCORES_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/);
    expect(GAME_SCORES_STATEMENTS[0]).toMatch(/id UUID PRIMARY KEY/);
    expect(GAME_SCORES_STATEMENTS[0]).toMatch(/seconds_used INTEGER NOT NULL/);
    expect(GAME_SCORES_STATEMENTS[0]).toMatch(/score INTEGER NULL/);
    expect(GAME_SCORES_STATEMENTS.join('\n')).toMatch(/\(enrollment_id, central_date\)/);
  });

  it('runs the statements once per process, even across concurrent callers', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    await Promise.all([ensureGameScoresSchema(run), ensureGameScoresSchema(run)]);
    await ensureGameScoresSchema(run);
    expect(run).toHaveBeenCalledTimes(GAME_SCORES_STATEMENTS.length);
  });

  it('a failed first run (two processes racing the CREATE) is reported and retried on the next call', async () => {
    const run = jest.fn().mockRejectedValueOnce(Object.assign(new Error('duplicate key value violates unique constraint "pg_type_typname_nsp_index"'), { name: 'SequelizeUniqueConstraintError' }))
      .mockResolvedValue(undefined);
    await expect(ensureGameScoresSchema(run)).rejects.toThrow(/pg_type/);
    await expect(ensureGameScoresSchema(run)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1 + GAME_SCORES_STATEMENTS.length);
  });
});
