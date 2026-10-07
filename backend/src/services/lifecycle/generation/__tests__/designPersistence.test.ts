/**
 * P4-T6 — the design-decision and visual-contract tables, exercised THROUGH THEIR MODELS against
 * a real Postgres.
 *
 * ## Why this suite exists at all
 *
 * `blueprint_role_map` sits in the carried-forward register as an open obligation for one reason:
 * a table with no model has no reader. Two more tables without models would have repeated that.
 * So the models ship with the DDL, and this is the proof that the reader works — a write and a
 * read back, not a type that merely compiles.
 *
 * ## It also proves the two DB-level invariants, which a model cannot
 *
 * `uq_design_decision_approved_tier` is PARTIAL (`WHERE status = 'approved'`), and that is the
 * whole design: `deliveryDesignLoop` is built on "supersession, never silent overwrite", so many
 * rows per tier over time is correct while many APPROVED rows at one tier is not. A full unique
 * index would forbid supersession; no index would allow two rows that both claim to be what was
 * agreed. Only a real Postgres can tell those three apart, which is why this is here and not a
 * mocked unit test.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run -d --name lifecycle-pg-test -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test \
 *     -e POSTGRES_DB=lifecycle_test -p 55432:5432 postgres:16-alpine
 *
 *   # from backend/, once `pg_isready` reports accepting connections:
 *   DATABASE_URL=postgres://test:test@localhost:55432/lifecycle_test \
 *     node ../node_modules/jest/bin/jest.js --runTestsByPath \
 *       src/services/lifecycle/generation/__tests__/designPersistence.test.ts
 *
 *   docker rm -f lifecycle-pg-test
 *
 * Throwaway credentials for a container that lives for one run; nothing here is a secret and
 * nothing persists. It must never be pointed at production, and it writes only rows it created
 * under a fixed synthetic tenant, which it deletes afterwards.
 *
 * ## Why it stays IN the CI gate rather than on the ignore list
 *
 * Exactly the choice `blueprintApproval.concurrency.integration.test.ts` made and documented:
 * with no `DATABASE_URL` it SKIPS, and a skipped test reports as skipped — visible. An ignored
 * one reports as nothing at all. CI has no `DATABASE_URL` (`jest.ci.config.ts:19`), and a
 * Postgres container there is deliberately a separate change (`:37`).
 */
import { QueryTypes } from 'sequelize';

// Standing up schema and round-tripping real connections is nothing like a unit test's 5s
// default, and the timeout belongs with the suite rather than in a runner config.
jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);

// Skip rather than fail when there is no database. Failing here would look like a defect in the
// product rather than an absent environment.
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.log(
    '[designPersistence] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; see the '
    + 'header for the throwaway-container command.',
  );
}

describeIfDb('the design tables round trip through their models', () => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require */
  const { sequelize } = require('../../../../config/database');
  const { ensureProjectLifecycleSchema } = require('../../../../db/ensureProjectLifecycleSchema');
  const BlueprintDesignDecision = require('../../../../models/BlueprintDesignDecision').default;
  const BlueprintVisualContract = require('../../../../models/BlueprintVisualContract').default;
  /* eslint-enable @typescript-eslint/no-var-requires, global-require */

  // Clearly synthetic and fixed, so cleanup can be exact rather than a truncate.
  const TENANT = '00000000-0000-4000-8000-00000000d651';
  const PROJECT = '00000000-0000-4000-8000-00000000d652';
  const HASH = 'a'.repeat(64);
  let manifestId = '';

  beforeAll(async () => {
    await ensureProjectLifecycleSchema();
    await sequelize.query(
      "INSERT INTO tenants (id, name) VALUES (:t, 'P4-T6 synthetic') ON CONFLICT (id) DO NOTHING",
      { replacements: { t: TENANT } },
    );
    await sequelize.query(
      "INSERT INTO projects (id, name) VALUES (:p, 'P4-T6 synthetic') ON CONFLICT (id) DO NOTHING",
      { replacements: { p: PROJECT } },
    );
    const rows: any = await sequelize.query(
      `INSERT INTO operating_blueprint_manifests
         (tenant_id, student_project_id, revision, content_sha256, status, refs_json, proposed_by)
       VALUES (:t, :p, 1, :h, 'draft', '{}'::jsonb, 'architect@example.test')
       RETURNING id`,
      { replacements: { t: TENANT, p: PROJECT, h: HASH }, type: QueryTypes.INSERT },
    );
    manifestId = (Array.isArray(rows) ? rows[0]?.[0]?.id ?? rows[0]?.id : rows?.id) as string;
    expect(typeof manifestId).toBe('string');
  });

  afterAll(async () => {
    // Children first; the FKs cascade, but deleting explicitly says what this suite owns.
    await sequelize.query('DELETE FROM blueprint_visual_contracts WHERE tenant_id = :t', { replacements: { t: TENANT } });
    await sequelize.query('DELETE FROM blueprint_design_decisions WHERE tenant_id = :t', { replacements: { t: TENANT } });
    await sequelize.query('DELETE FROM operating_blueprint_manifests WHERE tenant_id = :t', { replacements: { t: TENANT } });
    await sequelize.query('DELETE FROM projects WHERE id = :p', { replacements: { p: PROJECT } });
    await sequelize.query('DELETE FROM tenants WHERE id = :t', { replacements: { t: TENANT } });
    await sequelize.close();
  });

  /**
   * Capture the constraint a write violated.
   *
   * Sequelize reports EVERY integrity violation with the message "Validation error", so
   * `rejects.toThrow(/unique/)` fails even when the index did its job — which is how the
   * first version of these two tests failed while the database was behaving correctly. The
   * driver error underneath carries the real constraint name, and asserting THAT distinguishes
   * "the right index fired" from "something, somewhere, said no".
   */
  async function violation(write: () => Promise<unknown>): Promise<{ name: string; constraint?: string }> {
    try {
      await write();
    } catch (err: any) {
      return { name: String(err?.name), constraint: err?.parent?.constraint ?? err?.original?.constraint };
    }
    throw new Error('the write SUCCEEDED; the constraint under test did not fire');
  }

  const decision = (over: Record<string, unknown> = {}) => ({
    tenant_id: TENANT,
    manifest_id: manifestId,
    manifest_content_hash: HASH,
    tier: 'page_family',
    status: 'draft',
    variant_count: 2,
    dna_facets: ['theme', 'navigation'],
    ...over,
  });

  it('writes and reads back a design decision, including the JSONB array and the design ref', async () => {
    const created = await BlueprintDesignDecision.create(decision({
      title: 'Case workspace',
      selected_design_ref: 'alt-case_workspace@vc3',
      rationale: 'one surface holds both actions for a single contract',
      approved_variant_id: 'alt-case_workspace',
    }));
    const read = await BlueprintDesignDecision.findByPk(created.id);
    expect(read).not.toBeNull();
    expect(read.tenant_id).toBe(TENANT);
    expect(read.manifest_content_hash).toBe(HASH);
    expect(read.tier).toBe('page_family');
    // The reader exists and the array survives the round trip as an ARRAY, not a JSON string.
    expect(read.dna_facets).toEqual(['theme', 'navigation']);
    expect(Array.isArray(read.dna_facets)).toBe(true);
    expect(read.selected_design_ref).toBe('alt-case_workspace@vc3');
  });

  it('writes and reads back a visual contract, with the variance as a fraction', async () => {
    const d = await BlueprintDesignDecision.create(decision({ tier: 'critical_workflow' }));
    const created = await BlueprintVisualContract.create({
      tenant_id: TENANT,
      decision_id: d.id,
      revision: 1,
      required_regions: ['header', 'case detail'],
      required_actions: ['approve', 'reject'],
      reference_snapshot_ref: 'snapshot/case-detail@1',
      acceptable_variance: 0.02,
      accessibility_rules: { contrast: 'AA' },
    });
    const read = await BlueprintVisualContract.findByPk(created.id);
    expect(read.required_regions).toEqual(['header', 'case detail']);
    expect(read.required_actions).toEqual(['approve', 'reject']);
    expect(read.accessibility_rules).toEqual({ contrast: 'AA' });
    // NUMERIC comes back as a string by default, which is sequelize avoiding silent precision
    // loss rather than a bug. Read it as a number instead of asserting against a float literal.
    expect(Number(read.acceptable_variance)).toBeCloseTo(0.02, 6);
  });

  it('THE PARTIAL INDEX: two APPROVED decisions at one tier are refused by the database', async () => {
    await BlueprintDesignDecision.create(decision({ tier: 'design_system', status: 'approved' }));
    const v = await violation(() => BlueprintDesignDecision.create(
      decision({ tier: 'design_system', status: 'approved' }),
    ));
    expect(v.name).toBe('SequelizeUniqueConstraintError');
    expect(v.constraint).toBe('uq_design_decision_approved_tier');
  });

  it('PASSING COUNTERPART: supersession is still possible — many non-approved rows at one tier', async () => {
    // This is what a FULL unique index would have forbidden, which is why the index is partial.
    const first = await BlueprintDesignDecision.create(decision({ tier: 'exception', status: 'superseded' }));
    const second = await BlueprintDesignDecision.create(decision({
      tier: 'exception', status: 'superseded', supersedes_decision_id: first.id,
    }));
    const third = await BlueprintDesignDecision.create(decision({
      tier: 'exception', status: 'approved', supersedes_decision_id: second.id,
    }));
    expect([first.id, second.id, third.id].filter(Boolean)).toHaveLength(3);
    expect(third.supersedes_decision_id).toBe(second.id);
  });

  it('one visual contract per (decision, revision), so an approval reference resolves to one row', async () => {
    const d = await BlueprintDesignDecision.create(decision({ tier: 'product_personality' }));
    await BlueprintVisualContract.create({ tenant_id: TENANT, decision_id: d.id, revision: 7 });
    const v = await violation(() => BlueprintVisualContract.create(
      { tenant_id: TENANT, decision_id: d.id, revision: 7 },
    ));
    expect(v.name).toBe('SequelizeUniqueConstraintError');
    expect(v.constraint).toBe('uq_visual_contract_decision_revision');
    // and a DIFFERENT revision is fine, so the index constrains the pair rather than the decision
    const other = await BlueprintVisualContract.create({ tenant_id: TENANT, decision_id: d.id, revision: 8 });
    expect(other.revision).toBe(8);
  });

  it('the variance CHECK refuses a value outside 0..1, which in memory would gate nothing', async () => {
    const d = await BlueprintDesignDecision.create(decision({ tier: 'page_family', status: 'in_review' }));
    const v = await violation(() => BlueprintVisualContract.create({
      tenant_id: TENANT, decision_id: d.id, revision: 1, acceptable_variance: 1.5,
    }));
    expect(v.constraint).toBe('ck_visual_contract_variance_fraction');
  });

  it('the dna_facets CHECK refuses a non-array, so a list is never read out of a bare string', async () => {
    // Through raw SQL, because the model's typing is what a caller bypasses when the value
    // arrives as JSON. The CHECK is the backstop for exactly that path.
    const v = await violation(() => sequelize.query(
      `INSERT INTO blueprint_design_decisions
         (tenant_id, manifest_id, manifest_content_hash, tier, status, dna_facets)
       VALUES (:t, :m, :h, 'design_system', 'draft', '"theme"'::jsonb)`,
      { replacements: { t: TENANT, m: manifestId, h: HASH } },
    ));
    expect(v.constraint).toBe('ck_design_decision_dna_is_array');
  });

  it('running the ensure function again is a no-op, so a redeploy cannot damage the tables', async () => {
    const before: any = await sequelize.query(
      'SELECT count(*)::int AS n FROM blueprint_design_decisions WHERE tenant_id = :t',
      { replacements: { t: TENANT }, type: QueryTypes.SELECT },
    );
    await ensureProjectLifecycleSchema();
    const after: any = await sequelize.query(
      'SELECT count(*)::int AS n FROM blueprint_design_decisions WHERE tenant_id = :t',
      { replacements: { t: TENANT }, type: QueryTypes.SELECT },
    );
    expect(after[0].n).toBe(before[0].n);
    expect(before[0].n).toBeGreaterThan(0);
  });
});
