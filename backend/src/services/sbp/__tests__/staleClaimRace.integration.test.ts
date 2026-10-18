/**
 * The stale-build claim is race-safe, against REAL Postgres.
 *
 * Session CC-20261001-q7m4.
 *
 * ## Why this suite exists
 *
 * PR #3169 shipped `claimStaleGeneratingIntake`, which lets a build whose generation died
 * without the process dying be retried in an hour instead of at the next deploy. Its safety
 * argument is that the whole decision lives in the WHERE clause, so two callers racing on the
 * same stuck project cannot both win.
 *
 * That PR recorded, in as many words, that the claim was **"argued from the SQL's atomicity, not
 * observed"**, and added it to this programme's list of locks covered only by asserting what
 * their SQL says. A mocked `sequelize.query` proves the code issues the statement it was written
 * to issue; it cannot prove Postgres refuses the second caller. This suite closes that gap for
 * this one lock.
 *
 * ## It carries a mandatory positive control
 *
 * `naiveClaimBothWin` performs the read-then-write the real implementation deliberately avoids,
 * with the two reads interleaved before either write, and asserts that it produces **two**
 * winners. If that control ever stops producing two, this harness cannot detect a double-win and
 * the tests above it are proving nothing — they must not be cited as evidence of race safety.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name staleclaim-pg-test -p 55434:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=staleclaim_test \
 *     postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55434/staleclaim_test \
 *     npx jest -c jest.config.ts staleClaimRace
 *
 *   docker rm -f staleclaim-pg-test
 *
 * Port 55434, so it cannot collide with the agent-domain suite on 55433. Throwaway credentials
 * for a container that lives for one run; nothing here is secret and nothing persists. With no
 * `DATABASE_URL` the suite SKIPS AND SAYS SO — a skipped test reports as skipped, which is
 * visible, where an ignored one reports as nothing at all.
 *
 * It must never be pointed at production: it creates its own tables and writes only rows it made.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[staleClaimRace] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; the docblock '
    + 'has the one-line docker run and the exact command. It is NOT evidence about the claim '
    + 'being race-safe unless it actually ran.',
  );
}

describeIfDb('claimStaleGeneratingIntake is race-safe against real Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let claimStaleGeneratingIntake: typeof import('../planStore').claimStaleGeneratingIntake;

  const PROJECT = '55555555-5555-5555-5555-555555555555';
  const STALE_SECONDS = 3600;

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ claimStaleGeneratingIntake } = await import('../planStore'));

    // Minimal stand-in for the FK parent. `build_intake.project_id` REFERENCES projects(id), and
    // `projects` is one of the 20 tables that cannot be created by the boot path at all — see
    // `db/__tests__/bootSchemaCreatable.test.ts`. So the suite makes the little it needs.
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await sequelize.query(`CREATE TABLE IF NOT EXISTS build_intake (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id),
      enrollment_id UUID,
      idea TEXT NOT NULL,
      name VARCHAR(200),
      size VARCHAR(30) NOT NULL DEFAULT 'project',
      users TEXT,
      data_sources TEXT,
      done_definition TEXT,
      target_weeks INTEGER,
      correlation_id UUID,
      status VARCHAR(30) NOT NULL DEFAULT 'captured',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await sequelize.query(
      'INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING',
      { bind: [PROJECT], type: QueryTypes.INSERT },
    );
  });

  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS build_intake');
    await sequelize.query('DROP TABLE IF EXISTS projects');
    await sequelize.close();
  });

  /** A `generating` row whose last touch was `idleSeconds` ago. */
  async function seedGenerating(idleSeconds: number): Promise<void> {
    await sequelize.query('DELETE FROM build_intake WHERE project_id = $1',
      { bind: [PROJECT], type: QueryTypes.DELETE });
    await sequelize.query(
      `INSERT INTO build_intake (project_id, idea, status, correlation_id, created_at, updated_at)
       VALUES ($1, 'a stuck build', 'generating', NULL,
               NOW() - ($2 * INTERVAL '1 second'), NOW() - ($2 * INTERVAL '1 second'))`,
      { bind: [PROJECT, idleSeconds], type: QueryTypes.INSERT },
    );
  }

  async function correlationId(): Promise<string | null> {
    const rows = await sequelize.query<{ correlation_id: string | null }>(
      'SELECT correlation_id FROM build_intake WHERE project_id = $1',
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
    return rows[0]?.correlation_id ?? null;
  }

  it('TWO CONCURRENT CALLERS, exactly ONE wins', async () => {
    await seedGenerating(7200); // two hours idle: comfortably stale

    const a = '11111111-1111-1111-1111-111111111111';
    const b = '22222222-2222-2222-2222-222222222222';
    const [wonA, wonB] = await Promise.all([
      claimStaleGeneratingIntake(PROJECT, a, STALE_SECONDS),
      claimStaleGeneratingIntake(PROJECT, b, STALE_SECONDS),
    ]);

    expect([wonA, wonB].filter(Boolean)).toHaveLength(1);

    // And the row belongs to whichever one won, not to a mixture of the two.
    const owner = await correlationId();
    expect(owner).toBe(wonA ? a : b);
  });

  it('a FRESH generating row is claimed by NOBODY', async () => {
    // The staleness predicate doing its job. Without this, "exactly one wins" would also be
    // satisfied by an implementation that handed the row to the first caller regardless of age,
    // which is the behaviour that would take over a live build mid-generation.
    await seedGenerating(5);

    const [wonA, wonB] = await Promise.all([
      claimStaleGeneratingIntake(PROJECT, '33333333-3333-3333-3333-333333333333', STALE_SECONDS),
      claimStaleGeneratingIntake(PROJECT, '44444444-4444-4444-4444-444444444444', STALE_SECONDS),
    ]);

    expect([wonA, wonB].filter(Boolean)).toHaveLength(0);
    expect(await correlationId()).toBeNull();
  });

  it('a row that is NOT generating is never claimed', async () => {
    await seedGenerating(7200);
    await sequelize.query("UPDATE build_intake SET status = 'failed' WHERE project_id = $1",
      { bind: [PROJECT], type: QueryTypes.UPDATE });

    const won = await claimStaleGeneratingIntake(
      PROJECT, '66666666-6666-6666-6666-666666666666', STALE_SECONDS,
    );
    expect(won).toBe(false);
  });

  it('POSITIVE CONTROL: the read-then-write it avoids DOES produce two winners', async () => {
    // Mandatory. This performs the non-atomic claim the real implementation deliberately does
    // not use, with both reads taken before either write, and asserts the harness SEES two
    // winners. If this ever stops producing two, the tests above cannot detect a double-win and
    // must not be cited as evidence of race safety.
    await seedGenerating(7200);

    const readOne = async () => {
      const rows = await sequelize.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM build_intake
          WHERE project_id = $1 AND status = 'generating'
            AND updated_at < NOW() - ($2 * INTERVAL '1 second')`,
        { bind: [PROJECT, STALE_SECONDS], type: QueryTypes.SELECT },
      );
      return Number(rows[0].n) === 1;
    };

    // Both decide BEFORE either writes - the interleaving a real race produces, made determinate.
    const [sawA, sawB] = await Promise.all([readOne(), readOne()]);

    const writeOne = async (corr: string) => {
      await sequelize.query(
        'UPDATE build_intake SET correlation_id = $2, updated_at = NOW() WHERE project_id = $1',
        { bind: [PROJECT, corr], type: QueryTypes.UPDATE },
      );
      return true;
    };
    const wonA = sawA ? await writeOne('77777777-7777-7777-7777-777777777777') : false;
    const wonB = sawB ? await writeOne('88888888-8888-8888-8888-888888888888') : false;

    expect([wonA, wonB].filter(Boolean)).toHaveLength(2);
  });
});
