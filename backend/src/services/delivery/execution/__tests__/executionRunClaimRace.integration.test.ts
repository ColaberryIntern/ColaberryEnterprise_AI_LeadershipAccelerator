/**
 * The execution-run claim is a real queue, proved against REAL Postgres.
 *
 * Session CC-20261001-q7m4.
 *
 * ## Why this suite exists
 *
 * `CLAIM_NEXT_RUN_SQL`'s own docblock says it is "exported as a constant so the concurrency
 * semantics are reviewable and testable without a database". What that produced is
 * `executionPlane.test.ts:332`:
 *
 *     expect(CLAIM_NEXT_RUN_SQL).toContain('FOR UPDATE SKIP LOCKED');
 *
 * That asserts the string contains the words. It would pass if the clause sat inside a comment,
 * or applied to the wrong subquery, or if the surrounding statement claimed the same row twice.
 * This programme's register lists the execution-run claim among seven locks "covered" only that
 * way. This suite runs the exported statement concurrently instead.
 *
 * ## It carries a mandatory positive control
 *
 * `claimWithoutLocking` performs the same selection with the lock removed, both reads taken
 * before either write, and asserts the harness sees **one row claimed twice**. If that control
 * stops producing a double-claim, nothing above it is evidence.
 *
 * ## Worth knowing: nothing executes this in production yet
 *
 * `CLAIM_NEXT_RUN_SQL` has no non-test caller - the only mentions are its definition, a doc
 * reference in `ensureRefactoredDeliverySchema.ts`, and the text assertion above. Proving it now
 * means it is correct before it has a caller, which is the right order; it also means a green run
 * here is not evidence that any queue is running.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name runclaim-pg-test -p 55436:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=runclaim_test \
 *     postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55436/runclaim_test \
 *     npx jest -c jest.config.ts executionRunClaimRace
 *
 *   docker rm -f runclaim-pg-test
 *
 * Port 55436: 55433, 55434 and 55435 belong to the agent-domain, stale-claim and lease suites, so
 * all four can run at once. Throwaway credentials, one run, nothing persists. With no
 * `DATABASE_URL` the suite SKIPS AND SAYS SO.
 *
 * It must never be pointed at production: it creates its own table and writes only rows it made.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[executionRunClaimRace] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; the '
    + 'docblock has the one-line docker run and the exact command. It is NOT evidence that the '
    + 'claim behaves as a queue unless it actually ran.',
  );
}

describeIfDb('CLAIM_NEXT_RUN_SQL behaves as a queue, not just as a string containing SKIP LOCKED', () => {
  let sequelize: import('sequelize').Sequelize;
  let CLAIM_NEXT_RUN_SQL: string;

  const PROJECT = '99999999-9999-9999-9999-999999999999';

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    ({ CLAIM_NEXT_RUN_SQL } = await import('../executionRunState'));

    await sequelize.query(`CREATE TABLE IF NOT EXISTS delivery_execution_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      delivery_project_id UUID NOT NULL,
      story_id UUID,
      state VARCHAR(30) NOT NULL DEFAULT 'queued',
      execution_provider VARCHAR(60) NOT NULL DEFAULT 'claude_agent_sdk',
      claimed_by VARCHAR(120),
      claimed_at TIMESTAMPTZ,
      last_heartbeat_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  });

  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS delivery_execution_runs');
    await sequelize.close();
  });

  /** `count` queued runs, created in order so ORDER BY created_at is meaningful. */
  async function seedQueued(count: number): Promise<void> {
    await sequelize.query('DELETE FROM delivery_execution_runs', { type: QueryTypes.DELETE });
    for (let i = 0; i < count; i += 1) {
      await sequelize.query(
        `INSERT INTO delivery_execution_runs (delivery_project_id, state, created_at)
         VALUES ($1, 'queued', NOW() + ($2 * INTERVAL '1 millisecond'))`,
        { bind: [PROJECT, i], type: QueryTypes.INSERT },
      );
    }
  }

  const claim = async (workerId: string): Promise<string | null> => {
    const rows = await sequelize.query<{ id: string }>(CLAIM_NEXT_RUN_SQL, {
      replacements: { workerId },
      type: QueryTypes.SELECT,
    });
    return rows.length ? rows[0].id : null;
  };

  it('FIVE CONCURRENT WORKERS claim five queued runs, each exactly once', async () => {
    await seedQueued(5);

    const claimed = await Promise.all(
      ['w1', 'w2', 'w3', 'w4', 'w5'].map((w) => claim(w)),
    );
    const ids = claimed.filter(Boolean) as string[];

    expect(ids).toHaveLength(5);
    // The property that matters: no run went to two workers.
    expect(new Set(ids).size).toBe(5);

    const rows = await sequelize.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM delivery_execution_runs WHERE state = 'provisioning'",
      { type: QueryTypes.SELECT },
    );
    expect(Number(rows[0].n)).toBe(5);
  });

  it('workers beyond the queue depth get NOTHING rather than blocking or erroring', async () => {
    // What SKIP LOCKED buys: the surplus workers return empty instead of waiting behind a lock.
    await seedQueued(2);

    const claimed = await Promise.all(['a', 'b', 'c', 'd'].map((w) => claim(w)));
    const ids = claimed.filter(Boolean) as string[];

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(claimed.filter((c) => c === null)).toHaveLength(2);
  });

  it('a claimed run records WHICH worker took it', async () => {
    await seedQueued(1);
    const id = await claim('worker-42');
    expect(id).toBeTruthy();

    const rows = await sequelize.query<{ claimed_by: string; state: string }>(
      'SELECT claimed_by, state FROM delivery_execution_runs WHERE id = $1',
      { bind: [id], type: QueryTypes.SELECT },
    );
    expect(rows[0].claimed_by).toBe('worker-42');
    expect(rows[0].state).toBe('provisioning');
  });

  it('POSITIVE CONTROL: without the lock, ONE run is claimed by TWO workers', async () => {
    // Mandatory. This is the failure the SKIP LOCKED clause prevents, and the thing the string
    // assertion in executionPlane.test.ts cannot distinguish from success. Both reads are taken
    // before either write, which is the interleaving a real race produces, made determinate.
    await seedQueued(1);

    const pick = async (): Promise<string> => {
      const rows = await sequelize.query<{ id: string }>(
        "SELECT id FROM delivery_execution_runs WHERE state = 'queued' ORDER BY created_at LIMIT 1",
        { type: QueryTypes.SELECT },
      );
      return rows[0].id;
    };
    const [first, second] = await Promise.all([pick(), pick()]);
    expect(first).toBe(second); // both unlocked readers saw the same row

    const take = async (id: string, worker: string) => {
      await sequelize.query(
        "UPDATE delivery_execution_runs SET state = 'provisioning', claimed_by = $2 WHERE id = $1",
        { bind: [id, worker], type: QueryTypes.UPDATE },
      );
    };
    await take(first, 'ghost-1');
    await take(second, 'ghost-2');

    // One row, claimed twice: the second overwrote the first's ownership.
    const rows = await sequelize.query<{ claimed_by: string }>(
      'SELECT claimed_by FROM delivery_execution_runs WHERE id = $1',
      { bind: [first], type: QueryTypes.SELECT },
    );
    expect(rows[0].claimed_by).toBe('ghost-2');
  });
});
