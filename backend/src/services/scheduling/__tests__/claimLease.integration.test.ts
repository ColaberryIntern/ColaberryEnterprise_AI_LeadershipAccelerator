/**
 * The scheduler's claim is an owned lease, and stale recovery terminates. Against REAL Postgres.
 *
 * Session CC-20261026-q7w4.
 *
 * ## Why this suite exists
 *
 * `claimLease.test.ts` next door asserts on the SQL these functions build. That is worth having,
 * but it is the weaker half: it would pass with SQL Postgres rejects, and it cannot show that
 * `attempts_made + 1 >= max_attempts` actually partitions rows the way the two statements assume.
 * The unit suite replaced two tests that asserted on strings the tests wrote themselves, so
 * shipping a raw-SQL fix verified only by more string assertions would repeat the mistake it was
 * written to correct.
 *
 * What is under test is the ownership check and the recovery bound, against the real column set
 * that `ScheduledEmail.sync()` produces.
 *
 * ## The controls
 *
 * - `a dead processor's batch can still send WITHOUT the ownership check` is the positive control.
 *   It is the old behavior: act on the row the batch loaded at claim time, no re-assertion. If it
 *   ever stops showing the duplicate, nothing else in this suite is evidence.
 * - The recovery bound is proved by a loop that TERMINATES. Remove `attempts_made = attempts_made
 *   + 1` from the requeue branch and the loop exhausts its iterations with the row still
 *   claimable, which is the unbounded retry it exists to prevent. The room outbox suite proves
 *   the same property for its own queue the same way; this defect was that lesson not having
 *   reached the email scheduler.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name claimlease-pg-test -p 55438:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=claimlease_test \
 *     postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55438/claimlease_test \
 *     npx jest -c jest.config.ts src/services/scheduling/__tests__/claimLease.integration
 *
 *   docker rm -f claimlease-pg-test
 *
 * Port 55438: 55433-55437 belong to the agent-domain, stale-claim, lease, execution-run and room
 * outbox suites, so all six can run at once. Throwaway credentials, one run, nothing persists.
 * With no `DATABASE_URL` the suite SKIPS AND SAYS SO.
 *
 * It must never be pointed at production: it creates its own tables and deletes every row in
 * `scheduled_emails` between tests.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[claimLease] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; the docblock has '
    + 'the one-line docker run and the exact command. It is NOT evidence that the ownership '
    + 'check rejects a dead processor, nor that stale recovery terminates, unless it ran.',
  );
}

describeIfDb('the scheduler claim is an owned lease, and stale recovery terminates', () => {
  let sequelize: import('sequelize').Sequelize;
  let renewClaim: typeof import('../claimLease').renewClaim;
  let recoverStaleActions: typeof import('../claimLease').recoverStaleActions;
  let STALE_AFTER_MS: number;

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ renewClaim, recoverStaleActions, STALE_AFTER_MS } = await import('../claimLease'));

    // `scheduled_emails` carries FKs to these three. Sequelize emits the constraints whether or
    // not the referenced tables exist, so stubs have to come first. Only `id` is needed: nothing
    // under test reads through the references.
    await sequelize.query('CREATE TABLE IF NOT EXISTS leads (id SERIAL PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS follow_up_sequences (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS campaigns (id UUID PRIMARY KEY)');
    await sequelize.query('INSERT INTO leads (id) VALUES (1) ON CONFLICT DO NOTHING');

    // From the model, so the columns and types match what production has.
    const { ScheduledEmail } = await import('../../../models');
    await (ScheduledEmail as any).sync();
  });

  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS scheduled_emails');
    await sequelize.query('DROP TABLE IF EXISTS leads');
    await sequelize.query('DROP TABLE IF EXISTS follow_up_sequences');
    await sequelize.query('DROP TABLE IF EXISTS campaigns');
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM scheduled_emails', { type: QueryTypes.DELETE });
  });

  /**
   * One row already claimed by `processorId`, stamped `ageMs` ago.
   * `ageMs` above STALE_AFTER_MS is what recovery considers abandoned.
   */
  async function seedClaimed(opts: {
    processorId: string;
    ageMs: number;
    attemptsMade?: number;
    maxAttempts?: number;
  }): Promise<string> {
    const stampedAt = new Date(Date.now() - opts.ageMs);
    const rows = await sequelize.query<{ id: string }>(
      // No `updated_at`: the model declares only `created_at`, so the table `sync()` builds has
      // no such column and an insert naming it fails outright. Measured, not assumed, against
      // information_schema on the table this suite creates.
      `INSERT INTO scheduled_emails
         (id, lead_id, step_index, channel, subject, body, to_email,
          max_attempts, attempts_made, scheduled_for, status,
          processing_started_at, processor_id, created_at)
       VALUES
         (gen_random_uuid(), 1, 0, 'email', 'subj', 'body', 'lead@example.test',
          :maxAttempts, :attemptsMade, NOW(), 'processing',
          :stampedAt, :processorId, NOW())
       RETURNING id`,
      {
        replacements: {
          maxAttempts: opts.maxAttempts ?? 1,
          attemptsMade: opts.attemptsMade ?? 0,
          stampedAt,
          processorId: opts.processorId,
        },
        type: QueryTypes.SELECT,
      },
    );
    return rows[0].id;
  }

  const readRow = async (id: string) => {
    const rows = await sequelize.query<{
      status: string; attempts_made: number; processor_id: string | null;
      processing_started_at: Date | null;
    }>(
      `SELECT status, attempts_made, processor_id, processing_started_at
         FROM scheduled_emails WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    return rows[0];
  };

  describe('ownership', () => {
    it('lets the owner through and moves its lease forward', async () => {
      const id = await seedClaimed({ processorId: 'proc_A', ageMs: 9 * 60 * 1000 });
      const before = (await readRow(id)).processing_started_at!;

      await expect(renewClaim(id, 'proc_A')).resolves.toBe(true);

      const after = (await readRow(id)).processing_started_at!;
      expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    });

    it('refuses a processor that no longer owns the row', async () => {
      // The row was recovered and re-claimed by someone else while proc_A paced.
      const id = await seedClaimed({ processorId: 'proc_B', ageMs: 1000 });

      await expect(renewClaim(id, 'proc_A')).resolves.toBe(false);
    });

    it('refuses a row that is no longer processing', async () => {
      const id = await seedClaimed({ processorId: 'proc_A', ageMs: 1000 });
      await sequelize.query("UPDATE scheduled_emails SET status = 'sent' WHERE id = :id", {
        replacements: { id },
      });

      await expect(renewClaim(id, 'proc_A')).resolves.toBe(false);
    });

    it('refuses after recovery has released the row, which is the actual fix', async () => {
      // The whole duplicate-send chain in one test: proc_A claims, paces past the threshold,
      // recovery hands the row back, and proc_A must not be allowed to act on it.
      const id = await seedClaimed({
        processorId: 'proc_A', ageMs: STALE_AFTER_MS + 60_000, maxAttempts: 3,
      });

      await recoverStaleActions();

      expect((await readRow(id)).status).toBe('pending');
      await expect(renewClaim(id, 'proc_A')).resolves.toBe(false);
    });

    it('a dead processor CAN still act without the ownership check (positive control)', async () => {
      // The old behavior, reproduced: act on the id the batch is holding, with no re-assertion.
      // If this ever stops succeeding, the tests above prove nothing.
      const id = await seedClaimed({
        processorId: 'proc_A', ageMs: STALE_AFTER_MS + 60_000, maxAttempts: 3,
      });
      await recoverStaleActions();

      const unguarded = await sequelize.query(
        "UPDATE scheduled_emails SET status = 'sent' WHERE id = :id RETURNING id",
        { replacements: { id }, type: QueryTypes.SELECT },
      );

      expect((unguarded as unknown[]).length).toBe(1);
      expect((await readRow(id)).status).toBe('sent');
    });
  });

  describe('recovery', () => {
    it('requeues a row that has an attempt left, spending one', async () => {
      const id = await seedClaimed({
        processorId: 'proc_A', ageMs: STALE_AFTER_MS + 1000, attemptsMade: 0, maxAttempts: 3,
      });

      const out = await recoverStaleActions();

      expect(out.requeued).toBe(1);
      expect(out.exhausted).toBe(0);
      const row = await readRow(id);
      expect(row.status).toBe('pending');
      expect(row.attempts_made).toBe(1);
      expect(row.processor_id).toBeNull();
    });

    it('fails a row whose last attempt was the one that hung', async () => {
      // max_attempts defaults to 1, so the common case is a row with no budget at all.
      const id = await seedClaimed({
        processorId: 'proc_A', ageMs: STALE_AFTER_MS + 1000, attemptsMade: 0, maxAttempts: 1,
      });

      const out = await recoverStaleActions();

      expect(out.exhausted).toBe(1);
      expect(out.requeued).toBe(0);
      const row = await readRow(id);
      expect(row.status).toBe('failed');
      expect(row.attempts_made).toBe(1);
    });

    it('leaves a row that is not yet stale alone', async () => {
      const id = await seedClaimed({
        processorId: 'proc_A', ageMs: STALE_AFTER_MS - 60_000, maxAttempts: 3,
      });

      const out = await recoverStaleActions();

      expect(out.ids).toEqual([]);
      const row = await readRow(id);
      expect(row.status).toBe('processing');
      expect(row.attempts_made).toBe(0);
      expect(row.processor_id).toBe('proc_A');
    });

    it('partitions a mixed batch, failing the spent rows and requeueing the rest', async () => {
      // Proves the two predicates really are disjoint against Postgres rather than by reading
      // them: every row must appear in exactly one of the two outcomes.
      const spent = await seedClaimed({
        processorId: 'proc_A', ageMs: STALE_AFTER_MS + 1000, attemptsMade: 2, maxAttempts: 3,
      });
      const alive = await seedClaimed({
        processorId: 'proc_A', ageMs: STALE_AFTER_MS + 1000, attemptsMade: 0, maxAttempts: 3,
      });

      const out = await recoverStaleActions();

      expect(out.exhausted).toBe(1);
      expect(out.requeued).toBe(1);
      expect(out.ids.sort()).toEqual([spent, alive].sort());
      expect((await readRow(spent)).status).toBe('failed');
      expect((await readRow(alive)).status).toBe('pending');
    });

    it('TERMINATES for a row that hangs every single time', async () => {
      // The bound, proved by a loop that ends. Each pass is one hung run: the row is re-claimed,
      // goes stale, and recovery takes it again. Without the attempt increment this loop runs out
      // of iterations with the row still claimable, which is the unbounded retry.
      const MAX_ATTEMPTS = 3;
      const id = await seedClaimed({
        processorId: 'proc_A', ageMs: STALE_AFTER_MS + 1000, attemptsMade: 0,
        maxAttempts: MAX_ATTEMPTS,
      });

      let passes = 0;
      const CEILING = MAX_ATTEMPTS + 5; // generous: the point is that it stops well before this
      while (passes < CEILING) {
        passes += 1;
        const out = await recoverStaleActions();
        if (out.exhausted > 0) break;

        // Re-claim it and let it go stale again, exactly as a hanging processor would.
        await sequelize.query(
          `UPDATE scheduled_emails
              SET status = 'processing', processor_id = 'proc_A',
                  processing_started_at = NOW() - make_interval(secs => :staleSecs)
            WHERE id = :id`,
          {
            replacements: { id, staleSecs: STALE_AFTER_MS / 1000 + 1 },
            type: QueryTypes.UPDATE,
          },
        );
      }

      expect(passes).toBeLessThan(CEILING);
      expect(passes).toBe(MAX_ATTEMPTS);
      const row = await readRow(id);
      expect(row.status).toBe('failed');
      expect(row.attempts_made).toBe(MAX_ATTEMPTS);
    });

    it('reports nothing to do as nothing to do', async () => {
      const out = await recoverStaleActions();

      expect(out).toEqual({ requeued: 0, exhausted: 0, ids: [] });
    });
  });
});
