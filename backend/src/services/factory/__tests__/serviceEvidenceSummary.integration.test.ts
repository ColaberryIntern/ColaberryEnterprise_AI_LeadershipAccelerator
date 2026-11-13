/**
 * The evidence summary against a REAL Postgres (integration tier): two tenants share ONE case study, each confirms a
 * link from it to its own service, and each tenant's summary must count only its own link and never name the other
 * tenant's service. The unit suite fakes the where-clauses; this proves the real SQL keeps the tenancy invariant.
 *
 * Running it:
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts serviceEvidenceSummary.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates tables and rows. CI's
 * integration-tier job runs it against a disposable database (scripts/ci/runIntegrationSuites.js).
 */
export {}; // a module, so its consts never collide with another suite's in the test typecheck

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[serviceEvidenceSummary.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

const T1 = '7c000000-0000-4000-8000-000000000001';
const T2 = '7c000000-0000-4000-8000-000000000002';

describeIfDb('evidence summary tenancy against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let summary: typeof import('../serviceEvidenceSummary');
  const ids: Record<string, string> = {};
  const one = async (sql: string, bind: unknown[]): Promise<string> => ((await sequelize.query(sql, { bind }))[0] as { id: string }[])[0].id;
  const deps = { fetchOpportunities: async () => { throw new Error('no network in tests'); }, loadFitGaps: async () => null };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await (await import('../../../db/ensureCaseStudySchema')).ensureCaseStudySchema();
    await (await import('../../../db/ensureServiceOfferingSchema')).ensureServiceOfferingSchema();
    await (await import('../../../db/ensureCaseStudyServiceLinkSchema')).ensureCaseStudyServiceLinkSchema();
    await (await import('../../../db/ensureCaseStudyExternalImportSchema')).ensureCaseStudyExternalImportSchema();
    ids.shared = await one(`INSERT INTO case_studies (slug, title, status, source_type, industry) VALUES ('sv2-shared-it', 'Shared proof', 'published', 'project', 'Retail') RETURNING id`, []);
    ids.mine = await one(`INSERT INTO service_offerings (tenant_id, name, status) VALUES ($1, 'Tenant One Analytics', 'active') RETURNING id`, [T1]);
    ids.theirs = await one(`INSERT INTO service_offerings (tenant_id, name, status) VALUES ($1, 'Tenant Two Hidden Service', 'active') RETURNING id`, [T2]);
    ids.theirs2 = await one(`INSERT INTO service_offerings (tenant_id, name, status) VALUES ($1, 'Tenant Two Second Service', 'active') RETURNING id`, [T2]);
    for (const svc of [ids.mine, ids.theirs, ids.theirs2]) {
      await sequelize.query(
        `INSERT INTO case_study_service_links (case_study_id, service_offering_id, state, decided_by, decided_at) VALUES ($1, $2, 'confirmed', 'it', NOW())`,
        { bind: [ids.shared, svc] });
    }
    summary = await import('../serviceEvidenceSummary');
  });

  afterAll(async () => { await sequelize.close(); });

  it("tenant one sees only its own service and its own confirmed link through the shared case study", async () => {
    const s = await summary.getServiceEvidenceSummary({ tenantId: T1, status: 'all' }, deps);
    expect(s.services.map((x) => x.id)).toEqual([ids.mine]);
    expect(s.services[0]).toMatchObject({ insideCount: 1, outsideCount: 0, industries: [{ industry: 'Retail', count: 1 }] });
    expect(s.services[0].openOpportunityMatches).toBeNull();
    const text = JSON.stringify(s);
    expect(text).not.toContain('Tenant Two');
    expect(text).not.toContain(ids.theirs);
    expect(s.growthSeries.reduce((m, p) => Math.max(m, p.linksTotal), 0)).toBe(1);
  });

  it('tenant two counts its two links and never sees tenant one', async () => {
    const s = await summary.getServiceEvidenceSummary({ tenantId: T2, status: 'all' }, deps);
    expect(s.services.map((x) => x.id).sort()).toEqual([ids.theirs, ids.theirs2].sort());
    expect(JSON.stringify(s)).not.toContain('Tenant One');
    expect(s.growthSeries[s.growthSeries.length - 1].linksTotal).toBe(2);
  });

  it('the shared record is not in either Intake (both tenants confirmed it), and the read writes nothing', async () => {
    const before = ((await sequelize.query('SELECT COUNT(*)::int AS n FROM case_study_service_links'))[0] as { n: number }[])[0].n;
    const s = await summary.getServiceEvidenceSummary({ tenantId: T1 }, deps);
    expect(s.intake.map((i) => i.id)).not.toContain(ids.shared);
    const after = ((await sequelize.query('SELECT COUNT(*)::int AS n FROM case_study_service_links'))[0] as { n: number }[])[0].n;
    expect(after).toBe(before);
  });
});
