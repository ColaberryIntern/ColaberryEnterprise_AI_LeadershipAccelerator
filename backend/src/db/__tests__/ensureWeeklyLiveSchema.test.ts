import { sequelize } from '../../config/database';
import { WEEKLY_LIVE_DDL, WEEKLY_LIVE_TABLES, ensureWeeklyLiveSchema } from '../ensureWeeklyLiveSchema';

/**
 * WL2.1 text contract (the integration suite runs the same DDL on a real Postgres). Every statement
 * must be re-runnable and additive: a phase that ships a DROP, RENAME or type change is not allowed
 * to deploy (WL2.5 precondition c).
 */
/** The one ALTER shape allowed: adding a column if it is missing (WL4.1). Never a drop, rename or type change. */
const ADD_COLUMN = /^ALTER TABLE weekly_live_\w+ ADD COLUMN IF NOT EXISTS \w+ /;

it('every statement is CREATE ... IF NOT EXISTS or ADD COLUMN IF NOT EXISTS, and nothing drops, renames or changes a type', () => {
  for (const ddl of WEEKLY_LIVE_DDL) {
    expect(ddl).toMatch(/^(CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS |ALTER TABLE weekly_live_\w+ ADD COLUMN IF NOT EXISTS )/);
    expect(ddl).not.toMatch(/\b(DROP|RENAME|TYPE|SET DATA)\b/i);
    if (/\bALTER\b/i.test(ddl)) expect(ddl).toMatch(ADD_COLUMN);
  }
});

it.each([
  'ALTER TABLE weekly_live_plans DROP COLUMN status',
  'ALTER TABLE weekly_live_plans ALTER COLUMN status TYPE TEXT',
  'ALTER TABLE weekly_live_plans RENAME COLUMN status TO s',
  'ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS x INT',
])('the guard refuses %s', (ddl) => {
  const ok = /^(CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS |ALTER TABLE weekly_live_\w+ ADD COLUMN IF NOT EXISTS )/.test(ddl) && !/\b(DROP|RENAME|TYPE|SET DATA)\b/i.test(ddl);
  expect(ok).toBe(false);
});

it('creates each of the nine tables exactly once', () => {
  for (const t of WEEKLY_LIVE_TABLES) {
    expect(WEEKLY_LIVE_DDL.filter((d) => d.startsWith(`CREATE TABLE IF NOT EXISTS ${t} (`))).toHaveLength(1);
  }
});

it('carries the idempotency keys the later phases rely on', () => {
  const all = WEEKLY_LIVE_DDL.join('\n');
  expect(all).toContain('ON weekly_live_content_pieces (session_id, piece_key)');
  expect(all).toContain('ON weekly_live_signals (plan_id, url)');
  expect(all).toContain('ON weekly_live_topics (plan_id, rank)');
  expect(all).toContain('ON weekly_live_demand (week, measured_at)');
});

it('ensureWeeklyLiveSchema runs every statement in order and stops on the first failure', async () => {
  const q = jest.spyOn(sequelize, 'query').mockResolvedValue([] as never);
  await ensureWeeklyLiveSchema();
  expect(q).toHaveBeenCalledTimes(WEEKLY_LIVE_DDL.length);
  q.mockReset();
  q.mockResolvedValueOnce([] as never).mockRejectedValueOnce(new Error('boom'));
  await expect(ensureWeeklyLiveSchema()).rejects.toThrow('boom');
  expect(q).toHaveBeenCalledTimes(2);
  q.mockRestore();
});
