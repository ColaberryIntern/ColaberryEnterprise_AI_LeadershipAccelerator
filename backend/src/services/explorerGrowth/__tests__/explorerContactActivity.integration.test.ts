/**
 * The contact-activity loader, against REAL Postgres.
 *
 * ## Why this suite has to exist
 *
 * The entire value of `explorerContactActivityService` is four SQL statements. The unit suite
 * mocks `sequelize.query`, so it can prove the TypeScript around them and the text of one
 * predicate, and it can prove nothing at all about whether the SQL is correct Postgres or
 * whether `jsonb_to_recordset` parses an offset timestamp the way the contract claims. A
 * substring assertion over SQL is the weak test this repo has been bitten by before.
 *
 * Everything below is behaviour: write a row, run the loader, read the row back.
 *
 * ## The claims
 *
 * - FORWARD-ONLY. A newer timestamp wins; an older one is ignored; an identical one is ignored.
 *   This is what makes a replay a no-op and stops a stale file returning somebody to the pool.
 * - THE LEARNER-SIDE COLUMN. `explorer_journey_profiles.last_contacted_at` moves and
 *   `leads.last_contacted_at` does not. These are two real columns and only the first is read
 *   by the suppression, so writing to the wrong one would succeed and change nothing.
 * - THE SHARED CONTACT ID. Production holds one `ghl_contact_id` attached to two leads
 *   (8254 ids, 8253 distinct, measured 2026-11-17). One row in, two profiles moved, and no
 *   "command cannot affect row a second time" error.
 * - OFFSETS ARE HONORED. `2026-11-17T15:04:00-06:00` and `2026-11-17T21:04:00Z` are the same
 *   instant, and the loader must agree.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name contactact-pg-test -p 55451:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=contactact_test \
 *     postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55451/contactact_test \
 *     npx jest -c jest.config.ts src/services/explorerGrowth/__tests__/explorerContactActivity.integration
 *
 *   docker rm -f contactact-pg-test
 *
 * With no `DATABASE_URL` the suite SKIPS AND SAYS SO. CI's `integration-tier` job discovers
 * every `*.integration.test.ts` under `backend/src` and gives each one its own database.
 *
 * It must never be pointed at production: the bootstrap below CREATEs and TRUNCATEs tables.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(300_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[explorerContactActivity.integration] SKIPPED: no DATABASE_URL. This suite needs a real '
    + 'Postgres; the docblock has the docker run and the exact command. It is NOT evidence that '
    + 'the forward-only write works unless it actually ran.',
  );
}

describeIfDb('recordContactActivity against real Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let recordContactActivity: typeof import('../explorerContactActivityService').recordContactActivity;

  const NOW = new Date('2026-11-18T12:00:00.000Z');
  const iso = (s: string) => new Date(s).toISOString();

  const explain = async <T>(what: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      // Jest renders a raw Sequelize error as an EMPTY failure body, so every call says what it was.
      throw new Error(`${what} failed: ${(err as Error).message}`);
    }
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ recordContactActivity } = await import('../explorerContactActivityService'));

    /**
     * Hand-written DDL, NOT `model.sync()`, and that is a deliberate trade.
     *
     * `ExplorerJourneyProfile` declares foreign keys to `enrollments` and `leads`, and
     * `enrollments` pulls in cohorts and program blueprints behind it - a widening chain, none
     * of which these four statements touch. What they DO touch is exactly the columns below,
     * and the types are the ones production actually has, verified against
     * `information_schema.columns` on 2026-11-17 rather than copied from the model file:
     *
     *   explorer_journey_profiles.enrollment_id      uuid                     NOT NULL
     *   explorer_journey_profiles.lead_id            integer                  NULL
     *   explorer_journey_profiles.last_contacted_at  timestamp with time zone NULL
     *   explorer_journey_profiles.updated_at         timestamp with time zone NOT NULL
     *   leads.id                                     integer
     *   leads.ghl_contact_id                         character varying
     *
     * `updated_at NOT NULL` is in the list on purpose: it is the column the UPDATE also sets,
     * and a nullable stand-in here would hide a statement that forgot it.
     *
     * `leads.last_contacted_at` is present because one test asserts the loader does NOT touch it.
     */
    await explain('creating leads', () => sequelize.query(
      `CREATE TABLE IF NOT EXISTS leads (
         id SERIAL PRIMARY KEY,
         ghl_contact_id VARCHAR(255),
         last_contacted_at TIMESTAMPTZ
       )`,
    ));
    await explain('creating explorer_journey_profiles', () => sequelize.query(
      `CREATE TABLE IF NOT EXISTS explorer_journey_profiles (
         enrollment_id UUID PRIMARY KEY,
         lead_id INTEGER,
         last_contacted_at TIMESTAMPTZ,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    ));
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('TRUNCATE explorer_journey_profiles, leads RESTART IDENTITY');
  });

  /** Seed one lead and the profile attached to it. Returns the profile's enrollment id. */
  async function seed(ghlContactId: string | null, lastContactedAt: string | null): Promise<string> {
    const [lead] = await sequelize.query<{ id: number }>(
      'INSERT INTO leads (ghl_contact_id) VALUES (:g) RETURNING id',
      { type: QueryTypes.SELECT, replacements: { g: ghlContactId } },
    );
    const [profile] = await sequelize.query<{ enrollment_id: string }>(
      `INSERT INTO explorer_journey_profiles (enrollment_id, lead_id, last_contacted_at)
       VALUES (gen_random_uuid(), :leadId, :ts) RETURNING enrollment_id`,
      { type: QueryTypes.SELECT, replacements: { leadId: lead.id, ts: lastContactedAt } },
    );
    return profile.enrollment_id;
  }

  const readProfile = async (enrollmentId: string) => (await sequelize.query<{ last_contacted_at: Date | null; updated_at: Date }>(
    'SELECT last_contacted_at, updated_at FROM explorer_journey_profiles WHERE enrollment_id = :id',
    { type: QueryTypes.SELECT, replacements: { id: enrollmentId } },
  ))[0];

  describe('the basic write', () => {
    it('sets a timestamp on a profile that had none', async () => {
      const e = await seed('C1', null);
      const result = await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' }], NOW);

      expect(result).toMatchObject({ received: 1, matched: 1, unmatched: 0, written: 1, unchanged: 0, rejected_future: 0 });
      expect((await readProfile(e)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
    });

    it('also moves updated_at, so the row does not look untouched', async () => {
      const e = await seed('C1', null);
      await sequelize.query(
        "UPDATE explorer_journey_profiles SET updated_at = '2020-01-01T00:00:00Z' WHERE enrollment_id = :id",
        { replacements: { id: e } },
      );
      await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' }], NOW);
      expect((await readProfile(e)).updated_at.getUTCFullYear()).toBeGreaterThan(2020);
    });
  });

  describe('forward-only, which is what makes a replay safe', () => {
    it('a NEWER timestamp overwrites', async () => {
      const e = await seed('C1', '2026-11-10T00:00:00Z');
      const r = await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' }], NOW);
      expect(r.written).toBe(1);
      expect((await readProfile(e)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
    });

    it('an OLDER timestamp is ignored and the stored value does not move', async () => {
      // The harm this prevents: a stale or re-sent file dragging someone's contact time
      // backwards, out of the seven-day window, and back into Rose's list early.
      const e = await seed('C1', '2026-11-17T21:04:00Z');
      const r = await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-10T00:00:00Z' }], NOW);
      expect(r).toMatchObject({ matched: 1, written: 0, unchanged: 1 });
      expect((await readProfile(e)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
    });

    it('an IDENTICAL timestamp writes nothing, so a replay is a true no-op', async () => {
      const e = await seed('C1', '2026-11-17T21:04:00Z');
      const before = (await readProfile(e)).updated_at.toISOString();
      const r = await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' }], NOW);
      expect(r).toMatchObject({ matched: 1, written: 0, unchanged: 1 });
      // updated_at untouched too: nothing about the row changed.
      expect((await readProfile(e)).updated_at.toISOString()).toBe(before);
    });

    it('running the SAME batch twice writes on the first pass and nothing on the second', async () => {
      await seed('C1', null);
      const rows = [{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' }];
      expect((await recordContactActivity(rows, NOW)).written).toBe(1);
      expect(await recordContactActivity(rows, NOW)).toMatchObject({ matched: 1, written: 0, unchanged: 1 });
    });
  });

  describe('the two columns named last_contacted_at', () => {
    it('moves the LEARNER-side column and leaves the CRM-side one alone', async () => {
      // On production the CRM-side column is set on 99 of 25,568 leads, newest 22 June 2026, and
      // on zero rows of the current pool. The suppression never reads it. Writing there would
      // have looked like success and changed nothing, so this test pins which column moves.
      const e = await seed('C1', null);
      await sequelize.query("UPDATE leads SET last_contacted_at = '2026-06-22T23:00:55Z' WHERE ghl_contact_id = 'C1'");

      await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' }], NOW);

      expect((await readProfile(e)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
      const [lead] = await sequelize.query<{ last_contacted_at: Date }>(
        "SELECT last_contacted_at FROM leads WHERE ghl_contact_id = 'C1'",
        { type: QueryTypes.SELECT },
      );
      expect(lead.last_contacted_at.toISOString()).toBe(iso('2026-06-22T23:00:55Z'));
    });
  });

  describe('collisions the production data actually contains', () => {
    it('ONE contact id on TWO leads moves BOTH profiles, without a cardinality error', async () => {
      const a = await seed('Cshared', null);
      const b = await seed('Cshared', null);
      const r = await recordContactActivity([{ ghl_contact_id: 'Cshared', last_connected_call_at: '2026-11-17T21:04:00Z' }], NOW);

      expect(r.matched).toBe(1);   // contact ids
      expect(r.written).toBe(2);   // profiles
      expect(r.unchanged).toBe(0);
      expect((await readProfile(a)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
      expect((await readProfile(b)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
    });

    it('the SAME contact twice in one batch takes the LATER call', async () => {
      // Postgres would otherwise raise "command cannot affect row a second time"; the
      // MAX(ts) GROUP BY in the statement is what prevents it, and this proves the choice is
      // the later timestamp rather than whichever row happened to sort first.
      const e = await seed('C1', null);
      const r = await recordContactActivity([
        { ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T09:00:00Z' },
        { ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' },
      ], NOW);
      expect(r.written).toBe(1);
      expect((await readProfile(e)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
    });

    it('the same contact twice in REVERSE order still takes the later call', async () => {
      const e = await seed('C1', null);
      await recordContactActivity([
        { ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' },
        { ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T09:00:00Z' },
      ], NOW);
      expect((await readProfile(e)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
    });
  });

  describe('timestamps with an offset', () => {
    it('treats -06:00 and the equivalent Z as the same instant', async () => {
      const e = await seed('C1', '2026-11-17T21:04:00Z');
      // 15:04 Central is 21:04 UTC: the same instant, so forward-only must refuse it.
      const r = await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T15:04:00-06:00' }], NOW);
      expect(r).toMatchObject({ matched: 1, written: 0, unchanged: 1 });
      expect((await readProfile(e)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
    });

    it('CONTROL: one minute later in the SAME offset does write', async () => {
      // Without this, the test above would also pass if offsets were being dropped entirely.
      const e = await seed('C1', '2026-11-17T21:04:00Z');
      const r = await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T15:05:00-06:00' }], NOW);
      expect(r.written).toBe(1);
      expect((await readProfile(e)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:05:00Z'));
    });
  });

  describe('rows that reach nothing', () => {
    it('reports an unknown contact id as unmatched and writes nothing', async () => {
      await seed('C1', null);
      const r = await recordContactActivity([{ ghl_contact_id: 'CNOPE', last_connected_call_at: '2026-11-17T21:04:00Z' }], NOW);
      expect(r).toMatchObject({ received: 1, matched: 0, unmatched: 1, written: 0 });
      expect(r.unmatched_ghl_contact_ids).toEqual(['CNOPE']);
    });

    it('a lead with NO ghl_contact_id is unreachable, which is the 16 of 192 seen on production', async () => {
      await seed(null, null);
      const r = await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' }], NOW);
      expect(r.matched).toBe(0);
      expect(r.unmatched).toBe(1);
    });

    it('a lead with no PROFILE is unmatched, not a crash', async () => {
      await sequelize.query("INSERT INTO leads (ghl_contact_id) VALUES ('CORPHAN')");
      const r = await recordContactActivity([{ ghl_contact_id: 'CORPHAN', last_connected_call_at: '2026-11-17T21:04:00Z' }], NOW);
      expect(r).toMatchObject({ matched: 0, unmatched: 1, written: 0 });
    });

    it('splits a mixed batch correctly', async () => {
      const hit = await seed('C1', null);
      await seed('C2', '2026-11-17T23:00:00Z'); // already newer: matched, unchanged
      const r = await recordContactActivity([
        { ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' },
        { ghl_contact_id: 'C2', last_connected_call_at: '2026-11-17T21:04:00Z' },
        { ghl_contact_id: 'CNOPE', last_connected_call_at: '2026-11-17T21:04:00Z' },
      ], NOW);

      expect(r).toMatchObject({ received: 3, matched: 2, unmatched: 1, written: 1, unchanged: 1 });
      expect((await readProfile(hit)).last_contacted_at?.toISOString()).toBe(iso('2026-11-17T21:04:00Z'));
    });
  });

  describe('the future-timestamp rule, end to end', () => {
    it('never lets a future value reach the database', async () => {
      // A far-future timestamp would suppress that person permanently, because
      // `last_contacted_at < NOW() - 7 days` could never become true again.
      const e = await seed('C1', null);
      const r = await recordContactActivity([{ ghl_contact_id: 'C1', last_connected_call_at: '2099-01-01T00:00:00Z' }], NOW);
      expect(r.rejected_future).toBe(1);
      expect((await readProfile(e)).last_contacted_at).toBeNull();
    });
  });

  describe('a realistic batch', () => {
    it('loads 250 rows in one call and moves exactly the right profiles', async () => {
      // Kes's agreed first push is the trailing 14 days, which he measured at 378 connected
      // calls. This is that order of magnitude against the real statement, not a mock.
      const ids = Array.from({ length: 250 }, (_, i) => `C${i}`);
      for (const id of ids) await seed(id, null);
      // Half already hold a newer timestamp, so they must come back as unchanged.
      await sequelize.query(
        `UPDATE explorer_journey_profiles SET last_contacted_at = '2026-11-18T00:00:00Z'
          WHERE lead_id IN (SELECT id FROM leads WHERE ghl_contact_id IN (:ids))`,
        { replacements: { ids: ids.slice(0, 125) } },
      );

      const r = await recordContactActivity(
        ids.map((id) => ({ ghl_contact_id: id, last_connected_call_at: '2026-11-17T21:04:00Z' })),
        NOW,
      );

      expect(r).toMatchObject({ received: 250, matched: 250, unmatched: 0, written: 125, unchanged: 125 });
    });
  });
});
