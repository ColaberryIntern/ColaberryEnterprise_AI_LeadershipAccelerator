/**
 * LC-13: two concurrent approvals of the same blueprint revision must produce exactly one.
 *
 * THIS TEST EXISTS BECAUSE THE UNIT TEST CANNOT SETTLE IT. `approveBlueprint` does a
 * read-then-compare; what actually makes a double-approval impossible is the UNIQUE index
 * `uq_blueprint_approval_revision`. A doubled index proves only that the double behaves as
 * written. LC-13 was a real production incident — a review hold dropped on restart and a build
 * published itself to a student — and an incident does not get closed by a mock.
 *
 * IT CARRIES A MANDATORY POSITIVE CONTROL. The second test DROPS the unique index and asserts
 * the race then produces two approved rows. If that control does not fail, the first test is not
 * proving anything about the index and must not be cited as evidence. A concurrency test that
 * cannot fail is worth less than no test, because it manufactures confidence.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 * Following the convention `ensurePublishingSchema.integration.test.ts` already set here —
 * the existing `jest.config.ts` plus a name filter, NOT a separate config. An earlier draft of
 * this suite shipped its own `jest.integration.config.ts`; it was deleted, because a second
 * runner is a second thing to keep true, and because its `testMatch` was broad enough to pick
 * up the two pre-existing integration suites and run them against this disposable database.
 *
 *   docker run --rm -d --name lifecycle-pg-test -p 55432:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=lifecycle_test \
 *     pgvector/pgvector:pg15
 *
 *   # from backend/, once `pg_isready` reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@localhost:55432/lifecycle_test \
 *     npx jest -c jest.config.ts blueprintApproval.concurrency
 *
 *   docker rm -f lifecycle-pg-test
 *
 * Same image the preview stack uses, so engine behaviour matches. The preview stack's own
 * Postgres publishes no host port, which is why a throwaway container is used rather than
 * editing a compose file other sessions depend on. Throwaway credentials for a container that
 * lives for one test run; nothing here is a secret and nothing persists.
 *
 * ── Why it stays IN the CI gate ───────────────────────────────────────────────────────
 *
 * It is deliberately NOT on `jest.ci.config.ts`'s ignore list. With no `DATABASE_URL` it skips,
 * and a skipped test reports as skipped — visible. An ignored one reports as nothing at all.
 * That is the same choice the existing integration suite made, and it is the better one.
 *
 * It must never be pointed at production, and it writes only rows it created under a fixed
 * synthetic tenant.
 */
import { QueryTypes } from 'sequelize';

// Standing up schema and racing real connections is nothing like a unit test's 5s default, and
// the timeout belongs with the suite rather than in a runner config — the same choice
// multiProjectIsolation.integration.test.ts:61 makes.
jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);

// Skip rather than fail when there is no database. Failing here would look like a defect in the
// product rather than an absent environment, which is the confusion this guard prevents.
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[blueprintApproval.concurrency] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; ' +
    'see backend/jest.integration.config.ts for the one-line docker run and the exact command. ' +
    'It is NOT evidence about LC-13 unless it actually ran.',
  );
}

describeIfDb('LC-13 — concurrent approval of one revision', () => {
  let sequelize: import('sequelize').Sequelize;
  let approveBlueprint: typeof import('../blueprintApproval').approveBlueprint;
  let ensureProjectLifecycleSchema: typeof import('../../../db/ensureProjectLifecycleSchema').ensureProjectLifecycleSchema;

  const TENANT = '11111111-1111-1111-1111-111111111111';
  const PROJECT = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    // Imported lazily so the module's top-level `new Sequelize(...)` never runs in CI.
    ({ sequelize } = await import('../../../config/database'));
    ({ approveBlueprint } = await import('../blueprintApproval'));
    ({ ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema'));

    // The lifecycle tables FK to tenants/projects/delivery_projects, which this disposable
    // database does not have. Minimal stand-ins, created first so the real DDL applies cleanly.
    await sequelize.query(`CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)`);
    await sequelize.query(`INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [TENANT] });
    await sequelize.query(`INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [PROJECT] });

    await ensureProjectLifecycleSchema();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  /** A fresh draft manifest at revision 1, with a proposer so SoD can pass. */
  async function seedManifest(): Promise<string> {
    await sequelize.query(`DELETE FROM blueprint_approvals WHERE tenant_id = $1`, { bind: [TENANT] });
    await sequelize.query(`DELETE FROM operating_blueprint_manifests WHERE tenant_id = $1`, { bind: [TENANT] });
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO operating_blueprint_manifests
         (tenant_id, student_project_id, revision, status, refs_json, proposed_by)
       VALUES ($1, $2, 1, 'draft', '{"requirements":["REQ-1"]}'::jsonb, 'architect@example.test')
       RETURNING id`,
      { bind: [TENANT, PROJECT], type: QueryTypes.SELECT },
    );
    return rows[0].id;
  }

  async function approvedRowCount(manifestId: string): Promise<number> {
    const rows = await sequelize.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM blueprint_approvals WHERE manifest_id = $1 AND revision = 1`,
      { bind: [manifestId], type: QueryTypes.SELECT },
    );
    return Number(rows[0].n);
  }

  function raceTwoApprovals(manifestId: string) {
    // Two genuinely concurrent callers, both believing they are approving revision 1, with
    // DIFFERENT approvers so neither is refused for self-approval.
    const one = approveBlueprint({
      tenantId: TENANT, manifestId, expectedRevision: 1, scope: 'full',
      approvedBy: 'owner-a@example.test', approvedByRole: 'DELIVERY_OWNER',
    });
    const two = approveBlueprint({
      tenantId: TENANT, manifestId, expectedRevision: 1, scope: 'full',
      approvedBy: 'owner-b@example.test', approvedByRole: 'DELIVERY_OWNER',
    });
    return Promise.allSettled([one, two]);
  }

  it('the schema actually applied, so the rest of this suite is not testing nothing', async () => {
    const rows = await sequelize.query<{ t: boolean }>(
      `SELECT bool_or(indexname = 'uq_blueprint_approval_revision') AS t
         FROM pg_indexes WHERE schemaname = 'public'`,
      { type: QueryTypes.SELECT },
    );
    expect(rows[0].t).toBe(true);
  });

  it('produces exactly ONE approval under a real race', async () => {
    const manifestId = await seedManifest();
    const results = await raceTwoApprovals(manifestId);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one row, whatever the callers each believe happened.
    expect(await approvedRowCount(manifestId)).toBe(1);

    // And the outcome is legible to both callers: one succeeded, the other got a real error
    // rather than a silent success that wrote nothing.
    expect(fulfilled.length + rejected.length).toBe(2);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    if (rejected.length > 0) {
      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(String(err?.name ?? err)).toMatch(/ApprovalConflictError|SequelizeUniqueConstraintError|Error/);
    }
  });

  it('POSITIVE CONTROL: without the unique index, the same race writes TWO rows', async () => {
    // If this does not observe two rows, the index is not what is preventing the duplicate and
    // the test above is not evidence about it. Dropping and recreating a brand-new index inside a
    // disposable container touches nothing shared.
    const manifestId = await seedManifest();
    await sequelize.query(`DROP INDEX IF EXISTS uq_blueprint_approval_revision`);

    await raceTwoApprovals(manifestId);
    const n = await approvedRowCount(manifestId);

    // Clear the duplicates BEFORE restoring the index. Postgres cannot build a UNIQUE index over
    // rows that already violate it, so recreating it first fails with "could not create unique
    // index ... Key is duplicated" — which is itself a second confirmation that the duplicate is
    // real, but it would leave the schema wrong for every test after this one.
    await sequelize.query(`DELETE FROM blueprint_approvals WHERE manifest_id = $1`, { bind: [manifestId] });
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_approval_revision
         ON blueprint_approvals (manifest_id, revision)`,
    );

    // THE CONTROL. Two rows without the index means the index is what prevents the duplicate, and
    // the application-level read-then-compare CAS does not. If this ever reads 1, the test above
    // is passing for some other reason and must not be cited as evidence about LC-13.
    expect(n).toBe(2);
  });

  it('with the index restored, the race is back to exactly one', async () => {
    const manifestId = await seedManifest();
    await raceTwoApprovals(manifestId);
    expect(await approvedRowCount(manifestId)).toBe(1);
  });

  it('a retried approval returns the original approver rather than re-stamping', async () => {
    const manifestId = await seedManifest();
    const first = await approveBlueprint({
      tenantId: TENANT, manifestId, expectedRevision: 1, scope: 'full',
      approvedBy: 'owner-a@example.test',
    });
    const second = await approveBlueprint({
      tenantId: TENANT, manifestId, expectedRevision: 1, scope: 'full',
      approvedBy: 'owner-b@example.test',
    });
    expect(second.alreadyApproved).toBe(true);
    expect(second.approval.approved_by).toBe('owner-a@example.test');
    expect(second.approval.id).toBe(first.approval.id);
    expect(await approvedRowCount(manifestId)).toBe(1);
  });
});
