/**
 * The active-selection query, asserted as TEXT.
 *
 * `broadcastTelemetryService` has claimed in a comment since it was written that "the two must
 * agree, which is why `broadcastTelemetryQuery.test.ts` asserts the SQL text contains the
 * window". That file did not exist. This is it.
 *
 * WHY TEXT ASSERTIONS ARE THE RIGHT TOOL HERE, not a weaker substitute for a database test.
 * Three of this query's properties are invisible to any behavioural test that runs against a
 * small fixture, and all three are the kind that fail silently at scale or under a careless
 * edit:
 *
 *   1. COUNT(DISTINCT enrollment_id) rather than COUNT(*). With one viewer per person in a
 *      fixture these return the same number. They differ only when somebody opens a second
 *      tab, which is exactly the case the whole design exists to get right.
 *   2. The freshness window lives IN the query. Filtering afterwards in Node would return the
 *      same answer and quietly stop using `idx_bvs_active`, turning a bounded index read into
 *      a scan that grows with the broadcast.
 *   3. Staff and test viewers are excluded unless explicitly asked for. A fixture without
 *      staff in it cannot tell whether the clause is there.
 *
 * No database: `sequelize` is mocked and the SQL it was handed is the artefact under test.
 */
jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

import { sequelize } from '../../../config/database';
import { readLiveAudience } from '../broadcastTelemetryService';
import type { TelemetryConfig } from '../broadcastTelemetryPolicy';

const query = sequelize.query as unknown as jest.Mock;

const CFG: TelemetryConfig = {
  appHeartbeatSeconds: 30,
  appActiveWindowSeconds: 90,
  playbackHeartbeatSeconds: 15,
  viewerExpirySeconds: 45,
  bufferingGraceSeconds: 20,
};

const T0 = Date.parse('2026-10-15T15:00:00.000Z');
const OCC = '11111111-2222-4333-8444-555555555555';

/** Run the read and hand back the SQL and replacements it issued. */
async function captured(diagnostic = false): Promise<{ sql: string; repl: Record<string, unknown> }> {
  query.mockReset();
  query.mockResolvedValue([]);
  await readLiveAudience(OCC, CFG, T0, diagnostic);
  const call = query.mock.calls[0];
  return { sql: call[0] as string, repl: (call[1] as { replacements: Record<string, unknown> }).replacements };
}

describe('the unit counted is a PERSON', () => {
  it('counts DISTINCT enrollment_id, never rows', async () => {
    const { sql } = await captured();
    expect(sql).toMatch(/COUNT\(DISTINCT\s+s\.enrollment_id\)/);
    // COUNT(*) here would report one person with two tabs open as two audience members, and
    // every fixture with one tab per person would still pass.
    expect(sql).not.toMatch(/COUNT\(\s*\*\s*\)/);
  });
});

describe('the freshness window is IN the query', () => {
  it('filters on last_beat_at in SQL, which is what the index exists to serve', async () => {
    const { sql } = await captured();
    expect(sql).toMatch(/s\.last_beat_at\s*>=\s*:cut/);
  });

  it('derives the cut from viewerExpirySeconds, not from a hardcoded number', async () => {
    const { repl } = await captured();
    expect((repl.cut as Date).toISOString()).toBe(new Date(T0 - CFG.viewerExpirySeconds * 1000).toISOString());
  });

  it('counts a buffering tab only within the grace measured from its last REAL play', async () => {
    const { sql, repl } = await captured();
    expect(sql).toMatch(/s\.state\s*=\s*'buffering'/);
    expect(sql).toMatch(/s\.last_playing_at\s*>=\s*:grace/);
    // Measured from last_playing_at, not last_beat_at: a tab that stalls for a minute must
    // not keep refreshing its own grace simply by continuing to beat.
    expect((repl.grace as Date).toISOString()).toBe(new Date(T0 - CFG.bufferingGraceSeconds * 1000).toISOString());
  });
});

describe('staff and test viewers do not inflate the audience', () => {
  it('excludes them by default', async () => {
    const { sql, repl } = await captured(false);
    expect(sql).toMatch(/p\.is_staff\s*=\s*FALSE/);
    expect(sql).toMatch(/p\.is_test\s*=\s*FALSE/);
    expect(repl.diagnostic).toBe(false);
  });

  it('includes them only when diagnostic is asked for explicitly', async () => {
    const { repl } = await captured(true);
    expect(repl.diagnostic).toBe(true);
  });
});

describe('the read is scoped to one occurrence', () => {
  it('always filters by occurrence_id', async () => {
    const { sql, repl } = await captured();
    expect(sql).toMatch(/s\.occurrence_id\s*=\s*:occ/);
    expect(repl.occ).toBe(OCC);
  });

  it('joins people to sessions on BOTH occurrence and enrollment', async () => {
    // Joining on enrollment alone would pull a person's intent and flags from a different
    // broadcast, which is how one class's staff viewer disappears from another class's count.
    const { sql } = await captured();
    expect(sql).toMatch(/p\.occurrence_id\s*=\s*s\.occurrence_id/);
    expect(sql).toMatch(/p\.enrollment_id\s*=\s*s\.enrollment_id/);
  });
});
