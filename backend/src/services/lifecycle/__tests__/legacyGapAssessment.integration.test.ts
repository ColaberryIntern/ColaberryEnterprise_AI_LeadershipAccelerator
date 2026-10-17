/**
 * P7-T4 — the legacy gap assessor and the migration preview. **LC-15, DB-backed.**
 *
 * The acceptance has four clauses and three of them are about restraint:
 *
 *  - run against the real counts (62 legacy projects, 47 published plans);
 *  - **no fabricated approvals** -- a control attempts to synthesise one and is refused;
 *  - the preview **writes NOTHING**, proven by before/after row counts across every table it
 *    reads, not by reading the code and trusting it;
 *  - existing progress, approvals and IDs **enumerated, not sampled**.
 *
 * ## On the two production figures
 *
 * `plan-phase7.md:528` cites "62 student projects, 47 published plans" from a Phase 1
 * measurement, weeks before this packet. They were re-measured against production on
 * 2026-10-17 and are unchanged: 72 `projects` rows, 10 with a student lifecycle row, **62**
 * without, and **47** published plans.
 *
 * A first attempt at that re-measurement counted DISTINCT `build_intake` projects and got 48,
 * and was one sentence away from reporting false drift. `build_intake` is the wizard subset, not
 * the project table. The instrument is named with the figure here for that reason.
 *
 * Those are production numbers and cannot be asserted from a disposable database. What this
 * suite does instead is prove the ASSESSOR produces the right shape on data it controls, so the
 * production run is a matter of pointing it at production rather than of trusting it.
 *
 * ## Running it
 *
 *   docker run --rm -d --name legacy-gap-pg -p 55438:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=lifecycle_test \
 *     pgvector/pgvector:pg15
 *
 *   DATABASE_URL=postgres://test:test@localhost:55438/lifecycle_test \
 *     npx jest -c jest.config.ts legacyGapAssessment.integration
 *
 *   docker rm -f legacy-gap-pg
 */
import { QueryTypes } from 'sequelize';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[legacyGapAssessment.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

/** Every table the assessor's query touches. The write-nothing proof counts all of them. */
const TABLES = ['projects', 'project_lifecycle_states', 'build_intake', 'build_plans', 'student_tasks'];

describeIfDb('LC-15 — legacy gap assessment and migration preview', () => {
  let sequelize: import('sequelize').Sequelize;
  let assessLegacyProjects: typeof import('../legacyGapAssessment').assessLegacyProjects;
  let previewLegacyMigration: typeof import('../legacyGapAssessment').previewLegacyMigration;
  let ensureProjectLifecycleSchema:
    typeof import('../../../db/ensureProjectLifecycleSchema').ensureProjectLifecycleSchema;
  let ensureSbpSchema: typeof import('../../../db/ensureSbpSchema').ensureSbpSchema;

  const TENANT = '81111111-1111-1111-1111-111111111111';
  /** Three legacy projects (no lifecycle row) and one registered, so the filter has to work. */
  const LEGACY = [
    '8a000000-0000-0000-0000-000000000001',
    '8a000000-0000-0000-0000-000000000002',
    '8a000000-0000-0000-0000-000000000003',
  ];
  const REGISTERED = '8b000000-0000-0000-0000-000000000001';
  const CUTOFF = new Date('2026-10-12T00:00:00.000Z');

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ assessLegacyProjects, previewLegacyMigration } = await import('../legacyGapAssessment'));
    ({ ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema'));
    ({ ensureSbpSchema } = await import('../../../db/ensureSbpSchema'));

    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)`,
    );
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY, tenant_id UUID,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );
    await sequelize.query(`CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)`);
    // `student_tasks` belongs to another schema module; a minimal stand-in is enough for a count.
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS student_tasks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         project_id UUID)`,
    );
    await sequelize.query(`INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [TENANT] });

    await ensureProjectLifecycleSchema();
    await ensureSbpSchema();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query(`DELETE FROM build_plans WHERE project_id = ANY($1::uuid[])`,
      { bind: [[...LEGACY, REGISTERED]] });
    await sequelize.query(`DELETE FROM build_intake WHERE project_id = ANY($1::uuid[])`,
      { bind: [[...LEGACY, REGISTERED]] });
    await sequelize.query(`DELETE FROM student_tasks WHERE project_id = ANY($1::uuid[])`,
      { bind: [[...LEGACY, REGISTERED]] });
    await sequelize.query(`DELETE FROM project_lifecycle_states WHERE tenant_id = $1`, { bind: [TENANT] });
    await sequelize.query(`DELETE FROM projects WHERE id = ANY($1::uuid[])`,
      { bind: [[...LEGACY, REGISTERED]] });

    // Three legacy projects, created before the cutoff.
    for (const id of LEGACY) {
      await sequelize.query(
        `INSERT INTO projects (id, tenant_id, created_at) VALUES ($1, $2, '2026-09-01T00:00:00Z')`,
        { bind: [id, TENANT] },
      );
    }
    // One project created before the cutoff that DOES have a lifecycle row: must be excluded.
    await sequelize.query(
      `INSERT INTO projects (id, tenant_id, created_at) VALUES ($1, $2, '2026-09-01T00:00:00Z')`,
      { bind: [REGISTERED, TENANT] },
    );
    await sequelize.query(
      `INSERT INTO project_lifecycle_states (tenant_id, student_project_id, stage)
       VALUES ($1, $2, 'discovery')`,
      { bind: [TENANT, REGISTERED] },
    );
  });

  async function counts(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of TABLES) {
      const rows = await sequelize.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${t}`, { type: QueryTypes.SELECT },
      );
      out[t] = Number(rows[0].n);
    }
    return out;
  }

  it('ENUMERATES every legacy project, and excludes one that has a lifecycle row', async () => {
    const report = await assessLegacyProjects(CUTOFF);
    const ids = report.map((r) => r.projectId);

    // Enumerated, not sampled: every seeded id is present and the registered one is not.
    for (const id of LEGACY) expect(ids).toContain(id);
    expect(ids).not.toContain(REGISTERED);
    expect(report.filter((r) => LEGACY.includes(r.projectId))).toHaveLength(LEGACY.length);
    for (const r of report) expect(r.hasLifecycleRow).toBe(false);
  });

  it('COUNTS what each project has, rather than inferring it', async () => {
    await sequelize.query(
      `INSERT INTO build_intake (project_id, idea, status) VALUES ($1, 'legacy idea', 'published')`,
      { bind: [LEGACY[0]] },
    );
    await sequelize.query(
      `INSERT INTO student_tasks (project_id) VALUES ($1), ($1)`, { bind: [LEGACY[0]] },
    );

    const report = await assessLegacyProjects(CUTOFF);
    const first = report.find((r) => r.projectId === LEGACY[0])!;
    const second = report.find((r) => r.projectId === LEGACY[1])!;

    expect(first.counts.intake).toBe(true);
    expect(first.counts.tasks).toBe(2);
    // The negative half, so the counts are discriminating rather than always-true.
    expect(second.counts.intake).toBe(false);
    expect(second.counts.tasks).toBe(0);
  });

  it('stops at the stage the EVIDENCE justifies, naming the rule that stops it', async () => {
    // Derived by the shipped predicate, not hardcoded here. With no manifest and no approval --
    // which is every legacy project, and 0 rows in production for both tables -- the honest
    // answer is `discovery`, and the reason is a `not_assessed` gap on the next stage.
    const report = await assessLegacyProjects(CUTOFF);

    for (const r of report) {
      expect(r.highestJustifiableStage).toBe('discovery');
      expect(r.stoppedBy).toContain('requirements_ready');
      expect(r.stoppedBy).toContain('not_assessed');
    }
  });

  it('THE PREVIEW WRITES NOTHING, proven by before/after counts on every table it reads', async () => {
    await sequelize.query(
      `INSERT INTO build_intake (project_id, idea, status) VALUES ($1, 'legacy', 'published')`,
      { bind: [LEGACY[0]] },
    );
    const before = await counts();

    const report = await assessLegacyProjects(CUTOFF);
    const preview = previewLegacyMigration(report);

    const after = await counts();

    // Every table, not a spot check -- the acceptance says "across every table it reads".
    expect(after).toEqual(before);
    // And the preview really did produce something, so the equality above is not vacuous.
    expect(preview.proposals.length).toBeGreaterThan(0);
    expect(preview.assessed).toBe(report.length);
  });

  it('the preview PRESERVES what exists: counted, so nothing is being discarded silently', async () => {
    await sequelize.query(
      `INSERT INTO build_intake (project_id, idea, status) VALUES ($1, 'legacy', 'published')`,
      { bind: [LEGACY[0]] },
    );
    await sequelize.query(`INSERT INTO student_tasks (project_id) VALUES ($1), ($1), ($1)`,
      { bind: [LEGACY[1]] });

    const preview = previewLegacyMigration(await assessLegacyProjects(CUTOFF));

    expect(preview.preserves.intakes).toBe(1);
    expect(preview.preserves.tasks).toBe(3);
  });

  it('every proposal creates a lifecycle row and NOTHING else', async () => {
    const preview = previewLegacyMigration(await assessLegacyProjects(CUTOFF));

    for (const p of preview.proposals) {
      expect(p.create).toBe('lifecycle_row');
      expect(p.stage).toBe('discovery');
    }
    // And the refusals are reported as loudly as the proposals.
    expect(preview.refused.map((r) => r.kind).sort())
      .toEqual(['approval', 'design_selection', 'manifest', 'proposed_by']);
  });
});
