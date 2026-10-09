import { QueryTypes, type Sequelize } from 'sequelize';

/**
 * The one part of this phase that closes something LIVE: registration on the government pursuit
 * approval path.
 *
 * ## Why this test is the important one
 *
 * `services/factory/govDeliveryProject.ts` was added on 2026-10-04, three days after the
 * entry-point inventory this programme planned against was taken — so it appears in no chokepoint
 * list. Its header says it "Ships DARK behind FLAGS.govIngestion", which is stale: measured on the
 * production container, `ENABLE_GOV_INGESTION` is `true`. It therefore creates a real
 * `delivery_projects` row on every approved pursuit and registers no lifecycle, which is LC-01's
 * first clause unmet, in production, since that date.
 *
 * Everything else Phase 6 adds becomes reachable only when `ENABLE_PROJECT_LIFECYCLE` is switched
 * on in Phase 8. This path is reachable now, which is why it gets its own suite rather than a line
 * in the general one.
 *
 * ## What it asserts beyond "a lifecycle appears"
 *
 * Re-approval safety, because this exact file has already been fixed once for getting it wrong.
 * Its own comment records the incident: "a re-approval must NEVER reset an existing track's owner,
 * student-build link, or status (ingestion runs live in prod — a blind upsert here erased them)".
 * Adding a write to a path with that history without proving replay-safety would reintroduce a
 * known production defect, so the second call here checks that a track's owner set after the first
 * call SURVIVES, not merely that no duplicate lifecycle appears.
 *
 * ## Running it
 *
 *   docker run -d --name acc-lifecycle-scratch-pg -p 55432:5432  *     -e POSTGRES_PASSWORD=scratchlocal postgres:15
 *   docker exec acc-lifecycle-scratch-pg psql -U postgres -c 'CREATE DATABASE t1a_gov;'
 *
 *   DATABASE_URL=postgres://postgres:scratchlocal@localhost:55432/t1a_gov  *     npx jest --no-cache --forceExit --runTestsByPath  *     src/services/lifecycle/__tests__/lifecycleRegistration.gov.integration.test.ts
 *
 * SKIPS VISIBLY without `DATABASE_URL`. `--forceExit` because the pool keeps the process alive
 * after `afterAll` closes the instance; a run that appears to hang has usually already finished,
 * so read the output before concluding otherwise.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[lifecycleRegistration.gov.integration] SKIPPED: no DATABASE_URL. This is the suite that '
    + 'covers the one LIVE production hole in this phase; a green run without it means nothing.',
  );
}

/** The gov container is resolved by this exact slug — `factoryDemoContainer.ts` fails closed otherwise. */
const GOV_TENANT_SLUG = 'refactored';
const GOV_ORG_NAME = 'Colaberry Government Contracts';
const OPPORTUNITY = 'T1A-GOV-PROBE-0001';

describeIfDb('P6-T1a — the gov approval path registers a lifecycle, and replay stays safe', () => {
  let sequelize: Sequelize;
  let ensureGovTwoTrackProject: (input: {
    qualificationId: string;
    canonicalOpportunityId: string;
    established: any[];
    provenance?: { title?: string | null } | null;
    approverIdentityId?: string | null;
  }) => Promise<{ deliveryProjectId: string; created: boolean; tracks: number; requirements: number }>;
  let ContractTrack: any;

  let tenantId: string;
  let qualificationId: string;

  async function lifecycleRows(deliveryProjectId: string): Promise<Array<{ tenant_id: string; stage: string }>> {
    return sequelize.query<{ tenant_id: string; stage: string }>(
      'SELECT tenant_id, stage FROM project_lifecycle_states WHERE delivery_project_id = $1',
      { bind: [deliveryProjectId], type: QueryTypes.SELECT },
    );
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ ensureGovTwoTrackProject } = await import('../../factory/govDeliveryProject') as any);

    const Tenant = (await import('../../../models/Tenant')).default as any;
    const Organization = (await import('../../../models/Organization')).default as any;
    const DeliveryEngagement = (await import('../../../models/DeliveryEngagement')).default as any;
    const DeliveryProject = (await import('../../../models/DeliveryProject')).default as any;
    ContractTrack = (await import('../../../models/ContractTrack')).default as any;
    const ContractRequirement = (await import('../../../models/ContractRequirement')).default as any;
    const GovQualification = (await import('../../../models/GovQualification')).default as any;
    const { ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema');

    // `Organization` declares a foreign key to `enrollments`, and the lifecycle tables need
    // `projects`. Neither is otherwise reachable from here, so both get a minimal stand-in — they
    // are FK targets in this suite, never subjects of an assertion.
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');

    // Every table under test is built FROM ITS MODEL, so the path runs against the real column
    // shapes rather than a hand-written approximation that could drift from them.
    for (const model of [Tenant, Organization, DeliveryEngagement, DeliveryProject,
      ContractTrack, ContractRequirement, GovQualification]) {
      await model.sync();
    }
    await ensureProjectLifecycleSchema();

    const tenant = await Tenant.create({ slug: GOV_TENANT_SLUG, name: 'Refactored' });
    tenantId = tenant.id;
    const org = await Organization.create({ tenant_id: tenantId, name: GOV_ORG_NAME });
    await DeliveryEngagement.create({
      tenant_id: tenantId, organization_id: org.id, name: 'Gov Contracts', status: 'active',
    });
    // `tenant_id` and `bidding_entity` are both `allowNull: false` on the model; the first draft
    // omitted them and the whole suite failed in `beforeAll` before reaching a single assertion.
    const qual = await GovQualification.create({
      tenant_id: tenantId,
      bidding_entity: 'Colaberry',
      canonical_opportunity_id: OPPORTUNITY,
      version: 1,
      status: 'active',
    });
    qualificationId = qual.id;
  }, 180_000);

  afterAll(async () => {
    if (!sequelize) return;
    await sequelize.close();
  });

  it('the apparatus is real: the gov container resolves, so a null container cannot fake a pass', async () => {
    // `lookupGovContractsContainer` fails CLOSED — it returns null if the tenant slug, the org name
    // or the engagement is missing, and `ensureGovTwoTrackProject` then throws
    // GovContainerUnavailableError. Without this check, a mis-seeded fixture would make every
    // assertion below fail for the wrong reason, or worse, make a skipped path look covered.
    const { lookupGovContractsContainer } = await import('../../../scripts/lib/factoryDemoContainer');
    const container = await lookupGovContractsContainer();
    expect(container).not.toBeNull();
    expect(container!.tenant.id).toBe(tenantId);
  });

  it('REGISTERS A LIFECYCLE on the approval path — the live hole, closed', async () => {
    const result = await ensureGovTwoTrackProject({
      qualificationId,
      canonicalOpportunityId: OPPORTUNITY,
      established: [],
      provenance: { title: 'T1a synthetic pursuit' },
      approverIdentityId: null,
    });

    expect(result.created).toBe(true);
    const rows = await lifecycleRows(result.deliveryProjectId);
    expect(rows).toHaveLength(1);
    // The tenant comes off the created row, not from anything the caller passed to the hook.
    expect(rows[0].tenant_id).toBe(tenantId);
    expect(rows[0].stage).toBe('discovery');
  });

  it('re-approval adds no second lifecycle AND does not erase a track owner', async () => {
    // The two failure modes this path can have, checked together because fixing one by breaking
    // the other is the trap. The owner is set BETWEEN the two calls, which is what a reviewer
    // doing their job looks like in data.
    const first = await ensureGovTwoTrackProject({
      qualificationId,
      canonicalOpportunityId: OPPORTUNITY,
      established: [],
      provenance: { title: 'T1a synthetic pursuit' },
      approverIdentityId: null,
    });
    expect(first.created).toBe(false); // already created by the previous test

    const track = await ContractTrack.findOne({
      where: { delivery_project_id: first.deliveryProjectId },
    });
    expect(track).not.toBeNull();
    const owner = '44444444-4444-4444-8444-444444444444';
    await ContractTrack.update(
      { owner_identity_id: owner },
      { where: { id: track.id } },
    );

    const second = await ensureGovTwoTrackProject({
      qualificationId,
      canonicalOpportunityId: OPPORTUNITY,
      established: [],
      provenance: { title: 'T1a synthetic pursuit' },
      approverIdentityId: null,
    });
    expect(second.created).toBe(false);
    expect(second.deliveryProjectId).toBe(first.deliveryProjectId);

    // Exactly one lifecycle, still. The hook's ON CONFLICT DO NOTHING is what makes this true
    // under a contract where a registration error would otherwise abort the whole approval.
    expect(await lifecycleRows(first.deliveryProjectId)).toHaveLength(1);

    // And the reviewer's work survived, which is the defect this file was already fixed for once.
    const after = await ContractTrack.findOne({ where: { id: track.id } });
    expect(after.owner_identity_id).toBe(owner);
  });

  it('the reconciliation query reports the gov project as registered', async () => {
    // LC-01's actual question, asked the way P6-T10 will ask it in production.
    const { unregisteredDeliveryProjectsSince } = await import('../projectLifecycleRegistration');
    const unregistered = await unregisteredDeliveryProjectsSince(new Date(Date.now() - 3_600_000));
    const slugRows = await sequelize.query<{ id: string }>(
      'SELECT id FROM delivery_projects WHERE tenant_id = $1',
      { bind: [tenantId], type: QueryTypes.SELECT },
    );
    expect(slugRows.length).toBeGreaterThan(0);
    for (const row of slugRows) {
      expect(unregistered.map((u) => u.id)).not.toContain(row.id);
    }
  });
});
