/**
 * propose-service and promote against a REAL Postgres (integration tier): the advisory lock, the lower(name) match,
 * the (case study, service) pair index, and the promote rule, which the mocked suite cannot see.
 *
 * Running it:
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts serviceProposal.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates tables and rows. CI's
 * integration-tier job runs it against a disposable database (scripts/ci/runIntegrationSuites.js).
 */
export {}; // a module, so its consts never collide with another suite's in the test typecheck

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[serviceProposal.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

const TENANT = '7b000000-0000-4000-8000-000000000002';

describeIfDb('propose-service and promote against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let proposal: typeof import('../serviceProposal');
  let caseStudyId: string;
  const count = async (sql: string, bind: unknown[] = []) =>
    Number(((await sequelize.query(sql, { bind }))[0] as { n: number }[])[0].n);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await (await import('../../../db/ensureCaseStudySchema')).ensureCaseStudySchema();
    await (await import('../../../db/ensureServiceOfferingSchema')).ensureServiceOfferingSchema();
    await (await import('../../../db/ensureCaseStudyServiceLinkSchema')).ensureCaseStudyServiceLinkSchema();
    await (await import('../../../db/ensureCaseStudyExternalImportSchema')).ensureCaseStudyExternalImportSchema();
    const [rows] = await sequelize.query(
      `INSERT INTO case_studies (slug, title, status, source_type) VALUES ('sv1-propose-it', 'Pricing model', 'draft', 'external_document') RETURNING id`);
    caseStudyId = (rows as { id: string }[])[0].id;
    proposal = await import('../serviceProposal');
  });

  afterAll(async () => { await sequelize.close(); });

  let serviceId: string;

  it('promote refuses a growth service with no confirmed case study', async () => {
    const [rows] = await sequelize.query(
      `INSERT INTO service_offerings (tenant_id, name, status) VALUES ($1, 'Unproven Growth Service', 'growth') RETURNING id`, { bind: [TENANT] });
    const lonely = (rows as { id: string }[])[0].id;
    await expect(proposal.promoteServiceOffering({ tenantId: TENANT, serviceId: lonely, actor: 'it' }))
      .rejects.toMatchObject({ errorClass: 'PromotionRefused', httpStatus: 409 });
    expect(await count(`SELECT COUNT(*)::int AS n FROM service_offerings WHERE id = $1 AND status = 'growth'`, [lonely])).toBe(1);
  });

  it('proposing creates ONE growth service and ONE confirmed link', async () => {
    const out = await proposal.proposeServiceFromCaseStudy({ tenantId: TENANT, caseStudyId, name: 'Pricing Analytics', actor: 'it@test' });
    expect(out).toMatchObject({ existing: false, service: { status: 'growth', createdBy: 'it@test' }, link: { state: 'confirmed' } });
    serviceId = out.service.id;
    expect(await count(`SELECT COUNT(*)::int AS n FROM case_study_service_links WHERE case_study_id = $1 AND state = 'confirmed' AND decided_by = 'it@test'`, [caseStudyId])).toBe(1);
  });

  it('is idempotent by (tenant, lower(name)): a re-propose, differently cased, creates nothing', async () => {
    const out = await proposal.proposeServiceFromCaseStudy({ tenantId: TENANT, caseStudyId, name: 'pricing ANALYTICS', actor: 'it@test' });
    expect(out).toMatchObject({ existing: true, link: { changed: false } });
    expect(out.service.id).toBe(serviceId);
    expect(await count(`SELECT COUNT(*)::int AS n FROM service_offerings WHERE tenant_id = $1 AND lower(name) = 'pricing analytics'`, [TENANT])).toBe(1);
    expect(await count(`SELECT COUNT(*)::int AS n FROM case_study_service_links WHERE case_study_id = $1`, [caseStudyId])).toBe(1);
  });

  it('two simultaneous proposals of one new name make ONE service (advisory lock)', async () => {
    const both = await Promise.all([
      proposal.proposeServiceFromCaseStudy({ tenantId: TENANT, caseStudyId, name: 'Concurrent Service', actor: 'a' }),
      proposal.proposeServiceFromCaseStudy({ tenantId: TENANT, caseStudyId, name: 'concurrent service', actor: 'b' }),
    ]);
    expect(both.map((o) => o.existing).sort()).toEqual([false, true]);
    expect(await count(`SELECT COUNT(*)::int AS n FROM service_offerings WHERE tenant_id = $1 AND lower(name) = 'concurrent service'`, [TENANT])).toBe(1);
  });

  it('promote succeeds once a confirmed link exists, and is idempotent after', async () => {
    const first = await proposal.promoteServiceOffering({ tenantId: TENANT, serviceId, actor: 'it' });
    expect(first).toMatchObject({ promoted: true, confirmedCaseStudies: 1, service: { status: 'active' } });
    const again = await proposal.promoteServiceOffering({ tenantId: TENANT, serviceId, actor: 'it' });
    expect(again.promoted).toBe(false);
  });

  it("another tenant cannot promote this tenant's service", async () => {
    await expect(proposal.promoteServiceOffering({ tenantId: '7c000000-0000-4000-8000-000000000003', serviceId, actor: 'x' }))
      .rejects.toMatchObject({ errorClass: 'ServiceNotFound' });
  });
});
