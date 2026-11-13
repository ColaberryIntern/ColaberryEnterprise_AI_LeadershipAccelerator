/**
 * The Intake definition (package spec 1C), against an in-memory fake of the three tables it reads. The fake applies
 * the same where-clauses the queries send (Op.in / Op.notIn / Op.ne), so these tests check the DEFINITION - zero
 * confirmed links in this tenant, archived excluded, suggestions not counted - rather than the mock.
 */
import { Op } from 'sequelize';

type Row = Record<string, unknown>;
const tables: { services: Row[]; links: Row[]; cases: Row[]; imports: Row[] } = { services: [], links: [], cases: [], imports: [] };

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

import { listIntakeCaseStudies } from '../caseStudyIntakeQueue';

const cs = (id: string, o: Row = {}): Row => ({ id, title: id.toUpperCase(), slug: id, status: 'draft', source_type: 'project', industry: null, archived_at: null, ...o });
const link = (case_study_id: string, service_offering_id: string, state: string, match_score = 1): Row => ({ id: `${case_study_id}-${service_offering_id}`, case_study_id, service_offering_id, state, match_score, rationale: 'kw' });

beforeEach(() => {
  tables.services = [{ id: 'mine-1', name: 'Pricing Analytics', tenant_id: 't1' }, { id: 'mine-2', name: 'Data Eng', tenant_id: 't1' }, { id: 'theirs', name: 'Secret Other Service', tenant_id: 't2' }];
  tables.cases = [];
  tables.links = [];
  tables.imports = [];
});

const ids = async () => (await listIntakeCaseStudies({ tenantId: 't1' })).map((i) => i.id).sort();

describe('listIntakeCaseStudies', () => {
  it('holds a record with zero links, and a record with only SUGGESTED links', async () => {
    tables.cases = [cs('a'), cs('b')];
    tables.links = [link('b', 'mine-1', 'suggested')];
    expect(await ids()).toEqual(['a', 'b']);
  });

  it('releases a record once one link is CONFIRMED in this tenant, whatever its status', async () => {
    tables.cases = [cs('a', { status: 'published' }), cs('b', { status: 'approved' })];
    tables.links = [link('a', 'mine-2', 'confirmed')];
    expect(await ids()).toEqual(['b']);
  });

  it("keeps a record that only ANOTHER tenant confirmed - and never shows that tenant's service name", async () => {
    tables.cases = [cs('a')];
    tables.links = [link('a', 'theirs', 'confirmed'), link('a', 'mine-1', 'suggested', 4)];
    const [item] = await listIntakeCaseStudies({ tenantId: 't1' });
    expect(item.id).toBe('a');
    expect(item.suggestions.map((s) => s.serviceName)).toEqual(['Pricing Analytics']);
    expect(JSON.stringify(item)).not.toContain('Secret Other Service');
  });

  it('excludes archived records, by status and by archived_at', async () => {
    tables.cases = [cs('a', { status: 'archived' }), cs('b', { archived_at: new Date() }), cs('c')];
    expect(await ids()).toEqual(['c']);
  });

  it('a rejected link does not count as linked', async () => {
    tables.cases = [cs('a')];
    tables.links = [link('a', 'mine-1', 'rejected')];
    expect(await ids()).toEqual(['a']);
  });

  it('carries outside keywords + analysisError, the source kind, and suggestions strongest first', async () => {
    tables.cases = [cs('a', { source_type: 'external_drive' })];
    tables.links = [link('a', 'mine-2', 'suggested', 1), link('a', 'mine-1', 'suggested', 5)];
    tables.imports = [{ case_study_id: 'a', analysis: { keywords: ['pricing', 7, 'xgboost'] }, analysis_error: null }];
    const [item] = await listIntakeCaseStudies({ tenantId: 't1' });
    expect(item).toMatchObject({ sourceKind: 'outside', keywords: ['pricing', 'xgboost'], analysisError: null });
    expect(item.suggestions.map((s) => s.serviceId)).toEqual(['mine-1', 'mine-2']);
  });

  it('is empty when there are no records, and still works for a tenant with no services', async () => {
    expect(await listIntakeCaseStudies({ tenantId: 't1' })).toEqual([]);
    tables.cases = [cs('a')];
    expect((await listIntakeCaseStudies({ tenantId: 'nobody' })).map((i) => i.id)).toEqual(['a']);
  });
});
