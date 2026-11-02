/**
 * Static contract test for ensureLandingPageSnackbarSchema, on the mocked-sequelize convention
 * used by the other ensure* tests (no live database).
 *
 * The case worth testing here is the DEFAULT. The snack bar shipped working and deployed but dark
 * on every page, because `brands.snackbar_default_enabled` defaulted to false and no screen ever
 * set it. The column-presence post-condition passed throughout that period, so column checks alone
 * cannot catch this class of bug - hence a post-condition on the default itself, and these tests.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import {
  ensureLandingPageSnackbarSchema,
  LANDING_PAGE_SNACKBAR_SCHEMA_STATEMENTS,
} from '../ensureLandingPageSnackbarSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

const ALL_COLUMNS = [
  { table_name: 'brands', column_name: 'snackbar_default_enabled' },
  { table_name: 'landing_pages', column_name: 'snackbar_enabled' },
  { table_name: 'landing_pages', column_name: 'snackbar_config' },
  { table_name: 'leads', column_name: 'social_proof_opt_in' },
];

/** Routes the two post-condition reads by their SQL; DDL statements return nothing of interest. */
function primeDb(opts: {
  columns?: Array<{ table_name: string; column_name: string }>;
  defaultRows?: Array<{ column_default: string | null }>;
}): void {
  const columns = opts.columns ?? ALL_COLUMNS;
  const defaultRows = opts.defaultRows ?? [{ column_default: 'true' }];
  mockQuery.mockImplementation(async (sql: string) => {
    if (/column_default/.test(sql)) return [defaultRows];
    if (/information_schema/.test(sql)) return [columns];
    return [];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  primeDb({});
});

describe('ensureLandingPageSnackbarSchema', () => {
  describe('statements', () => {
    it('happy path: resolves when every column exists and the default is true', async () => {
      await expect(ensureLandingPageSnackbarSchema()).resolves.toBeUndefined();
    });

    it('sets the brand default to true, so a brand created later shows a snack bar unprompted', () => {
      expect(
        LANDING_PAGE_SNACKBAR_SCHEMA_STATEMENTS.some((s) =>
          /ALTER TABLE brands ALTER COLUMN snackbar_default_enabled SET DEFAULT true/i.test(s)),
      ).toBe(true);
    });

    it('keeps ADD COLUMN as a separate statement, since it is a no-op where the column already exists', () => {
      const addColumn = LANDING_PAGE_SNACKBAR_SCHEMA_STATEMENTS.find((s) =>
        /ADD COLUMN IF NOT EXISTS snackbar_default_enabled/i.test(s));
      expect(addColumn).toBeDefined();
      expect(addColumn).not.toMatch(/SET DEFAULT/i);
    });

    it('never blanket-UPDATEs brands: a brand switched off must stay off across restarts', () => {
      const mutations = LANDING_PAGE_SNACKBAR_SCHEMA_STATEMENTS.filter((s) =>
        /\b(UPDATE|DELETE FROM|TRUNCATE)\b/i.test(s));
      expect(mutations).toEqual([]);
    });

    it('every statement is additive and idempotent', () => {
      for (const statement of LANDING_PAGE_SNACKBAR_SCHEMA_STATEMENTS) {
        const guarded = /IF NOT EXISTS/i.test(statement) || /ALTER COLUMN \w+ SET DEFAULT/i.test(statement);
        expect({ statement, guarded }).toEqual({ statement, guarded: true });
      }
    });

    it('idempotent: a second run resolves the same way', async () => {
      await ensureLandingPageSnackbarSchema();
      await expect(ensureLandingPageSnackbarSchema()).resolves.toBeUndefined();
    });
  });

  describe('post-conditions', () => {
    it('throws when the default is still false — the exact state that kept the feature dark', async () => {
      primeDb({ defaultRows: [{ column_default: 'false' }] });
      await expect(ensureLandingPageSnackbarSchema()).rejects.toThrow(/default is false, expected true/);
    });

    it('throws when the column has no default at all', async () => {
      primeDb({ defaultRows: [{ column_default: null }] });
      await expect(ensureLandingPageSnackbarSchema()).rejects.toThrow(/default is NULL, expected true/);
    });

    it('throws when the column is absent from current_schema()', async () => {
      primeDb({ defaultRows: [] });
      await expect(ensureLandingPageSnackbarSchema()).rejects.toThrow(/not found in current_schema/);
    });

    it('throws, naming the column, when a required column is missing', async () => {
      primeDb({ columns: ALL_COLUMNS.filter((c) => c.column_name !== 'snackbar_config') });
      await expect(ensureLandingPageSnackbarSchema()).rejects.toThrow(/landing_pages.snackbar_config/);
    });

    it('pins table_schema: this database carries the same table name in more than one schema', async () => {
      await ensureLandingPageSnackbarSchema();
      const defaultRead = mockQuery.mock.calls.map((c) => String(c[0])).find((s) => /column_default/.test(s));
      expect(defaultRead).toMatch(/table_schema = current_schema\(\)/);
    });
  });
});
