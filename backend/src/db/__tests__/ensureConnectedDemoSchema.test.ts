/**
 * ensureConnectedDemoSchema: it must REJECT, which is the inverse of the known defect next door.
 *
 * `ensureProjectLifecycleSchema` applies DDL warn-only and its caller discards the assert's
 * boolean, so a database missing that schema boots clean. These tests pin the opposite behavior
 * for this module, in BOTH halves of the defect:
 *   - a failing DDL statement rejects (the warn-only half)
 *   - a missing column after a clean apply rejects (the discarded-boolean half)
 *
 * The query layer is mocked, so this is a fast unit test of the CONTROL, not of Postgres.
 */
import { ConnectedDemoSchemaError } from '../ensureConnectedDemoSchema';

jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { sequelize } = require('../../config/database') as { sequelize: { query: jest.Mock } };
const {
  ensureConnectedDemoSchema,
  assertConnectedDemoSchema,
  CONNECTED_DEMO_COLUMNS,
} = require('../ensureConnectedDemoSchema') as typeof import('../ensureConnectedDemoSchema');

/** An information_schema answer in the shape the assert reads: c0..cN booleans. */
function columnsPresent(present: boolean[]) {
  const row: Record<string, boolean> = {};
  present.forEach((p, i) => { row[`c${i}`] = p; });
  return [[row]];
}

const ALL_PRESENT = () => columnsPresent(CONNECTED_DEMO_COLUMNS.map(() => true));

beforeEach(() => {
  sequelize.query.mockReset();
});

describe('ensureConnectedDemoSchema: the happy path', () => {
  it('resolves when every statement applies and every column is present', async () => {
    sequelize.query.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) return Promise.resolve(ALL_PRESENT());
      return Promise.resolve([[], []]);
    });
    await expect(ensureConnectedDemoSchema()).resolves.toBeUndefined();
  });

  it('is idempotent: every DDL statement is IF NOT EXISTS, so a second run is a no-op', async () => {
    sequelize.query.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) return Promise.resolve(ALL_PRESENT());
      return Promise.resolve([[], []]);
    });
    await ensureConnectedDemoSchema();
    const ddl = sequelize.query.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((s: string) => !s.includes('information_schema'));
    expect(ddl.length).toBeGreaterThan(0);
    for (const sql of ddl) expect(sql).toMatch(/IF NOT EXISTS/);
  });

  it('adds demo_share_enabled with DEFAULT false, so no existing project becomes public', async () => {
    sequelize.query.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) return Promise.resolve(ALL_PRESENT());
      return Promise.resolve([[], []]);
    });
    await ensureConnectedDemoSchema();
    const enabled = sequelize.query.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((s: string) => s.includes('demo_share_enabled'));
    expect(enabled).toBeDefined();
    expect(enabled).toMatch(/NOT NULL DEFAULT false/);
  });
});

describe('ensureConnectedDemoSchema: it REJECTS, unlike the lifecycle precedent', () => {
  it('REJECTS when a DDL statement fails (the warn-only half of the known defect)', async () => {
    sequelize.query.mockImplementation((sql: string) => {
      if (sql.includes('ADD COLUMN IF NOT EXISTS demo_spec')) {
        return Promise.reject(new Error('permission denied for table projects'));
      }
      if (sql.includes('information_schema')) return Promise.resolve(ALL_PRESENT());
      return Promise.resolve([[], []]);
    });

    // rejects, NOT resolves: a warn-and-continue here is the bug being avoided.
    await expect(ensureConnectedDemoSchema()).rejects.toThrow(ConnectedDemoSchemaError);
    await expect(ensureConnectedDemoSchema()).rejects.toThrow(/statement failed/);
  });

  it('REJECTS when a column is missing after a clean apply (the discarded-boolean half)', async () => {
    sequelize.query.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) {
        // Every statement "succeeded" and the column still is not there.
        return Promise.resolve(columnsPresent(CONNECTED_DEMO_COLUMNS.map((_, i) => i !== 2)));
      }
      return Promise.resolve([[], []]);
    });

    await expect(ensureConnectedDemoSchema()).rejects.toThrow(ConnectedDemoSchemaError);
    await expect(ensureConnectedDemoSchema()).rejects.toThrow(/demo_spec/);
  });

  it('carries a stable error_class, so a caller can branch without string matching', async () => {
    sequelize.query.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) return Promise.resolve(columnsPresent([false, false, false]));
      return Promise.resolve([[], []]);
    });
    await ensureConnectedDemoSchema().catch((e: ConnectedDemoSchemaError) => {
      expect(e.error_class).toBe('ConnectedDemoSchemaUnavailable');
      expect(e.name).toBe('ConnectedDemoSchemaError');
    });
    expect.assertions(2);
  });
});

describe('assertConnectedDemoSchema reports precisely, in both directions', () => {
  it('returns [] when all three columns are present', async () => {
    sequelize.query.mockResolvedValue(ALL_PRESENT());
    await expect(assertConnectedDemoSchema()).resolves.toEqual([]);
  });

  it('names exactly the missing columns, not all of them', async () => {
    sequelize.query.mockResolvedValue(columnsPresent([true, false, false]));
    const missing = await assertConnectedDemoSchema();
    expect(missing).toEqual(['demo_share_enabled', 'demo_spec']);
    expect(missing).not.toContain('demo_share_token');
  });

  it('tolerates an empty result row rather than crashing', async () => {
    sequelize.query.mockResolvedValue([[]]);
    await expect(assertConnectedDemoSchema()).resolves.toEqual([...CONNECTED_DEMO_COLUMNS]);
  });
});
