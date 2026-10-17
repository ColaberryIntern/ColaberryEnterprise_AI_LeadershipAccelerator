/**
 * P7-T3 case 4 — concurrent approval of a contract process document, and the CAS backstop.
 * **LC-13, the highest-priority row in the packet.**
 *
 * ## Why this suite had to exist
 *
 * `plan.md:94` carries risk **R5** against `factoryApproval.ts` — *"read-then-compare outside a
 * transaction, no row lock"* — with its status recorded as **"Unknown until tested"**, and
 * `plan.md:121` makes LC-13 the highest priority because **it was a real production incident**.
 * Measured before writing a line of this file:
 *
 *   ls  src/services/factory/__tests__/ | grep -i approv   ->  factoryApproval.test.ts only
 *   find src -name "*integration*" -name "*.test.ts" | grep factory   ->  NOTHING
 *
 * So the claim that `uq_contract_proc_doc_version` backstops this race was argued **only by
 * analogy** to `blueprintApproval.concurrency.integration.test.ts` and had never been executed
 * against `contract_process_documents`. An analogy is not a measurement.
 *
 * ## What the code actually does, read rather than assumed
 *
 * `approveProcessDocument` (`factoryApproval.ts:124-171`) is three separately-committing
 * statements with **no transaction and no row lock**:
 *
 *   :126  findOne(order: version DESC)        <- read
 *   :132  checkExpectedVersion(...)           <- compare
 *   :143  create({ version: current.version + 1, ... })
 *   :158  current.save()                      <- supersede the prior version
 *
 * `grep -rn "FOR UPDATE|lock: *Transaction|LOCK TABLE|pg_advisory|SKIP LOCKED" src` returns
 * **zero hits under `src/services/factory/`**, and the word "transaction" appears in this module
 * only in its own prose. That is the difference from `blueprintApproval`, which at least wraps
 * its CAS in `sequelize.transaction` so a loser fails cleanly instead of half-writing.
 *
 * ## THE FINDING THIS SUITE PINS, which is sharper than "is the index there"
 *
 * **Under a true race the CAS cannot refuse anybody.** Both callers read version 1 before either
 * writes, so both compute `ok: true` and both attempt `version: 2`. The application-level guard is
 * therefore bypassed entirely by concurrency, and the ONLY thing standing between the system and a
 * duplicate approval is the unique index. The positive control below is what turns that sentence
 * from an argument into evidence.
 *
 * ## Running it
 *
 * The convention this repo settled on: the existing `jest.config.ts` plus a name filter, NOT a
 * separate config -- an earlier `jest.integration.config.ts` was deleted because its `testMatch`
 * was broad enough to drag sibling suites into the disposable database.
 *
 *   docker run --rm -d --name factory-approval-pg -p 55432:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=lifecycle_test \
 *     pgvector/pgvector:pg15
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@localhost:55432/lifecycle_test \
 *     npx jest -c jest.config.ts factoryApproval.concurrency
 *
 *   docker rm -f factory-approval-pg
 *
 * **Use a DISPOSABLE database and do not share it.** This suite drops and recreates
 * `uq_contract_proc_doc_version` and plants a trigger, both restored in `finally`. It also
 * hand-creates minimal `tenants`/`projects`/`delivery_projects` stand-ins, which makes a later
 * `Tenant.sync()` in another suite a no-op -- the documented cross-suite hazard that stops the
 * sync-ing suites and the hand-rolling suites from sharing a database in either order.
 *
 * With no `DATABASE_URL` this SKIPS visibly. A skipped concurrency test is not evidence about
 * LC-13, and must not be cited as any.
 */
import { QueryTypes } from 'sequelize';
import { fixtureC } from '../../lifecycle/generation/__tests__/fixtures/referenceFixtures';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[factoryApproval.concurrency] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; '
    + 'see the header for the one-line docker run and the exact command. It is NOT evidence '
    + 'about LC-13 or risk R5 unless it actually ran.',
  );
}

jest.setTimeout(120_000);

describeIfDb('LC-13 / R5 — concurrent approval of one process document', () => {
  let sequelize: import('sequelize').Sequelize;
  let approveProcessDocument: typeof import('../factoryApproval').approveProcessDocument;
  let ensureContractTrackSchema:
    typeof import('../../../db/ensureContractTrackSchema').ensureContractTrackSchema;

  const TENANT = '31111111-1111-1111-1111-111111111111';
  const PROJECT = '32222222-2222-2222-2222-222222222222';
  const DELIVERY = '33333333-3333-3333-3333-333333333333';
  const TRACK = 'solution_build';
  const INDEX = 'uq_contract_proc_doc_version';

  /**
   * The seed document must PASS the approval gate, or both racers throw `ApprovalGateError`, the
   * row count reads 1, and that 1 has nothing to do with the index. Measured with the shipped
   * `assertApprovable` before this suite was written: fixtures A, B and C all report
   * `factoryErrors=0` and all three pass. C is "the ordinary path", so C is the seed.
   */
  const DOC = fixtureC.project();

  beforeAll(async () => {
    // Lazily imported so the module's top-level `new Sequelize(...)` never runs in CI.
    ({ sequelize } = await import('../../../config/database'));
    ({ approveProcessDocument } = await import('../factoryApproval'));
    ({ ensureContractTrackSchema } = await import('../../../db/ensureContractTrackSchema'));

    // `contract_process_documents.delivery_project_id` FKs to `delivery_projects(id)`
    // (`ensureContractTrackSchema.ts:105`), which a disposable database does not have.
    await sequelize.query(`CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)`);
    await sequelize.query(`INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [TENANT] });
    await sequelize.query(`INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [PROJECT] });
    await sequelize.query(
      `INSERT INTO delivery_projects (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [DELIVERY] },
    );

    await ensureContractTrackSchema();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  /** A single version-1 draft, with every prior row for this project cleared first. */
  async function seedDraft(): Promise<void> {
    await sequelize.query(
      `DELETE FROM contract_process_documents WHERE delivery_project_id = $1`, { bind: [DELIVERY] },
    );
    await sequelize.query(
      `INSERT INTO contract_process_documents
         (delivery_project_id, track_type, version, doc_json, status)
       VALUES ($1, $2, 1, $3::jsonb, 'draft')`,
      { bind: [DELIVERY, TRACK, JSON.stringify(DOC)] },
    );
  }

  const approve = () => approveProcessDocument({
    deliveryProjectId: DELIVERY,
    trackType: TRACK,
    expectedVersion: 1,
    level: 'documented',
    revisionId: 'rev-1',
    approvedBy: 'approver@example.test',
    enrichmentStatus: 'resolved',
  });

  /** Both callers believe the document is at version 1. That is the race. */
  const raceTwoApprovals = () => Promise.allSettled([approve(), approve()]);

  async function countAtVersion(version: number): Promise<number> {
    const rows = await sequelize.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM contract_process_documents
         WHERE delivery_project_id = $1 AND track_type = $2 AND version = $3`,
      { bind: [DELIVERY, TRACK, version], type: QueryTypes.SELECT },
    );
    return Number(rows[0].n);
  }

  async function rows(): Promise<Array<{ version: number; status: string; superseded_by_id: string | null }>> {
    return sequelize.query<{ version: number; status: string; superseded_by_id: string | null }>(
      `SELECT version, status, superseded_by_id FROM contract_process_documents
         WHERE delivery_project_id = $1 AND track_type = $2 ORDER BY version`,
      { bind: [DELIVERY, TRACK], type: QueryTypes.SELECT },
    );
  }

  it('APPARATUS: the table and the unique index both exist, so a pass below means something', async () => {
    // Without this, every assertion in this file could pass against a database where the index
    // was never created -- the row count would be 1 because nothing raced, not because anything
    // refused.
    const idx = await sequelize.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = $1`, { bind: [INDEX], type: QueryTypes.SELECT },
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toContain('UNIQUE');
    // The exact key, so a reshaped index does not quietly stop covering the race.
    expect(idx[0].indexdef).toMatch(/\(delivery_project_id, track_type, version\)/);
  });

  it('produces exactly ONE version-2 row under a real race', async () => {
    await seedDraft();
    const results = await raceTwoApprovals();

    // The invariant, whatever each caller believes happened.
    expect(await countAtVersion(2)).toBe(1);
    expect(results).toHaveLength(2);

    const rejected = results.filter((r) => r.status === 'rejected');
    // One of the two must have been refused. Both succeeding would BE the duplicate approval.
    expect(rejected).toHaveLength(1);

    const err = (rejected[0] as PromiseRejectedResult).reason as
      { name?: string; parent?: { message?: string } };

    /**
     * STRICT, by EXACT NAME. The sibling blueprint suite asserts
     * `toMatch(/ApprovalConflictError|SequelizeUniqueConstraintError|Error/)`, and `Error` is a
     * substring of every error name there is -- including `TypeError` and a bare `Error` -- so
     * that assertion cannot fail and proves nothing about the CAS. Exact membership instead.
     *
     * Two outcomes are legitimate and which one fires depends on the interleaving:
     *   - both read version 1 -> both pass CAS -> the loser hits the unique index;
     *   - one completes entirely first -> the other reads version 2 -> CAS refuses it.
     * The first is the interesting case and the one the positive control is about.
     */
    expect(['SequelizeUniqueConstraintError', 'ApprovalConflictError']).toContain(err?.name);

    if (err?.name === 'SequelizeUniqueConstraintError') {
      // Postgres's own message names the index. Sequelize's `message` is the useless
      // "Validation error", which would pass for any validation failure -- the strict shape
      // `planStore.publishConcurrency.integration.test.ts:207-209` already established here.
      expect(err.parent?.message ?? '').toContain(INDEX);
    }

    // PRINTED, because which branch fired is the measurement and a reader should not have to
    // re-run the race to learn it.
    // eslint-disable-next-line no-console
    console.log(`[factoryApproval.concurrency] loser was refused by: ${err?.name}`);
  });

  it('POSITIVE CONTROL: without the index, the same race writes TWO version-2 rows', async () => {
    // THE TEST THAT MAKES THE ONE ABOVE MEAN SOMETHING. If this does not observe two rows, then
    // the index is not what prevents the duplicate and nothing here is evidence about R5.
    await seedDraft();
    await sequelize.query(`DROP INDEX IF EXISTS ${INDEX}`);
    try {
      await raceTwoApprovals();
      const n = await countAtVersion(2);

      // TWO rows means the application-level read-then-compare CAS does NOT prevent a duplicate
      // approval, and the index alone does. That is risk R5, answered: "Unknown until tested"
      // becomes "the CAS is bypassed by concurrency; the index is the only backstop".
      expect(n).toBe(2);
    } finally {
      // Clear the duplicates BEFORE restoring: Postgres cannot build a unique index over rows
      // that already violate it. Restored in `finally` so a failed expectation above does not
      // leave the schema wrong for every test after it.
      await sequelize.query(
        `DELETE FROM contract_process_documents WHERE delivery_project_id = $1 AND version = 2`,
        { bind: [DELIVERY] },
      );
      await sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX}
           ON contract_process_documents (delivery_project_id, track_type, version)`,
      );
    }
  });

  it('with the index restored, the race is back to exactly one', async () => {
    // Proves the control cleaned up after itself. Without this, a later failure in this file
    // could be the control's leftovers rather than a real defect.
    await seedDraft();
    await raceTwoApprovals();
    expect(await countAtVersion(2)).toBe(1);
  });

  it('leaves exactly ONE head: the prior version is superseded and points at the winner', async () => {
    // Fork-on-edit's actual invariant. A count of version-2 rows does not express it: two
    // non-superseded rows would be two live heads for one track, which is what the approval
    // history is supposed to make impossible.
    await seedDraft();
    await raceTwoApprovals();

    const all = await rows();
    const heads = all.filter((r) => r.status !== 'superseded');
    expect(heads).toHaveLength(1);
    expect(heads[0].version).toBe(2);
    expect(heads[0].status).toBe('documented');

    const prior = all.find((r) => r.version === 1)!;
    expect(prior.status).toBe('superseded');
    expect(prior.superseded_by_id).toBeTruthy();
  });

  /**
   * REGRESSION TEST FOR DEFECT 1 OF P7-T3, which this suite found and this packet fixed.
   *
   * **The break, as first measured:** `create` and `current.save()` were separate autocommitting
   * statements with no transaction around them, so a failure between them committed the new
   * approved version while the prior version was never superseded -- leaving TWO live heads for
   * one track, which is exactly what fork-on-edit exists to prevent. This test observed
   * `version 2 = documented` alongside `version 1 = draft`, two heads, and passed.
   *
   * **The fix:** both statements now run inside one `sequelize.transaction` in
   * `factoryApproval.ts`. The assertions below are inverted accordingly: the failed supersede must
   * now roll the create back, so there is NO version 2 at all and version 1 remains the only head.
   *
   * Fault injected with a planted `BEFORE UPDATE` trigger -- the technique this repo already uses
   * to make a DB-level failure deterministic. Dropped in `finally`.
   *
   * **What the fix does NOT do:** it does not serialize the race. Two concurrent callers still
   * both read version 1 and both pass the CAS; the unique index is what refuses the duplicate, as
   * the positive control above measures. Conflating the two would overstate it.
   */
  it('REGRESSION: a failed supersede rolls the create BACK, leaving one head', async () => {
    await seedDraft();
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION refuse_proc_doc_update() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'planted: UPDATE refused'; END;
      $$ LANGUAGE plpgsql;
    `);
    await sequelize.query(`
      CREATE TRIGGER refuse_proc_doc_update_trg BEFORE UPDATE ON contract_process_documents
        FOR EACH ROW EXECUTE FUNCTION refuse_proc_doc_update();
    `);
    try {
      // The approval still throws -- the caller is told, which it must be.
      await expect(approve()).rejects.toThrow(/planted: UPDATE refused/);

      const all = await rows();
      // THE FIX: the new version was rolled back with the failed supersede. Before the fix this
      // read 'documented'.
      expect(all.find((r) => r.version === 2)).toBeUndefined();
      expect(await countAtVersion(2)).toBe(0);
      // And version 1 is untouched, still the single live head.
      expect(all.find((r) => r.version === 1)?.status).toBe('draft');
      expect(all.filter((r) => r.status !== 'superseded')).toHaveLength(1);
    } finally {
      await sequelize.query(`DROP TRIGGER IF EXISTS refuse_proc_doc_update_trg ON contract_process_documents`);
      await sequelize.query(`DROP FUNCTION IF EXISTS refuse_proc_doc_update()`);
    }
  });

  it('CONTROL: with the trigger gone, one approval leaves one head', async () => {
    // So the test above is attributable to the planted failure and not to the seed or the gate.
    await seedDraft();
    await approve();
    const all = await rows();
    expect(all.filter((r) => r.status !== 'superseded')).toHaveLength(1);
  });
});
