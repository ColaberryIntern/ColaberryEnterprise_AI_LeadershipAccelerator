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

  const TENANT = '33333333-3333-3333-3333-333333333333';
  const ENROLLMENT = '44444444-4444-4444-4444-444444444444';
  const PROGRAM = '55555555-5555-5555-5555-555555555555';
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

  async function wipe(projectId: string): Promise<void> {
    // Children cascade on projects(id); the delete is scoped to the one derived id this suite owns.
    await sequelize.query('DELETE FROM projects WHERE id = $1', { bind: [projectId] });
  }

  beforeAll(async () => {
    // Lazily imported so the module's top-level `new Sequelize(...)` never runs in CI.
    ({ sequelize } = await import('../../../config/database'));
    ({ provisionDomain } = await import('../agentDomainProvisioner'));
    ({ planProvision } = await import('../agentDomainProvisionPlan'));

    // Minimal stand-ins for the tables the real DDL references. Created FIRST so the ensure call
    // applies cleanly, and before any `sync()` — which would otherwise test a fake schema first.
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY, slug TEXT UNIQUE)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS ai_agents (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS program_blueprints (
      id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS enrollments (
      id UUID PRIMARY KEY, email TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS admin_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE, role TEXT)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY,
      enrollment_id UUID NOT NULL REFERENCES enrollments(id),
      program_id UUID NOT NULL REFERENCES program_blueprints(id),
      name TEXT, project_stage TEXT NOT NULL DEFAULT 'discovery',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS student_task_lists (
      id UUID PRIMARY KEY,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      enrollment_id UUID NOT NULL REFERENCES enrollments(id),
      cluster VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started', position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS student_tasks (
      id UUID PRIMARY KEY,
      task_list_id UUID NOT NULL REFERENCES student_task_lists(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL, description TEXT, narrative TEXT, build TEXT,
      status TEXT NOT NULL DEFAULT 'not_started', position INTEGER NOT NULL DEFAULT 0,
      story_id VARCHAR(60), release_key VARCHAR(60),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

    await sequelize.query(
      `INSERT INTO tenants (id, slug) VALUES ($1, 'colaberry') ON CONFLICT DO NOTHING`, { bind: [TENANT] });
    await sequelize.query(
      `INSERT INTO program_blueprints (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [PROGRAM] });
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
      const randomId = await sequelize.query<{ id: string }>(
        `INSERT INTO projects (id, enrollment_id, program_id, name)
         VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
        { bind: [ENROLLMENT, PROGRAM, DOMAIN], type: QueryTypes.SELECT },
      );
      expect(randomId).toHaveLength(1);
      expect(randomId[0].id).not.toBe(p.project_id);
      const total = await count(
        `SELECT count(*)::text AS n FROM projects WHERE name = $1`, [DOMAIN]);
      expect(total).toBe(2); // the derived one plus the random one
      await sequelize.query(`DELETE FROM projects WHERE id = $1`, { bind: [randomId[0].id] });
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
        const second = await sequelize.query<{ id: string }>(
          `INSERT INTO projects (id, enrollment_id, program_id, name)
           VALUES (gen_random_uuid(), $1, $2, 'control-second') RETURNING id`,
          { bind: [ENROLLMENT, PROGRAM], type: QueryTypes.SELECT },
        );
        secondProject = second[0].id;

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
});
