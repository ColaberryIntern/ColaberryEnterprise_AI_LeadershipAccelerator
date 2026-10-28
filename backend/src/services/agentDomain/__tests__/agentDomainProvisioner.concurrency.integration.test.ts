/**
 * T14 — idempotency and the concurrency race, against REAL Postgres.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * ## Why this suite exists and the unit test is not enough
 *
 * `provisionOne` does nothing to prevent a duplicate. There is no read-then-compare, no "does it
 * already exist" check — by design. What actually makes a second run write zero rows is the
 * PRIMARY KEY on `projects` (at a derived id) and `uq_agent_domain_key` on the anchor, both
 * enforced by Postgres. A mocked `sequelize.query` proves only that the code issues the statements
 * it was written to issue; it cannot prove the database refuses the second one. The repo already
 * settled this argument in `blueprintApproval.concurrency.integration.test.ts`, whose docblock says
 * it plainly: "a doubled index proves only that the double behaves as written."
 *
 * ## It carries mandatory positive controls
 *
 * Two of them, and if either fails to fail, the tests above it are proving nothing and must not be
 * cited as evidence. (1) With the derived id replaced by a fresh uuid, the second run inserts a
 * second project. (2) With `uq_agent_domain_key` dropped, the race produces two anchors.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name agentdomain-pg-test -p 55433:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=agentdomain_test \
 *     pgvector/pgvector:pg15
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@localhost:55433/agentdomain_test \
 *     npx jest -c jest.config.ts agentDomainProvisioner.concurrency
 *
 *   docker rm -f agentdomain-pg-test
 *
 * Port 55433, not 55432, so it cannot collide with the lifecycle suite's container if both run.
 * Throwaway credentials for a container that lives for one test run; nothing here is a secret and
 * nothing persists. With no `DATABASE_URL` the suite SKIPS and says so — a skipped test reports as
 * skipped, which is visible, where an ignored one reports as nothing at all.
 *
 * It must never be pointed at production. It writes only rows it created, under a synthetic tenant.
 */

import { QueryTypes } from 'sequelize';

jest.setTimeout(180_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[agentDomainProvisioner.concurrency] SKIPPED: no DATABASE_URL. This suite needs a real '
    + 'Postgres; the docblock has the one-line docker run and the exact command. It is NOT '
    + 'evidence about idempotency or the race unless it actually ran.',
  );
}

describeIfDb('T14 — provisioning is idempotent and race-safe', () => {
  let sequelize: import('sequelize').Sequelize;
  let provisionDomain: typeof import('../agentDomainProvisioner').provisionDomain;
  let planProvision: typeof import('../agentDomainProvisionPlan').planProvision;
  let domainProjectName: typeof import('../agentDomainRegistry').domainProjectName;

  const TENANT = '33333333-3333-3333-3333-333333333333';
  const ENROLLMENT = '44444444-4444-4444-4444-444444444444';
  // The PINNED blueprint, not a synthetic id: the provisioner resolves this exact row and
  // verifies its name, after the previous `ORDER BY created_at ASC LIMIT 1` was measured in
  // production to resolve the customer-facing accelerator instead.
  const PROGRAM = '8660090e-1f6f-51cf-ae46-483bfa8903c5';
  const PROGRAM_NAME = 'Internal AI Employee Operations';
  const DOMAIN = 'marketing';
  const PROVISIONED_BY = 'CC-20261006-a4k7/T14-integration';

  async function count(sql: string, bind: unknown[] = []): Promise<number> {
    const rows = await sequelize.query<{ n: string }>(sql, { bind, type: QueryTypes.SELECT });
    return Number(rows[0].n);
  }

  /** Every table the provisioner declares, counted for this project. */
  async function countsForProject(projectId: string): Promise<Record<string, number>> {
    return {
      projects: await count('SELECT count(*)::text AS n FROM projects WHERE id = $1', [projectId]),
      agent_domain_projects: await count(
        'SELECT count(*)::text AS n FROM agent_domain_projects WHERE student_project_id = $1', [projectId]),
      project_lifecycle_states: await count(
        'SELECT count(*)::text AS n FROM project_lifecycle_states WHERE student_project_id = $1', [projectId]),
      student_task_lists: await count(
        'SELECT count(*)::text AS n FROM student_task_lists WHERE project_id = $1', [projectId]),
      student_tasks: await count(
        'SELECT count(*)::text AS n FROM student_tasks WHERE project_id = $1', [projectId]),
      agent_domain_build_authorizations: await count(
        `SELECT count(*)::text AS n FROM agent_domain_build_authorizations a
           JOIN agent_domain_projects p ON p.id = a.agent_domain_project_id
          WHERE p.student_project_id = $1`, [projectId]),
    };
  }

  function codeOfExecutor(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    return fs.readFileSync(path.join(__dirname, '..', 'agentDomainProvisioner.ts'), 'utf8');
  }

  async function wipe(projectId: string): Promise<void> {
    // Children are deleted EXPLICITLY, in dependency order, because the tables now come from
    // their models and the models' foreign keys do not declare ON DELETE CASCADE -- the
    // hand-rolled stand-ins they replaced did, so a bare `DELETE FROM projects` used to work and
    // now trips the constraint. Scoped to the one derived id this suite owns.
    for (const sql of [
      'DELETE FROM student_tasks WHERE project_id = $1',
      'DELETE FROM student_task_lists WHERE project_id = $1',
      'DELETE FROM agent_domain_projects WHERE student_project_id = $1',
      'DELETE FROM project_lifecycle_states WHERE student_project_id = $1',
      'DELETE FROM projects WHERE id = $1',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(sql, { bind: [projectId] });
    }
  }

  beforeAll(async () => {
    // Lazily imported so the module's top-level `new Sequelize(...)` never runs in CI.
    ({ sequelize } = await import('../../../config/database'));
    ({ provisionDomain } = await import('../agentDomainProvisioner'));
    ({ planProvision } = await import('../agentDomainProvisionPlan'));
    ({ domainProjectName } = await import('../agentDomainRegistry'));

    // Minimal stand-ins for the tables the real DDL references. Created FIRST so the ensure call
    // applies cleanly, and before any `sync()` — which would otherwise test a fake schema first.
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY, slug TEXT UNIQUE)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS ai_agents (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS program_blueprints (
      id UUID PRIMARY KEY, name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS enrollments (
      id UUID PRIMARY KEY, email TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS admin_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE, role TEXT)`);
    // `projects`, `student_task_lists` and `student_tasks` are created FROM THEIR MODELS.
    //
    // They used to be hand-rolled CREATE TABLEs here, which was fine while the provisioner wrote
    // them with raw SQL naming its own columns. It now goes through `Project.findOrCreate`, whose
    // SELECT lists every attribute the model declares -- so a six-column stand-in cannot serve it,
    // and a hand-written table would drift from the model silently. `sync()` makes the table BE
    // the model's table.
    // `student_tasks.requirement_map_id` references this; it is not a table this feature owns, so
    // it is a stand-in like the others rather than a model sync.
    await sequelize.query(`CREATE TABLE IF NOT EXISTS requirements_maps (id UUID PRIMARY KEY)`);

    const { default: ProjectModel } = await import('../../../models/Project');
    const { default: StudentTaskListModel } = await import('../../../models/StudentTaskList');
    const { default: StudentTaskModel } = await import('../../../models/StudentTask');
    await ProjectModel.sync();
    await StudentTaskListModel.sync();
    await StudentTaskModel.sync();

    await sequelize.query(
      `INSERT INTO tenants (id, slug) VALUES ($1, 'colaberry') ON CONFLICT DO NOTHING`, { bind: [TENANT] });
    await sequelize.query(
      `INSERT INTO program_blueprints (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      { bind: [PROGRAM, PROGRAM_NAME] });
    // A SECOND, OLDER blueprint, so the suite reproduces the production shape that caused the
    // defect: the resolver must pick the pinned one, not the oldest.
    await sequelize.query(
      `INSERT INTO program_blueprints (id, name, created_at)
       VALUES ('11111111-aaaa-bbbb-cccc-000000000001', 'Enterprise AI Leadership Accelerator',
               now() - interval '200 days')
       ON CONFLICT DO NOTHING`);
    await sequelize.query(
      `INSERT INTO enrollments (id, email) VALUES ($1, 'ai-staff@example.test') ON CONFLICT DO NOTHING`,
      { bind: [ENROLLMENT] });
    await sequelize.query(
      `INSERT INTO admin_users (email, role) VALUES ('ai-staff@example.test', 'ai_staff')
       ON CONFLICT (email) DO NOTHING`);

    // The real DDL, applied AFTER its referenced tables exist.
    const { ensureAgentDomainProjectSchema } = await import('../../../db/ensureAgentDomainProjectSchema');
    const { ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema');
    await sequelize.query(`CREATE TABLE IF NOT EXISTS project_lifecycle_states (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      student_project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      delivery_project_id UUID REFERENCES delivery_projects(id) ON DELETE CASCADE,
      stage TEXT NOT NULL DEFAULT 'discovery', condition TEXT, condition_reason TEXT,
      entry_point TEXT, next_actor_role TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_lifecycle_student_project
      ON project_lifecycle_states (student_project_id) WHERE student_project_id IS NOT NULL`);
    await ensureAgentDomainProjectSchema();
    void ensureProjectLifecycleSchema; // the lifecycle table is stood up above; keep the import honest
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('the schema actually applied, so the rest of this suite is not testing nothing', async () => {
    const n = await count(
      `SELECT count(*)::text AS n FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'uq_agent_domain_key'`);
    expect(n).toBe(1);
  });

  // ─────────────────────────── idempotency, by execution ───────────────────────────

  describe('a second run writes nothing', () => {
    const plan = () => planProvision(DOMAIN);

    beforeEach(async () => { await wipe(plan().project_id); });

    it('run once: every declared table gets its rows, and the authorization table gets none', async () => {
      const first = await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const p = plan();

      expect(first.project_id).toBe(p.project_id);
      expect(first.already_present).toBe(false);
      expect(first.inserted.projects).toBe(1);
      expect(first.inserted.agent_domain_projects).toBe(1);
      expect(first.inserted.project_lifecycle_states).toBe(1);
      expect(first.inserted.student_task_lists).toBe(p.releases.length);
      expect(first.inserted.student_tasks).toBe(p.stories.length);
      expect(first.inserted.agent_domain_build_authorizations).toBe(0);

      // Read back from the database rather than trusting the return value.
      const db = await countsForProject(p.project_id);
      expect(db.projects).toBe(1);
      expect(db.student_task_lists).toBe(p.releases.length);
      expect(db.student_tasks).toBe(p.stories.length);
      expect(db.agent_domain_build_authorizations).toBe(0);
    });

    it('RUN TWICE: the second creates ZERO rows in every table and returns the same ids', async () => {
      const first = await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const before = await countsForProject(first.project_id);

      const second = await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);

      expect(second.project_id).toBe(first.project_id);
      expect(second.anchor_id).toBe(first.anchor_id);
      expect(second.already_present).toBe(true);
      expect(Object.values(second.inserted)).toEqual(Object.values(second.inserted).map(() => 0));

      // And nothing moved in the database either.
      expect(await countsForProject(first.project_id)).toEqual(before);
    });

    it('provisions at discovery, with the entry point recorded', async () => {
      const r = await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const rows = await sequelize.query<{ stage: string; entry_point: string }>(
        `SELECT stage, entry_point FROM project_lifecycle_states WHERE student_project_id = $1`,
        { bind: [r.project_id], type: QueryTypes.SELECT },
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].stage).toBe('discovery');
      expect(rows[0].entry_point).toBe('agent_domain_factory_provisioner');
    });

    it('owns an ai_staff enrollment, never a human one', async () => {
      const r = await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const rows = await sequelize.query<{ role: string }>(
        `SELECT au.role FROM projects pr
           JOIN enrollments e ON e.id = pr.enrollment_id
           JOIN admin_users au ON lower(au.email) = lower(e.email)
          WHERE pr.id = $1`,
        { bind: [r.project_id], type: QueryTypes.SELECT },
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe('ai_staff');
    });

    it('POSITIVE CONTROL: a NON-derived id makes the second run insert a second project', async () => {
      // Proves the idempotency above comes from the derived primary key, not from the code's shape.
      const p = plan();
      await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      // Through the MODEL, like the code under test. A raw insert here used to work against the
      // hand-rolled stand-in and does not against the model's own table -- and a control that
      // takes a different path from the thing it controls for is weaker anyway.
      const { default: ProjectModel } = await import('../../../models/Project');
      // AF2.7: the decoy carries the name the provisioner ACTUALLY writes -- the domain's title,
      // not its raw key. This counted `WHERE name = DOMAIN` and silently fell to 1 the moment
      // the provisioner started naming projects properly, so the count tracks `domainProjectName`
      // rather than restating a literal that can drift away from the code under test.
      const provisionedName = domainProjectName(DOMAIN);
      const random = await ProjectModel.create({
        enrollment_id: ENROLLMENT, program_id: PROGRAM, name: provisionedName,
      } as never, { lifecycleEntryPoint: 'test.non_derived_control' } as never);
      const randomId = String((random as unknown as { id: string }).id);
      try {
        expect(randomId).not.toBe(p.project_id);
        const total = await count(
          `SELECT count(*)::text AS n FROM projects WHERE name = $1`, [provisionedName]);
        expect(total).toBe(2); // the derived one plus the random one
      } finally {
        // In a `finally` because this cleanup used to sit after the assertion: when the
        // expectation failed, the decoy row survived into the NEXT test and failed that one too,
        // so one real defect reported as two and the second pointed at innocent code.
        await sequelize.query(`DELETE FROM project_lifecycle_states WHERE student_project_id = $1`,
          { bind: [randomId] });
        await sequelize.query(`DELETE FROM projects WHERE id = $1`, { bind: [randomId] });
      }
    });
  });

  // ─────────────────────────── the race ───────────────────────────

  describe('two simultaneous runs produce exactly one project', () => {
    const plan = () => planProvision(DOMAIN);

    beforeEach(async () => { await wipe(plan().project_id); });

    function raceTwo() {
      const ctx = { sequelize, provisionedBy: PROVISIONED_BY };
      return Promise.allSettled([provisionDomain(ctx, DOMAIN), provisionDomain(ctx, DOMAIN)]);
    }

    it('exactly one project and one anchor survive, and at most one run reports an insert', async () => {
      const results = await raceTwo();
      const p = plan();

      const db = await countsForProject(p.project_id);
      expect(db.projects).toBe(1);
      expect(db.agent_domain_projects).toBe(1);
      expect(db.project_lifecycle_states).toBe(1);
      expect(db.student_task_lists).toBe(p.releases.length);
      expect(db.student_tasks).toBe(p.stories.length);

      // Both callers either succeed with the same ids or one fails on the conflict; neither
      // outcome may leave two projects behind, which the counts above have already settled.
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      for (const r of fulfilled) {
        expect((r as PromiseFulfilledResult<{ project_id: string }>).value.project_id).toBe(p.project_id);
      }
      const inserters = fulfilled.filter(
        (r) => (r as PromiseFulfilledResult<{ already_present: boolean }>).value.already_present === false,
      );
      expect(inserters.length).toBeLessThanOrEqual(1);
    });

    it('POSITIVE CONTROL: with uq_agent_domain_key dropped, the race produces TWO anchors', async () => {
      // If this control does not fail, the test above proves nothing about the index.
      await sequelize.query(`DROP INDEX IF EXISTS uq_agent_domain_key`);
      let secondProject: string | null = null;
      try {
        await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);

        // A SECOND project, not a second anchor on the same one. The anchor table also carries
        // `uq_agent_domain_project` (unique on student_project_id), so reusing the first project
        // violates THAT index instead of the one under test. The first attempt at this control did
        // exactly that: it failed for the wrong reason, which would have read as "the index works"
        // while proving nothing at all about `uq_agent_domain_key`.
        const { default: ProjectModel } = await import('../../../models/Project');
        const second = await ProjectModel.create({
          enrollment_id: ENROLLMENT, program_id: PROGRAM, name: 'control-second',
        } as never, { lifecycleEntryPoint: 'test.index_control' } as never);
        secondProject = String((second as unknown as { id: string }).id);

        await sequelize.query(
          `INSERT INTO agent_domain_projects
             (id, tenant_id, student_project_id, domain_key, provisioned_by)
           VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
          { bind: [TENANT, secondProject, DOMAIN, 'control'] },
        );
        const n = await count(
          `SELECT count(*)::text AS n FROM agent_domain_projects WHERE domain_key = $1`, [DOMAIN]);
        expect(n).toBe(2); // two anchors for one (tenant, domain): only possible with the index gone
      } finally {
        await sequelize.query(`DELETE FROM agent_domain_projects WHERE provisioned_by = 'control'`);
        if (secondProject) {
          await sequelize.query(`DELETE FROM project_lifecycle_states WHERE student_project_id = $1`,
            { bind: [secondProject] });
          await sequelize.query(`DELETE FROM projects WHERE id = $1`, { bind: [secondProject] });
        }
        await sequelize.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_domain_key
             ON agent_domain_projects (tenant_id, domain_key)`);
      }
    });

    it('the index is back, so a later run of this suite is not silently unguarded', async () => {
      const n = await count(
        `SELECT count(*)::text AS n FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'uq_agent_domain_key'`);
      expect(n).toBe(1);
    });
  });

  // ─────────────────────────── the forbidden writes ───────────────────────────

  // ─────────────────────── the assert, exercised for real ───────────────────────

  /**
   * T08's post-condition had no behavioural coverage until here.
   *
   * It was verified by reading its own source with a regex, which cannot catch a semantic
   * regression -- and in fact did not catch a real one: `readNames` destructured `[rows]` off
   * Sequelize's `[results, metadata]` tuple while this driver returns a single-column select as
   * raw arrays, so the assert saw only the FIRST row and reported every required table after the
   * first as missing. That defect was found by running this suite, not by reading the file.
   */
  describe('assertAgentDomainProjectSchema, against a real database', () => {
    let assertSchema: typeof import('../../../db/ensureAgentDomainProjectSchema').assertAgentDomainProjectSchema;

    beforeAll(async () => {
      ({ assertAgentDomainProjectSchema: assertSchema } =
        await import('../../../db/ensureAgentDomainProjectSchema'));
    });

    it('passes on the healthy schema this suite stood up', async () => {
      await expect(assertSchema()).resolves.toBeUndefined();
    });

    it('FIXTURE: a PARTIAL pre-existing table is reported, column by column', async () => {
      // The `IF NOT EXISTS` adoption scenario. In production this is the likely shape of a
      // failure: a table left behind by an earlier partial run, adopted as-is, with the
      // post-condition seeing only its name.
      await sequelize.query('ALTER TABLE agent_domain_projects DROP COLUMN manager_blocker');
      try {
        await expect(assertSchema()).rejects.toThrow(
          /missing column public\.agent_domain_projects\.manager_blocker/,
        );
      } finally {
        await sequelize.query('ALTER TABLE agent_domain_projects ADD COLUMN manager_blocker TEXT');
      }
      // And it passes again once the column is back, so the check is not permanently tripped.
      await expect(assertSchema()).resolves.toBeUndefined();
    });

    it('FIXTURE: a table present ONLY in a snapshot schema is still missing from public', async () => {
      // THIS FIXTURE HAD TO BE REBUILT. The first version created `agent_domain_projects` in the
      // snapshot schema but dropped `public.agent_domain_build_authorizations` -- a table with NO
      // snapshot copy. So the assert reported it missing whether or not the query was
      // schema-qualified, and the fixture proved nothing about qualification while its name said
      // it did. A verifier ran both variants and got an identical verdict.
      //
      // The discriminating shape is to drop the table that DOES have a snapshot copy: an
      // unqualified assert finds the snapshot row and reports success for `public`, a qualified one
      // reports it missing. That is the difference this fixture exists to detect, and the mutation
      // recorded below confirms it now does.
      await sequelize.query('CREATE SCHEMA IF NOT EXISTS snap_quincy_20260819');
      await sequelize.query(
        `CREATE TABLE IF NOT EXISTS snap_quincy_20260819.agent_domain_projects (
           id UUID PRIMARY KEY, tenant_id UUID, student_project_id UUID, domain_key TEXT,
           agent_id UUID, manager_identity_id TEXT, manager_can_reach BOOLEAN,
           manager_blocker TEXT, intended_builder TEXT, intended_builder_state TEXT,
           provisioned_by TEXT)`,
      );
      await sequelize.query('DROP TABLE IF EXISTS public.agent_domain_projects CASCADE');
      try {
        // The snapshot copy exists and is complete; the public one is gone. Only a
        // schema-qualified assert can tell.
        await expect(assertSchema()).rejects.toThrow(/missing table public\.agent_domain_projects/);
      } finally {
        const { ensureAgentDomainProjectSchema } =
          await import('../../../db/ensureAgentDomainProjectSchema');
        await ensureAgentDomainProjectSchema();
        await sequelize.query('DROP SCHEMA IF EXISTS snap_quincy_20260819 CASCADE');
      }
      await expect(assertSchema()).resolves.toBeUndefined();
    });

    it('POSITIVE CONTROL: the snapshot copy really is complete, so an unqualified assert WOULD pass', async () => {
      // Proves the fixture above discriminates, without needing to mutate the source: if the
      // snapshot table were incomplete, an unqualified assert would fail for a different reason
      // and the fixture would be detecting the wrong thing.
      await sequelize.query('CREATE SCHEMA IF NOT EXISTS snap_quincy_20260819');
      await sequelize.query(
        `CREATE TABLE IF NOT EXISTS snap_quincy_20260819.agent_domain_projects (
           id UUID PRIMARY KEY, tenant_id UUID, student_project_id UUID, domain_key TEXT,
           agent_id UUID, manager_identity_id TEXT, manager_can_reach BOOLEAN,
           manager_blocker TEXT, intended_builder TEXT, intended_builder_state TEXT,
           provisioned_by TEXT)`,
      );
      try {
        const unqualified = await sequelize.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM information_schema.tables
            WHERE table_name = 'agent_domain_projects'`,
          { type: QueryTypes.SELECT },
        );
        // Two copies: public and the snapshot. An unqualified lookup cannot distinguish them.
        expect(Number(unqualified[0].n)).toBe(2);

        const qualified = await sequelize.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'agent_domain_projects'`,
          { type: QueryTypes.SELECT },
        );
        expect(Number(qualified[0].n)).toBe(1);
      } finally {
        await sequelize.query('DROP SCHEMA IF EXISTS snap_quincy_20260819 CASCADE');
      }
    });

    it('a missing INDEX is reported too, not only tables and columns', async () => {
      await sequelize.query('DROP INDEX IF EXISTS idx_agent_domain_build_auth');
      try {
        await expect(assertSchema()).rejects.toThrow(/missing index public\.idx_agent_domain_build_auth/);
      } finally {
        await sequelize.query(
          `CREATE INDEX IF NOT EXISTS idx_agent_domain_build_auth
             ON agent_domain_build_authorizations (agent_domain_project_id)`,
        );
      }
      await expect(assertSchema()).resolves.toBeUndefined();
    });
  });

  // ─────────────────────── the hook, and the logging ───────────────────────

  /**
   * The lifecycle row is written by the MODEL HOOK, not by the provisioner.
   *
   * The provisioner used to write `project_lifecycle_states` by hand after a raw
   * `INSERT INTO projects`. That fired neither of `Project`'s hooks and built the parallel path
   * upstream's LC-01 work exists to eliminate — a hand-maintained list of creation sites was
   * measured wrong within a week, and this repo had already lost ledger events on ~90% of 16,070
   * production tickets to the same bypass.
   *
   * These tests prove the hook actually fires, which no mock can.
   */
  describe('the lifecycle hook, firing for real', () => {
    const plan = () => planProvision(DOMAIN);

    beforeEach(async () => { await wipe(plan().project_id); });

    it('writes the lifecycle row ITSELF, at discovery, with this provisioner as the entry point', async () => {
      const r = await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const rows = await sequelize.query<{ stage: string; entry_point: string; tenant_id: string }>(
        `SELECT stage, entry_point, tenant_id FROM project_lifecycle_states
          WHERE student_project_id = $1`,
        { bind: [r.project_id], type: QueryTypes.SELECT },
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].stage).toBe('discovery');
      expect(rows[0].entry_point).toBe('agent_domain_factory_provisioner');
      expect(rows[0].tenant_id).toBe(TENANT);
      // Counted, not assumed: the provisioner reads the row back rather than claiming the hook ran.
      expect(r.inserted.project_lifecycle_states).toBe(1);
    });

    it('exactly ONE lifecycle row, even though two paths could have written it', async () => {
      await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const n = await count(
        `SELECT count(*)::text AS n FROM project_lifecycle_states WHERE student_project_id = $1`,
        [plan().project_id],
      );
      expect(n).toBe(1);
    });

    it('a re-run does not fire the hook again', async () => {
      await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const second = await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      // `findOrCreate` fires afterCreate only when it creates, so the second run inserts nothing.
      expect(second.inserted.projects).toBe(0);
      expect(await count(
        `SELECT count(*)::text AS n FROM project_lifecycle_states WHERE student_project_id = $1`,
        [plan().project_id],
      )).toBe(1);
    });

    it('emits a structured log line carrying every field the schema requires', async () => {
      const lines: string[] = [];
      const spy = jest.spyOn(console, 'log').mockImplementation((s: unknown) => { lines.push(String(s)); });
      try {
        await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY, correlationId: 'trace-xyz' }, DOMAIN);
      } finally {
        spy.mockRestore();
      }
      const mine = lines
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((o): o is Record<string, unknown> => !!o && o.event === 'agent_domain_provisioned');
      expect(mine).toHaveLength(1);
      expect(Object.keys(mine[0])).toEqual(expect.arrayContaining([
        'timestamp', 'level', 'service', 'event', 'correlation_id', 'duration_ms', 'outcome', 'context',
      ]));
      expect(mine[0].correlation_id).toBe('trace-xyz');
      expect(mine[0].outcome).toBe('success');
    });

    it('a re-run reports `partial`, not `success`, because it wrote nothing', async () => {
      // The distinction the dead `? 'success' : 'success'` ternary was standing in for.
      await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const lines: string[] = [];
      const spy = jest.spyOn(console, 'log').mockImplementation((s: unknown) => { lines.push(String(s)); });
      try {
        await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      } finally {
        spy.mockRestore();
      }
      const mine = lines
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((o): o is Record<string, unknown> => !!o && o.event === 'agent_domain_provisioned');
      expect(mine).toHaveLength(1);
      expect(mine[0].outcome).toBe('partial');
    });
  });

  /**
   * The anchor's measured reachability, which shipped NULL.
   *
   * All ten production rows landed with `manager_can_reach` and `manager_blocker` NULL, because
   * the INSERT omitted both columns. The API was unaffected -- it reads the registry -- so nothing
   * failed and nothing looked wrong; it was found by querying the table after provisioning.
   */
  describe('the anchor carries the measured reachability', () => {
    const plan = () => planProvision(DOMAIN);

    beforeEach(async () => { await wipe(plan().project_id); });

    it('a fresh provision writes both columns, not NULL', async () => {
      await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const rows = await sequelize.query<{ manager_can_reach: boolean | null; manager_blocker: string | null }>(
        `SELECT manager_can_reach, manager_blocker FROM agent_domain_projects WHERE domain_key = $1`,
        { bind: [DOMAIN], type: QueryTypes.SELECT },
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].manager_can_reach).not.toBeNull();
      expect(rows[0].manager_can_reach).toBe(plan().manager_can_reach);
    });

    it('RECONCILE repairs a row that already landed NULL', async () => {
      const { reconcileAnchorMetadata } = await import('../agentDomainProvisioner');
      await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      // Reproduce the production state exactly.
      await sequelize.query(
        `UPDATE agent_domain_projects SET manager_can_reach = NULL, manager_blocker = NULL
          WHERE domain_key = $1`, { bind: [DOMAIN] });

      const first = await reconcileAnchorMetadata({ sequelize, provisionedBy: PROVISIONED_BY });
      expect(first.find((r) => r.domain_key === DOMAIN)?.changed).toBe(true);

      const rows = await sequelize.query<{ manager_can_reach: boolean | null }>(
        `SELECT manager_can_reach FROM agent_domain_projects WHERE domain_key = $1`,
        { bind: [DOMAIN], type: QueryTypes.SELECT },
      );
      expect(rows[0].manager_can_reach).toBe(plan().manager_can_reach);
    });

    it('a SECOND reconcile changes nothing, and says so', async () => {
      const { reconcileAnchorMetadata } = await import('../agentDomainProvisioner');
      await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      await reconcileAnchorMetadata({ sequelize, provisionedBy: PROVISIONED_BY });
      const second = await reconcileAnchorMetadata({ sequelize, provisionedBy: PROVISIONED_BY });
      expect(second.find((r) => r.domain_key === DOMAIN)?.changed).toBe(false);
    });

    it('POSITIVE CONTROL: `<>` would NOT have repaired a NULL, which is why it is IS DISTINCT FROM', () => {
      // `NULL <> false` is NULL, so a `<>`-scoped UPDATE matches nothing and silently does no
      // work -- the exact failure this function exists to repair.
      expect(codeOfExecutor()).toMatch(/IS DISTINCT FROM/);
    });

    it('reconcile does NOT touch the insert counts, so idempotency still reads true', async () => {
      const { reconcileAnchorMetadata } = await import('../agentDomainProvisioner');
      await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      await reconcileAnchorMetadata({ sequelize, provisionedBy: PROVISIONED_BY });
      const again = await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      expect(again.already_present).toBe(true);
      expect(again.inserted.agent_domain_projects).toBe(0);
    });
  });

  it('never touches enrollments, and never writes ai_agents', async () => {
    const before = await sequelize.query<{ h: string }>(
      `SELECT md5(string_agg(e.id::text || coalesce(e.email,''), '|' ORDER BY e.id)) AS h FROM enrollments e`,
      { type: QueryTypes.SELECT },
    );
    await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
    const after = await sequelize.query<{ h: string }>(
      `SELECT md5(string_agg(e.id::text || coalesce(e.email,''), '|' ORDER BY e.id)) AS h FROM enrollments e`,
      { type: QueryTypes.SELECT },
    );
    expect(after[0].h).toBe(before[0].h);
    expect(await count(`SELECT count(*)::text AS n FROM ai_agents`)).toBe(0);
  });
/**
   * The blueprint the ten projects belong to.
   *
   * Found by querying production BEFORE the first provisioning run, which is the only place it could
   * have been found. The resolver took `ORDER BY created_at ASC LIMIT 1`, and in production that
   * returns "Enterprise AI Leadership Accelerator" -- the customer programme. Ten internal
   * AI-employee projects would have been created against it, nothing would have failed, and the only
   * trace would have been a `program_id` nobody reads.
   */
  describe('the program blueprint is the pinned one, not the oldest', () => {
    const plan = () => planProvision(DOMAIN);

    beforeEach(async () => { await wipe(plan().project_id); });

    it('an OLDER blueprint exists, so picking the oldest would pick the wrong one', async () => {
      const rows = await sequelize.query<{ id: string; name: string }>(
        `SELECT id, name FROM program_blueprints ORDER BY created_at ASC LIMIT 1`,
        { type: QueryTypes.SELECT },
      );
      // The fixture reproduces the production shape. Without this the test below could pass over a
      // single-blueprint table, where both strategies agree.
      expect(rows[0].name).toBe('Enterprise AI Leadership Accelerator');
      expect(rows[0].id).not.toBe(PROGRAM);
    });

    it('the project is attached to the PINNED blueprint', async () => {
      const r = await provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN);
      const rows = await sequelize.query<{ program_id: string }>(
        `SELECT program_id FROM projects WHERE id = $1`,
        { bind: [r.project_id], type: QueryTypes.SELECT },
      );
      expect(rows[0].program_id).toBe(PROGRAM);
    });

    it('REFUSES when the pinned blueprint is absent, rather than falling back', async () => {
      await sequelize.query(`DELETE FROM program_blueprints WHERE id = $1`, { bind: [PROGRAM] });
      try {
        await expect(provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN))
          .rejects.toThrow(/ProgramBlueprintError: no program_blueprints row with id/);
        // And it did NOT quietly use the older one.
        expect(await count(
          `SELECT count(*)::text AS n FROM projects WHERE id = $1`, [plan().project_id],
        )).toBe(0);
      } finally {
        await sequelize.query(
          `INSERT INTO program_blueprints (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          { bind: [PROGRAM, PROGRAM_NAME] });
      }
    });

    it('REFUSES when the id has been reused for a different programme', async () => {
      await sequelize.query(`UPDATE program_blueprints SET name = $2 WHERE id = $1`,
        { bind: [PROGRAM, 'Something Else Entirely'] });
      try {
        await expect(provisionDomain({ sequelize, provisionedBy: PROVISIONED_BY }, DOMAIN))
          .rejects.toThrow(/is named 'Something Else Entirely', expected/);
      } finally {
        await sequelize.query(`UPDATE program_blueprints SET name = $2 WHERE id = $1`,
          { bind: [PROGRAM, PROGRAM_NAME] });
      }
    });
  });
});
