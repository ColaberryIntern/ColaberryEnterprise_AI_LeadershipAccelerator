/**
 * Static contract test for ensureCaseStudySchema — asserts properties of the SQL
 * statement array itself, WITHOUT requiring a live database (same convention as
 * ensureCapeSchema.test.ts / ensureSbpSchema.test.ts). sequelize.query is mocked
 * so importing the module never attempts a real connection, which is what keeps
 * this suite inside CI's set: jest.ci.config.ts is an ignore-list for suites that
 * need real Postgres, and CI provisions none.
 *
 * What this suite CANNOT prove, deliberately stated so nobody mistakes a green run
 * for a migrated database: every statement in the module is swallowed into a
 * console.warn, so these tests show the right SQL is *issued*, never that it
 * *applied*. Proving the tables actually exist is assertCaseStudySchema()'s job,
 * run against a real database by scripts/verifyCaseStudySchema.ts.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import {
  ensureCaseStudySchema,
  assertCaseStudySchema,
  parseCreatedColumns,
  CASE_STUDY_STATEMENTS,
  CASE_STUDY_TABLES,
  CASE_STUDY_REQUIRED_COLUMNS,
  CASE_STUDY_REQUIRED_INDEXES,
} from '../ensureCaseStudySchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

/**
 * Collapse whitespace before matching. Several DDL statements wrap across lines
 * for readability, and `.` does not cross a newline — matching raw text made two
 * assertions in this suite fail against SQL that was actually correct.
 */
const flat = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([]);
});

describe('ensureCaseStudySchema — statement contract', () => {
  it('happy path: issues CREATE TABLE IF NOT EXISTS for all 10 Case Study tables', async () => {
    await ensureCaseStudySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(CASE_STUDY_TABLES).toHaveLength(10);
    for (const table of CASE_STUDY_TABLES) {
      expect(
        statements.some((s) => new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`).test(s)),
      ).toBe(true);
    }
  });

  it('every statement is idempotent — CREATE/ALTER ... IF NOT EXISTS, no exceptions', () => {
    const offenders = CASE_STUDY_STATEMENTS.filter(
      (s) => !/(CREATE (TABLE|UNIQUE INDEX|INDEX) IF NOT EXISTS|ADD COLUMN IF NOT EXISTS)/i.test(s),
    );
    expect(offenders).toEqual([]);
  });

  it('additive only: no statement drops, truncates, or rewrites an existing column', () => {
    // A destructive statement here would run at every boot, against production,
    // with its error swallowed. The blast radius justifies asserting it directly
    // rather than trusting review.
    const destructive = CASE_STUDY_STATEMENTS.filter((s) =>
      /\b(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN|RENAME)\b/i.test(s),
    );
    expect(destructive).toEqual([]);
  });

  it('touches nothing outside the case_study namespace', () => {
    // The whole schema must be additive with respect to the rest of the platform.
    // Table targets and index targets are matched with separate anchored patterns:
    // a bare `ON` alternation also matches the "on" ending an index name like
    // cs_repositories_unique_per_collection, which silently captured the literal
    // string "ON" as the target.
    const targets: string[] = [];
    for (const stmt of CASE_STUDY_STATEMENTS) {
      const created = flat(stmt).match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
      if (created) targets.push(created[1]);
      const indexed = flat(stmt).match(/\sON\s+(\w+)\s*\(/i);
      if (indexed) targets.push(indexed[1]);
    }
    expect(targets.length).toBe(CASE_STUDY_STATEMENTS.length);
    for (const t of targets) expect(t).toMatch(/^case_stud(y|ies)/);
  });

  it('declares no foreign key to a table this module does not create', () => {
    // projects/tenants/brands/github_connections are referenced by id but never
    // by REFERENCES: `projects` is created by no ensure* module in this repo, so a
    // constraint against it would make the whole CREATE TABLE fail on a fresh
    // database — and that failure is swallowed, leaving no table at all.
    const owned = new Set<string>(CASE_STUDY_TABLES);
    for (const stmt of CASE_STUDY_STATEMENTS) {
      for (const [, target] of stmt.matchAll(/REFERENCES\s+(\w+)\s*\(/gi)) {
        expect(owned.has(target)).toBe(true);
      }
    }
  });

  it('boundary: declares the invariant-carrying unique indexes', async () => {
    await ensureCaseStudySchema();
    const statements = mockQuery.mock.calls.map((c) => flat(String(c[0])));

    // one publication per (case study, surface) — stops a double-publish creating two rows
    expect(statements.some((s) => /UNIQUE INDEX.*case_study_publications \(case_study_id, surface_key\)/.test(s))).toBe(true);
    // a regeneration is a new version, never an overwrite
    expect(statements.some((s) => /UNIQUE INDEX.*case_study_snapshots \(case_study_id, version\)/.test(s))).toBe(true);
    // Owner/Repo and owner/repo are the same repository inside one collection
    expect(statements.some((s) => /UNIQUE INDEX.*case_study_repositories \(collection_id, LOWER\(repo_owner\), LOWER\(repo_name\)\)/.test(s))).toBe(true);
    // public slug uniqueness
    expect(statements.some((s) => /UNIQUE INDEX.*case_studies \(slug\)/.test(s))).toBe(true);
    // at most one primary repo per collection — the database backstop for the race
    // T004's verification found, where two concurrent promotions could each demote a
    // stale incumbent and both commit, leaving an ambiguous Case Study.
    expect(statements.some((s) =>
      /UNIQUE INDEX.*case_study_repositories \(collection_id\) WHERE role = 'primary'/.test(s),
    )).toBe(true);
    // one metric row per (case study, metric key). resolveChart builds
    // `new Map(metrics.map((m) => [m.metric_key, m]))`, which keeps the LAST
    // duplicate silently — so two rows sharing a key do not error, they render a
    // chart plotting an arbitrary one of them. Asserted as UNIQUE and unqualified:
    // a WHERE clause here would leave the duplicate representable in exactly the
    // pending state a producer writes.
    expect(statements.some((s) =>
      /UNIQUE INDEX.*case_study_metrics \(case_study_id, metric_key\)/.test(s),
    )).toBe(true);
    expect(statements.some((s) =>
      /UNIQUE INDEX.*case_study_metrics \(case_study_id, metric_key\) WHERE/.test(s),
    )).toBe(false);
  });

  it('defaults closed: consent, publishability and visibility all default to the safe value', () => {
    const all = CASE_STUDY_STATEMENTS.join('\n');
    // Each of these defaulting the other way would mean an un-reviewed record could
    // reach the public surface the moment a row is inserted.
    expect(all).toMatch(/organization_naming_consent BOOLEAN NOT NULL DEFAULT false/);
    expect(all).toMatch(/builder_naming_consent BOOLEAN NOT NULL DEFAULT false/);
    expect(all).toMatch(/allow_public_repo_link BOOLEAN NOT NULL DEFAULT false/);
    expect(all).toMatch(/is_publicly_openable BOOLEAN NOT NULL DEFAULT false/);
    expect(all).toMatch(/publishable BOOLEAN NOT NULL DEFAULT false/);
    expect(all).toMatch(/verification_class VARCHAR\(20\) NOT NULL DEFAULT 'pending'/);
    expect(all).toMatch(/case_studies[\s\S]*?status VARCHAR\(20\) NOT NULL DEFAULT 'draft'/);
    expect(all).toMatch(/visibility VARCHAR\(20\) NOT NULL DEFAULT 'private'/);
  });

  it('failure path: one failing statement does not stop the rest (partial DB self-heals)', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('relation already exists'))
      .mockResolvedValue([]);

    await expect(ensureCaseStudySchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(CASE_STUDY_STATEMENTS.length);
  });

  it('idempotency: running twice issues byte-identical SQL both times', async () => {
    await ensureCaseStudySchema();
    const first = mockQuery.mock.calls.map((c) => String(c[0]));
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    await ensureCaseStudySchema();
    const second = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(second).toEqual(first);
  });
});

describe('parseCreatedColumns — the parity source of truth', () => {
  it('extracts table.column pairs and ignores constraint lines', () => {
    const parsed = parseCreatedColumns([
      `CREATE TABLE IF NOT EXISTS demo_table (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         some_name VARCHAR(40) NOT NULL,
         UNIQUE (some_name),
         CONSTRAINT demo_chk CHECK (some_name <> '')
       )`,
    ]);
    expect(parsed).toEqual(['demo_table.id', 'demo_table.some_name']);
  });

  it('boundary: returns nothing for a statement that creates no table', () => {
    expect(parseCreatedColumns([`CREATE INDEX IF NOT EXISTS idx_x ON y (z)`])).toEqual([]);
  });

  it('regression: two columns on ONE physical line are both reported', () => {
    // The line-splitting version silently dropped the second. That is the
    // dangerous failure direction: a column this parser omits is a column the
    // model-parity test never requires a model to declare, so Sequelize would
    // silently drop every write to it — the exact shape of the 2026-08-22
    // tenancy defect, which passed every test while doing nothing.
    expect(parseCreatedColumns([
      `CREATE TABLE IF NOT EXISTS t (
         id UUID PRIMARY KEY, alpha VARCHAR(10) NOT NULL, beta INTEGER
       )`,
    ])).toEqual(['t.id', 't.alpha', 't.beta']);
  });

  it('regression: a column definition wrapped across lines yields no phantom entry', () => {
    // The line-splitting version emitted a bogus `t.DEFAULT` from the
    // continuation line. Loud rather than silent, but still wrong.
    expect(parseCreatedColumns([
      `CREATE TABLE IF NOT EXISTS t (
         id UUID PRIMARY KEY,
         metadata JSONB NOT NULL
           DEFAULT '{}'::jsonb
       )`,
    ])).toEqual(['t.id', 't.metadata']);
  });

  it('boundary: commas inside parentheses never split a definition', () => {
    expect(parseCreatedColumns([
      `CREATE TABLE IF NOT EXISTS t (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         amount NUMERIC(10, 2) NOT NULL,
         UNIQUE (id, amount)
       )`,
    ])).toEqual(['t.id', 't.amount']);
  });

  it('covers every real table and picks up the consent columns the publish gate reads', () => {
    for (const table of CASE_STUDY_TABLES) {
      expect(CASE_STUDY_REQUIRED_COLUMNS.some((c) => c.startsWith(`${table}.`))).toBe(true);
    }
    expect(CASE_STUDY_REQUIRED_COLUMNS).toEqual(expect.arrayContaining([
      'case_studies.organization_naming_consent',
      'case_studies.builder_naming_consent',
      'case_study_snapshots.content_hash',
      'case_study_publications.published_snapshot_id',
      'case_study_publications.surface_key',
      'case_study_metrics.publishable',
    ]));
  });

  it('produces no duplicate entries', () => {
    expect(new Set(CASE_STUDY_REQUIRED_COLUMNS).size).toBe(CASE_STUDY_REQUIRED_COLUMNS.length);
  });

  it('the post-check covers EVERY index the DDL creates, not a subset', () => {
    // A hand-maintained subset meant 11 of 19 indexes could be absent from
    // production while assertCaseStudySchema() still reported ok. A post-check
    // with a hole produces false confidence, which is worse than no post-check.
    const created = CASE_STUDY_STATEMENTS
      .map((s) => flat(s).match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS (\w+)/i)?.[1])
      .filter(Boolean);
    expect(created.length).toBeGreaterThan(0);
    expect([...CASE_STUDY_REQUIRED_INDEXES].sort()).toEqual([...created].sort());
    // and the unique ones that carry real invariants are definitely in there
    expect(CASE_STUDY_REQUIRED_INDEXES).toEqual(expect.arrayContaining([
      'case_studies_slug_unique',
      'cs_publications_unique_case_surface',
      'cs_snapshots_unique_case_version',
      'cs_repositories_unique_per_collection',
      // The point of naming this one explicitly: it is the index whose absence is
      // invisible. A missing unique index does not break a query, it just stops
      // refusing a duplicate — so it must be in the list assertCaseStudySchema()
      // checks against pg_indexes, or "boot ran clean" would cover a database
      // where the constraint silently never applied.
      'cs_metrics_unique_case_key',
    ]));
  });
});

describe('assertCaseStudySchema — the post-check that actually proves migration', () => {
  it('reports ok when the catalog contains every table, index and column', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce([[{ tables: [...CASE_STUDY_TABLES], indexes: [...CASE_STUDY_REQUIRED_INDEXES] }]])
      .mockResolvedValueOnce([
        CASE_STUDY_REQUIRED_COLUMNS.map((c) => ({ table_name: c.split('.')[0], column_name: c.split('.')[1] })),
      ]);

    await expect(assertCaseStudySchema()).resolves.toEqual({ ok: true, missing: [] });
  });

  it('FAILS LOUDLY on an un-migrated database — the case an assertion exists for', async () => {
    // This is the test that matters. ensureCaseStudySchema() resolves happily
    // against a database where every statement failed, because each error is
    // swallowed. Without this assertion firing, a completely empty schema looks
    // identical to a healthy one.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce([[{ tables: null, indexes: null }]])
      .mockResolvedValueOnce([[]]);

    const result = await assertCaseStudySchema();

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['table:case_studies', 'index:case_studies_slug_unique']));
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.error_class).toBe('SchemaInvariantViolation');
    expect(logged.level).toBe('error');
    errorSpy.mockRestore();
  });

  it('boundary: detects a table that exists but is missing a later-added column', async () => {
    // CREATE TABLE IF NOT EXISTS is a no-op on an existing table, so this is the
    // realistic partial-migration shape, not a hypothetical one.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const withoutConsent = CASE_STUDY_REQUIRED_COLUMNS.filter(
      (c) => c !== 'case_studies.organization_naming_consent',
    );
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce([[{ tables: [...CASE_STUDY_TABLES], indexes: [...CASE_STUDY_REQUIRED_INDEXES] }]])
      .mockResolvedValueOnce([
        withoutConsent.map((c) => ({ table_name: c.split('.')[0], column_name: c.split('.')[1] })),
      ]);

    const result = await assertCaseStudySchema();

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('column:case_studies.organization_naming_consent');
    errorSpy.mockRestore();
  });

  it('failure path: an unreachable catalog reports not-ok rather than throwing', async () => {
    mockQuery.mockReset();
    mockQuery.mockRejectedValue(new Error('connection refused'));

    await expect(assertCaseStudySchema()).resolves.toEqual({ ok: false, missing: ['post-check-failed'] });
  });
});
