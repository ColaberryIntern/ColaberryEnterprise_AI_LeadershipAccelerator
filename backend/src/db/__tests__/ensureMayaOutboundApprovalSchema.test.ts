/**
 * T5 - the outbound approval queue's DDL, and the two things it must be INCAPABLE of.
 *
 * "The service never auto-approves" is a claim about code that a later edit can falsify.
 * "The table has no word for auto-approval, and refuses a decider whose name begins with
 * `system:`" is a claim about the schema that the same edit cannot. Most of this file is
 * therefore about what the DDL does NOT allow.
 *
 * The table this one exists to avoid is `approval_requests`, whose unguarded 15-minute sweep
 * writes `approved` with `decided_by = 'system:auto_approve_timeout'` and has already replayed
 * 851 DMs to 52 students in production. If that sweep, or anything shaped like it, is ever
 * pointed at this table, `chk_moa_decider_is_a_person` makes the UPDATE fail rather than send.
 *
 * `ensureMayaOutboundApprovalSchema` swallows every statement failure into a warn, so it
 * resolves identically on total success and total failure, and `CREATE TABLE IF NOT EXISTS` is
 * a no-op against an existing table. That is why `assertMayaOutboundApprovalSchema` reads
 * `information_schema` rather than trusting the ensure, and why the guarded wrapper is the
 * thing boot calls.
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
  APPROVAL_STATUSES,
  REQUIRED_CHECKS,
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
  ROLLBACK_STATEMENTS,
  assertMayaOutboundApprovalSchema,
  ensureMayaOutboundApprovalSchema,
  ensureMayaOutboundApprovalSchemaGuarded,
} from '../ensureMayaOutboundApprovalSchema';
import { activeBootCall } from './helpers/bootCalls';

beforeEach(() => { jest.clearAllMocks(); });

/**
 * Strip `--` comments so prose ABOUT sql is never mistaken for sql.
 *
 * This is not a nicety. The first run of this suite failed two assertions because the DDL's own
 * comments say "No 'auto_approved' exists" and name `approval_requests` as the table this one
 * replaces - the instrument read the description of a thing as the thing. `bootSchemaCreatable.
 * test.ts` records the same failure from the other direction, where a comment documenting a
 * table's ABSENCE was classified as creating it. The control below pins the stripping, because
 * without it every "the DDL does not contain X" assertion here could pass by accident.
 */
export function stripSqlComments(sql: string): string {
  return sql.split('\n').map((line) => line.replace(/--[^\n]*/, '')).join('\n');
}

/** The statements the ensure actually issues, captured by running it against the mock. */
async function issuedStatements(): Promise<string> {
  mockQuery.mockResolvedValue([]);
  await ensureMayaOutboundApprovalSchema();
  return stripSqlComments(mockQuery.mock.calls.map((c) => String(c[0])).join('\n'));
}

/** The same statements with their comments left in, for the stripper's own control. */
async function issuedStatementsRaw(): Promise<string> {
  mockQuery.mockResolvedValue([]);
  await ensureMayaOutboundApprovalSchema();
  return mockQuery.mock.calls.map((c) => String(c[0])).join('\n');
}

describe('the instrument reads sql, not prose about sql', () => {
  it('CONTROL - the DDL comments really do mention both forbidden strings', async () => {
    // If this ever stops being true, the stripper below is no longer load-bearing and the
    // "does not contain" assertions would be passing for a different reason than they claim.
    const raw = await issuedStatementsRaw();
    expect(raw).toMatch(/auto_approved/i);
    expect(raw).toMatch(/approval_requests/i);
  });

  it('and the stripper removes them, while keeping the sql', async () => {
    const stripped = await issuedStatements();
    expect(stripped).not.toMatch(/auto_approved/i);
    expect(stripped).not.toMatch(/approval_requests/i);
    expect(stripped).toMatch(/CREATE TABLE IF NOT EXISTS maya_outbound_approvals/i);
    expect(stripped).toMatch(/decided_by NOT LIKE 'system:%'/i);
  });
});

describe('the status vocabulary has no word for an approval nobody made', () => {
  it('declares exactly the eight states, and auto_approved is not one of them', () => {
    expect([...APPROVAL_STATUSES].sort()).toEqual([
      'approved', 'expired', 'failed', 'pending_approval',
      'rejected', 'sending', 'sent', 'withdrawn',
    ]);
  });

  it.each(['auto_approved', 'auto_approve', 'timeout_approved', 'system_approved'])(
    'has no %s status, in the list or in the DDL',
    async (forbidden) => {
      expect(APPROVAL_STATUSES).not.toContain(forbidden);
      expect(await issuedStatements()).not.toMatch(new RegExp(`'${forbidden}'`, 'i'));
    },
  );

  it('POSITIVE CONTROL - the DDL matcher fires on a status that IS declared', async () => {
    // Without this, the four assertions above would pass just as happily against a DDL that
    // declared no statuses at all.
    expect(await issuedStatements()).toMatch(/'pending_approval'/);
  });

  it('writes every status into the CHECK, so an unlisted one cannot be stored', async () => {
    const sql = await issuedStatements();
    expect(sql).toMatch(/CONSTRAINT chk_moa_status_is_known CHECK \(status IN \(/i);
    for (const s of APPROVAL_STATUSES) expect(sql).toMatch(new RegExp(`'${s}'`));
  });

  it('starts a new row in pending_approval, never in anything deliverable', async () => {
    expect(await issuedStatements()).toMatch(/status TEXT NOT NULL DEFAULT 'pending_approval'/i);
  });
});

describe('the invariant is a constraint, not a convention', () => {
  it('refuses a decider whose name begins with system:', async () => {
    const sql = await issuedStatements();
    expect(sql).toMatch(/CONSTRAINT chk_moa_decider_is_a_person CHECK/i);
    // The PREFIX is banned, not the one literal the existing sweep happens to write, so no
    // sibling value - 'system:retry', 'system:replay' - can slip past later.
    expect(sql).toMatch(/decided_by NOT LIKE 'system:%'/i);
    expect(REQUIRED_CHECKS).toContain('chk_moa_decider_is_a_person');
  });

  it('still allows an undecided row, so the constraint does not block composing', async () => {
    expect(await issuedStatements()).toMatch(/decided_by IS NULL/i);
  });

  it('refuses a row with no message in it', async () => {
    const sql = await issuedStatements();
    expect(sql).toMatch(/CONSTRAINT chk_moa_message_is_present CHECK/i);
    for (const col of ['body', 'body_hash', 'recipient_ref', 'recipient_address',
      'channel', 'capability', 'correlation_id', 'idempotency_key']) {
      expect(sql).toMatch(new RegExp(`length\\(btrim\\(${col}\\)\\)\\s*>\\s*0`, 'i'));
    }
  });

  it('makes a replayed compose one row rather than two', async () => {
    const sql = await issuedStatements();
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_moa_idempotency_key/i);
    expect(sql).toMatch(/\(idempotency_key\)/i);
  });

  it('indexes the expiry sweep only over pending rows, so it cannot find anything to send', async () => {
    const sql = await issuedStatements();
    expect(sql).toMatch(/idx_moa_pending_expiry[\s\S]*?WHERE status = 'pending_approval'/i);
  });
});

describe('the ensure is idempotent, which is what makes it safe at every boot', () => {
  it('issues the identical statements on a second run', async () => {
    const first = await issuedStatements();
    mockQuery.mockClear();
    const second = await issuedStatements();
    expect(second).toBe(first);
  });

  it('writes nothing that is unsafe to re-run', async () => {
    const statements = (await issuedStatements()).split('\n').join(' ');
    // Every DDL verb present must carry its IF-guard. A bare CREATE TABLE or CREATE INDEX
    // would throw on the second boot, and the ensure would swallow it into a warn - green, and
    // broken, which is the exact failure mode this suite exists to make impossible.
    expect(statements).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/i);
    expect(statements).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i);
    expect(statements).not.toMatch(/\bDROP\b/i);
  });

  it('reverts whole, and takes nothing else with it', () => {
    expect(ROLLBACK_STATEMENTS).toEqual(['DROP TABLE IF EXISTS maya_outbound_approvals']);
    expect(ROLLBACK_STATEMENTS.join()).not.toMatch(/approval_requests|ai_agents|ALTER/i);
  });

  it('never mentions approval_requests - this queue replaces it, it does not reach into it', async () => {
    expect(await issuedStatements()).not.toMatch(/approval_requests/i);
  });
});

describe('the assert proves the DDL ran, rather than trusting that it did', () => {
  /** Answer every information_schema probe with a full set. */
  function everythingPresent() {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/information_schema\.tables/.test(sql)) return REQUIRED_TABLES.map((t) => ({ name: t }));
      if (/information_schema\.columns/.test(sql)) return REQUIRED_COLUMNS.map((c) => ({ name: c }));
      if (/pg_indexes/.test(sql)) return REQUIRED_INDEXES.map((i) => ({ name: i }));
      if (/table_constraints/.test(sql)) return REQUIRED_CHECKS.map((c) => ({ name: c }));
      return [];
    });
  }

  it('passes when everything is there', async () => {
    everythingPresent();
    await expect(assertMayaOutboundApprovalSchema()).resolves.toBeUndefined();
  });

  it('names the absent TABLE once rather than every column it would have had', async () => {
    mockQuery.mockResolvedValue([]);
    await expect(assertMayaOutboundApprovalSchema())
      .rejects.toThrow(/SchemaInvariantViolation: missing table maya_outbound_approvals$/);
  });

  it.each(REQUIRED_CHECKS.map((c) => [c]))('fails when the %s constraint is missing', async (check) => {
    everythingPresent();
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string) => {
      if (/table_constraints/.test(sql)) {
        return REQUIRED_CHECKS.filter((c) => c !== check).map((c) => ({ name: c }));
      }
      return base(sql);
    });
    await expect(assertMayaOutboundApprovalSchema())
      .rejects.toThrow(new RegExp(`missing constraint ${check}`));
  });

  it.each(['maya_outbound_approvals.body', 'maya_outbound_approvals.decided_by',
    'maya_outbound_approvals.idempotency_key'].map((c) => [c]))(
    'fails when the %s column is missing',
    async (column) => {
      everythingPresent();
      const base = mockQuery.getMockImplementation()!;
      mockQuery.mockImplementation(async (sql: string) => {
        if (/information_schema\.columns/.test(sql)) {
          return REQUIRED_COLUMNS.filter((c) => c !== column).map((c) => ({ name: c }));
        }
        return base(sql);
      });
      await expect(assertMayaOutboundApprovalSchema())
        .rejects.toThrow(new RegExp(`missing column ${column.replace('.', '\\.')}`));
    },
  );
});

describe('the guarded wrapper cannot reject, because boot awaits it bare', () => {
  it('reports ok when the schema is sound', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/information_schema\.tables/.test(sql)) return REQUIRED_TABLES.map((t) => ({ name: t }));
      if (/information_schema\.columns/.test(sql)) return REQUIRED_COLUMNS.map((c) => ({ name: c }));
      if (/pg_indexes/.test(sql)) return REQUIRED_INDEXES.map((i) => ({ name: i }));
      if (/table_constraints/.test(sql)) return REQUIRED_CHECKS.map((c) => ({ name: c }));
      return [];
    });
    await expect(ensureMayaOutboundApprovalSchemaGuarded()).resolves.toEqual({ ok: true });
  });

  it('answers rather than throws when the database is unreachable', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new TypeError('connection refused'));
    await expect(ensureMayaOutboundApprovalSchemaGuarded())
      .resolves.toEqual({ ok: false, error_class: 'TypeError' });
    // Fails CLOSED and LOUDLY. A silent swallow here would mean the queue is absent, the
    // enqueue throws, and nobody knows why Maya says she cannot send.
    expect(warn).toHaveBeenCalled();
    const logged = JSON.parse(String(warn.mock.calls.at(-1)?.[0]));
    expect(logged).toMatchObject({
      level: 'error', service: 'maya',
      event: 'maya_outbound_approval_schema_unavailable', outcome: 'failure',
    });
    warn.mockRestore();
  });
});

describe('boot actually calls it', () => {
  it('is wired into server.ts, on a line that is not commented out', () => {
    // `activeBootCall` rather than indexOf: an independent review proved that commenting out a
    // boot call while leaving the line in place passed every test that used plain text search.
    expect(activeBootCall('ensureMayaOutboundApprovalSchemaGuarded()')).toBeGreaterThan(-1);
  });

  it('is the GUARDED form, so a schema failure cannot crash the boot', () => {
    expect(activeBootCall('await ensureMayaOutboundApprovalSchema()')).toBe(-1);
  });
});
