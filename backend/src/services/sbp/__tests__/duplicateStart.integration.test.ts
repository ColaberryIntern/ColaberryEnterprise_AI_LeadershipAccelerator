/**
 * P7-T3 case 2 — a duplicate start produces exactly ONE result. **LC-13, DB-backed.**
 *
 * Required by `request.md:257` ("no duplicated work"), `request.md:187` ("duplicate starts and
 * crash/retry create one result"), and `request.md:123`: *"A duplicate request or worker retry
 * must not duplicate projects, approvals, stories, or external writes."*
 *
 * ## What already covers this, and what does not
 *
 * The orchestrator's re-entry guard -- refuse while `status === 'generating'`
 * (`sbpOrchestrator.ts:195-199`) -- is unit-tested against a mocked `planStore` in
 * `sbpOrchestrator.recovery.test.ts`, including the case that matters most: *"startBuild still
 * refuses a generating row, which is why the sweep, not a retry, is the recovery"*. Those are real
 * tests of the decision.
 *
 * What had no DB-backed coverage is the STORAGE half -- whether two starts for one project can
 * leave two intake rows. Measured before writing this: no integration suite referenced
 * `build_intake_unique_project`. The guard reads a row; if two rows could exist, the guard reads
 * one of them and the other is invisible to it.
 *
 * ## Running it
 *
 *   docker run --rm -d --name sbp-dupe-pg -p 55435:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=sbp_test \
 *     pgvector/pgvector:pg15
 *
 *   DATABASE_URL=postgres://test:test@localhost:55435/sbp_test \
 *     npx jest -c jest.config.ts duplicateStart.integration
 *
 *   docker rm -f sbp-dupe-pg
 *
 * Disposable database only: this suite drops and restores `build_intake_unique_project`, and
 * hand-creates minimal `projects`/`enrollments` stand-ins. With no `DATABASE_URL` it SKIPS.
 */
import { QueryTypes } from 'sequelize';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[duplicateStart.integration] SKIPPED: no DATABASE_URL. Needs a real Postgres; see the header. '
    + 'It is NOT evidence about LC-13 unless it ran.',
  );
}

jest.setTimeout(120_000);

describeIfDb('LC-13 case 2 — a duplicate start converges on one intake row', () => {
  let sequelize: import('sequelize').Sequelize;
  let saveIntake: typeof import('../planStore').saveIntake;
  let getIntake: typeof import('../planStore').getIntake;
  let listIntakesByStatus: typeof import('../planStore').listIntakesByStatus;
  let ensureSbpSchema: typeof import('../../../db/ensureSbpSchema').ensureSbpSchema;

  const PROJECT = '51111111-1111-1111-1111-111111111111';
  const ENROLLMENT = '52222222-2222-2222-2222-222222222222';
  const INDEX = 'build_intake_unique_project';

  const base = { project_id: PROJECT, enrollment_id: ENROLLMENT, idea: 'a seat-management tool' };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ saveIntake, getIntake, listIntakesByStatus } = await import('../planStore'));
    ({ ensureSbpSchema } = await import('../../../db/ensureSbpSchema'));

    await sequelize.query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)`);
    await sequelize.query(`INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [PROJECT] });
    await sequelize.query(
      `INSERT INTO enrollments (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [ENROLLMENT] },
    );
    await ensureSbpSchema();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query(`DELETE FROM build_intake WHERE project_id = $1`, { bind: [PROJECT] });
  });

  async function rowCount(): Promise<number> {
    const rows = await sequelize.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM build_intake WHERE project_id = $1`,
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
    return Number(rows[0].n);
  }

  it('APPARATUS: the unique index on project_id exists', async () => {
    const idx = await sequelize.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = $1`,
      { bind: [INDEX], type: QueryTypes.SELECT },
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toContain('UNIQUE');
    expect(idx[0].indexdef).toMatch(/\(project_id\)/);
  });

  it('two CONCURRENT starts leave exactly ONE row', async () => {
    // The shape of a double-click or a retried worker: both calls believe they are starting.
    await Promise.all([
      saveIntake({ ...base, status: 'generating', correlation_id: null }),
      saveIntake({ ...base, status: 'generating', correlation_id: null }),
    ]);
    expect(await rowCount()).toBe(1);
  });

  it('the LAST writer wins the mutable fields, so the surviving row is coherent', async () => {
    // Not merely "one row" -- the row has to be one caller's view, not a blend. The upsert sets
    // status and correlation_id from EXCLUDED, so the second write owns them.
    await saveIntake({ ...base, status: 'captured', correlation_id: '53333333-3333-3333-3333-333333333333' });
    await saveIntake({ ...base, status: 'generating', correlation_id: '54444444-4444-4444-4444-444444444444' });

    const row = await getIntake(PROJECT);
    expect(await rowCount()).toBe(1);
    expect(row?.status).toBe('generating');
    expect(row?.correlation_id).toBe('54444444-4444-4444-4444-444444444444');
  });

  it('POSITIVE CONTROL: the index is what makes the upsert possible at all', async () => {
    /**
     * Not the shape the sibling suites use, and the difference is worth stating. Dropping a
     * backstop index usually lets a duplicate through; here `saveIntake` uses
     * `ON CONFLICT (project_id)`, and Postgres REQUIRES a matching unique index for that clause --
     * so without it the statement does not duplicate, it ERRORS.
     *
     * That is still a positive control, and a sharper one: it proves the idempotency is the
     * database's, not the application's. There is no read-then-write in `saveIntake` that could
     * be covering for it.
     */
    await sequelize.query(`DROP INDEX IF EXISTS ${INDEX}`);
    try {
      const err = await saveIntake({ ...base, status: 'generating' }).catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      // Postgres's own words, so this cannot pass on an unrelated failure.
      expect(String((err as { parent?: { message?: string } }).parent?.message ?? (err as Error).message))
        .toMatch(/no unique or exclusion constraint matching the ON CONFLICT specification/i);
    } finally {
      await sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX} ON build_intake (project_id)`,
      );
    }
  });

  it('with the index restored, a duplicate start is one row again', async () => {
    // Proves the control cleaned up, so a later failure is not its leftovers.
    await saveIntake({ ...base, status: 'generating' });
    await saveIntake({ ...base, status: 'generating' });
    expect(await rowCount()).toBe(1);
  });

  /**
   * FINDING, pinned rather than fixed: the re-entry guard has NO EXPIRY.
   *
   * `sbpOrchestrator.ts:195-199` refuses a second start while `status === 'generating'`, and the
   * only thing that clears that status is `recoverStrandedBuilds`, which runs **once at boot**
   * (`server.ts:2773-2774`). `listIntakesByStatus` applies no age filter, and `build_intake` has
   * no lease, deadline or heartbeat column -- `updated_at` is ordered by, never compared against.
   *
   * So a build whose generation dies without the process dying stays `generating` indefinitely,
   * and every retry is refused until somebody deploys. That is FAIL-CLOSED, which is the right
   * direction -- a stuck build is better than a double build -- and it is a deliberate design
   * (the orchestrator's own comment calls the sweep "the recovery, not a retry"). But it means
   * the recovery path for one stuck student is a restart of the service, which is worth having
   * written down somewhere a reader will find it.
   *
   * Not fixed here: adding a TTL changes when generation may restart, on a live student path,
   * which is a behaviour change outside this packet's scope.
   */
  it('FINDING: a `generating` row has no TTL, so only a boot sweep can release it', async () => {
    // Backdate the row well past any plausible timeout. If an expiry existed, this is where it
    // would take effect.
    await saveIntake({ ...base, status: 'generating' });
    await sequelize.query(
      `UPDATE build_intake SET updated_at = NOW() - INTERVAL '30 days' WHERE project_id = $1`,
      { bind: [PROJECT] },
    );

    // Still generating, and still returned by the sweep's own query -- the only release path.
    const row = await getIntake(PROJECT);
    expect(row?.status).toBe('generating');
    const stranded = await listIntakesByStatus('generating');
    expect(stranded.find((r) => r.project_id === PROJECT)).toBeDefined();

    // And no column exists that could carry a deadline, asserted on the schema so this does not
    // become stale prose the day one is added.
    const cols = await sequelize.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'build_intake'`,
      { type: QueryTypes.SELECT },
    );
    const names = cols.map((c) => c.column_name);
    for (const candidate of ['lease_until', 'expires_at', 'heartbeat_at', 'generating_since']) {
      expect(names).not.toContain(candidate);
    }
  });
});
