/**
 * The outside intake against a REAL Postgres (integration tier), with the AgTech fixture from Ali's design package.
 *
 * The unit suites mock the models, so they cannot see whether the transaction really rolls back, whether the UNIQUE
 * content-hash index really stops a duplicate, or whether the suggestion pass really writes links. This suite does.
 * The PDF parser and the LLM are stubbed (pdf-parse cannot load inside jest's VM - its real run against this fixture
 * is caseStudyOutsideExtract.realPdf.test.ts - and no test may call OpenAI). The suggestion pass is the REAL one.
 *
 * Running it:
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts caseStudyOutsideIntake.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates tables and rows. CI's
 * integration-tier job runs it against a disposable database (scripts/ci/runIntegrationSuites.js).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export {}; // a module, so its consts never collide with another suite's in the test typecheck

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[caseStudyOutsideIntake.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'outside-case-studies', 'AgTech_-_Advanced_Econometric_Pricing_Model.pdf'));
const TENANT = '7a000000-0000-4000-8000-000000000001';

describeIfDb('outside case-study intake against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let intake: typeof import('../caseStudyOutsideIntake');
  let storeDir: string;
  const ctx = { tenantId: TENANT, actor: 'integration@test', correlationId: 'it-1' };
  const analysis = {
    title: 'Advanced Econometric Pricing Model', industry: 'AgTech', year: 2024, clientDescriptor: 'a major agriculture science company',
    summary: 'An econometric pricing model combining XGBoost with classical econometrics.', problem: null, approach: null,
    outcomes: [], techStack: ['XGBoost'], metrics: [{ label: 'Key wavelength bands', value: '5', verified: false as const }],
    capabilities: ['Pricing optimization'], keywords: ['pricing', 'econometric'], suggestedNaics: ['541511'],
  };
  const deps = (over: Record<string, unknown> = {}) => ({
    extract: jest.fn().mockResolvedValue({ ok: true, text: 'Advanced Econometric Pricing Model ... XGBoost', truncated: false, errorClass: null, error: null }),
    analyze: jest.fn().mockResolvedValue({ analysis, cached: false, error: null, errorClass: null }),
    storeOriginal: async (key: string, bytes: Buffer) => { fs.writeFileSync(path.join(storeDir, key), bytes); },
    ...over,
  });
  const count = async (table: string, where = 'TRUE') =>
    Number(((await sequelize.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`))[0] as { n: number }[])[0].n);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csx-it-'));
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await (await import('../../../db/ensureCaseStudySchema')).ensureCaseStudySchema();
    await (await import('../../../db/ensureServiceOfferingSchema')).ensureServiceOfferingSchema();
    await (await import('../../../db/ensureCaseStudyServiceLinkSchema')).ensureCaseStudyServiceLinkSchema();
    const ext = await import('../../../db/ensureCaseStudyExternalImportSchema');
    await ext.ensureCaseStudyExternalImportSchema();
    await ext.ensureCaseStudyExternalImportSchema(); // re-runnable at every boot
    await sequelize.query(
      `INSERT INTO service_offerings (tenant_id, name, category, keywords_json, status)
       VALUES ($1, 'AI / ML Predictive Analytics', 'Data Science', '["pricing","econometric","forecasting"]'::jsonb, 'active')`,
      { bind: [TENANT] },
    );
    intake = await import('../caseStudyOutsideIntake');
  });

  afterAll(async () => {
    await sequelize.close();
  });

  let firstId: string;

  it('creates a private draft, its file artifact, provenance, pending metrics, the import row and suggestions', async () => {
    const res = await intake.importOutsideFile(
      { bytes: FIXTURE, fileName: 'AgTech_-_Advanced_Econometric_Pricing_Model.pdf', mimeType: 'application/pdf', sourceKind: 'external_document' }, ctx, deps(),
    );
    expect(res).toMatchObject({ status: 'created', analysisError: null });
    firstId = String(res.caseStudyId);
    const [rows] = await sequelize.query('SELECT status, visibility, source_type, organization_identity_mode FROM case_studies WHERE id = $1', { bind: [firstId] });
    expect(rows).toEqual([{ status: 'draft', visibility: 'private', source_type: 'external_document', organization_identity_mode: 'anonymized' }]);
    expect(await count('case_study_artifacts', `case_study_id = '${firstId}' AND source_type = 'file'`)).toBe(1);
    expect(await count('case_study_evidence', `case_study_id = '${firstId}' AND metadata->>'provenance' = 'outside_document'`)).toBe(1);
    expect(await count('case_study_metrics', `case_study_id = '${firstId}' AND verification_class = 'pending' AND publishable = false`)).toBe(1);
    expect(await count('case_study_external_imports', `case_study_id = '${firstId}' AND analysis_status = 'analyzed'`)).toBe(1);
    expect(await count('case_study_service_links', `case_study_id = '${firstId}' AND state = 'suggested'`)).toBeGreaterThan(0);
    expect(res.suggestionsInserted).toBeGreaterThan(0);
  });

  it('a second import of the same file creates NOTHING and returns the first record', async () => {
    const before = await Promise.all(['case_studies', 'case_study_artifacts', 'case_study_external_imports', 'case_study_service_links'].map((t) => count(t)));
    const res = await intake.importOutsideFile(
      { bytes: FIXTURE, fileName: 'renamed-copy.pdf', mimeType: 'application/pdf', sourceKind: 'external_document' }, ctx, deps(),
    );
    expect(res).toMatchObject({ status: 'already_imported', alreadyImported: true, caseStudyId: firstId });
    const after = await Promise.all(['case_studies', 'case_study_artifacts', 'case_study_external_imports', 'case_study_service_links'].map((t) => count(t)));
    expect(after).toEqual(before);
  });

  it('an LLM failure still creates a draft with analysisError (fail-soft)', async () => {
    const bytes = Buffer.concat([FIXTURE, Buffer.from('\n% variant')]);
    const res = await intake.importOutsideFile(
      { bytes, fileName: 'AgTech_variant.pdf', mimeType: 'application/pdf', sourceKind: 'external_document' }, ctx,
      deps({ analyze: jest.fn().mockResolvedValue({ analysis: null, cached: false, error: 'The AI analysis could not be generated right now.', errorClass: 'UpstreamError' }) }),
    );
    expect(res).toMatchObject({ status: 'created', analysisError: 'The AI analysis could not be generated right now.' });
    const [rows] = await sequelize.query('SELECT analysis_status, analysis_error FROM case_study_external_imports WHERE case_study_id = $1', { bind: [res.caseStudyId] });
    expect(rows).toEqual([{ analysis_status: 'failed', analysis_error: 'The AI analysis could not be generated right now.' }]);
    expect(await count('case_study_artifacts', `case_study_id = '${res.caseStudyId}'`)).toBe(1);
  });

  it('two simultaneous imports of the same new file make ONE record; the loser rolls back whole', async () => {
    const bytes = Buffer.concat([FIXTURE, Buffer.from('\n% race')]);
    const casesBefore = await count('case_studies');
    const file = { bytes, fileName: 'race.pdf', mimeType: 'application/pdf', sourceKind: 'external_document' as const };
    const [a, b] = await Promise.all([intake.importOutsideFile(file, ctx, deps()), intake.importOutsideFile(file, ctx, deps())]);
    expect([a.status, b.status].sort()).toEqual(['already_imported', 'created']);
    expect(await count('case_studies')).toBe(casesBefore + 1);
    expect(await count('case_study_external_imports', `content_hash = '${intake.sha256(bytes)}'`)).toBe(1);
  });
});
