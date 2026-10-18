/**
 * Only one ACTIVE lease per resource_key, proved against REAL Postgres.
 *
 * Session CC-20261001-q7m4.
 *
 * ## Why this suite exists
 *
 * `ensureWorkGraphSchema.ts` states the design in its own words: collision detection for
 * `resource_leases` is enforced at the DB level, by a partial unique index on `(resource_key)
 * WHERE status = 'active'`, and `acquireLease()` relies on catching that unique violation.
 *
 * Until now nothing exercised it. This programme's register lists `resource_leases` as the
 * closest structural analogue to the lock `lifecycleExecution` lacks, and notes it had **no race
 * test at all** - one of seven locks "covered" only by asserting what their SQL says. A unit test
 * with a mocked model proves the code issues a CREATE and catches an error; it cannot prove
 * Postgres refuses the second one.
 *
 * ## It carries a mandatory positive control
 *
 * With the partial index DROPPED, the same race produces TWO active leases. If that control ever
 * stops producing two, the index is not what is doing the work, this harness cannot detect a
 * double-acquire, and the test above it is not evidence. This is the same control that answered
 * Risk R5 for `factoryApproval`, where the compare-and-swap turned out to refuse nobody and the
 * unique index was the only real backstop.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name leaserace-pg-test -p 55435:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=leaserace_test \
 *     postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55435/leaserace_test \
 *     npx jest -c jest.config.ts resourceLeaseRace
 *
 *   docker rm -f leaserace-pg-test
 *
 * Port 55435: 55433 belongs to the agent-domain suite and 55434 to the stale-claim suite, so all
 * three can run at once. Throwaway credentials, one run, nothing persists. With no `DATABASE_URL`
 * the suite SKIPS AND SAYS SO.
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
    '[resourceLeaseRace] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; the docblock '
    + 'has the one-line docker run and the exact command. It is NOT evidence that only one active '
    + 'lease per resource_key is possible unless it actually ran.',
  );
}

const ACTIVE_INDEX = 'idx_resource_leases_active_resource_key';

describeIfDb('resource_leases allows exactly one ACTIVE lease per resource_key', () => {
  let sequelize: import('sequelize').Sequelize;
  let acquireLease: typeof import('../workCoordinatorService').acquireLease;

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ acquireLease } = await import('../workCoordinatorService'));

    // Minimal FK parents. Both columns on resource_leases are nullable, but the REFERENCES
    // clauses need their targets to exist before the table can be created.
    await sequelize.query('CREATE TABLE IF NOT EXISTS ticket_work_units (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS agent_runs (id UUID PRIMARY KEY)');
    await sequelize.query(`CREATE TABLE IF NOT EXISTS resource_leases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      resource_key VARCHAR(255) NOT NULL,
      work_unit_id UUID REFERENCES ticket_work_units(id),
      run_id UUID REFERENCES agent_runs(id),
      lease_owner VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      heartbeat_at TIMESTAMPTZ,
      idempotency_key VARCHAR(255) NOT NULL,
      before_state_version VARCHAR(100),
      cancellation_token UUID NOT NULL DEFAULT gen_random_uuid(),
      released_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_leases_idempotency_key '
      + 'ON resource_leases (idempotency_key)',
    );
  });

  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS resource_leases');
    await sequelize.query('DROP TABLE IF EXISTS ticket_work_units');
    await sequelize.query('DROP TABLE IF EXISTS agent_runs');
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM resource_leases', { type: QueryTypes.DELETE });
    // Recreated every time, because one test deliberately drops it.
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${ACTIVE_INDEX} `
      + "ON resource_leases (resource_key) WHERE status = 'active'",
    );
  });

  async function activeCount(resourceKey: string): Promise<number> {
    const rows = await sequelize.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM resource_leases WHERE resource_key = $1 AND status = 'active'",
      { bind: [resourceKey], type: QueryTypes.SELECT },
    );
    return Number(rows[0].n);
  }

  const lease = (key: string, idem: string) => ({
    resourceKey: key,
    leaseOwner: `owner-${idem}`,
    idempotencyKey: idem,
    ttlMs: 60_000,
  });

  it('TWO CONCURRENT ACQUIRES on one resource_key: exactly ONE is granted', async () => {
    const key = 'ticket:race-1';
    const [a, b] = await Promise.all([
      acquireLease(lease(key, 'idem-a') as never),
      acquireLease(lease(key, 'idem-b') as never),
    ]);

    expect([a.acquired, b.acquired].filter(Boolean)).toHaveLength(1);
    expect(await activeCount(key)).toBe(1);

    // The loser is told who holds it rather than being handed a database error.
    const loser = a.acquired ? b : a;
    expect(loser.lease).toBeNull();
    expect(loser.conflictWith).toBeTruthy();
  });

  it('POSITIVE CONTROL: with the partial index dropped, the same race grants TWO', async () => {
    // Mandatory. This is what proves the INDEX is doing the work rather than the application
    // code. Risk R5 found exactly this shape in factoryApproval: a compare-and-swap that
    // refused nobody, with the unique index as the only real backstop.
    const key = 'ticket:race-2';
    await sequelize.query(`DROP INDEX IF EXISTS ${ACTIVE_INDEX}`);

    const [a, b] = await Promise.all([
      acquireLease(lease(key, 'idem-c') as never),
      acquireLease(lease(key, 'idem-d') as never),
    ]);

    expect([a.acquired, b.acquired].filter(Boolean)).toHaveLength(2);
    expect(await activeCount(key)).toBe(2);
  });

  it('the SAME idempotency key is idempotent, which is not the same thing as losing a race', async () => {
    // Two different mechanisms share one return shape, so the suite separates them: this path
    // short-circuits on the idempotency key before any INSERT is attempted.
    const key = 'ticket:race-3';
    const first = await acquireLease(lease(key, 'idem-same') as never);
    const second = await acquireLease(lease(key, 'idem-same') as never);

    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(true);
    expect((second.lease as any)?.id).toBe((first.lease as any)?.id);
    expect(await activeCount(key)).toBe(1);
  });

  it('a RELEASED lease frees the key, because the index only binds active ones', async () => {
    const key = 'ticket:race-4';
    const first = await acquireLease(lease(key, 'idem-e') as never);
    expect(first.acquired).toBe(true);

    await sequelize.query(
      "UPDATE resource_leases SET status = 'released', released_at = NOW() WHERE resource_key = $1",
      { bind: [key], type: QueryTypes.UPDATE },
    );

    const second = await acquireLease(lease(key, 'idem-f') as never);
    expect(second.acquired).toBe(true);
    expect(await activeCount(key)).toBe(1);
  });
});
