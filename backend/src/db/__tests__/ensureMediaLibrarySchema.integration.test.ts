/**
 * INTEGRATION TEST — proves the CHECK constraint actually REFUSES a half-populated asset row.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────────────
 *
 * LIB-1's deliverable is the constraint, not the columns. The unit suite
 * (`ensureMediaLibrarySchema.test.ts`) reads the DDL *strings*: it proves the statements were
 * written, and pins the decisions that are invisible in a diff review — which column is relaxed,
 * what each partial index leaves out on purpose. It cannot prove Postgres accepted any of it,
 * that the constraint covers the columns intended, or that an insert is refused. Only a database
 * can.
 *
 * That distinction is not academic here. `ensureContentOsSchema` wraps every statement in a
 * try/catch that only warns, so on a database where the ALTER failed the service would boot, the
 * unit tests would pass, and a 'link' row carrying a storage_key would be perfectly legal — and
 * would reach the publishing worker, which builds a provider payload from `storage_key`.
 *
 * ── `export {}` is load-bearing, not boilerplate ──────────────────────────────────────
 *
 * A .ts file with no top-level import or export is a GLOBAL SCRIPT, not a module, so its
 * top-level `const`s land in the global scope. `ensurePublishingSchema.integration.test.ts`
 * declares `HAS_DB` and `describeIfDb` exactly as this file does, and when this suite was first
 * written without the export, tsc reported "cannot redeclare block-scoped variable" twice in
 * EACH file — this one broke a file it never touched. Keep the export, or copy a top-level
 * import, in any suite that follows this shape.
 *
 * ── No long-lived transaction, deliberately ───────────────────────────────────────────
 *
 * The first version of this suite wrapped every probe in one transaction with a SAVEPOINT each,
 * so that nothing committed. It HUNG in CI and was killed at the 300s cap. A probe here
 * *expects* an INSERT to fail, and once a statement fails inside a Sequelize transaction that
 * transaction is finished as far as Sequelize is concerned; the next query waits for a
 * connection that is never returned. So each insert runs on its own, where a failure aborts only
 * its own implicit transaction, and `afterEach` deletes everything this suite created by its own
 * tenant id. `afterAll` closes the connection, without which Jest holds an open handle and the
 * worker never exits.
 *
 * ── Rejections are matched BY CONSTRAINT NAME ─────────────────────────────────────────
 *
 * Asserting only "it threw" would pass if the insert failed for an unrelated reason: a NOT NULL
 * column, a typo in the column list, a missing table. Each probe therefore asserts the error
 * names `media_assets_kind_shape`, and a positive control inserts a valid row to prove the table
 * is writable at all.
 *
 * Never point this at production. It inserts and deletes rows, which is why it scopes every one
 * of them to a tenant id that exists nowhere else.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // A suite that skips in silence is indistinguishable from one that passed.
  // eslint-disable-next-line no-console
  console.warn(
    '[ensureMediaLibrarySchema.integration] SKIPPED: no DATABASE_URL. This proves a CHECK\n'
    + 'constraint against a real Postgres; without one it is not evidence.',
  );
}

describeIfDb('ensureMediaLibrarySchema — the CHECK constraint (requires DATABASE_URL)', () => {
  let sequelize: any;
  let schema: any;

  // Nothing else in any database uses this tenant, so "delete everything for this tenant" can
  // never touch a row this suite did not create.
  const TENANT = '44444444-4444-4444-8444-444444444444';
  const BRAND_A = '55555555-5555-4555-8555-555555555555';
  const BRAND_B = '66666666-6666-4666-8666-666666666666';

  interface Row {
    kind?: string | null;
    storage_key?: string | null;
    mime_type?: string | null;
    source_url?: string | null;
    brand_id?: string | null;
    archived_at?: string | null;
  }

  async function insert(row: Row): Promise<void> {
    // When `kind` is omitted the column is left out of the statement entirely, so the row takes
    // the column DEFAULT. That is exactly what the pre-migration-shape test needs: a caller
    // written before this migration does not mention `kind` at all.
    // The column names come from this fixed list, never from the caller.
    const columns = ['tenant_id', 'brand_id', 'storage_key', 'mime_type', 'source_url', 'archived_at'];
    if (row.kind !== undefined) columns.push('kind');
    await sequelize.query(
      `INSERT INTO media_assets (${columns.join(', ')})
       VALUES (${columns.map((c) => `:${c}`).join(', ')})`,
      {
        replacements: {
          tenant_id: TENANT,
          brand_id: row.brand_id === undefined ? BRAND_A : row.brand_id,
          storage_key: row.storage_key ?? null,
          mime_type: row.mime_type === undefined ? 'image/png' : row.mime_type,
          source_url: row.source_url ?? null,
          archived_at: row.archived_at ?? null,
          ...(row.kind === undefined ? {} : { kind: row.kind }),
        },
      },
    );
  }

  /**
   * Attempt an insert. Returns '' when the row was accepted, or the error text when refused.
   *
   * READ THE DRIVER ERROR, NOT JUST THE WRAPPER. Sequelize v6 wraps SQLSTATE 23505 as a
   * `UniqueConstraintError` whose own `.message` is the useless string "Validation error"; the
   * Postgres text and the constraint name live on `.parent` / `.original`. A probe that matched
   * only `err.message` would fail against a constraint that was working perfectly, and - worse -
   * a probe asserting "it threw" would pass for the wrong reason. CHECK violations arrive as
   * `DatabaseError`, which does carry the text, which is why only the unique probes were
   * affected.
   */
  async function attempt(row: Row): Promise<string> {
    try {
      await insert(row);
      return '';
    } catch (err: any) {
      const text = [
        err?.message,
        err?.parent?.message,
        err?.original?.message,
        err?.parent?.constraint,
        err?.original?.constraint,
      ].filter(Boolean).join(' | ');
      // '' is this function's signal for "accepted". An error carrying no message, parent or
      // original would otherwise be reported as an acceptance - unreachable for pg/Sequelize
      // errors, but "accepted" should mean "did not throw", never "threw silently".
      return text || 'threw with no message, parent or original';
    }
  }

  const FILE: Row = { kind: 'file', storage_key: 'media/x/abc.png', mime_type: 'image/png', source_url: null };
  const LINK: Row = { kind: 'link', storage_key: null, mime_type: 'text/uri-list', source_url: 'https://youtu.be/abc123' };

  beforeAll(async () => {
    ({ sequelize } = await import('../../config/database'));
    const { ensureContentOsSchema } = await import('../ensureContentOsSchema');
    schema = await import('../ensureMediaLibrarySchema');
    // media_assets is CREATED there; this module only ALTERs it, so the order is a requirement.
    await ensureContentOsSchema();
    // This THROWS if the constraint or any index did not land, so a green run below cannot mean
    // "the DDL silently failed and nothing was being enforced".
    await schema.ensureMediaLibrarySchema();
  });

  afterEach(async () => {
    await sequelize.query('DELETE FROM media_assets WHERE tenant_id = :tenant', {
      replacements: { tenant: TENANT },
    });
  });

  afterAll(async () => {
    // Without this the worker holds an open pool and Jest never exits.
    if (sequelize) await sequelize.close();
  });

  describe('positive control — the table is writable, so a refusal means something', () => {
    it('accepts a well-formed file row', async () => {
      expect(await attempt(FILE)).toBe('');
    });

    it('accepts a well-formed link row, with no storage key', async () => {
      expect(await attempt(LINK)).toBe('');
    });

    it('accepts the PRE-MIGRATION shape, so existing writers keep working', async () => {
      // No `kind` supplied at all: the column default makes it a file. Every caller written
      // before this migration inserts exactly this shape and must not start failing.
      expect(await attempt({ storage_key: 'media/x/legacy.png', mime_type: 'image/png' })).toBe('');
    });
  });

  describe('the three shapes LIB-1 exists to refuse', () => {
    it('REFUSES a link carrying a storage_key', async () => {
      // The dangerous one: this row would reach publishingWorker, which reads storage_key.
      expect(await attempt({ ...LINK, storage_key: 'media/x/abc.png' }))
        .toMatch(/media_assets_kind_shape/);
    });

    it('REFUSES a file with no storage_key', async () => {
      expect(await attempt({ ...FILE, storage_key: null }))
        .toMatch(/media_assets_kind_shape/);
    });

    it('REFUSES a link with no source_url', async () => {
      expect(await attempt({ ...LINK, source_url: null }))
        .toMatch(/media_assets_kind_shape/);
    });
  });

  describe('the shapes that follow from the same constraint', () => {
    it('REFUSES a file carrying a source_url', async () => {
      expect(await attempt({ ...FILE, source_url: 'https://example.com/x' }))
        .toMatch(/media_assets_kind_shape/);
    });

    it('REFUSES a kind that is neither file nor link, with no separate enum constraint', async () => {
      // Any other value satisfies neither branch, so the shape CHECK doubles as the enum.
      expect(await attempt({ ...FILE, kind: 'video' }))
        .toMatch(/media_assets_kind_shape/);
    });
  });

  describe('media_assets_link_unique, and the holes left in it deliberately', () => {
    it('REFUSES the same URL twice for one brand, naming the index', async () => {
      expect(await attempt(LINK)).toBe('');
      const refused = await attempt(LINK);
      // By NAME, not by the word "unique". Sequelize's own message here is "Validation error",
      // so a loose regex would either fail against a working index or pass against the wrong one.
      expect(refused).toMatch(/media_assets_link_unique/);
    });

    it('ALLOWS the same URL for a DIFFERENT brand', async () => {
      // Deduplicating across brands would tell brand A what brand B has saved. Same reasoning as
      // media_assets_brand_checksum_unique (ensureContentOsSchema.ts:169-178).
      expect(await attempt({ ...LINK, brand_id: BRAND_A })).toBe('');
      expect(await attempt({ ...LINK, brand_id: BRAND_B })).toBe('');
    });

    it('ALLOWS re-adding a URL that was archived', async () => {
      // Archiving is how an operator removes a link. Without `archived_at IS NULL` in the
      // predicate the archived row would block the new one, and the only visible symptom would
      // be "nothing happens when I paste it".
      expect(await attempt({ ...LINK, archived_at: '2026-01-01T00:00:00Z' })).toBe('');
      expect(await attempt(LINK)).toBe('');
    });

    it('ALLOWS a duplicate tenant-level link (brand_id NULL): the documented escape hatch', async () => {
      // A tidiness problem, accepted on purpose, exactly as the checksum index accepts it.
      expect(await attempt({ ...LINK, brand_id: null })).toBe('');
      expect(await attempt({ ...LINK, brand_id: null })).toBe('');
    });
  });

  /**
   * The module's stated acceptance is "the post-condition throws when the constraint is dropped".
   * Against `ensureMediaLibrarySchema` that is unobservable: it re-runs the DDL before checking,
   * so a dropped constraint is simply re-created and it returns cleanly. `assertMediaLibrarySchema`
   * is exported precisely so the claim can be put to a database and seen to fail.
   *
   * These run LAST and each one restores what it broke, so nothing above depends on their order.
   */
  describe('the post-condition can actually be observed failing', () => {
    afterEach(async () => {
      // Put the schema back whatever happened, including on a failed assertion.
      await schema.ensureMediaLibrarySchema();
    });

    it('THROWS when the CHECK constraint is dropped', async () => {
      await sequelize.query('ALTER TABLE media_assets DROP CONSTRAINT media_assets_kind_shape');
      await expect(schema.assertMediaLibrarySchema()).rejects.toThrow(/media_assets_kind_shape/);
    });

    it('THROWS when the link-uniqueness index is dropped', async () => {
      await sequelize.query('DROP INDEX media_assets_link_unique');
      await expect(schema.assertMediaLibrarySchema()).rejects.toThrow(/media_assets_link_unique/);
    });

    it('THROWS when storage_key is put back to NOT NULL, which would make links impossible', async () => {
      // SET NOT NULL validates the WHOLE table, so any link row (storage_key IS NULL by the
      // CHECK) must go first or the ALTER fails for an unrelated reason.
      //
      // SCOPED TO THIS TENANT DELIBERATELY. This is the only mutation in the file that could
      // reach another tenant's rows, and because every link row has a NULL storage_key by
      // construction, an unscoped delete here would wipe every tenant's links if this suite were
      // ever pointed at a shared database. Scoped, the worst case is that the ALTER fails loudly
      // on someone else's rows, which is the correct way for that mistake to surface.
      await sequelize.query('DELETE FROM media_assets WHERE storage_key IS NULL AND tenant_id = :tenant', {
        replacements: { tenant: TENANT },
      });
      await sequelize.query('ALTER TABLE media_assets ALTER COLUMN storage_key SET NOT NULL');
      await expect(schema.assertMediaLibrarySchema()).rejects.toThrow(/storage_key is still NOT NULL/);
    });

    it('discriminates healthy from broken WITHIN ONE TEST, independent of hook order', async () => {
      // A separate "passes on a healthy schema" test would be near-tautological here: the
      // preceding afterEach calls the combined ensure, which ends in an assert, so a passing
      // assert has just been demonstrated by the hook. Doing both halves in one test makes the
      // discrimination atomic and proves the assert is not simply throwing unconditionally.
      await expect(schema.assertMediaLibrarySchema()).resolves.toBeUndefined();
      await sequelize.query('ALTER TABLE media_assets DROP CONSTRAINT media_assets_kind_shape');
      await expect(schema.assertMediaLibrarySchema()).rejects.toThrow(/media_assets_kind_shape/);
      await schema.ensureMediaLibrarySchema();
      await expect(schema.assertMediaLibrarySchema()).resolves.toBeUndefined();
    });

    it('is idempotent: a second and third full run neither throw nor change the outcome', async () => {
      // CLAUDE.md treats "works once, breaks on the second run" as a production defect, and this
      // runs on every boot.
      await schema.ensureMediaLibrarySchema();
      await schema.ensureMediaLibrarySchema();
      await expect(schema.assertMediaLibrarySchema()).resolves.toBeUndefined();
    });
  });

  it('CONTROL: the probe harness can tell acceptance from refusal', async () => {
    // If `attempt` returned '' for everything, every "REFUSES" above would be vacuous and every
    // "ALLOWS" a false pass. One known-good and one known-bad row, side by side.
    const accepted = await attempt(FILE);
    const refused = await attempt({ ...FILE, storage_key: null });
    expect(accepted).toBe('');
    expect(refused).not.toBe('');
    expect(refused).toMatch(/media_assets_kind_shape/);
  });

  it('CONTROL: afterEach really empties the table for this tenant', async () => {
    // Every "ALLOWS" test above depends on starting from a clean slate. If the cleanup silently
    // did nothing, the uniqueness tests would be testing leftovers from earlier tests.
    await insert(FILE);
    const [before]: any = await sequelize.query(
      'SELECT COUNT(*)::int AS n FROM media_assets WHERE tenant_id = :tenant',
      { replacements: { tenant: TENANT } },
    );
    expect(Number(before[0].n)).toBeGreaterThan(0);
    await sequelize.query('DELETE FROM media_assets WHERE tenant_id = :tenant', {
      replacements: { tenant: TENANT },
    });
    const [after]: any = await sequelize.query(
      'SELECT COUNT(*)::int AS n FROM media_assets WHERE tenant_id = :tenant',
      { replacements: { tenant: TENANT } },
    );
    expect(Number(after[0].n)).toBe(0);
  });
});
