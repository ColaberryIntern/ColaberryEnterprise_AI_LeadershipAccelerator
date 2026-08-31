import * as fs from 'fs';
import * as path from 'path';

const queryMock = jest.fn();
jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

import {
  ensureExplorerCampaignKeyIndex,
  EXPLORER_CAMPAIGN_KEY_INDEX,
} from '../ensureExplorerCampaignKeyIndex';

/**
 * EPIC 6 T003a.
 *
 * The property under test is not "the index gets created". It is **"the backend
 * still starts"**. `CREATE UNIQUE INDEX ... IF NOT EXISTS` raises on duplicate
 * data rather than skipping it, and `start()` is invoked bare at `server.ts:3023`
 * with `app.listen()` as its final statement and no `unhandledRejection` handler
 * — so an uncontained throw here means the port never binds.
 *
 * Duplicate rows degrade one feature. A bricked boot takes the platform down.
 */

beforeEach(() => {
  queryMock.mockReset().mockResolvedValue([]);
});

describe('it cannot stop the backend from starting', () => {
  it('resolves rather than throwing when the pre-flight query fails', async () => {
    queryMock.mockRejectedValue(new Error('connection refused'));
    await expect(ensureExplorerCampaignKeyIndex()).resolves.toEqual({
      created: false,
      skipped: 'error',
    });
  });

  it('resolves rather than throwing when the DDL itself fails', async () => {
    queryMock
      .mockResolvedValueOnce([]) // pre-flight: no duplicates
      .mockRejectedValueOnce(new Error('could not create unique index'));
    await expect(ensureExplorerCampaignKeyIndex()).resolves.toMatchObject({ created: false });
  });

  it('has no path that rejects, whatever the database does', async () => {
    for (const failure of [new Error('x'), 'a string', null, undefined]) {
      queryMock.mockReset().mockRejectedValue(failure);
      await expect(ensureExplorerCampaignKeyIndex()).resolves.toBeDefined();
    }
  });
});

describe('it refuses to attempt a DDL that would raise', () => {
  it('skips the index when duplicates exist, and names them', async () => {
    queryMock.mockResolvedValueOnce([{ k: 'explorer_weekly_digest', n: 2 }]);
    const result = await ensureExplorerCampaignKeyIndex();

    expect(result).toEqual({
      created: false,
      skipped: 'duplicates_exist',
      duplicateKeys: ['explorer_weekly_digest'],
    });
    // One query only — the pre-flight. The DDL was never attempted.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('creates the index when the table is clean', async () => {
    const result = await ensureExplorerCampaignKeyIndex();
    expect(result).toEqual({ created: true });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('runs the duplicate check BEFORE the create, not after', async () => {
    await ensureExplorerCampaignKeyIndex();
    expect(String(queryMock.mock.calls[0][0])).toContain('HAVING count(*) > 1');
    expect(String(queryMock.mock.calls[1][0])).toContain('CREATE UNIQUE INDEX');
  });
});

describe('the index itself is correctly shaped', () => {
  it('is PARTIAL, so it cannot catch the other 36 campaigns', async () => {
    // Every non-Explorer campaign has no settings.campaign_key, so the predicate
    // excludes them. Without the WHERE this would collapse every such campaign
    // onto a single NULL key and reject all but one.
    await ensureExplorerCampaignKeyIndex();
    const ddl = String(queryMock.mock.calls[1][0]);
    expect(ddl).toContain("WHERE settings->>'campaign_key' IS NOT NULL");
  });

  it('indexes the key expression, not the whole settings blob', async () => {
    await ensureExplorerCampaignKeyIndex();
    expect(String(queryMock.mock.calls[1][0])).toContain("((settings->>'campaign_key'))");
  });

  it('uses IF NOT EXISTS so a re-boot is a no-op', async () => {
    await ensureExplorerCampaignKeyIndex();
    expect(String(queryMock.mock.calls[1][0])).toContain('IF NOT EXISTS');
  });
});

describe('it is wired into the boot path, ahead of the seed', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'server.ts'), 'utf8');

  it('is called from server.ts', () => {
    // A module with three green verification suites that nothing ever calls is
    // the same shape as a guard that cannot fire.
    expect(serverSrc).toContain('ensureExplorerCampaignKeyIndex()');
  });

  it('is called BEFORE seedAllCampaigns, which creates the rows it constrains', () => {
    const indexAt = serverSrc.indexOf('ensureExplorerCampaignKeyIndex()');
    const seedAt = serverSrc.indexOf('seedAllCampaigns().catch');
    expect(indexAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(-1);
    expect(indexAt).toBeLessThan(seedAt);
  });

  it('is wrapped at the call site too, belt and braces on the boot path', () => {
    const around = serverSrc.slice(
      serverSrc.indexOf('ensureExplorerCampaignKeyIndex()') - 200,
      serverSrc.indexOf('ensureExplorerCampaignKeyIndex()') + 200,
    );
    expect(around).toContain('try {');
    expect(around).toContain('catch');
  });

  it('names the index consistently', () => {
    expect(EXPLORER_CAMPAIGN_KEY_INDEX).toBe('idx_campaigns_explorer_key');
  });
});

describe('the seed is registered in seedAllCampaigns, in its own try/catch', () => {
  const seedAllSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'seeds', 'seedAllCampaigns.ts'),
    'utf8',
  );

  it('delegates to the Explorer seed', () => {
    expect(seedAllSrc).toContain('seedExplorerGrowthCampaigns()');
  });

  it('wraps it so one failure cannot cost the other 36 campaigns', async () => {
    const at = seedAllSrc.indexOf('await seedExplorerGrowthCampaigns()');
    expect(at).toBeGreaterThan(-1);
    const around = seedAllSrc.slice(at - 120, at + 200);
    expect(around).toContain('try {');
    expect(around).toContain('catch');
  });
});
