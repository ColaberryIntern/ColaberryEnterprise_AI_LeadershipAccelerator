import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { QueryTypes, type Sequelize } from 'sequelize';

/* eslint-disable @typescript-eslint/no-var-requires, global-require */

/**
 * P6-T6 — the front-door SKILL, measured by its SCRIPT and not by its prose.
 *
 * ## Why this file exists in this shape
 *
 * Cycle 1 of this task asserted the front door over the skill's Markdown, and the plan audit
 * correctly called that a claim that can pass without any behaviour behind it. A skill document
 * saying "always create projects through the governed path" is a sentence; it refuses nothing.
 *
 * So the acceptance was rewritten to the thing that can actually be false: the skill's COMMITTED
 * SCRIPT calls the governed entry point, and cannot reach a creation path that bypasses it. That
 * is what this file measures, against a real Postgres, by:
 *
 *   1. running the script's own function and showing the lifecycle row appears,
 *   2. PERFORMING a bypass and showing the script refuses it,
 *   3. running the invocation written in the script's own header,
 *   4. refusing the student path, loudly and by name.
 *
 * The Markdown is then checked for CONSISTENCY with that measured behaviour at the bottom of
 * this file. That block is labelled a documentation check, because it is one: it proves the
 * document agrees with the code, not that the code does anything.
 *
 * ## Running it
 *
 *   docker exec acc-lifecycle-scratch-pg psql -U postgres -c 'CREATE DATABASE t6_frontdoor;'
 *   DATABASE_URL=postgres://postgres:scratchlocal@localhost:55432/t6_frontdoor \
 *     npx jest --no-cache --forceExit --runTestsByPath \
 *     src/services/lifecycle/__tests__/projectLifecycleSkill.integration.test.ts
 *
 * SKIPS VISIBLY without `DATABASE_URL`. The claim is that a hook fires and writes a row; that
 * cannot be checked without a database, and a green report from a run that never connected would
 * be worse than no report.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[projectLifecycleSkill.integration] SKIPPED: no DATABASE_URL. The front door\'s only '
    + 'executable evidence is that a lifecycle row appears, which needs a real Postgres.',
  );
}

const SKILL_DIR = path.join(__dirname, '..', '..', '..', '..', '..', '.claude', 'skills', 'project-lifecycle');
const SCRIPT = path.join(SKILL_DIR, 'scripts', 'registerGovernedProject.js');
const TENANT = '77777777-7777-4777-8777-777777777771';
const ENGAGEMENT = '77777777-7777-4777-8777-777777777772';

describeIfDb('the front-door script creates a GOVERNED project', () => {
  let sequelize: Sequelize;
  let DeliveryProject: any;
  let registerGovernedProject: any;
  let GovernanceRefusal: any;
  let parseArgs: any;

  async function lifecycleRowsFor(projectId: string) {
    return sequelize.query<{ id: string; stage: string; tenant_id: string }>(
      'SELECT id, stage, tenant_id FROM project_lifecycle_states WHERE delivery_project_id = $1',
      { bind: [projectId], type: QueryTypes.SELECT },
    );
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    DeliveryProject = (await import('../../../models/DeliveryProject')).default;
    ({ registerGovernedProject, GovernanceRefusal, parseArgs } = require(SCRIPT));
    const { ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema');

    // Built FROM THE MODELS, never by hand-written DDL. A one-column stand-in for `tenants` made
    // a later `Tenant.sync()` a no-op in a sibling suite and broke it in either order; the note on
    // `lifecycleRegistration.integration.test.ts` records that in full.
    const Tenant = (await import('../../../models/Tenant')).default as any;
    await Tenant.sync();
    await Tenant.findOrCreate({
      where: { id: TENANT },
      defaults: { id: TENANT, slug: 't6-frontdoor', name: 'T6 front door' },
    });
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await DeliveryProject.sync();
    await ensureProjectLifecycleSchema();
  }, 180_000);

  afterAll(async () => {
    if (!sequelize) return;
    await sequelize.query('DELETE FROM project_lifecycle_states WHERE tenant_id = $1', { bind: [TENANT] })
      .catch(() => undefined);
    await sequelize.query('DELETE FROM delivery_projects WHERE tenant_id = $1', { bind: [TENANT] })
      .catch(() => undefined);
    await sequelize.close();
  });

  it('ONE invocation produces ONE lifecycle row, carrying the requested tenant', async () => {
    const result = await registerGovernedProject(
      { kind: 'delivery', tenantId: TENANT, engagementId: ENGAGEMENT, name: 'T6 Governed Project' },
      { sequelize, DeliveryProject },
    );

    expect(result.projectId).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await lifecycleRowsFor(result.projectId);
    // EXACTLY one. The hook's `ON CONFLICT DO NOTHING` makes a replay a no-op, and two rows for
    // one project would mean the conflict target is wrong.
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT);
    expect(rows[0].id).toBe(result.lifecycleId);
    // The script reports the stage it observed rather than the stage it expected.
    expect(result.stage).toBe(rows[0].stage);
  }, 60_000);

  it('THE BYPASS, PERFORMED AND REFUSED: a creator that writes raw SQL is caught', async () => {
    // Not a source assertion. This injects a `DeliveryProject` whose `create` inserts the row
    // DIRECTLY, exactly as a well-meaning edit to the script would -- raw SQL skips Sequelize's
    // hooks, so no lifecycle row is written and the project exists ungoverned.
    //
    // The script's own verify step is what refuses it. That is the property worth having: the
    // front door cannot be quietly rewritten into a bypass, because it checks its own outcome
    // instead of trusting the creation call.
    const id = randomUUID();
    const bypassingCreator = {
      create: async (attrs: Record<string, unknown>) => {
        await sequelize.query(
          `INSERT INTO delivery_projects
             (id, engagement_id, tenant_id, name, slug, project_class, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
          { bind: [id, attrs.engagement_id, attrs.tenant_id, attrs.name, attrs.slug, attrs.project_class, attrs.status] },
        );
        return { id };
      },
    };

    await expect(registerGovernedProject(
      { kind: 'delivery', tenantId: TENANT, engagementId: ENGAGEMENT, name: 'T6 Bypass Attempt' },
      { sequelize, DeliveryProject: bypassingCreator },
    )).rejects.toThrow(/GOVERNANCE FAILURE[\s\S]*NO lifecycle row/);

    // And the bypass really did create an ungoverned row, which is what makes the refusal
    // meaningful rather than a lucky throw: the project exists and has no lifecycle.
    const rows = await lifecycleRowsFor(id);
    expect(rows).toHaveLength(0);
    const [project] = await sequelize.query<{ id: string }>(
      'SELECT id FROM delivery_projects WHERE id = $1', { bind: [id], type: QueryTypes.SELECT },
    );
    expect(project.id).toBe(id);
  }, 60_000);

  it('POSITIVE CONTROL for the bypass check: the real model DOES register', async () => {
    // Without this, a verify step that threw unconditionally would pass the test above and
    // refuse every legitimate creation.
    const result = await registerGovernedProject(
      { kind: 'delivery', tenantId: TENANT, engagementId: ENGAGEMENT, name: 'T6 Control' },
      { sequelize, DeliveryProject },
    );
    expect(await lifecycleRowsFor(result.projectId)).toHaveLength(1);
  }, 60_000);

  it('refuses a cross-tenant lifecycle row rather than returning it', async () => {
    // The hook reads the tenant off the row it is registering, so a mismatch would mean the hook
    // keyed on something else. Checked because the script RETURNS this id to its caller, and a
    // caller acting on another tenant's lifecycle is LC-14's territory.
    const other = '77777777-7777-4777-8777-77777777777f';
    const wrongTenantCreator = {
      create: async (attrs: Record<string, unknown>) => DeliveryProject.create({ ...attrs, tenant_id: other }),
    };
    const Tenant = (await import('../../../models/Tenant')).default as any;
    await Tenant.findOrCreate({
      where: { id: other }, defaults: { id: other, slug: 't6-other', name: 'T6 other' },
    });

    await expect(registerGovernedProject(
      { kind: 'delivery', tenantId: TENANT, engagementId: ENGAGEMENT, name: 'T6 Wrong Tenant' },
      { sequelize, DeliveryProject: wrongTenantCreator },
    )).rejects.toThrow(/GOVERNANCE FAILURE[\s\S]*carries tenant/);

    await sequelize.query('DELETE FROM project_lifecycle_states WHERE tenant_id = $1', { bind: [other] });
    await sequelize.query('DELETE FROM delivery_projects WHERE tenant_id = $1', { bind: [other] });
    await sequelize.query('DELETE FROM tenants WHERE id = $1', { bind: [other] });
  }, 60_000);

  it('REFUSES the student path by name, and does not touch the database', async () => {
    // The front door must not silently do nothing for student projects. A refusal that named no
    // reason would send an operator looking for a bug in their invocation instead of at P6-T1b.
    const before = await sequelize.query<{ n: string }>(
      'SELECT count(*) AS n FROM project_lifecycle_states WHERE tenant_id = $1',
      { bind: [TENANT], type: QueryTypes.SELECT },
    );

    let caught: any;
    try {
      await registerGovernedProject(
        { kind: 'student', tenantId: TENANT, name: 'T6 Student' },
        { sequelize, DeliveryProject },
      );
    } catch (e) { caught = e; }

    expect(caught).toBeInstanceOf(GovernanceRefusal);
    expect(caught.reason).toBe('student_lifecycle_unregistered');
    expect(caught.message).toContain('P6-T1b');
    expect(caught.message).toContain('build-student-project');

    const after = await sequelize.query<{ n: string }>(
      'SELECT count(*) AS n FROM project_lifecycle_states WHERE tenant_id = $1',
      { bind: [TENANT], type: QueryTypes.SELECT },
    );
    expect(after[0].n).toBe(before[0].n);
  }, 60_000);

  it('THE DOCUMENTED INVOCATION WORKS: the header\'s own command parses to valid input', async () => {
    // The failure class this guards is a document that disproves its own example, which a Phase 4
    // handoff was failed for three times. The first draft of this script derived field names by
    // camel-casing the flag, so `--tenant` became `tenant` while the function required `tenantId`
    // and the documented command would have refused every time with `missing_input`.
    //
    // The flags are read OUT OF THE HEADER COMMENT, not retyped here, so the test follows the
    // document rather than agreeing with a copy of it.
    const src = fs.readFileSync(SCRIPT, 'utf8').replace(/\r\n/g, '\n');
    const usage = src.slice(src.indexOf('## Usage'), src.indexOf('Reads `DATABASE_URL`'));
    const flags = [...usage.matchAll(/--([a-z-]+)/g)].map((m) => m[1]);

    // Positive control: the usage block really was found and really does name flags. A regex
    // that matched nothing would make the assertion below vacuous.
    expect(flags).toContain('kind');
    expect(flags.length).toBeGreaterThanOrEqual(4);

    // Every documented flag maps to a real input field.
    const parsed = parseArgs(flags.flatMap((f: string) => [`--${f}`, 'x']));
    expect(parsed.__unknown).toBeUndefined();

    // And the full documented invocation reaches the governed path rather than a validation
    // refusal: it is run with a real tenant and engagement substituted for the placeholders.
    const argv = ['--kind', 'delivery', '--tenant', TENANT, '--engagement', ENGAGEMENT, '--name', 'T6 Documented'];
    const result = await registerGovernedProject(parseArgs(argv), { sequelize, DeliveryProject });
    expect(await lifecycleRowsFor(result.projectId)).toHaveLength(1);
  }, 60_000);
});

/**
 * DOCUMENTATION CHECK, and labelled as one.
 *
 * Nothing below proves any behaviour. It proves the skill document agrees with the behaviour the
 * suite above measured, which is a different and much weaker claim. It is worth having because a
 * front-door skill whose prose contradicts its script is how an agent ends up taking the
 * ungoverned path while believing it is governed, but it must never be mistaken for evidence
 * that the front door works.
 *
 * Runs WITHOUT a database, on purpose: a documentation check that skips in CI documents nothing.
 */
describe('DOCUMENTATION CHECK: the skill document agrees with the measured behaviour', () => {
  const read = (f: string) => fs.readFileSync(path.join(SKILL_DIR, f), 'utf8').replace(/\r\n/g, '\n');

  it('the skill exists, names its script, and the script it names is there', () => {
    const skill = read('SKILL.md');
    expect(skill).toContain('registerGovernedProject.js');
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it('STATES THE T1b BLOCKER, because a front door that silently skips students is worse than none', () => {
    // Required by the task in those terms. The document has to say that the student half is not
    // governed yet, or it would carry this skill's authority over a path it does not cover.
    const skill = read('SKILL.md');
    expect(skill).toContain('P6-T1b');
    expect(skill.toLowerCase()).toContain('not governed');
  });

  it('does not claim the student path is covered', () => {
    // The specific wrong sentence. A document saying "every new project registers a lifecycle"
    // would be false today and would be believed.
    const skill = read('SKILL.md');
    expect(skill).not.toMatch(/every new project (now )?registers a lifecycle/i);
  });

  it('preserves story-build and build-student-project rather than replacing them', () => {
    // `request.md:247`: story-build's current meaning and the Basecamp integration are preserved.
    const skill = read('SKILL.md');
    expect(skill).toContain('story-build');
    expect(skill).toContain('build-student-project');
  });
});
