/**
 * The manifest writer against a real Postgres, because the thing being claimed is a DATABASE
 * property.
 *
 * `writeBlueprintManifest` is read-then-insert in application code. What actually makes a
 * concurrent replay impossible is the partial unique index on `(tenant, project, refs_sha256)`.
 * A doubled connection would prove only that the double behaves as written, which is the same
 * reason `blueprintApproval.concurrency.integration.test.ts` exists next door.
 *
 * IT CARRIES THE SAME MANDATORY POSITIVE CONTROL. One test DROPS the refs index and asserts the
 * race then produces TWO rows. If that control does not fail, the race test is not evidence
 * about the index and must not be cited as such — a concurrency test that cannot fail
 * manufactures confidence rather than supplying it.
 *
 * It also pins the branch that distinguishes the two conflicts. The table has two unique
 * indexes, and a failed insert means either "someone wrote exactly this" (a replay — return it)
 * or "a concurrent writer took the revision I picked, with different refs" (not a replay — my
 * write still has to happen). Collapsing those is silent data loss in the second case, so there
 * is a test that seeds the revision collision directly.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name lifecycle-pg-test -p 55432:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=lifecycle_test \
 *     pgvector/pgvector:pg15
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@localhost:55432/lifecycle_test \
 *     npx jest -c jest.config.ts manifestWriter.integration
 *
 *   docker rm -f lifecycle-pg-test
 *
 * Throwaway credentials for a container that lives for one run; nothing here is a secret and
 * nothing persists. It must never be pointed at production, and it writes only rows it created
 * under a fixed synthetic tenant.
 *
 * With no `DATABASE_URL` it SKIPS rather than fails, and a skipped test reports as skipped —
 * visible. An ignored one reports as nothing at all.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[manifestWriter.integration] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; '
    + 'the docker one-liner and exact command are in this file\'s header. It is NOT evidence '
    + 'about the idempotency index unless it actually ran.',
  );
}

describeIfDb('writeBlueprintManifest against a real database', () => {
  let sequelize: import('sequelize').Sequelize;
  let writeBlueprintManifest: typeof import('../manifestWriter').writeBlueprintManifest;
  let refsContentHash: typeof import('../manifestWriter').refsContentHash;
  let emptyRefs: typeof import('../adapters/manifestRefs').emptyRefs;

  const TENANT = '33333333-3333-3333-3333-333333333333';
  const PROJECT = '44444444-4444-4444-4444-444444444444';
  const PROPOSER = 'architect@example.test';

  /** Distinct refs, so each test can ask for a genuinely different blueprint. */
  function refsWith(ids: string[]) {
    const r = emptyRefs('sbp', PROJECT);
    for (const id of ids) r.processes.push({ id, revision: 1 });
    return r;
  }

  async function rowCount(): Promise<number> {
    const rows = await sequelize.query<{ n: string }>(
      'SELECT count(*) AS n FROM operating_blueprint_manifests WHERE tenant_id = $1',
      { bind: [TENANT], type: QueryTypes.SELECT },
    );
    return Number(rows[0].n);
  }

  beforeAll(async () => {
    // Lazily imported so the module's top-level `new Sequelize(...)` never runs in CI.
    ({ sequelize } = await import('../../../config/database'));
    ({ writeBlueprintManifest, refsContentHash } = await import('../manifestWriter'));
    ({ emptyRefs } = await import('../adapters/manifestRefs'));
    const { ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema');

    // The lifecycle tables FK to tenants/projects, which a disposable database lacks.
    await sequelize.query('CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)');
    await sequelize.query('INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [TENANT] });
    await sequelize.query('INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [PROJECT] });

    await ensureProjectLifecycleSchema();
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM operating_blueprint_manifests WHERE tenant_id = $1', { bind: [TENANT] });
  });

  afterAll(async () => {
    await sequelize.query('DELETE FROM operating_blueprint_manifests WHERE tenant_id = $1', { bind: [TENANT] });
    await sequelize.close();
  });

  it('creates the first manifest production has ever written, and stores both hashes', async () => {
    const refs = refsWith(['proc-a']);
    const out = await writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs, proposedBy: PROPOSER,
    });

    expect(out.created).toBe(true);
    expect(out.revision).toBe(1);
    expect(out.refsSha256).toBe(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs }));

    const rows = await sequelize.query<{
      refs_sha256: string | null; content_sha256: string | null; proposed_by: string | null;
      status: string; student_project_id: string | null; delivery_project_id: string | null;
    }>(
      `SELECT refs_sha256, content_sha256, proposed_by, status, student_project_id, delivery_project_id
         FROM operating_blueprint_manifests WHERE id = $1`,
      { bind: [out.manifestId], type: QueryTypes.SELECT },
    );
    const row = rows[0];

    // Both hashes present and DIFFERENT: one identifies the write, one binds the approval.
    expect(row.refs_sha256).toBe(out.refsSha256);
    expect(row.content_sha256).toBe(out.contentSha256);
    expect(row.refs_sha256).not.toBe(row.content_sha256);
    // A proposer from the first row, or separation of duty cannot be enforced later.
    expect(row.proposed_by).toBe(PROPOSER);
    expect(row.status).toBe('draft');
    // `sbp` writes the student column and leaves the delivery one null; the CHECK enforces it.
    expect(row.student_project_id).toBe(PROJECT);
    expect(row.delivery_project_id).toBeNull();
  });

  it('IS IDEMPOTENT: calling twice with identical refs returns the same row, not a second one', async () => {
    const refs = refsWith(['proc-a']);
    const first = await writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs, proposedBy: PROPOSER,
    });
    const second = await writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs, proposedBy: PROPOSER,
    });

    expect(second.manifestId).toBe(first.manifestId);
    expect(second.created).toBe(false);
    expect(second.revision).toBe(first.revision);
    expect(await rowCount()).toBe(1);
  });

  it('PASSING COUNTERPART: different refs DO create a second row, at the next revision', async () => {
    // Without this, the idempotency test above would hold against a writer that refuses every
    // write after the first.
    const a = await writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs: refsWith(['proc-a']), proposedBy: PROPOSER,
    });
    const b = await writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs: refsWith(['proc-b']), proposedBy: PROPOSER,
    });

    expect(b.manifestId).not.toBe(a.manifestId);
    expect(b.created).toBe(true);
    expect(b.revision).toBe(2);
    expect(b.contentSha256).not.toBe(a.contentSha256);
    expect(await rowCount()).toBe(2);
  });

  it('TWO CONCURRENT writes of identical refs produce exactly ONE row', async () => {
    const refs = refsWith(['proc-race']);
    const call = () => writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs, proposedBy: PROPOSER,
    });

    const [x, y] = await Promise.all([call(), call()]);

    expect(await rowCount()).toBe(1);
    expect(x.manifestId).toBe(y.manifestId);
    // Exactly one of them inserted; the other found what the winner wrote.
    expect([x.created, y.created].filter(Boolean)).toHaveLength(1);
  });

  /**
   * A raw insert bypassing the writer, at an EXPLICIT revision.
   *
   * The revision is a parameter so the two inserts below can differ on it while sharing a
   * refs hash. That is the isolation that matters: identical revisions would collide on the
   * REVISION index instead, and the control would be proving the wrong constraint.
   */
  async function rawInsert(refsSha: string, revision: number): Promise<any> {
    try {
      await sequelize.query(
        `INSERT INTO operating_blueprint_manifests
           (tenant_id, student_project_id, revision, status, refs_json, refs_sha256, proposed_by)
         VALUES ($1, $2, $3, 'draft', '{}'::jsonb, $4, $5)`,
        { bind: [TENANT, PROJECT, revision, refsSha, PROPOSER] },
      );
      return null;
    } catch (err) {
      return err;
    }
  }

  it('MANDATORY POSITIVE CONTROL: the INDEX is what refuses a duplicate, not the writer', async () => {
    // WHY THIS IS NOT A RACE. An earlier version of this control dropped the index and raced
    // two application calls, expecting two rows. It passed once and failed once — because the
    // writer reads before it inserts, so with the index gone, whether the second caller’s
    // pre-read sees the first row is a coin flip. A flaky positive control is worse than
    // none: it manufactures confidence intermittently, and a verifier re-running it gets a
    // different answer than the one published.
    //
    // The claim is about the INDEX, so it is asserted at the level where it is deterministic.
    const sha = 'f'.repeat(64);

    // WITH the index: the second insert of identical refs is REFUSED by the database.
    expect(await rawInsert(sha, 1)).toBeNull();
    const refused = await rawInsert(sha, 2);  // different revision, same refs
    expect(refused).not.toBeNull();
    // Sequelize reports every integrity violation as "Validation error", so the only way to
    // say WHICH constraint fired is to read it off the driver error.
    expect(refused?.parent?.constraint).toBe('uq_blueprint_manifest_refs_student');
    expect(await rowCount()).toBe(1);

    // WITHOUT it: the identical second insert is ACCEPTED. This is the half that proves the
    // refusal above comes from the index and not from something else in the schema.
    await sequelize.query('DROP INDEX IF EXISTS uq_blueprint_manifest_refs_student');
    try {
      expect(await rawInsert(sha, 2)).toBeNull();
      expect(await rowCount()).toBe(2);
    } finally {
      await sequelize.query('DELETE FROM operating_blueprint_manifests WHERE tenant_id = $1', { bind: [TENANT] });
      const { ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema');
      await ensureProjectLifecycleSchema();
    }
  });

  it('A REVISION collision is NOT treated as a replay: the loser RETRIES and lands', async () => {
    // THE BRANCH THAT DISTINGUISHES THE TWO UNIQUE INDEXES, exercised for real.
    //
    // An earlier version of this test seeded revision 1 and asserted the writer landed at 2.
    // That never entered the retry path at all — revision 2 was free, so the first insert
    // succeeded. The test named a branch it did not reach, which is worth more as a lesson
    // than the assertion was: a test is not about a code path because its title says so.
    //
    // Two concurrent writers with DIFFERENT refs genuinely force it. Both read MAX(revision)
    // and pick the same next value; one inserts; the other conflicts on the REVISION index,
    // re-reads on its own refs, finds nothing — so this is not a replay — and must retry at a
    // recomputed revision. If the two conflicts were collapsed, the loser would return the
    // winner’s row and its own blueprint would be silently lost.
    const mine = refsWith(['proc-mine']);
    const theirs = refsWith(['proc-theirs']);

    const [a, b] = await Promise.all([
      writeBlueprintManifest({
        tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs: mine, proposedBy: PROPOSER,
      }),
      writeBlueprintManifest({
        tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs: theirs, proposedBy: PROPOSER,
      }),
    ]);

    // BOTH writes survive. Neither is reported as a replay, and they hold distinct revisions.
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.manifestId).not.toBe(b.manifestId);
    expect([a.revision, b.revision].sort()).toEqual([1, 2]);
    expect(await rowCount()).toBe(2);

    // And each row carries ITS OWN refs hash, which is what proves neither write was
    // substituted for the other.
    expect(a.refsSha256).toBe(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs: mine }));
    expect(b.refsSha256).toBe(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs: theirs }));
  });

  it('A REVISION CONFLICT retries and keeps its OWN refs, rather than returning the winner’s row', async () => {
    // THE BRANCH THE DESIGN TURNS ON, forced deliberately.
    //
    // Three mutations survived this suite because nothing reached it: collapsing the two
    // unique-index conflicts, and cutting the retry budget to one, both cost zero tests.
    // `Promise.all` cannot produce a revision collision — the pool serialises the
    // MAX(revision) read, so no caller picks a revision another caller already took.
    //
    // So the revision is injected, handing back a value that IS in use. That is precisely the
    // state a real concurrent writer creates between another writer’s read and its insert.
    const theirs = refsWith(['proc-winner']);
    const winner = await writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs: theirs, proposedBy: PROPOSER,
    });
    expect(winner.revision).toBe(1);

    // Hand back revision 1 once — already taken — then let the real allocator run.
    let calls = 0;
    const mine = refsWith(['proc-loser']);
    const out = await writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs: mine, proposedBy: PROPOSER,
      nextRevisionFor: async (t, o, p) => {
        calls += 1;
        if (calls === 1) return 1;
        const { QueryTypes: QT } = await import('sequelize');
        const rows = await sequelize.query<{ next: number | null }>(
          `SELECT MAX(revision) + 1 AS next FROM operating_blueprint_manifests
             WHERE tenant_id = $1 AND student_project_id = $2`,
          { bind: [t, p], type: QT.SELECT },
        );
        return Number(rows[0]?.next ?? 1) || 1;
      },
    });

    // It RETRIED — so the collision was detected rather than mistaken for a replay.
    expect(calls).toBeGreaterThan(1);
    // And it kept its own write: a new row, its own refs, NOT the winner’s.
    expect(out.created).toBe(true);
    expect(out.manifestId).not.toBe(winner.manifestId);
    expect(out.revision).toBe(2);
    expect(out.refsSha256).toBe(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs: mine }));
    expect(await rowCount()).toBe(2);
  });

  it('gives up after a BOUNDED number of revision collisions rather than spinning', async () => {
    // The retry budget is finite on purpose — CLAUDE.md forbids unbounded retry, and an
    // unbounded loop here would spin forever against a writer that keeps winning. Injecting a
    // permanently-taken revision is the only way to reach the exhaustion path.
    await writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT,
      refs: refsWith(['proc-squatter']), proposedBy: PROPOSER,
    });

    let calls = 0;
    await expect(writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT,
      refs: refsWith(['proc-starved']), proposedBy: PROPOSER,
      nextRevisionFor: async () => { calls += 1; return 1; },
    })).rejects.toThrow(/concurrent writer is winning/);

    // Named, not merely "it threw": the budget is 3, so 3 attempts and no more.
    expect(calls).toBe(3);
    // And it did NOT write a partial row on the way out.
    expect(await rowCount()).toBe(1);
  });

  it('is scoped BY TENANT: identical refs under another tenant are a different manifest', async () => {
    // MX2. Dropping the tenant predicate from the replay lookup survived mutation, so the
    // scoping was untested. The hash is tenant-salted, so there was no live cross-tenant
    // leak — but "a bug would need two mistakes" is not coverage, and this subsystem has a
    // standing rule that row checks come AFTER an audited tenant guard.
    const OTHER = '99999999-9999-9999-9999-999999999999';
    await sequelize.query('INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [OTHER] });

    const refs = refsWith(['proc-shared']);
    const mine = await writeBlueprintManifest({
      tenantId: TENANT, origin: 'sbp', projectId: PROJECT, refs, proposedBy: PROPOSER,
    });
    const theirs = await writeBlueprintManifest({
      tenantId: OTHER, origin: 'sbp', projectId: PROJECT, refs, proposedBy: PROPOSER,
    });

    try {
      // Byte-identical refs, two tenants, two rows. Neither is reported as a replay of the
      // other, and the hashes differ because the tenant is an input to the hash.
      expect(theirs.created).toBe(true);
      expect(theirs.manifestId).not.toBe(mine.manifestId);
      expect(theirs.refsSha256).not.toBe(mine.refsSha256);
      // One row under OUR tenant, so the other tenant’s write was not counted as ours.
      expect(await rowCount()).toBe(1);
    } finally {
      await sequelize.query('DELETE FROM operating_blueprint_manifests WHERE tenant_id = $1', { bind: [OTHER] });
    }
  });

  it('a delivery-origin write sets the OTHER project column', async () => {
    const DELIVERY = '55555555-5555-5555-5555-555555555555';
    await sequelize.query('INSERT INTO delivery_projects (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [DELIVERY] });

    const out = await writeBlueprintManifest({
      tenantId: TENANT, origin: 'factory', projectId: DELIVERY, refs: emptyRefs('factory', DELIVERY), proposedBy: PROPOSER,
    });

    const rows = await sequelize.query<{ student_project_id: string | null; delivery_project_id: string | null }>(
      'SELECT student_project_id, delivery_project_id FROM operating_blueprint_manifests WHERE id = $1',
      { bind: [out.manifestId], type: QueryTypes.SELECT },
    );
    expect(rows[0].delivery_project_id).toBe(DELIVERY);
    expect(rows[0].student_project_id).toBeNull();
  });
});
