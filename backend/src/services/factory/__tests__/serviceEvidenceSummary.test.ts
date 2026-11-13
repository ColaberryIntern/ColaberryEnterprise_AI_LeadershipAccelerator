/**
 * The evidence summary (package spec 1F) against an in-memory fake of the tables it reads. The fake applies the same
 * where-clauses the queries send (Op.in / Op.ne / null), so these tests check the DEFINITIONS - tenancy through a
 * shared case study, archived excluded, suggestions not counted as proof, null-not-zero for unknown demand - rather
 * than the mock.
 */
import { Op } from 'sequelize';

type Row = Record<string, unknown>;
const tables: Record<'services' | 'links' | 'cases' | 'imports' | 'metrics', Row[]> = { services: [], links: [], cases: [], imports: [], metrics: [] };

function matches(row: Row, where: Record<string | symbol, unknown>): boolean {
  return Object.keys(where).every((k) => {
    const cond = where[k] as unknown;
    const v = row[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      const c = cond as Record<symbol, unknown>;
      if (Op.in in c) return (c[Op.in] as unknown[]).includes(v);
      if (Op.notIn in c) return !(c[Op.notIn] as unknown[]).includes(v);
      if (Op.ne in c) return v !== c[Op.ne];
    }
    return cond === null ? v === null || v === undefined : v === cond;
  });
}
const model = (name: keyof typeof tables) => ({
  findAll: jest.fn(async (opts: { where: Record<string | symbol, unknown>; limit?: number }) =>
    tables[name].filter((r) => matches(r, opts.where)).slice(0, opts.limit ?? Infinity)),
});
jest.mock('../../../models/ServiceOffering', () => ({ __esModule: true, default: model('services') }));
jest.mock('../../../models/CaseStudyServiceLink', () => ({ __esModule: true, default: model('links') }));
jest.mock('../../../models/CaseStudy', () => ({ __esModule: true, default: model('cases') }));
jest.mock('../../../models/CaseStudyExternalImport', () => ({ __esModule: true, default: model('imports') }));
jest.mock('../../../models/CaseStudyMetric', () => ({ __esModule: true, default: model('metrics') }));

import { getServiceEvidenceSummary } from '../serviceEvidenceSummary';
import { EvidenceSummarySchema } from '../serviceEvidenceSummaryTypes';
import { listIntakeCaseStudies } from '../../caseStudy/caseStudyIntakeQueue';
import type { GovOpportunityFeed } from '../opportunities/govOpportunity';

const NOW = new Date('2026-11-13T15:00:00Z');
const svc = (id: string, o: Row = {}): Row => ({ id, name: `Svc ${id}`, tenant_id: 't1', status: 'active', category: null, keywords_json: [], naics_codes_json: [], created_at: new Date('2026-02-01T00:00:00Z'), ...o });
const cs = (id: string, o: Row = {}): Row => ({ id, title: `Case ${id}`, slug: id, status: 'published', source_type: 'project', industry: 'Retail', archived_at: null, created_at: new Date('2026-03-01T00:00:00Z'), approved_at: null, ...o });
const link = (case_study_id: string, service_offering_id: string, state: string, decided_at: Date | null = new Date('2026-04-01T00:00:00Z')): Row =>
  ({ id: `${case_study_id}-${service_offering_id}`, case_study_id, service_offering_id, state, match_score: 2, rationale: 'kw', decided_at });

const liveFeed = (opps: Array<Partial<{ title: string; category: string; closeDate: string | null }>>): GovOpportunityFeed => ({
  source: 'live', snapshotDate: null,
  opportunities: opps.map((o, i) => ({ uuid: `u${i}`, title: o.title ?? '', agency: 'A', closeDate: o.closeDate === undefined ? '2026-12-01' : o.closeDate, fitScore: null, estimatedValue: null, sourceUrl: null, category: o.category ?? null })),
});
const deps = (over: Record<string, unknown> = {}) => ({
  now: () => NOW,
  fetchOpportunities: jest.fn(async () => liveFeed([])),
  loadFitGaps: jest.fn(async () => []),
  listIntake: jest.fn(async () => []),
  ...over,
});

let errSpy: jest.SpyInstance;
beforeEach(() => {
  tables.services = [svc('mine-1'), svc('mine-2'), svc('theirs', { tenant_id: 't2', name: 'Secret Other Service' })];
  tables.links = []; tables.cases = []; tables.imports = []; tables.metrics = [];
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errSpy.mockRestore());

const byId = (s: Awaited<ReturnType<typeof getServiceEvidenceSummary>>, id: string) => s.services.find((x) => x.id === id)!;

describe('getServiceEvidenceSummary', () => {
  it('counts confirmed inside/outside proof, scores it, and carries the case-study cards', async () => {
    tables.cases = [cs('a', { approved_at: new Date('2026-05-01Z') }), cs('b', { source_type: 'external_document', industry: 'AgTech' })];
    tables.imports = [{ case_study_id: 'b', analysis: { year: 2024, keywords: ['pricing'], metrics: [{ label: 'Lift', value: '5%' }] } }];
    tables.metrics = [{ case_study_id: 'a', label: 'Hours saved', value_display: '120', verified_at: new Date(), is_headline: true }];
    tables.links = [link('a', 'mine-1', 'confirmed'), link('b', 'mine-1', 'confirmed')];
    const s = await getServiceEvidenceSummary({ tenantId: 't1' }, deps());
    expect(() => EvidenceSummarySchema.parse(s)).not.toThrow();
    const m = byId(s, 'mine-1');
    expect(m).toMatchObject({ insideCount: 1, outsideCount: 1, newestEvidenceYear: 2026, freshness: 20 });
    // 18 + 11 + 20 + 4*2 industries = 57
    expect(m.evidenceScore).toBe(57);
    expect(m.evidenceTier).toBe('emerging');
    expect(m.caseStudies.map((c) => [c.id, c.year, c.headlineMetric])).toEqual([
      ['a', 2026, { label: 'Hours saved', value: '120', verified: true }],
      ['b', 2024, { label: 'Lift', value: '5%', verified: false }],
    ]);
    expect(byId(s, 'mine-2')).toMatchObject({ evidenceScore: 0, evidenceTier: 'none', caseStudies: [] });
  });

  it("never counts or names another tenant's link through a SHARED case study", async () => {
    tables.cases = [cs('shared')];
    tables.links = [link('shared', 'theirs', 'confirmed'), link('shared', 'mine-2', 'suggested')];
    const s = await getServiceEvidenceSummary({ tenantId: 't1', status: 'all' }, deps());
    expect(s.services.map((x) => x.id).sort()).toEqual(['mine-1', 'mine-2']);
    expect(s.services.every((x) => x.insideCount + x.outsideCount === 0)).toBe(true);
    expect(byId(s, 'mine-2').suggestedCount).toBe(1);
    expect(JSON.stringify(s)).not.toContain('Secret Other Service');
    expect(JSON.stringify(s)).not.toContain('theirs');
  });

  it('ignores archived case studies and treats suggestions as suggestions, not proof', async () => {
    tables.cases = [cs('arch', { status: 'archived' }), cs('arch2', { archived_at: new Date() }), cs('sug')];
    tables.links = [link('arch', 'mine-1', 'confirmed'), link('arch2', 'mine-1', 'confirmed'), link('sug', 'mine-1', 'suggested')];
    const m = byId(await getServiceEvidenceSummary({ tenantId: 't1' }, deps()), 'mine-1');
    expect(m).toMatchObject({ insideCount: 0, outsideCount: 0, suggestedCount: 1, evidenceScore: 0 });
  });

  it('openOpportunityMatches is null (not 0) when the feed throws, and when only the snapshot is available', async () => {
    const thrown = await getServiceEvidenceSummary({ tenantId: 't1' }, deps({ fetchOpportunities: async () => { throw new Error('ETIMEDOUT'); } }));
    expect(thrown.services.every((x) => x.openOpportunityMatches === null)).toBe(true);
    expect(thrown.opportunityFeed).toEqual({ source: 'unavailable', openCount: null });
    expect(thrown.decideNow.demandWithoutProof).toEqual({ count: null, ids: [] });
    const snap = await getServiceEvidenceSummary({ tenantId: 't1' }, deps({ fetchOpportunities: async () => ({ ...liveFeed([{ title: 'data' }]), source: 'snapshot' }) }));
    expect(snap.services.every((x) => x.openOpportunityMatches === null)).toBe(true);
    expect(snap.opportunityFeed.source).toBe('snapshot');
  });

  it('counts strong + moderate matches on OPEN opportunities only, and flags demand without proof', async () => {
    tables.services = [svc('mine-1', { category: 'Data Analytics', keywords_json: ['dashboards'] }), svc('mine-2', { keywords_json: ['etl'] })];
    tables.cases = [cs('a')];
    tables.links = [link('a', 'mine-2', 'confirmed')];
    const feed = liveFeed([
      { title: 'Dashboards', category: 'Data Analytics' },            // mine-1 moderate (category) - counts
      { title: 'Dashboards', category: 'Data Analytics', closeDate: '2026-11-01' }, // closed - ignored
      { title: 'Dashboards', category: 'Data Analytics', closeDate: null },         // unknown close - ignored
      { title: 'ETL pipeline' },                                       // mine-2 weak (1 keyword) - not counted
    ]);
    const s = await getServiceEvidenceSummary({ tenantId: 't1' }, deps({ fetchOpportunities: async () => feed }));
    expect(s.opportunityFeed).toEqual({ source: 'live', openCount: 2 });
    expect(byId(s, 'mine-1').openOpportunityMatches).toBe(1);
    expect(byId(s, 'mine-2').openOpportunityMatches).toBe(0);
    expect(s.decideNow.demandWithoutProof).toEqual({ count: 1, ids: ['mine-1'] });
  });

  it('flags a service whose newest proof is two years old as stale, but not one with proof from last year', async () => {
    tables.cases = [cs('old', { created_at: new Date('2024-06-01Z') }), cs('recent', { created_at: new Date('2025-06-01Z') })];
    tables.links = [link('old', 'mine-1', 'confirmed'), link('recent', 'mine-2', 'confirmed')];
    const s = await getServiceEvidenceSummary({ tenantId: 't1' }, deps());
    expect(s.decideNow.staleServices).toEqual({ count: 1, ids: ['mine-1'] });
  });

  it('blocked case studies are exactly the Intake set (real intake definition)', async () => {
    tables.cases = [cs('linked'), cs('loose'), cs('only-suggested')];
    tables.links = [link('linked', 'mine-1', 'confirmed'), link('only-suggested', 'mine-1', 'suggested')];
    const s = await getServiceEvidenceSummary({ tenantId: 't1' }, deps({ listIntake: listIntakeCaseStudies }));
    expect(s.decideNow.blockedCaseStudies.ids.sort()).toEqual(['loose', 'only-suggested']);
    expect(s.intake.map((i) => i.id).sort()).toEqual(['loose', 'only-suggested']);
  });

  it('open Fit gaps pass through, and are null (not 0) when the vetting read failed', async () => {
    const gap = { qualificationKey: 'gws:1', title: 'T', buyer: 'B', closeDate: '2026-12-01', capabilityId: 'CAP-01', name: 'X', assessment: 'new' as const, matchedServiceId: null };
    expect((await getServiceEvidenceSummary({ tenantId: 't1' }, deps({ loadFitGaps: async () => [gap] }))).decideNow.openFitGaps).toEqual({ count: 1, items: [gap] });
    expect((await getServiceEvidenceSummary({ tenantId: 't1' }, deps({ loadFitGaps: async () => null }))).decideNow.openFitGaps).toEqual({ count: null, items: [] });
  });

  it('honors the status filter', async () => {
    tables.services = [svc('a1'), svc('g1', { status: 'growth' }), svc('r1', { status: 'retired' })];
    expect((await getServiceEvidenceSummary({ tenantId: 't1' }, deps())).services.map((s) => s.id)).toEqual(['a1']);
    expect((await getServiceEvidenceSummary({ tenantId: 't1', status: 'growth' }, deps())).services.map((s) => s.id)).toEqual(['g1']);
    expect((await getServiceEvidenceSummary({ tenantId: 't1', status: 'all' }, deps())).services.map((s) => s.id).sort()).toEqual(['a1', 'g1', 'r1']);
  });

  it('an empty catalog is an honest empty page, and validates', async () => {
    tables.services = [];
    const s = await getServiceEvidenceSummary({ tenantId: 't1' }, deps());
    expect(EvidenceSummarySchema.parse(s)).toMatchObject({ services: [], industryMatrix: { industries: [], cells: [] }, growthSeries: [] });
  });

  it('is idempotent: two calls over the same data return the same summary and write nothing', async () => {
    tables.cases = [cs('a')];
    tables.links = [link('a', 'mine-1', 'confirmed')];
    const before = JSON.stringify(tables);
    const d = deps();
    expect(await getServiceEvidenceSummary({ tenantId: 't1' }, d)).toEqual(await getServiceEvidenceSummary({ tenantId: 't1' }, d));
    expect(JSON.stringify(tables)).toBe(before);
  });
});
