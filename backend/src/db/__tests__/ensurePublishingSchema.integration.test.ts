/**
 * OPT-IN INTEGRATION TEST — proves the idempotency constraints actually REJECT a duplicate.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────────────
 *
 * T005's acceptance criterion was "a test proves a duplicate idempotency key is rejected by
 * the unique constraint". The unit suites do not prove that. `modelParity` regex-matches
 * `CREATE UNIQUE INDEX` in the DDL string, and the post-condition suite proves a MISSING index
 * is detected at boot. Both are useful; neither exercises a constraint. Review flagged the
 * gap, and more importantly flagged that it had not been disclosed — the record read as
 * though the criterion was met.
 *
 * A regex over DDL text proves the statement was written. It cannot prove Postgres accepted
 * it, that the index applies to the columns intended, or that a second insert is refused.
 * Only a database can.
 *
 * ── Why it is opt-in rather than part of the default gate ─────────────────────────────
 *
 * `backend/jest.ci.config.ts` documents at length why DB-touching suites are excluded from
 * CI: there is no Postgres service container in the workflow, and a permanently-red gate is
 * one somebody eventually deletes. CLAUDE.md's Testing rules explicitly sanction integration
 * tests behind an env flag, which is exactly what this is.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts ensurePublishingSchema.integration
 *
 * With no DATABASE_URL it SKIPS rather than passing vacuously — a skipped test reports as
 * skipped, whereas a test that silently returns early reports as passed and is worse than
 * none at all.
 *
 * It writes only to `publishing_jobs`, only rows it created, and deletes them in `afterEach`
 * whether the assertion passed or failed. It must never be pointed at production; the same
 * rule the rest of this repo's integration guidance states.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb('ensurePublishingSchema — idempotency constraints (requires DATABASE_URL)', () => {
  let sequelize: any;
  let ensurePublishingSchema: any;
  const createdIds: string[] = [];

  const TENANT = '11111111-1111-4111-8111-111111111111';
  const ITEM = '22222222-2222-4222-8222-222222222222';
  const ACCOUNT = '33333333-3333-4333-8333-333333333333';

  beforeAll(async () => {
    ({ sequelize } = await import('../../config/database'));
    ({ ensurePublishingSchema } = await import('../ensurePublishingSchema'));
    // The content tables are FK parents of publishing_jobs, so they must exist first.
    const { ensureContentOsSchema } = await import('../ensureContentOsSchema');
    await ensureContentOsSchema();
    const result = await ensurePublishingSchema();
    // If the schema itself did not land, every assertion below would be meaningless.
    expect(result.missingIndexes).toEqual([]);

    await sequelize.query(
      `INSERT INTO content_items (id, tenant_id, title)
       VALUES (:id, :tenant, 'integration fixture')
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { id: ITEM, tenant: TENANT } },
    );
  });

  afterEach(async () => {
    if (createdIds.length === 0) return;
    await sequelize.query('DELETE FROM publishing_jobs WHERE id IN (:ids)', {
      replacements: { ids: createdIds },
    });
    createdIds.length = 0;
  });

  afterAll(async () => {
    await sequelize.query('DELETE FROM content_items WHERE id = :id', { replacements: { id: ITEM } });
  });

  async function insertJob(overrides: Record<string, unknown> = {}): Promise<string> {
    const id = `${Math.random().toString(16).slice(2, 10)}-0000-4000-8000-000000000000`;
    const row = {
      id,
      tenant_id: TENANT,
      content_item_id: ITEM,
      channel_account_id: ACCOUNT,
      provider: 'linkedin',
      publish_at: new Date().toISOString(),
      scheduled_occurrence: '2026-09-10T09:00:00Z',
      content_revision: 1,
      idempotency_key: 'key-alpha',
      ...overrides,
    };
    await sequelize.query(
      `INSERT INTO publishing_jobs
         (id, tenant_id, content_item_id, channel_account_id, provider, publish_at,
          scheduled_occurrence, content_revision, idempotency_key)
       VALUES (:id, :tenant_id, :content_item_id, :channel_account_id, :provider, :publish_at,
               :scheduled_occurrence, :content_revision, :idempotency_key)`,
      { replacements: row },
    );
    createdIds.push(id);
    return id;
  }

  it('accepts the first job', async () => {
    await expect(insertJob()).resolves.toBeTruthy();
  });

  it('REJECTS a second job with the same idempotency_key', async () => {
    // Guard 1: the application-level key. This is the criterion T005 was set.
    await insertJob({ idempotency_key: 'key-duplicate' });
    await expect(insertJob({ idempotency_key: 'key-duplicate' }))
      .rejects.toThrow(/unique|duplicate key/i);
  });

  it('REJECTS a second job with the same (item, revision, account, occurrence)', async () => {
    // Guard 2: the semantic key. Distinct idempotency keys, so guard 1 does NOT fire — this
    // is the case that catches a bug in whatever computes guard 1.
    await insertJob({ idempotency_key: 'key-sem-1', scheduled_occurrence: 'slot-A' });
    await expect(insertJob({ idempotency_key: 'key-sem-2', scheduled_occurrence: 'slot-A' }))
      .rejects.toThrow(/unique|duplicate key/i);
  });

  it('ALLOWS a later content revision for the same account and slot', async () => {
    // Publishing revision 3 after revision 2 already went out is a legitimately different
    // job, not a duplicate. If the semantic key omitted content_revision this would fail.
    await insertJob({ idempotency_key: 'key-rev-1', scheduled_occurrence: 'slot-B', content_revision: 1 });
    await expect(
      insertJob({ idempotency_key: 'key-rev-2', scheduled_occurrence: 'slot-B', content_revision: 2 }),
    ).resolves.toBeTruthy();
  });

  it('does NOT constrain the semantic key while channel_account_id is NULL', async () => {
    // Documents the known consequence of the partial index rather than pretending otherwise:
    // the semantic guard is DORMANT while T003 is gated and every row has a null account.
    // Without the partial predicate the index would exist and be equally useless, since NULLs
    // are distinct in a unique index — so this asserts the real behaviour, and will need
    // revisiting when T003 lands.
    await insertJob({ idempotency_key: 'key-null-1', channel_account_id: null, scheduled_occurrence: 'slot-C' });
    await expect(
      insertJob({ idempotency_key: 'key-null-2', channel_account_id: null, scheduled_occurrence: 'slot-C' }),
    ).resolves.toBeTruthy();
  });
});
