jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
// eslint-disable-next-line import/first
import {
  __resetColaberryTvSchemaForTests, COLABERRY_TV_SEED_IDS, COLABERRY_TV_SEED_SQL, COLABERRY_TV_STATEMENTS, ensureColaberryTvSchema,
} from '../ensureColaberryTvSchema';

/**
 * Campus v20 N3 (C134): the two additive tables and the seed. The seed is the nine real shorts, inserted in ONE statement that only
 * fires into a playlist that has never been used (no videos AND no audit rows), so a short staff deleted never comes back.
 */
beforeEach(() => __resetColaberryTvSchemaForTests());

describe('ensureColaberryTvSchema', () => {
  it('creates both tables additively, then seeds, once per process', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    await ensureColaberryTvSchema(run);
    await ensureColaberryTvSchema(run);
    expect(run).toHaveBeenCalledTimes(COLABERRY_TV_STATEMENTS.length + 1);
    for (const s of COLABERRY_TV_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/);
    expect(COLABERRY_TV_STATEMENTS.join(' ')).not.toMatch(/DROP|ALTER|TRUNCATE/i);
    expect(run.mock.calls[COLABERRY_TV_STATEMENTS.length]).toEqual([COLABERRY_TV_SEED_SQL, { ids: [...COLABERRY_TV_SEED_IDS] }]);
  });

  it('the seed fires only into an unused playlist and is safe to repeat', () => {
    expect(COLABERRY_TV_SEED_SQL).toMatch(/NOT EXISTS \(SELECT 1 FROM colaberry_tv_videos\)/);
    expect(COLABERRY_TV_SEED_SQL).toMatch(/NOT EXISTS \(SELECT 1 FROM colaberry_tv_audit\)/);
    expect(COLABERRY_TV_SEED_SQL).toMatch(/ON CONFLICT \(youtube_id\) DO NOTHING/);
  });

  it('seeds the nine real short ids from the v20 design, each a valid YouTube id, with no invented titles or lengths', () => {
    expect(COLABERRY_TV_SEED_IDS).toHaveLength(9);
    for (const id of COLABERRY_TV_SEED_IDS) expect(id).toMatch(/^[\w-]{11}$/);
    expect(new Set(COLABERRY_TV_SEED_IDS).size).toBe(9);
    expect(COLABERRY_TV_SEED_SQL).not.toMatch(/title|duration/);
  });

  it('a failed run clears the memo so the next call retries', async () => {
    const run = jest.fn().mockRejectedValueOnce(new Error('connection reset')).mockResolvedValue(undefined);
    await expect(ensureColaberryTvSchema(run)).rejects.toThrow('connection reset');
    await ensureColaberryTvSchema(run);
    expect(run).toHaveBeenCalledTimes(1 + COLABERRY_TV_STATEMENTS.length + 1);
  });
});
