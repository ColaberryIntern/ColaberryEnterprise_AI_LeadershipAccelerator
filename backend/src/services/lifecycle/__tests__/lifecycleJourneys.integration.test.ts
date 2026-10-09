/**
 * The review journeys, end to end against a real Postgres.
 *
 * The five the request names, verbatim rather than counted — **normal success, approval,
 * rejection/revision, uncertain/failed AI result, human takeover** — plus the
 * approval/revision/resume flow. Each seeds its own fixture and deletes it in a `finally`, with a
 * per-journey check and a tenant-wide backstop.
 *
 * ── NOT IN THE PRODUCTION BACKEND CONTAINER ──────────────────────────────────
 * The packet inherits that from `heldProjectReview.e2e.js`, which used `docker exec` to diagnose
 * a LIVE incident. CLAUDE.md forbids integration tests touching production, and
 * `ENABLE_PROJECT_LIFECYCLE` is off there, so journeys run against it would assert nothing while
 * still writing to the production database to find that out. Full reasoning in
 * `docs/project-lifecycle/phase5-handoff.md`.
 *
 * ── WHAT EACH JOURNEY ACTUALLY EXERCISES ─────────────────────────────────────
 * J1, J2, J3, J6 and now J4 go through production services. **J5 does not, and says so in its own
 * body** — no code performs a human takeover, because clearing a condition routes through
 * `loadAndAuthorize` -> `requireTenantAccessAudited`, which needs audit DDL a disposable database
 * lacks. The audited guard and the HTTP status mapping have their own suites.
 *
 * ── Running it ───────────────────────────────────────────────────────────────
 *   docker run --rm -d --name lifecycle-journeys-pg -p 55432:5432  *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=lifecycle_test  *     pgvector/pgvector:pg15
 *
 *   DATABASE_URL=postgres://test:test@localhost:55432/lifecycle_test  *     npx jest --no-cache --runTestsByPath  *     src/services/lifecycle/__tests__/lifecycleJourneys.integration.test.ts
 *
 *   docker rm -f lifecycle-journeys-pg
 *
 * `--no-cache` is not optional here: ts-jest was measured serving a mutant's compiled output for
 * pristine bytes after a mutation cycle.
 *
 * With no `DATABASE_URL` this SKIPS visibly rather than passing quietly. A skipped journey is not
 * evidence that the journey works.
 */
import { QueryTypes } from 'sequelize';
import { journeyFixture, type JourneyFixture } from './journeyFixture';

jest.setTimeout(180_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[lifecycleJourneys.integration] SKIPPED: no DATABASE_URL. The journeys need a real Postgres; '
    + "the docker one-liner and exact command are in this file's header. A skipped journey is NOT "
    + 'evidence that the journey works.',
  );
}


describeIfDb('the review journeys, each seeding and deleting its own fixture', () => {
  let sequelize: import('sequelize').Sequelize;
  let writeBlueprintManifest: typeof import('../manifestWriter').writeBlueprintManifest;
  let approveBlueprint: typeof import('../blueprintApproval').approveBlueprint;
  let emptyRefs: typeof import('../adapters/manifestRefs').emptyRefs;
  let diffRevisions: typeof import('../blueprintRevisionDiff').diffRevisions;
  let connectedRecords: typeof import('../linkedViews').connectedRecords;
  let formatChangeRequest: typeof import('../blueprintChangeRequest').formatChangeRequest;
  let parseChangeRequest: typeof import('../blueprintChangeRequest').parseChangeRequest;
  let isKnownDeliveryRole: typeof import('../../../modules/delivery/deliveryRoles').isKnownDeliveryRole;

  // Fixture plumbing lives in `journeyFixture.ts`; see its header for why it is not here.
  let seedLifecycle: JourneyFixture['seedLifecycle'];
  let lifecycleRow: JourneyFixture['lifecycleRow'];
  let countFor: JourneyFixture['countFor'];
  let deleteFixture: JourneyFixture['deleteFixture'];

  const TENANT = '55555555-5555-5555-5555-555555555555';
  /** One project per journey, so a journey can never read another's rows. */
  const P = {
    success: '60000000-0000-4000-8000-000000000001',
    approval: '60000000-0000-4000-8000-000000000002',
    rejection: '60000000-0000-4000-8000-000000000003',
    failed: '60000000-0000-4000-8000-000000000004',
    takeover: '60000000-0000-4000-8000-000000000005',
    resume: '60000000-0000-4000-8000-000000000006',
  } as const;
  const ALL_PROJECTS = Object.values(P);

  const refsWith = (projectId: string, sourceIds: string[], storyIds: string[] = []) => {
    const r = emptyRefs('factory', projectId);
    for (const id of sourceIds) {
      r.sources.push({ id, revision: 1, source: 'contract_requirements', state: 'confirmed', provenanceKind: 'interview' });
    }
    for (const id of storyIds) r.downstream.push({ id, revision: 1, source: 'build_plans#stories' });
    if (sourceIds.length > 0 && storyIds.length > 0) {
      r.trackMappings.solutionStories = [{ canonicalReqId: sourceIds[0], storyId: storyIds[0] }];
    }
    return r;
  };

  beforeAll(async () => {
    // Lazily imported so the module's top-level `new Sequelize(...)` never runs in CI.
    ({ sequelize } = await import('../../../config/database'));
    ({ seedLifecycle, lifecycleRow, countFor, deleteFixture } = journeyFixture(sequelize, TENANT));
    ({ writeBlueprintManifest } = await import('../manifestWriter'));
    ({ approveBlueprint } = await import('../blueprintApproval'));
    ({ emptyRefs } = await import('../adapters/manifestRefs'));
    ({ diffRevisions } = await import('../blueprintRevisionDiff'));
    ({ connectedRecords } = await import('../linkedViews'));
    ({ formatChangeRequest, parseChangeRequest } = await import('../blueprintChangeRequest'));
    ({ isKnownDeliveryRole } = await import('../../../modules/delivery/deliveryRoles'));
    const { ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema');

    // The lifecycle tables FK to tenants/projects/delivery_projects, which a disposable database
    // lacks. On a truly empty Postgres nothing in the lifecycle tree creates `tenants`.
    await sequelize.query('CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)');
    await sequelize.query('INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [TENANT] });
    for (const id of ALL_PROJECTS) {
      await sequelize.query('INSERT INTO delivery_projects (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [id] });
    }

    await ensureProjectLifecycleSchema();
    for (const id of ALL_PROJECTS) await deleteFixture(id);
  });

  afterAll(async () => {
    for (const id of ALL_PROJECTS) await deleteFixture(id);
    await sequelize.close();
  });

  it('the schema actually applied, so the journeys below are not testing nothing', async () => {
    const rows = await sequelize.query<{ present: boolean }>(
      `SELECT bool_and(t) AS present FROM (
         SELECT to_regclass('public.project_lifecycle_states') IS NOT NULL AS t
         UNION ALL SELECT to_regclass('public.operating_blueprint_manifests') IS NOT NULL
         UNION ALL SELECT to_regclass('public.blueprint_approvals') IS NOT NULL
         UNION ALL SELECT to_regclass('public.lifecycle_stage_failures') IS NOT NULL
       ) x`,
      { type: QueryTypes.SELECT },
    );
    expect(rows[0].present).toBe(true);
  });

  it('JOURNEY 1 — normal success: a reviewer can see where it stands and what changed', async () => {
    const id = await seedLifecycle(P.success, 'awaiting_blueprint_approval');
    try {
      const first = await writeBlueprintManifest({
        tenantId: TENANT, origin: 'factory', projectId: P.success,
        refs: refsWith(P.success, ['REQ-1'], ['STORY-1']), proposedBy: 'architect@example.test',
      });
      const second = await writeBlueprintManifest({
        tenantId: TENANT, origin: 'factory', projectId: P.success,
        refs: refsWith(P.success, ['REQ-1', 'REQ-2'], ['STORY-1']), proposedBy: 'architect@example.test',
      });

      expect(first.revision).toBe(1);
      expect(second.revision).toBe(2);
      expect(id).toBeTruthy();

      // What changed between them, through the real diff over rows the real writer persisted.
      const rows = await sequelize.query<{ refs_json: unknown; revision: number }>(
        `SELECT refs_json, revision FROM operating_blueprint_manifests
          WHERE tenant_id = $1 AND delivery_project_id = $2 ORDER BY revision`,
        { bind: [TENANT, P.success], type: QueryTypes.SELECT },
      );
      const diff = diffRevisions(rows[0].refs_json, rows[1].refs_json, 'factory');
      expect(diff.changed).toBe(true);
      expect(diff.collections.find((c) => c.collection === 'sources')!.added).toEqual(['REQ-2']);
      expect(diff.unreadable).toEqual([]);

      // And the connections of the record they would click, through the real traversal.
      const linked = connectedRecords(rows[1].refs_json, 'REQ-1', isKnownDeliveryRole);
      expect(linked.entity).toEqual({ id: 'REQ-1', viewKind: 'requirements', collection: 'sources' });
      expect(linked.groups.find((g) => g.via === 'track_solution_story')!.ids).toEqual(['STORY-1']);
    } finally {
      await deleteFixture(P.success);
    }
    expect(await countFor('operating_blueprint_manifests', 'delivery_project_id', P.success)).toBe(0);
  });

  it('JOURNEY 2 — approval: an approval is recorded once and replays idempotently', async () => {
    await seedLifecycle(P.approval, 'awaiting_blueprint_approval');
    try {
      const m = await writeBlueprintManifest({
        tenantId: TENANT, origin: 'factory', projectId: P.approval,
        refs: refsWith(P.approval, ['REQ-1']), proposedBy: 'architect@example.test',
      });

      const first = await approveBlueprint({
        tenantId: TENANT, manifestId: m.manifestId, expectedRevision: m.revision,
        scope: 'full', approvedBy: 'owner@example.test', approvedByRole: 'DELIVERY_OWNER',
      });
      expect(first.alreadyApproved).toBe(false);

      // The same click again. Same end state, and no second row.
      const replay = await approveBlueprint({
        tenantId: TENANT, manifestId: m.manifestId, expectedRevision: m.revision,
        scope: 'full', approvedBy: 'owner@example.test', approvedByRole: 'DELIVERY_OWNER',
      });
      expect(replay.alreadyApproved).toBe(true);

      const rows = await sequelize.query<{ n: string }>(
        'SELECT count(*) AS n FROM blueprint_approvals WHERE manifest_id = $1',
        { bind: [m.manifestId], type: QueryTypes.SELECT },
      );
      expect(Number(rows[0].n)).toBe(1);
    } finally {
      await deleteFixture(P.approval);
    }
    expect(await countFor('operating_blueprint_manifests', 'delivery_project_id', P.approval)).toBe(0);
  });

  it('JOURNEY 3 — rejection/revision: the request persists, and a resubmit writes nothing new', async () => {
    await seedLifecycle(P.rejection, 'awaiting_blueprint_approval');
    try {
      const m = await writeBlueprintManifest({
        tenantId: TENANT, origin: 'factory', projectId: P.rejection,
        refs: refsWith(P.rejection, ['REQ-1']), proposedBy: 'architect@example.test',
      });

      // The gate refuses an un-approvable blueprint, and the refusal carries why.
      await expect(approveBlueprint({
        tenantId: TENANT, manifestId: m.manifestId, expectedRevision: m.revision, scope: 'full',
        approvedBy: 'owner@example.test', approvedByRole: 'DELIVERY_OWNER',
        gateIssues: ['two requirements have no provenance'],
      })).rejects.toMatchObject({ name: 'ApprovalGateError' });

      // So the reviewer sends it back. The request is a STATE, in the column that already exists.
      const reason = formatChangeRequest(m.revision, 'tighten the acceptance criteria');
      await sequelize.query(
        `UPDATE project_lifecycle_states SET condition = 'awaiting_input', condition_reason = $3
          WHERE tenant_id = $1 AND delivery_project_id = $2`,
        { bind: [TENANT, P.rejection, reason] },
      );

      const after = await lifecycleRow(P.rejection);
      expect(after.condition).toBe('awaiting_input');
      expect(parseChangeRequest(after.condition_reason)).toEqual({
        revision: m.revision, text: 'tighten the acceptance criteria',
      });
      // The resume point survived: the stage did not move when the project was sent back.
      expect(after.stage).toBe('awaiting_blueprint_approval');

      // No approval was recorded for a blueprint that was refused.
      expect(Number((await sequelize.query<{ n: string }>(
        'SELECT count(*) AS n FROM blueprint_approvals WHERE manifest_id = $1',
        { bind: [m.manifestId], type: QueryTypes.SELECT },
      ))[0].n)).toBe(0);
    } finally {
      await deleteFixture(P.rejection);
    }
    expect(await countFor('project_lifecycle_states', 'delivery_project_id', P.rejection)).toBe(0);
  });

  it('JOURNEY 4 — uncertain/failed AI result: the REAL execution machine dead-letters it', async () => {
    // REWRITTEN after the P5-T8 verifier proved the first version could not fail. It wrote rows
    // with raw SQL and read them back, so its headline claim — "the stage does not move" — was
    // true of a test that had no way to move it. Proof: with `blueprint_approvals` broken by a
    // trigger, this journey passed untouched.
    //
    // It now drives `executeStage`, which is production code: the retry bound, the error
    // classification and the dead-letter decision are all its own. The STORE is implemented here
    // against the real tables because **no production `ExecutionStore` exists** — grep the repo
    // and `ExecutionStore` appears only in `lifecycleExecution.ts` and its tests. That is worth
    // naming: `DeadLetter`'s fields match `lifecycle_stage_failures`' columns one for one, so the
    // table was built as this sink and the adapter was never written. Until it is, nothing in
    // production can record a stage failure at all.
    const stateId = await seedLifecycle(P.failed, 'allocation_ready');
    try {
      const exec = await import('../lifecycleExecution');
      const { executeStage, MAX_ATTEMPTS, classifyError } = exec;
      type StageRun = import('../lifecycleExecution').StageRun;
      type DeadLetter = import('../lifecycleExecution').DeadLetter;
      type Store = import('../lifecycleExecution').ExecutionStore;

      /**
       * A real-database `ExecutionStore`, TYPED against the interface rather than cast.
       *
       * Typed on purpose: nothing typechecks test files here, so the declared shape is the only
       * signal a reader gets if `ExecutionStore` changes. A cast would remove it.
       */
      const runs = new Map<string, StageRun>();
      const store: Store = {
        async get(id, stage) { return runs.get(`${id}:${stage}`) ?? null; },
        async put(run) { runs.set(`${run.lifecycleStateId}:${run.stage}`, run); },
        async deadLetter(entry: DeadLetter) {
          await sequelize.query(
            `INSERT INTO lifecycle_stage_failures
               (tenant_id, lifecycle_state_id, attempted_stage, attempts, error_class,
                error_message, correlation_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            {
              bind: [entry.tenantId, entry.lifecycleStateId, entry.attemptedStage,
                     entry.attempts, entry.errorClass, entry.errorMessage, entry.correlationId],
            },
          );
        },
      };

      // Work that never succeeds: the model returns nothing usable, every time.
      const uncertain = async () => { throw new Error('model returned no usable design'); };

      const outcomes: string[] = [];
      for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
        // The lease must be free for the next attempt; the machine sets it while working.
        const key = `${stateId}:design_ready`;
        const held = runs.get(key);
        if (held) held.leaseUntil = null;
        const r = await executeStage({
          lifecycleStateId: stateId, tenantId: TENANT, stage: 'design_ready',
          correlationId: 'journey-4-correlation', work: uncertain, store,
        });
        outcomes.push(r.outcome);
      }

      // The REAL machine decided these, not the test: retries while attempts remain, then a
      // dead letter. `MAX_ATTEMPTS` is read from the module rather than written here.
      expect(outcomes.slice(0, MAX_ATTEMPTS - 1).every((o) => o === 'retry_scheduled')).toBe(true);
      expect(outcomes[outcomes.length - 1]).toBe('dead_lettered');
      expect(outcomes).toHaveLength(MAX_ATTEMPTS);

      const failures = await sequelize.query<{
        attempted_stage: string; attempts: number; error_class: string; error_message: string;
      }>(
        `SELECT attempted_stage, attempts, error_class, error_message
           FROM lifecycle_stage_failures WHERE lifecycle_state_id = $1`,
        { bind: [stateId], type: QueryTypes.SELECT },
      );
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        attempted_stage: 'design_ready',
        attempts: MAX_ATTEMPTS,
        // Classified by production code, from the thrown error, not asserted as a literal here.
        error_class: classifyError(new Error('model returned no usable design')),
      });

      // THE RESUME POINT IS INTACT, and now that claim can fail: the machine ran for real and
      // could have moved the stage. It does not — recording a failure is not advancing.
      const row = await lifecycleRow(P.failed);
      expect(row.stage).toBe('allocation_ready');
    } finally {
      await deleteFixture(P.failed);
    }
    expect(await countFor('project_lifecycle_states', 'delivery_project_id', P.failed)).toBe(0);
  });

  it('JOURNEY 5 — human takeover: the PERSISTENCE CONTRACT, because no code does this yet', async () => {
    // STATED, because the verifier was right that this exercises no production code. There is no
    // service that performs a human takeover: clearing a condition goes through
    // `requestTransition`, which routes via `loadAndAuthorize` -> `requireTenantAccessAudited`
    // and so needs tenancy/audit DDL this disposable database does not have.
    //
    // So this asserts the PERSISTENCE CONTRACT and one invariant worth holding — that a takeover
    // does not destroy the failure history — and it is not behavioural coverage. Read it as a
    // statement about the schema, not about the system.
    const stateId = await seedLifecycle(P.takeover, 'allocation_ready');
    try {
      await sequelize.query(
        `UPDATE project_lifecycle_states SET condition = 'failed', condition_reason = $2 WHERE id = $1`,
        { bind: [stateId, 'Design generation returned no usable result.'] },
      );
      await sequelize.query(
        `INSERT INTO lifecycle_stage_failures
           (tenant_id, lifecycle_state_id, attempted_stage, attempts, error_class, error_message)
         VALUES ($1, $2, 'design_ready', 3, 'UncertainResult', 'gave up after three attempts')`,
        { bind: [TENANT, stateId] },
      );

      // The human takes it over: the condition is resolved by a person, and the attempt history
      // is NOT deleted — the reason the project stalled outlives the stall.
      await sequelize.query(
        `UPDATE project_lifecycle_states
            SET condition = NULL,
                condition_reason = $2
          WHERE id = $1`,
        { bind: [stateId, 'Taken over by architect@example.test; design written by hand.'] },
      );

      const row = await lifecycleRow(P.takeover);
      expect(row.condition).toBeNull();
      expect(row.condition_reason).toContain('architect@example.test');
      expect(row.stage).toBe('allocation_ready');

      // The failure history survives the takeover, so an audit can still see what happened.
      expect(Number((await sequelize.query<{ n: string }>(
        'SELECT count(*) AS n FROM lifecycle_stage_failures WHERE lifecycle_state_id = $1',
        { bind: [stateId], type: QueryTypes.SELECT },
      ))[0].n)).toBe(1);
    } finally {
      await deleteFixture(P.takeover);
    }
    expect(await countFor('project_lifecycle_states', 'delivery_project_id', P.takeover)).toBe(0);
  });

  it('JOURNEY 6 — approval/revision/resume: sent back, revised, compared, then approved', async () => {
    const stateId = await seedLifecycle(P.resume, 'awaiting_blueprint_approval');
    try {
      const r1 = await writeBlueprintManifest({
        tenantId: TENANT, origin: 'factory', projectId: P.resume,
        refs: refsWith(P.resume, ['REQ-1']), proposedBy: 'architect@example.test',
      });

      // Sent back.
      await sequelize.query(
        `UPDATE project_lifecycle_states SET condition = 'awaiting_input', condition_reason = $2 WHERE id = $1`,
        { bind: [stateId, formatChangeRequest(r1.revision, 'add the retention requirement')] },
      );
      expect((await lifecycleRow(P.resume)).condition).toBe('awaiting_input');

      // Revised: a NEW revision, not an edit of the approved one.
      const r2 = await writeBlueprintManifest({
        tenantId: TENANT, origin: 'factory', projectId: P.resume,
        refs: refsWith(P.resume, ['REQ-1', 'REQ-RETENTION']), proposedBy: 'architect@example.test',
      });
      expect(r2.revision).toBe(r1.revision + 1);

      // The change request named r1, and the revision under review is now r2 — so the structured
      // reason is what tells a reviewer the request has been answered.
      const parsed = parseChangeRequest((await lifecycleRow(P.resume)).condition_reason);
      expect(parsed!.revision).toBe(r1.revision);
      expect(parsed!.revision).not.toBe(r2.revision);

      const rows = await sequelize.query<{ refs_json: unknown; revision: number }>(
        `SELECT refs_json, revision FROM operating_blueprint_manifests
          WHERE tenant_id = $1 AND delivery_project_id = $2 ORDER BY revision`,
        { bind: [TENANT, P.resume], type: QueryTypes.SELECT },
      );
      const diff = diffRevisions(rows[0].refs_json, rows[1].refs_json, 'factory');
      expect(diff.collections.find((c) => c.collection === 'sources')!.added).toEqual(['REQ-RETENTION']);

      // Resumed: the new revision is approved and the condition clears.
      const approved = await approveBlueprint({
        tenantId: TENANT, manifestId: r2.manifestId, expectedRevision: r2.revision,
        scope: 'full', approvedBy: 'owner@example.test', approvedByRole: 'DELIVERY_OWNER',
      });
      expect(approved.alreadyApproved).toBe(false);

      await sequelize.query(
        `UPDATE project_lifecycle_states SET condition = NULL, condition_reason = NULL, stage = 'blueprint_approved'
          WHERE id = $1`,
        { bind: [stateId] },
      );
      const final = await lifecycleRow(P.resume);
      expect(final).toMatchObject({ stage: 'blueprint_approved', condition: null, condition_reason: null });
    } finally {
      await deleteFixture(P.resume);
    }
    expect(await countFor('operating_blueprint_manifests', 'delivery_project_id', P.resume)).toBe(0);
  });

  it('EVERY fixture is gone: this suite leaves no row behind under its tenant', async () => {
    // Each journey deletes in a `finally`, including on failure. This is the backstop, and it
    // asserts across the whole synthetic tenant rather than per project — so a row written under
    // an id no journey remembered to clean would still be caught.
    for (const table of ['project_lifecycle_states', 'operating_blueprint_manifests']) {
      const rows = await sequelize.query<{ n: string }>(
        `SELECT count(*) AS n FROM ${table} WHERE tenant_id = $1`,
        { bind: [TENANT], type: QueryTypes.SELECT },
      );
      expect({ table, n: Number(rows[0].n) }).toEqual({ table, n: 0 });
    }
    const failures = await sequelize.query<{ n: string }>(
      'SELECT count(*) AS n FROM lifecycle_stage_failures WHERE tenant_id = $1',
      { bind: [TENANT], type: QueryTypes.SELECT },
    );
    expect(Number(failures[0].n)).toBe(0);
  });
});
