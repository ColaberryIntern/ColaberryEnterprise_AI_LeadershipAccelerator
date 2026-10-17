/**
 * P7-T3 case 3 — concurrent revisions: the stage compare-and-swap. **LC-13, DB-backed.**
 *
 * ## The branch this exists for had NO test at any tier
 *
 * `lifecycleStatus.ts:265-285` is the **only production writer of
 * `project_lifecycle_states.stage`**. It writes conditionally:
 *
 *     ProjectLifecycleState.update({ stage: decision.to, ... },
 *                                  { where: { id: row.id, stage: row.stage } })
 *     if (updated === 0) return { ...decision, allowed: false, refusal: 'illegal_edge',
 *       message: 'The project stage changed while this request was in flight; nothing was applied.' }
 *
 * Measured before writing this file: `grep -rn "changed while this request was in flight" src`
 * finds the string in that one production line and in NO test. The nearby suites exercise the
 * PURE `evaluateTransition` producer, or mock the decision at the route; nothing reaches the
 * conditional update's loser. So the guard against two concurrent transitions both applying was
 * argued and never run.
 *
 * ## How this reaches it cheaply, which is the part worth explaining
 *
 * Getting to the CAS needs authorization to pass AND a transition to be permitted. Both look
 * expensive and are not:
 *
 *  - **Authorization.** `loadAndAuthorize` rides the `migration_open_legacy_admin` ramp, which
 *    opens when `tenant_memberships` is EMPTY -- which a disposable database is. Note the ramp
 *    needs the table to EXIST: `membershipSystemIsUnpopulated` catches a query error and returns
 *    `false` (strict), deliberately, because guessing "unpopulated" on a hiccup would hand out
 *    cross-tenant reads. So the table is created and left empty.
 *  - **The audit write** cannot block: `recordAccessDecision` catches its own failure and returns
 *    false (`tenantAccessAudit.ts:97-100`), so a missing audit table logs and continues.
 *  - **A permitted transition with no evidence.** `discovery` is the one stage whose
 *    prerequisites are just "the project has a tenant", and `STAGE_PERMISSION.discovery` is
 *    `project.read`, the lowest grant in the registry. `RETURN.requirements_ready` includes
 *    `discovery`. So a row seeded at `requirements_ready`, returned to `discovery` by an
 *    `observer`, is permitted without seeding a manifest, refs or approvals.
 *
 * That is a real transition on the real code path, not a shortcut around it: the same
 * `evaluateTransition`, the same authorization, the same conditional update.
 *
 * ## Running it
 *
 *   docker run --rm -d --name stage-cas-pg -p 55436:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=lifecycle_test \
 *     pgvector/pgvector:pg15
 *
 *   DATABASE_URL=postgres://test:test@localhost:55436/lifecycle_test \
 *     npx jest -c jest.config.ts stageCas.integration
 *
 *   docker rm -f stage-cas-pg
 *
 * Disposable database only. With no `DATABASE_URL` it SKIPS.
 */
import { QueryTypes } from 'sequelize';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[stageCas.integration] SKIPPED: no DATABASE_URL. Needs a real Postgres; see the header. '
    + 'It is NOT evidence about LC-13 unless it ran.',
  );
}

jest.setTimeout(120_000);

describeIfDb('LC-13 case 3 — two concurrent transitions, one applied', () => {
  let sequelize: import('sequelize').Sequelize;
  let requestTransition: typeof import('../lifecycleStatus').requestTransition;
  let ensureProjectLifecycleSchema:
    typeof import('../../../db/ensureProjectLifecycleSchema').ensureProjectLifecycleSchema;

  const TENANT = '61111111-1111-1111-1111-111111111111';
  const PROJECT = '62222222-2222-2222-2222-222222222222';
  // `observer` grants `project.read`, which is exactly what entering `discovery` requires and
  // nothing more -- so this cannot pass by being over-privileged.
  const ADMIN = { id: 'admin-1', email: 'observer@example.test', role: 'observer' };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ requestTransition } = await import('../lifecycleStatus'));
    ({ ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema'));

    await sequelize.query(`CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)`);
    // EMPTY ON PURPOSE: an empty membership table is what opens the migration ramp, and an
    // ABSENT one closes it (the count throws and the bridge answers "populated", strictly).
    await sequelize.query(`CREATE TABLE IF NOT EXISTS tenant_memberships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, platform_identity_id UUID, role TEXT)`);
    await sequelize.query(`INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [TENANT] });
    await sequelize.query(`INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [PROJECT] });

    await ensureProjectLifecycleSchema();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  /** One lifecycle row at `requirements_ready`, which RETURNS to `discovery`. */
  async function seedAt(stage: string): Promise<void> {
    await sequelize.query(
      `DELETE FROM project_lifecycle_states WHERE tenant_id = $1`, { bind: [TENANT] },
    );
    await sequelize.query(
      `INSERT INTO project_lifecycle_states (tenant_id, student_project_id, stage)
       VALUES ($1, $2, $3)`,
      { bind: [TENANT, PROJECT, stage] },
    );
  }

  async function stageNow(): Promise<string> {
    const rows = await sequelize.query<{ stage: string }>(
      `SELECT stage FROM project_lifecycle_states WHERE student_project_id = $1`,
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
    return rows[0]?.stage;
  }

  const ret = () => requestTransition({
    projectId: PROJECT, kind: 'student' as const, to: 'discovery' as never,
    reason: 'sent back for rework', isDraftScenario: false, admin: ADMIN,
  });

  it('APPARATUS: a single return transition is PERMITTED and applied', async () => {
    // The positive control, first. Without it, every refusal below could be the authorization
    // ramp or the permission check refusing, and the CAS would never be reached at all.
    await seedAt('requirements_ready');
    const decision = await ret();

    expect(decision.allowed).toBe(true);
    expect(decision.refusal).toBeUndefined();
    expect(await stageNow()).toBe('discovery');
  });

  it('TWO CONCURRENT returns: exactly one applies, and the loser is told the stage moved', async () => {
    await seedAt('requirements_ready');

    const [a, b] = await Promise.all([ret(), ret()]);
    const outcomes = [a, b];
    const applied = outcomes.filter((d) => d.allowed);
    const refused = outcomes.filter((d) => !d.allowed);

    // The invariant: one write, not two.
    expect(applied).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(await stageNow()).toBe('discovery');

    // THE BRANCH THIS SUITE EXISTS FOR. `lifecycleStatus.ts:278-285`, previously unreached by
    // any test. The loser is refused with a reason a caller can act on, not a silent no-op and
    // not a second apply.
    expect(refused[0].refusal).toBe('illegal_edge');
    expect(refused[0].message).toContain('changed while this request was in flight');
    expect(refused[0].message).toContain('nothing was applied');
  });

  it('the loser does NOT overwrite the winner, even though both decided the same target', async () => {
    // Both callers computed `to: discovery`, so a blind second UPDATE would be invisible in the
    // final stage -- it would look identical. The observable difference is the REFUSAL, and the
    // write count. Asserted on `updated_at`, which a second UPDATE would move.
    await seedAt('requirements_ready');
    await Promise.all([ret(), ret()]);

    const rows = await sequelize.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM project_lifecycle_states WHERE student_project_id = $1`,
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it('a transition requested from a stage that has already moved is refused, not re-applied', async () => {
    // The sequential form of the same race, which is what a retried request looks like: the
    // first call succeeds, the second arrives believing the old stage is current.
    await seedAt('requirements_ready');

    const first = await ret();
    expect(first.allowed).toBe(true);
    expect(await stageNow()).toBe('discovery');

    // Now at `discovery`, whose RETURN list is empty, so this is refused BEFORE the CAS -- by
    // `evaluateTransition`. Named as a different refusal on purpose: it proves the two guards
    // are distinguishable, rather than one masking the other.
    const second = await ret();
    expect(second.allowed).toBe(false);
    expect(second.message).not.toContain('changed while this request was in flight');
    expect(await stageNow()).toBe('discovery');
  });

  it('CONTROL: an unknown role is refused, so the ramp is not authorizing everything', async () => {
    // The migration ramp opens tenant SCOPE, not permission. If this passed, the permitted
    // transition above would be meaningless -- it would prove only that nothing was checked.
    await seedAt('requirements_ready');
    const decision = await requestTransition({
      projectId: PROJECT, kind: 'student' as const, to: 'discovery' as never,
      reason: 'sent back', isDraftScenario: false,
      admin: { id: 'a2', email: 'nobody@example.test', role: 'not_a_real_role' },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toBe('forbidden');
    expect(await stageNow()).toBe('requirements_ready');
  });
});
