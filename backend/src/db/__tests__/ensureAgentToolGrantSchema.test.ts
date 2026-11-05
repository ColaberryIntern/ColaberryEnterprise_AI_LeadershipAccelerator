/**
 * AF3.5 — the grant ledger's DDL, and the columns it must be INCAPABLE of holding.
 *
 * "The service does not write an autonomy level" is a claim about code that a later edit can
 * falsify. "The table has no autonomy column" is a claim about the schema that the same edit
 * cannot. The second is the one worth asserting, so most of this file is about what the DDL
 * does NOT contain.
 *
 * `ensureAgentToolGrantSchema` swallows every statement failure into a warn, so it resolves
 * identically on total success and total failure, and `CREATE TABLE IF NOT EXISTS` is a no-op
 * against an existing table. That is why the assert reads `information_schema` rather than
 * trusting the ensure — a schema fix once shipped "green" and stayed broken in production for a
 * day because the unit tests mocked `sequelize.query` and could not see a column name.
 */

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));
jest.mock('../ensureAgentDomainProjectSchema', () => ({
  normalizeNameRows: (rows: unknown) => (rows as Array<Record<string, string>>)
    .map((r) => String(Object.values(r)[0])),
}));

import {
  REQUIRED_CHECKS,
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
  ROLLBACK_STATEMENTS,
  assertAgentToolGrantSchema,
  ensureAgentToolGrantSchema,
  ensureAgentToolGrantSchemaGuarded,
} from '../ensureAgentToolGrantSchema';

beforeEach(() => { jest.clearAllMocks(); });

/** The statements the ensure actually issues, captured by running it against the mock. */
async function issuedStatements(): Promise<string> {
  mockQuery.mockResolvedValue([]);
  await ensureAgentToolGrantSchema();
  return mockQuery.mock.calls.map((c) => String(c[0])).join('\n');
}

describe('the DDL cannot hold anything that widens what an agent may do', () => {
  it.each(['autonomy_level', 'enabled', 'abac_mode_override', 'risk_tier', 'verdict'])(
    'declares no %s column',
    async (column) => {
      const sql = await issuedStatements();
      // Shape, not vocabulary: a column DECLARATION is the name followed by a type. This lets a
      // comment or a constraint mention the word without failing.
      const declaration = new RegExp(`^\\s*${column}\\s+(UUID|TEXT|BOOLEAN|TIMESTAMPTZ|JSONB)`, 'im');
      expect({ column, declared: declaration.test(sql) }).toEqual({ column, declared: false });
    },
  );

  it('POSITIVE CONTROL — the declaration matcher fires on a column that IS declared', () => {
    // Without this, the five assertions above would pass just as happily against a broken regex.
    const declaration = /^\s*tool_name\s+(UUID|TEXT|BOOLEAN|TIMESTAMPTZ|JSONB)/im;
    return issuedStatements().then((sql) => expect(declaration.test(sql)).toBe(true));
  });

  it('never mentions the ai_agents table — the ledger records, it does not reach', async () => {
    expect(await issuedStatements()).not.toMatch(/ai_agents/i);
  });
});

describe('what the DDL does declare', () => {
  it('carries who approved it, what for, and when', async () => {
    const sql = await issuedStatements();
    for (const col of ['agent_id', 'agent_name', 'tool_name', 'capability_id',
      'approved_by_identity', 'approved_at']) {
      expect(sql).toMatch(new RegExp(`^\\s*${col}\\s`, 'im'));
    }
  });

  it('makes a second grant of the same tool impossible rather than merely unlikely', async () => {
    // The idempotency key. Without the UNIQUE index a retried request writes a duplicate row,
    // and "works once, breaks on the second run" is a production defect in this repo.
    const sql = await issuedStatements();
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_adtg_agent_tool/i);
    expect(sql).toMatch(/\(agent_id,\s*tool_name\)/i);
  });

  it('refuses a row with an empty name, tool, capability or approver', async () => {
    const sql = await issuedStatements();
    expect(sql).toMatch(/CONSTRAINT chk_adtg_fields_are_present CHECK/i);
    for (const col of ['agent_name', 'tool_name', 'capability_id', 'approved_by_identity']) {
      expect(sql).toMatch(new RegExp(`length\\(btrim\\(${col}\\)\\)\\s*>\\s*0`, 'i'));
    }
  });

  it('reverts whole, and takes nothing else with it', () => {
    expect(ROLLBACK_STATEMENTS).toEqual(['DROP TABLE IF EXISTS agent_domain_tool_grants']);
    expect(ROLLBACK_STATEMENTS.join()).not.toMatch(/ai_agents|ALTER/i);
  });
});

describe('the assert proves the DDL ran, rather than trusting that it did', () => {
  /** Answer every information_schema probe with a full set. */
  function everythingPresent() {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/information_schema\.tables/.test(sql)) {
        return REQUIRED_TABLES.map((t) => ({ name: t }));
      }
      if (/information_schema\.columns/.test(sql)) {
        return REQUIRED_COLUMNS.map((c) => ({ name: c }));
      }
      if (/pg_indexes/.test(sql)) return REQUIRED_INDEXES.map((i) => ({ name: i }));
      if (/table_constraints/.test(sql)) return REQUIRED_CHECKS.map((c) => ({ name: c }));
      return [];
    });
  }

  it('passes when everything is there', async () => {
    everythingPresent();
    await expect(assertAgentToolGrantSchema()).resolves.toBeUndefined();
  });

  it('throws naming the missing table', async () => {
    mockQuery.mockResolvedValue([]);
    await expect(assertAgentToolGrantSchema())
      .rejects.toThrow(/missing table agent_domain_tool_grants/);
  });

  it('throws naming a missing column rather than passing on the table alone', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/information_schema\.tables/.test(sql)) return [{ name: REQUIRED_TABLES[0] }];
      if (/information_schema\.columns/.test(sql)) {
        // Everything except the one that records WHO said so.
        return REQUIRED_COLUMNS
          .filter((c) => !c.endsWith('approved_by_identity'))
          .map((c) => ({ name: c }));
      }
      if (/pg_indexes/.test(sql)) return REQUIRED_INDEXES.map((i) => ({ name: i }));
      if (/table_constraints/.test(sql)) return REQUIRED_CHECKS.map((c) => ({ name: c }));
      return [];
    });
    await expect(assertAgentToolGrantSchema()).rejects.toThrow(/approved_by_identity/);
  });

  it('throws when the unique index is absent — a ledger without it is not idempotent', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/information_schema\.tables/.test(sql)) return [{ name: REQUIRED_TABLES[0] }];
      if (/information_schema\.columns/.test(sql)) {
        return REQUIRED_COLUMNS.map((c) => ({ name: c }));
      }
      if (/pg_indexes/.test(sql)) return [{ name: 'idx_adtg_agent_name' }];
      if (/table_constraints/.test(sql)) return REQUIRED_CHECKS.map((c) => ({ name: c }));
      return [];
    });
    await expect(assertAgentToolGrantSchema())
      .rejects.toThrow(/missing index uq_adtg_agent_tool/);
  });

  it('the guarded boot entry point CANNOT reject', async () => {
    // Boot registration must never stop the backend binding its port.
    mockQuery.mockRejectedValue(new Error('database is on fire'));
    const result = await ensureAgentToolGrantSchemaGuarded();
    expect(result.ok).toBe(false);
    expect(result.error_class).toBe('Error');
  });

  it('the guarded entry point reports success when the assert passes', async () => {
    everythingPresent();
    await expect(ensureAgentToolGrantSchemaGuarded()).resolves.toEqual({ ok: true });
  });
});
