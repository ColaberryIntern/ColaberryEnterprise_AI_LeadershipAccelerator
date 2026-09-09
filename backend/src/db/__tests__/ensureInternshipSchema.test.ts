/**
 * Static contract test for ensureInternshipSchema, in this repo's mocked-DB
 * convention (see ensureEmailSendLedgerSchema.test.ts): sequelize.query is a
 * jest.fn() so importing the module never opens a connection.
 *
 * ── WHAT THIS FILE DOES NOT PROVE ──────────────────────────────────────────
 * Nothing here proves the DDL ran, and nothing here proves a UNIQUE index
 * actually refuses a second row — sequelize.query accepts any string, including
 * one Postgres would reject. What it does prove is that the statements are
 * DECLARED with the shape the feature's safety requirements depend on, that the
 * post-condition notices when they are absent, and that no statement in this
 * module is destructive.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import {
  ensureInternshipSchema,
  assertInternshipSchema,
  CRITICAL_UNIQUE_INDEXES,
  REQUIRED_TABLES,
} from '../ensureInternshipSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

const catalogWith = (indexNames: readonly string[]) =>
  mockQuery.mockImplementation(async (sql: string) => {
    if (/pg_indexes/.test(sql)) return [indexNames.map((indexname) => ({ indexname }))];
    return [[]];
  });

const ddlIssued = () =>
  mockQuery.mock.calls.map((c) => String(c[0])).filter((s) => !/pg_indexes/.test(s));

beforeEach(() => {
  jest.clearAllMocks();
  catalogWith(CRITICAL_UNIQUE_INDEXES);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('the DDL it declares', () => {
  it('creates every table the feature needs', async () => {
    await ensureInternshipSchema();
    const sql = ddlIssued().join('\n');
    for (const table of REQUIRED_TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('is additive only — no DROP, no TRUNCATE, no DELETE, no destructive ALTER', async () => {
    await ensureInternshipSchema();
    for (const sql of ddlIssued()) {
      expect(sql).not.toMatch(/\bDROP\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
      expect(sql).not.toMatch(/\bDELETE\b/i);
      expect(sql).not.toMatch(/ALTER\s+TABLE\s+\w+\s+(DROP|RENAME)/i);
    }
  });

  it('touches no existing table — every CREATE/ALTER names an internship table', async () => {
    await ensureInternshipSchema();
    const known = new Set<string>(REQUIRED_TABLES);
    for (const sql of ddlIssued()) {
      const m = /(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE)\s+(\w+)/i.exec(sql);
      if (m) expect(known.has(m[1])).toBe(true);
    }
  });

  it('every statement is IF NOT EXISTS, so a re-run is a no-op', async () => {
    await ensureInternshipSchema();
    for (const sql of ddlIssued()) {
      expect(sql).toMatch(/IF NOT EXISTS/i);
    }
  });

  it('running it twice issues the same statements and never throws', async () => {
    await expect(ensureInternshipSchema()).resolves.toBeUndefined();
    const first = ddlIssued().length;
    jest.clearAllMocks();
    catalogWith(CRITICAL_UNIQUE_INDEXES);
    await expect(ensureInternshipSchema()).resolves.toBeUndefined();
    expect(ddlIssued().length).toBe(first);
  });

  it('survives a failing statement rather than refusing to boot', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/pg_indexes/.test(sql)) return [[]];
      throw new Error('permission denied');
    });
    await expect(ensureInternshipSchema()).resolves.toBeUndefined();
  });
});

describe('the constraints the feature\'s correctness rests on', () => {
  // Each of these maps 1:1 to a stated requirement. If one is ever dropped from
  // the DDL, the failure should name the guarantee that was lost.
  it('a duplicate active cohort membership is refused by the database', async () => {
    await ensureInternshipSchema();
    const sql = ddlIssued().join('\n');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_cohort_memberships_active[\s\S]*?\(enrollment_id, cohort_id, membership_type\)[\s\S]*?WHERE status = 'active'/,
    );
  });

  it('"ask once" is enforced by a unique answer per question per application', async () => {
    await ensureInternshipSchema();
    expect(ddlIssued().join('\n')).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_response_per_question[\s\S]*?\(application_id, question_key\)/,
    );
  });

  it('a signed document revision can never be overwritten', async () => {
    await ensureInternshipSchema();
    expect(ddlIssued().join('\n')).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_document_revision[\s\S]*?\(application_id, document_type, kind, revision\)/,
    );
  });

  it('only one interview question set can be active at a time', async () => {
    await ensureInternshipSchema();
    expect(ddlIssued().join('\n')).toMatch(
      /uq_internship_question_set_one_active[\s\S]*?WHERE status = 'active'/,
    );
  });

  it('a replayed Synthflow completion cannot open a second interview session', async () => {
    await ensureInternshipSchema();
    expect(ddlIssued().join('\n')).toMatch(
      /uq_internship_session_provider_call[\s\S]*?WHERE provider_call_id IS NOT NULL/,
    );
  });

  it('a rejection cannot be stored without a reason code', async () => {
    await ensureInternshipSchema();
    const decisions = ddlIssued().find((s) => s.includes('CREATE TABLE IF NOT EXISTS internship_decisions'))!;
    expect(decisions).toMatch(/reason_code\s+VARCHAR\(60\)\s+NOT NULL/);
  });
});

describe('no secret can be stored, by construction', () => {
  // "Never accept an API-key field." The strongest version of that rule is that
  // there is nowhere to put one.
  it('declares no column that could hold a key, password or token', async () => {
    await ensureInternshipSchema();
    const sql = ddlIssued().join('\n').toLowerCase();
    for (const forbidden of ['api_key', 'apikey', 'password', 'secret', 'access_token', 'credential']) {
      expect(sql).not.toContain(forbidden);
    }
  });
});

describe('the post-condition has teeth', () => {
  it('warns, naming the missing index, when a unique index did not land', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    catalogWith(CRITICAL_UNIQUE_INDEXES.filter((n) => n !== 'uq_cohort_memberships_active'));

    await assertInternshipSchema();

    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('internship_schema_missing_unique_index');
    expect(logged).toContain('uq_cohort_memberships_active');
  });

  it('stays quiet when every critical index is present and unique', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    catalogWith(CRITICAL_UNIQUE_INDEXES);

    await assertInternshipSchema();

    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('internship_schema_missing_unique_index');
  });

  it('only counts an index that is actually UNIQUE', async () => {
    // A non-unique index of the right name would satisfy a name lookup while
    // protecting nobody, so the query filters on indexdef.
    await ensureInternshipSchema();
    const catalogQuery = mockQuery.mock.calls.map((c) => String(c[0])).find((s) => /pg_indexes/.test(s))!;
    expect(catalogQuery).toMatch(/indexdef ILIKE 'CREATE UNIQUE%'/);
  });

  it('does not throw when the catalog query itself fails', async () => {
    mockQuery.mockImplementation(async () => { throw new Error('no connection'); });
    await expect(assertInternshipSchema()).resolves.toBeUndefined();
  });
});
