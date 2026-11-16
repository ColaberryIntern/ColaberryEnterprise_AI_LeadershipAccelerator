/**
 * AI Service Gap Detector against a REAL Postgres (integration tier): the idempotency key, review preservation on
 * re-analysis, stale detection, tenant isolation, the one-running-batch index, batch partial failure + resume, and
 * that analysis never touches services or links. The model is a fake `assess`; nothing calls OpenAI.
 *
 * Running it:
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts serviceGap.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates tables and rows. CI's
 * integration-tier job runs it against a disposable database (scripts/ci/runIntegrationSuites.js).
 */
import type { Assess } from '../serviceGapAnalysis';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[serviceGap.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

const T1 = '7b000000-0000-4000-8000-0000000000a1';
const T2 = '7b000000-0000-4000-8000-0000000000a2';
const SUMMARY = 'The team built a model that reads sensor history from transformers and industrial motors, estimates thermal aging, and schedules maintenance before failure. Delivered a dashboard and alerting.';

describeIfDb('service gap detector against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let A: typeof import('../serviceGapAnalysis');
  let B: typeof import('../serviceGapBatch');
  let L: typeof import('../serviceGapLoader');
  const ids: Record<string, string> = {};
  const one = async (sql: string, bind: unknown[] = []): Promise<string> => ((await sequelize.query(sql, { bind }))[0] as { id: string }[])[0].id;
  const count = async (sql: string, bind: unknown[] = []): Promise<number> => Number(((await sequelize.query(sql, { bind }))[0] as { n: number }[])[0].n);
  const matchAssess = (serviceRef = 'S1') => jest.fn<ReturnType<Assess>, Parameters<Assess>>(async () => ({
    raw: { decision: 'MATCH_EXISTING', targetRef: serviceRef, maturity: 'implemented_demo', candidates: [{ ref: serviceRef, capabilityOverlap: 80, buyerProblemOverlap: 80, deliverableOverlap: 80 }] },
    errorClass: null, error: null, model: 'fake-model',
  }));

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await (await import('../../../../db/ensureCaseStudySchema')).ensureCaseStudySchema();
    await (await import('../../../../db/ensureServiceOfferingSchema')).ensureServiceOfferingSchema();
    await (await import('../../../../db/ensureCaseStudyServiceLinkSchema')).ensureCaseStudyServiceLinkSchema();
    await (await import('../../../../db/ensureCaseStudyExternalImportSchema')).ensureCaseStudyExternalImportSchema();
    await (await import('../../../../db/ensureServiceGapSchema')).ensureServiceGapSchema();
    ids.svc = await one(`INSERT INTO service_offerings (tenant_id, name, category, keywords_json, status) VALUES ($1, 'Industrial AI', 'AI', '["predictive maintenance","manufacturing","sensor"]', 'active') RETURNING id`, [T1]);
    ids.other = await one(`INSERT INTO service_offerings (tenant_id, name, status) VALUES ($1, 'Other Tenant Service', 'active') RETURNING id`, [T2]);
    ids.cs = await one(`INSERT INTO case_studies (slug, title, status, source_type, canonical_summary, industry) VALUES ('gap-it-1', 'Thermal Aging Prediction', 'draft', 'manual', $1, 'Manufacturing') RETURNING id`, [SUMMARY]);
    ids.cs2 = await one(`INSERT INTO case_studies (slug, title, status, source_type, canonical_summary) VALUES ('gap-it-2', 'Second Case', 'draft', 'manual', $1) RETURNING id`, [SUMMARY.replace('transformers', 'pumps')]);
    ids.thin = await one(`INSERT INTO case_studies (slug, title, status, source_type, canonical_summary) VALUES ('gap-it-3', 'Title Only', 'draft', 'manual', 'Short.') RETURNING id`);
    A = await import('../serviceGapAnalysis');
    B = await import('../serviceGapBatch');
    L = await import('../serviceGapLoader');
  });
  afterAll(async () => { await sequelize.close(); });

  const analyze = async (assess: Assess, force = false, caseId = ids.cs) => {
    const ev = (await L.loadEvidence([caseId])).get(caseId)!;
    return A.analyzeCaseStudy({ tenantId: T1, evidence: ev, catalog: await L.loadCatalog(T1), actor: 'it@test', force, assess });
  };

  it('the loader is tenant-scoped: the other tenant\'s service is never in the catalog', async () => {
    const names = (await L.loadCatalog(T1)).map((s) => s.name);
    expect(names).toEqual(['Industrial AI']);
  });

  it('analyzes once; the same inputs reuse the stored row with NO model call (idempotent)', async () => {
    const assess = matchAssess();
    const first = await analyze(assess);
    expect(first.reused).toBe(false);
    expect(first.view).toMatchObject({ status: 'ok', decision: 'MATCH_EXISTING', recommendation: { target: { serviceId: ids.svc } } });
    const again = await analyze(assess);
    expect(again.reused).toBe(true);
    expect(assess).toHaveBeenCalledTimes(1);
    expect(await count('SELECT COUNT(*)::int AS n FROM service_gap_analyses WHERE case_study_id = $1', [ids.cs])).toBe(1);
  });

  it('analysis never creates, links or changes a service', async () => {
    expect(await count('SELECT COUNT(*)::int AS n FROM case_study_service_links')).toBe(0);
    expect(await count('SELECT COUNT(*)::int AS n FROM service_offerings')).toBe(2);
  });

  it('two simultaneous analyses of one case make ONE row', async () => {
    const assess = matchAssess();
    await Promise.all([analyze(assess, false, ids.cs2), analyze(assess, false, ids.cs2)]);
    expect(await count('SELECT COUNT(*)::int AS n FROM service_gap_analyses WHERE case_study_id = $1', [ids.cs2])).toBe(1);
  });

  it('a human review survives a forced re-analysis', async () => {
    const { view } = await analyze(matchAssess());
    await A.reviewAnalysis({ tenantId: T1, id: view.id, state: 'dismissed', note: 'Not a new service', actor: 'reviewer@test' });
    const forced = await analyze(matchAssess(), true);
    expect(forced.reused).toBe(false);
    expect(forced.view).toMatchObject({ id: view.id, reviewState: 'dismissed', reviewNote: 'Not a new service', reviewedBy: 'reviewer@test' });
  });

  it('review is tenant-scoped: another tenant cannot review this analysis', async () => {
    const { view } = await analyze(matchAssess());
    await expect(A.reviewAnalysis({ tenantId: T2, id: view.id, state: 'accepted', note: null, actor: 'x' })).rejects.toBeInstanceOf(A.GapReviewNotFound);
  });

  it('a catalog change makes the stored analysis stale (and the next analysis a new row)', async () => {
    await sequelize.query(`UPDATE service_offerings SET description = 'Now also digital twins' WHERE id = $1`, { bind: [ids.svc] });
    const catalogFp = (await import('../serviceGapRetrieval')).catalogFingerprint(await L.loadCatalog(T1));
    const ev = (await L.loadEvidence([ids.cs])).get(ids.cs)!;
    const latest = await A.latestAnalyses(T1, new Map([[ids.cs, { caseFp: (await import('../serviceGapRetrieval')).caseStudyFingerprint(ev), catalogFp }]]));
    expect(latest.get(ids.cs)?.stale).toBe(true);
    expect((await analyze(matchAssess())).reused).toBe(false);
    expect(await count('SELECT COUNT(*)::int AS n FROM service_gap_analyses WHERE case_study_id = $1', [ids.cs])).toBe(2);
  });

  it('a failed analysis is stored as failed and retried on the next call', async () => {
    const down = jest.fn<ReturnType<Assess>, Parameters<Assess>>(async () => ({ raw: null, errorClass: 'UpstreamError' as const, error: 'down', model: 'fake-model' }));
    await sequelize.query(`UPDATE service_offerings SET description = 'v3' WHERE id = $1`, { bind: [ids.svc] });
    expect((await analyze(down)).view).toMatchObject({ status: 'failed', errorClass: 'UpstreamError', recommendation: null });
    const up = matchAssess();
    expect((await analyze(up)).view.status).toBe('ok');
    expect(up).toHaveBeenCalledTimes(1);
  });

  it('only ONE running batch per tenant; a second start gets the running run back', async () => {
    const a = await B.startRun(T1, 'it@test');
    const b = await B.startRun(T1, 'it@test');
    expect(a.started).toBe(true);
    expect(b.started).toBe(false);
    expect(b.run.id).toBe(a.run.id);
    expect(a.caseStudyIds.sort()).toEqual([ids.cs, ids.cs2, ids.thin].sort());

    // Partial failure: one item throws, the run still completes with counters.
    let calls = 0;
    const ok = matchAssess();
    const flaky: Assess = async (input) => { calls += 1; if (calls === 1) throw new Error('boom'); return ok(input); };
    await B.processRun({ runId: a.run.id, tenantId: T1, caseStudyIds: a.caseStudyIds, actor: 'it@test', assess: flaky, concurrency: 1 });
    const done = await B.latestRun(T1);
    expect(done).toMatchObject({ status: 'completed', total: 3 });
    expect(done!.analyzed + done!.reused + done!.failed).toBe(3);
    expect(done!.failed).toBeGreaterThanOrEqual(1);
    // The thin case abstained without a model call.
    expect(await count(`SELECT COUNT(*)::int AS n FROM service_gap_analyses WHERE case_study_id = $1 AND status = 'insufficient'`, [ids.thin])).toBe(1);
  });

  it('a resumed batch only pays for what is missing: everything stored is reused', async () => {
    const r = await B.startRun(T1, 'it@test');
    const assess = matchAssess();
    await B.processRun({ runId: r.run.id, tenantId: T1, caseStudyIds: r.caseStudyIds, actor: 'it@test', assess, concurrency: 2 });
    const before = assess.mock.calls.length;
    const r2 = await B.startRun(T1, 'it@test');
    await B.processRun({ runId: r2.run.id, tenantId: T1, caseStudyIds: r2.caseStudyIds, actor: 'it@test', assess, concurrency: 2 });
    expect(assess.mock.calls.length).toBe(before);
    expect(await B.latestRun(T1)).toMatchObject({ status: 'completed', reused: 3, analyzed: 0, failed: 0 });
  });

  it('"Use existing" pins a SUGGESTED link only: idempotent, never confirms, never a foreign or retired service', async () => {
    const pin = await import('../../../caseStudy/caseStudyServiceLinkPin');
    const a = await pin.suggestLinkForService({ tenantId: T1, caseStudyId: ids.cs, serviceId: ids.svc, suggestedBy: 'service-gap:it', rationale: 'Link to Industrial AI.' });
    const b = await pin.suggestLinkForService({ tenantId: T1, caseStudyId: ids.cs, serviceId: ids.svc, suggestedBy: 'service-gap:it', rationale: null });
    expect(a).toMatchObject({ state: 'suggested', created: true });
    expect(b).toMatchObject({ id: a.id, state: 'suggested', created: false });
    expect(await count(`SELECT COUNT(*)::int AS n FROM case_study_service_links WHERE case_study_id = $1 AND state = 'confirmed'`, [ids.cs])).toBe(0);
    // A person's rejection is never overwritten by a later pin.
    await sequelize.query(`UPDATE case_study_service_links SET state = 'rejected' WHERE id = $1`, { bind: [a.id] });
    expect((await pin.suggestLinkForService({ tenantId: T1, caseStudyId: ids.cs, serviceId: ids.svc, suggestedBy: 'x', rationale: null })).state).toBe('rejected');
    await expect(pin.suggestLinkForService({ tenantId: T1, caseStudyId: ids.cs, serviceId: ids.other, suggestedBy: 'x', rationale: null })).rejects.toBeInstanceOf(pin.ServiceNotSuggestableError);
    const retired = await one(`INSERT INTO service_offerings (tenant_id, name, status) VALUES ($1, 'Old Retired', 'retired') RETURNING id`, [T1]);
    await expect(pin.suggestLinkForService({ tenantId: T1, caseStudyId: ids.cs, serviceId: retired, suggestedBy: 'x', rationale: null })).rejects.toBeInstanceOf(pin.ServiceNotSuggestableError);
    await sequelize.query(`DELETE FROM case_study_service_links WHERE id = $1`, { bind: [a.id] });
    await sequelize.query(`DELETE FROM service_offerings WHERE id = $1`, { bind: [retired] });
  });

  it('a run abandoned by a crashed process does not lock the button forever', async () => {
    await sequelize.query(`INSERT INTO service_gap_runs (tenant_id, status, started_at) VALUES ($1, 'running', now() - interval '2 hours')`, { bind: [T2] });
    const r = await B.startRun(T2, 'it@test');
    expect(r.started).toBe(true);
    expect(await count(`SELECT COUNT(*)::int AS n FROM service_gap_runs WHERE tenant_id = $1 AND status = 'failed' AND last_error LIKE 'abandoned%'`, [T2])).toBe(1);
  });
});
