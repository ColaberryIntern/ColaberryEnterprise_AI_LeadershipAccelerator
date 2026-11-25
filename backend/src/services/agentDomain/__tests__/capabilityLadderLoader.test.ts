/**
 * The loader's job is grouping and restraint: one query for the page, nothing queried when there
 * is nothing to ask about, and each capability given only its own stories. The grouping matters
 * because `LIKE ANY` returns one flat set for every pattern at once, so without the per-prefix
 * filter two capabilities on the same screen would each show the other's rungs.
 */
import { loadCapabilityStories } from '../capabilityLadderLoader';

function fakeSequelize(rows: Array<{ story_id: string; verified_at: string | null }>) {
  const calls: Array<{ sql: string; bind: unknown }> = [];
  const sequelize = {
    query: jest.fn(async (sql: string, opts: { bind?: unknown }) => {
      calls.push({ sql, bind: opts?.bind });
      return rows;
    }),
  };
  return { sequelize, calls };
}

const PLATFORM = 'platform.CAP.orchestration_health_watch';
const SALES = 'sales.CAP.pipeline_digest';

describe('loadCapabilityStories', () => {
  it('asks nothing of the database when there are no capabilities', async () => {
    const { sequelize, calls } = fakeSequelize([]);
    const out = await loadCapabilityStories(sequelize as never, []);
    expect(out.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('makes ONE query for the whole page', async () => {
    const { sequelize, calls } = fakeSequelize([
      { story_id: `${PLATFORM}.L1-BY-HAND`, verified_at: null },
      { story_id: `${SALES}.L1-BY-HAND`, verified_at: null },
    ]);
    await loadCapabilityStories(sequelize as never, [
      'platform.orchestration_health_watch',
      'sales.pipeline_digest',
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].bind).toEqual([[`${PLATFORM}.%`, `${SALES}.%`]]);
  });

  it('casts the bound array, because a bare ANY fails at runtime here', () => {
    // Asserted on the SQL text rather than by running it: the failure this guards against is a
    // Postgres type-deduction error that a mocked query can never reproduce.
    const { sequelize } = fakeSequelize([]);
    return loadCapabilityStories(sequelize as never, ['platform.x']).then(() => {
      expect((sequelize.query as jest.Mock).mock.calls[0][0]).toContain('$1::text[]');
    });
  });

  it('gives each capability only its own stories', async () => {
    const { sequelize } = fakeSequelize([
      { story_id: `${PLATFORM}.L1-BY-HAND`, verified_at: '2026-11-23' },
      { story_id: `${PLATFORM}.L3-TOOL-REQUEST`, verified_at: null },
      { story_id: `${SALES}.L1-BY-HAND`, verified_at: null },
    ]);
    const out = await loadCapabilityStories(sequelize as never, [
      'platform.orchestration_health_watch',
      'sales.pipeline_digest',
    ]);
    expect(out.get('platform.orchestration_health_watch')).toHaveLength(2);
    expect(out.get('sales.pipeline_digest')).toHaveLength(1);
  });

  it('de-duplicates repeated capability ids, which a queue of sibling tool requests produces', async () => {
    const { sequelize, calls } = fakeSequelize([]);
    await loadCapabilityStories(sequelize as never, [
      'executive.weekly_performance_report_email',
      'executive.weekly_performance_report_email',
      'executive.weekly_performance_report_email',
    ]);
    expect(calls[0].bind).toEqual([['executive.CAP.weekly_performance_report_email.%']]);
  });

  it('skips an unresolvable id instead of widening the predicate with it', async () => {
    const { sequelize, calls } = fakeSequelize([]);
    await loadCapabilityStories(sequelize as never, ['nodomain', 'platform.ok']);
    expect(calls[0].bind).toEqual([['platform.CAP.ok.%']]);
  });

  it('omits a capability the query returned nothing for', async () => {
    const { sequelize } = fakeSequelize([]);
    const out = await loadCapabilityStories(sequelize as never, ['platform.orchestration_health_watch']);
    expect(out.has('platform.orchestration_health_watch')).toBe(false);
  });
});
