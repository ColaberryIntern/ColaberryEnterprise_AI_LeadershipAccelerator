/**
 * Static contract test for ensureRefactoredDeliverySchema — asserts the SQL statement
 * array without requiring a live database (mocked sequelize.query, same convention as
 * ensureCapeGovernanceSchema.test.ts).
 *
 * These are not "does CREATE TABLE appear" tests. Each one pins a decision that Gate 0
 * reached and that would be expensive to rediscover: which tables carry tenancy, which
 * constraint must survive, which column must stop being NOT NULL, and that boot cannot
 * be brought down by one bad statement.
 */
jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

import { sequelize } from '../../config/database';
import {
  ensureRefactoredDeliverySchema,
  REFACTORED_DELIVERY_SCHEMA_STATEMENTS,
} from '../ensureRefactoredDeliverySchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

const statementsFrom = (calls: unknown[][]): string[] => calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([]);
});

describe('ensureRefactoredDeliverySchema — tables', () => {
  it('happy path: creates all 7 delivery tables', async () => {
    await ensureRefactoredDeliverySchema();
    const sql = statementsFrom(mockQuery.mock.calls).join('\n');

    for (const table of [
      'delivery_engagements',
      'delivery_projects',
      'delivery_project_source_links',
      'delivery_project_members',
      'delivery_contracts',
      'delivery_decisions',
      'delivery_events',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('every CREATE TABLE is IF NOT EXISTS, so a second boot is a no-op', async () => {
    await ensureRefactoredDeliverySchema();
    const creates = statementsFrom(mockQuery.mock.calls).filter((s) => /CREATE TABLE/.test(s));

    expect(creates.length).toBeGreaterThan(0);
    creates.forEach((s) => expect(s).toMatch(/CREATE TABLE IF NOT EXISTS/));
  });

  it('every CREATE INDEX is IF NOT EXISTS, for the same reason', async () => {
    await ensureRefactoredDeliverySchema();
    const indexes = statementsFrom(mockQuery.mock.calls).filter((s) => /CREATE .*INDEX/.test(s));

    expect(indexes.length).toBeGreaterThan(0);
    indexes.forEach((s) => expect(s).toMatch(/CREATE (UNIQUE )?INDEX IF NOT EXISTS/));
  });
});

describe('ensureRefactoredDeliverySchema — tenancy by parent', () => {
  /**
   * The load-bearing assertion of the whole module. Gate 0's DATA_OWNERSHIP_MATRIX
   * concluded that only the two directly-reachable tables carry their own tenant_id and
   * everything else scopes by join — because two sources of truth for "who owns this
   * row" eventually disagree, and the disagreement surfaces as one client seeing
   * another's screen. A future change that adds tenant_id to a child table should fail
   * here and be forced to argue for itself.
   */
  it('only delivery_engagements and delivery_projects declare tenant_id', async () => {
    await ensureRefactoredDeliverySchema();
    const creates = statementsFrom(mockQuery.mock.calls).filter((s) =>
      /CREATE TABLE IF NOT EXISTS delivery_/.test(s),
    );

    const withTenantColumn = creates
      .filter((s) => /^\s*tenant_id /m.test(s))
      .map((s) => s.match(/CREATE TABLE IF NOT EXISTS (\w+)/)![1]);

    // delivery_events carries a denormalised tenant_id so an event stays scopeable after
    // its project is archived. It is append-only and FK-free, so it cannot drift by
    // being updated out of step with its parent.
    expect(withTenantColumn.sort()).toEqual(
      ['delivery_engagements', 'delivery_events', 'delivery_projects'].sort(),
    );
  });

  it('delivery_projects slug is unique per tenant, not globally', async () => {
    await ensureRefactoredDeliverySchema();
    const sql = statementsFrom(mockQuery.mock.calls).join('\n');

    // Two tenants both naming a project "customer-portal" is normal and must not collide.
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS delivery_projects_tenant_slug_unique\s+ON delivery_projects \(tenant_id, slug\)/,
    );
  });

  it('delivery_events carries no foreign keys, so it outlives what it describes', async () => {
    await ensureRefactoredDeliverySchema();
    const create = statementsFrom(mockQuery.mock.calls).find((s) =>
      /CREATE TABLE IF NOT EXISTS delivery_events/.test(s),
    );

    expect(create).toBeDefined();
    expect(create).not.toMatch(/REFERENCES/i);
  });
});

describe('ensureRefactoredDeliverySchema — idempotency backstops', () => {
  it('one source link per student project (master plan §15: same source link ⇒ one link)', async () => {
    await ensureRefactoredDeliverySchema();
    const sql = statementsFrom(mockQuery.mock.calls).join('\n');

    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS delivery_project_source_links_student_unique\s+ON delivery_project_source_links \(student_project_id\)/,
    );
  });

  it('one membership row per (project, identity, role), so revocation is never ambiguous', async () => {
    await ensureRefactoredDeliverySchema();
    const sql = statementsFrom(mockQuery.mock.calls).join('\n');

    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS delivery_project_members_unique_active\s+ON delivery_project_members \(delivery_project_id, platform_identity_id, delivery_role\)/,
    );
  });

  it('one contract row per (project, version), so approval cannot be duplicated', async () => {
    await ensureRefactoredDeliverySchema();
    const sql = statementsFrom(mockQuery.mock.calls).join('\n');

    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS delivery_contracts_project_version_unique\s+ON delivery_contracts \(delivery_project_id, version\)/,
    );
  });
});

describe('ensureRefactoredDeliverySchema — ESC-1 organization relaxation', () => {
  it('drops NOT NULL on organizations.owner_enrollment_id', async () => {
    await ensureRefactoredDeliverySchema();
    const sql = statementsFrom(mockQuery.mock.calls).join('\n');

    expect(sql).toContain(
      'ALTER TABLE organizations ALTER COLUMN owner_enrollment_id DROP NOT NULL',
    );
  });

  /**
   * The correction that matters, and the reason this test exists rather than being
   * assumed. Gate 0's C-02 recommended dropping the unique constraint alongside NOT
   * NULL. That was wrong twice over: PostgreSQL already treats NULLs as distinct in a
   * unique index, so null-owner client organizations were never blocked by it; and the
   * constraint is what makes orgService.registerManager()'s findOrCreate race-safe.
   * Dropping it would let two simultaneous registrations for one manager each create an
   * organization.
   */
  it('does NOT drop the unique constraint that makes registerManager race-safe', async () => {
    await ensureRefactoredDeliverySchema();
    const sql = statementsFrom(mockQuery.mock.calls).join('\n');

    expect(sql).not.toMatch(/DROP CONSTRAINT[^\n]*owner_enrollment/i);
    expect(sql).not.toMatch(/DROP INDEX[^\n]*owner_enrollment/i);
  });

  it('backfills organization_type so existing rows keep the meaning they already had', async () => {
    await ensureRefactoredDeliverySchema();
    const sql = statementsFrom(mockQuery.mock.calls).join('\n');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS organization_type');
    expect(sql).toMatch(
      /UPDATE organizations SET organization_type = 'management_account'\s+WHERE organization_type IS NULL/,
    );
  });

  it('touches no other existing table, and adds no NOT NULL to an existing column', async () => {
    await ensureRefactoredDeliverySchema();
    const alters = statementsFrom(mockQuery.mock.calls).filter((s) => /^ALTER TABLE/.test(s));

    alters.forEach((s) => expect(s).toMatch(/^ALTER TABLE organizations /));
    alters.forEach((s) => expect(s).not.toMatch(/SET NOT NULL/));
  });

  it('drops nothing and renames nothing', async () => {
    await ensureRefactoredDeliverySchema();
    const sql = statementsFrom(mockQuery.mock.calls).join('\n');

    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/RENAME/i);
  });
});

describe('ensureRefactoredDeliverySchema — failure path', () => {
  /**
   * A statement Postgres has no IF NOT EXISTS form for, or a race with a second booting
   * container, must not stop the server coming up. Boot failure is an outage; a missing
   * index is not.
   */
  it('one failing statement neither throws nor stops the remaining statements', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockResolvedValue([]);

    await expect(ensureRefactoredDeliverySchema()).resolves.toBeUndefined();

    expect(mockQuery).toHaveBeenCalledTimes(REFACTORED_DELIVERY_SCHEMA_STATEMENTS.length);
    consoleError.mockRestore();
  });

  it('the failure is logged as structured JSON rather than swallowed', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockReset();
    mockQuery.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([]);

    await ensureRefactoredDeliverySchema();

    expect(consoleError).toHaveBeenCalled();
    const logged = JSON.parse(String(consoleError.mock.calls[0][0]));
    expect(logged).toMatchObject({
      level: 'error',
      service: 'backend',
      event: 'ensure_refactored_delivery_schema_statement_failed',
      outcome: 'failure',
      error_class: 'Error',
    });
    expect(logged.context.message).toBe('boom');
    consoleError.mockRestore();
  });

  it('never logs a full statement, so a future seed value cannot leak through the log', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockReset();
    mockQuery.mockRejectedValue(new Error('x'));

    await ensureRefactoredDeliverySchema();

    consoleError.mock.calls.forEach(([line]) => {
      expect(JSON.parse(String(line)).context.sql.length).toBeLessThanOrEqual(160);
    });
    consoleError.mockRestore();
  });
});

describe('REFACTORED_DELIVERY_SCHEMA_STATEMENTS', () => {
  it('is exported for inspection and matches what the runner executes', async () => {
    await ensureRefactoredDeliverySchema();

    expect(REFACTORED_DELIVERY_SCHEMA_STATEMENTS.length).toBeGreaterThan(0);
    expect(statementsFrom(mockQuery.mock.calls)).toEqual([
      ...REFACTORED_DELIVERY_SCHEMA_STATEMENTS,
    ]);
  });

  it('runs the organization relaxation before creating anything that points at organizations', async () => {
    const relaxIndex = REFACTORED_DELIVERY_SCHEMA_STATEMENTS.findIndex((s) =>
      /ALTER COLUMN owner_enrollment_id DROP NOT NULL/.test(s),
    );
    const engagementIndex = REFACTORED_DELIVERY_SCHEMA_STATEMENTS.findIndex((s) =>
      /CREATE TABLE IF NOT EXISTS delivery_engagements/.test(s),
    );

    expect(relaxIndex).toBeGreaterThanOrEqual(0);
    expect(engagementIndex).toBeGreaterThan(relaxIndex);
  });

  it('creates delivery_projects before the children that join back to it', async () => {
    const projectIndex = REFACTORED_DELIVERY_SCHEMA_STATEMENTS.findIndex((s) =>
      /CREATE TABLE IF NOT EXISTS delivery_projects/.test(s),
    );

    for (const child of [
      'delivery_project_source_links',
      'delivery_project_members',
      'delivery_contracts',
      'delivery_decisions',
    ]) {
      const childIndex = REFACTORED_DELIVERY_SCHEMA_STATEMENTS.findIndex((s) =>
        new RegExp(`CREATE TABLE IF NOT EXISTS ${child}`).test(s),
      );
      expect(childIndex).toBeGreaterThan(projectIndex);
    }
  });
});
