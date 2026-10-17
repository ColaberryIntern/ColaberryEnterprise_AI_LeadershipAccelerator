/**
 * P7-T3 case 1 — the review hold survives a restart. **LC-13's named regression, DB-backed.**
 *
 * ## The incident this protects, with its own measured timestamps
 *
 * `ensureSbpSchema.ts:113-118` records it in the column's own comment:
 *
 * > the hold lived only in `StartBuildInput`, so a deploy mid-generation left
 * > `recoverStrandedBuilds` rebuilding the job from this row with no hold in it -- and the
 * > resumed build published itself to the student. Measured on production 2026-10-01: container
 * > restarted 03:06:47, build resumed 03:06:54, `sbp_autopublished` at 03:07:37 on a build
 * > started with `holdForReview: true`. **A safety property that evaporates on restart is not
 * > one.**
 *
 * ## Why a DB-backed suite, when unit tests already cover the hold
 *
 * They cover it against a **mocked `planStore`**: `sbpOrchestrator.recovery.test.ts:100` asserts
 * `saved.hold_for_review === true` on a captured argument, and
 * `sbpOrchestrator.autoPublish.test.ts:357-390` asserts a resumed held build does not publish.
 * Both are real tests of the orchestrator's intent. Neither can fail if the value never survives
 * the round trip through Postgres -- which is the half the incident was actually about. Measured
 * before writing this file: `grep -rln hold_for_review --include="*integration*.test.ts" -r src`
 * returned **nothing**. The column had no DB-backed coverage at all.
 *
 * (That command is written without a `**` glob on purpose: the sequence it forms inside a
 * block comment is a comment TERMINATOR, which is exactly how the first version of this
 * file failed to parse -- the docblock closed early and the prose became code.)
 *
 * ## The protection is INCIDENTAL, and that is the point of this suite
 *
 * The hold survives a status change only because `setStatus` (`sbpOrchestrator.ts:541-549`)
 * re-reads the row with `getIntake` (`SELECT *`) and **spreads it** into `saveIntake`. Contrast
 * `answers`, which the upsert protects structurally:
 *
 *     answers        = COALESCE(EXCLUDED.answers, build_intake.answers)   <- protected
 *     hold_for_review = EXCLUDED.hold_for_review                          <- overwritten
 *
 * and `saveIntake` coerces with `intake.hold_for_review === true`, so an **absent** field writes
 * `false`. A caller that upserts without carrying the hold forward therefore clears it silently.
 * Today none does. The last test here pins that edge deliberately, so the day someone adds a
 * partial upsert -- or narrows `getIntake`'s `SELECT *` to a column list -- this suite fails
 * instead of a student receiving an unreviewed build.
 *
 * ## Running it
 *
 *   docker run --rm -d --name sbp-hold-pg -p 55434:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=sbp_test \
 *     pgvector/pgvector:pg15
 *
 *   DATABASE_URL=postgres://test:test@localhost:55434/sbp_test \
 *     npx jest -c jest.config.ts holdForReview.integration
 *
 *   docker rm -f sbp-hold-pg
 *
 * Use a DISPOSABLE database. This suite hand-creates minimal `projects`/`enrollments` stand-ins,
 * which makes a later `Tenant.sync()`-style model sync in another suite a no-op -- the documented
 * cross-suite hazard. With no `DATABASE_URL` it SKIPS, and a skipped regression test is not
 * evidence that the regression is fixed.
 */
import { QueryTypes } from 'sequelize';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[holdForReview.integration] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; see '
    + 'the header for the one-line docker run. It is NOT evidence about LC-13 unless it ran.',
  );
}

jest.setTimeout(120_000);

describeIfDb('LC-13 case 1 — the review hold survives the round trip and a restart', () => {
  let sequelize: import('sequelize').Sequelize;
  let saveIntake: typeof import('../planStore').saveIntake;
  let getIntake: typeof import('../planStore').getIntake;
  let listIntakesByStatus: typeof import('../planStore').listIntakesByStatus;
  let ensureSbpSchema: typeof import('../../../db/ensureSbpSchema').ensureSbpSchema;

  const PROJECT = '41111111-1111-1111-1111-111111111111';
  const ENROLLMENT = '42222222-2222-2222-2222-222222222222';

  /** The minimum a `build_intake` row needs; `idea` is NOT NULL. */
  const base = {
    project_id: PROJECT,
    enrollment_id: ENROLLMENT,
    idea: 'an admissions triage tool',
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ saveIntake, getIntake, listIntakesByStatus } = await import('../planStore'));
    ({ ensureSbpSchema } = await import('../../../db/ensureSbpSchema'));

    // `build_intake` FKs to projects(id) and enrollments(id) (`ensureSbpSchema.ts:~96-98`).
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

  /** Read the raw column, not the typed accessor, so the assertion is about the ROW. */
  async function heldInRow(): Promise<boolean | null> {
    const rows = await sequelize.query<{ hold_for_review: boolean }>(
      `SELECT hold_for_review FROM build_intake WHERE project_id = $1`,
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
    return rows.length ? rows[0].hold_for_review : null;
  }

  it('APPARATUS: the column exists, NOT NULL, defaulting to FALSE', async () => {
    // Without this, every assertion below could pass against a database where the column was
    // never added -- a missing column would read as "not held", which is the dangerous direction.
    const col = await sequelize.query<{ is_nullable: string; column_default: string | null }>(
      `SELECT is_nullable, column_default FROM information_schema.columns
         WHERE table_name = 'build_intake' AND column_name = 'hold_for_review'`,
      { type: QueryTypes.SELECT },
    );
    expect(col).toHaveLength(1);
    expect(col[0].is_nullable).toBe('NO');
    expect(String(col[0].column_default)).toContain('false');
  });

  it('the hold is PERSISTED to the row, not merely carried in the job', async () => {
    // The whole incident in one assertion: the value has to be in Postgres, because a restart
    // rebuilds the job from Postgres and from nothing else.
    await saveIntake({ ...base, status: 'generating', hold_for_review: true });
    expect(await heldInRow()).toBe(true);
  });

  it('the READ half: getIntake returns the hold for a held row', async () => {
    // `setStatus` and `inputFromIntake` both depend on this. `getIntake` is `SELECT *`, so the
    // column rides along -- narrowing it to an explicit list without this column would silently
    // un-hold every build at the next status change.
    await saveIntake({ ...base, status: 'generating', hold_for_review: true });
    const intake = await getIntake(PROJECT);
    expect(intake?.hold_for_review).toBe(true);
  });

  it('A STATUS CHANGE PRESERVES THE HOLD — the restart path, end to end', async () => {
    /**
     * `setStatus` is module-private, so this drives the exact composition it performs at
     * `sbpOrchestrator.ts:548`: `saveIntake({ ...(await getIntake(id)), status })`. Stated
     * plainly rather than left to look like the shipped function: what is proved is that the
     * read-and-spread round trip preserves the hold through a real upsert, which is the property
     * `setStatus` relies on and the one the incident broke.
     */
    await saveIntake({ ...base, status: 'captured', hold_for_review: true });

    const reread = await getIntake(PROJECT);
    // Asserted before the spread, so a null read fails HERE with a clear message rather than
    // producing a confusing upsert from an empty object.
    expect(reread).toBeTruthy();
    await saveIntake({
      ...(reread as NonNullable<typeof reread>), project_id: PROJECT, status: 'generating',
    });

    expect(await heldInRow()).toBe(true);
    const after = await getIntake(PROJECT);
    expect(after?.status).toBe('generating');
    expect(after?.hold_for_review).toBe(true);
  });

  it('the RECOVERY SWEEP sees the hold: a stranded held row is listed with it intact', async () => {
    // `recoverStrandedBuilds` (`sbpOrchestrator.ts:606-608`) starts from exactly this query, and
    // hands each row to `inputFromIntake`, which restores `holdForReview: intake.hold_for_review
    // === true` (`:576-578`). If the hold were absent here, the resumed build would publish --
    // which is what happened on 2026-10-01.
    await saveIntake({ ...base, status: 'generating', hold_for_review: true });

    const stranded = await listIntakesByStatus('generating');
    const mine = stranded.find((r) => r.project_id === PROJECT);
    expect(mine).toBeDefined();
    expect(mine?.hold_for_review).toBe(true);
    // And the value survives the coercion `inputFromIntake` applies to it.
    expect(mine?.hold_for_review === true).toBe(true);
  });

  it('NEGATIVE CONTROL: an unheld build is not held, so the assertions above can fail', async () => {
    // Without this, every test here would pass against an implementation that hardcoded `true`.
    await saveIntake({ ...base, status: 'generating', hold_for_review: false });
    expect(await heldInRow()).toBe(false);

    const stranded = await listIntakesByStatus('generating');
    expect(stranded.find((r) => r.project_id === PROJECT)?.hold_for_review).toBe(false);
  });

  it('a row written BEFORE the column existed reads as NOT held, via the DDL default', async () => {
    // Backward compatibility, asserted on the schema rather than argued: an insert that names no
    // `hold_for_review` gets `false` from `DEFAULT FALSE`, so legacy rows are unheld rather than
    // NULL. `inputFromIntake`'s `=== true` would treat NULL as unheld too, but a NOT NULL column
    // means that path is unreachable.
    await sequelize.query(
      `INSERT INTO build_intake (project_id, enrollment_id, idea, status)
       VALUES ($1, $2, 'legacy row', 'generating')`,
      { bind: [PROJECT, ENROLLMENT] },
    );
    expect(await heldInRow()).toBe(false);
  });

  /**
   * THE SHARP EDGE, pinned as the behaviour it is.
   *
   * `hold_for_review = EXCLUDED.hold_for_review` is an unconditional overwrite, and `saveIntake`
   * coerces an absent field with `=== true`, so a partial upsert writes `false`. Compare the line
   * directly above it in the same statement, which protects `answers` structurally:
   *
   *     answers = COALESCE(EXCLUDED.answers, build_intake.answers)
   *
   * **No caller does this today** -- both `saveIntake` callers either set the hold explicitly
   * (`sbpOrchestrator.ts:201`) or spread a freshly-read row (`:548`). So this is not a live
   * defect, and it is not being reported as one. It is a tripwire: the hold survives by caller
   * discipline rather than by construction, and this test is what fails if that discipline
   * lapses. The structural fix, if it is ever wanted, is one `COALESCE` away.
   */
  it('TRIPWIRE: a partial upsert CLEARS the hold, because only `answers` is COALESCE-protected', async () => {
    await saveIntake({ ...base, status: 'generating', hold_for_review: true });
    expect(await heldInRow()).toBe(true);

    // The same project, upserted without carrying the hold forward.
    await saveIntake({ ...base, status: 'drafted' });

    // Cleared. If this ever reads `true`, somebody has made the hold structural -- good; delete
    // this test and say so in the commit.
    expect(await heldInRow()).toBe(false);

    // The contrast, asserted in the same test so the asymmetry is visible rather than described:
    // `answers` survives the identical partial upsert.
    await saveIntake({
      ...base, status: 'generating', hold_for_review: true,
      answers: [{ id: 'q1', question: 'who uses it?', answer: 'admissions staff' }],
    });
    await saveIntake({ ...base, status: 'drafted' });
    const after = await getIntake(PROJECT);
    expect(after?.answers).toHaveLength(1);
    expect(after?.hold_for_review).toBe(false);
  });
});
