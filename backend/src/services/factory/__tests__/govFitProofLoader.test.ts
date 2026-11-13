/**
 * loadFitProofContext against an in-memory fake that applies the real where-clauses (Op.in / Op.ne / null): tenancy
 * through a shared case study, archived records excluded, evidence keyed only for ACTIVE services.
 */
import { Op } from 'sequelize';

type Row = Record<string, unknown>;
const tables: Record<'services' | 'links' | 'cases' | 'imports', Row[]> = { services: [], links: [], cases: [], imports: [] };
function matches(row: Row, where: Record<string | symbol, unknown>): boolean {
  return Object.keys(where).every((k) => {
    const cond = where[k] as unknown;
    const v = row[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      const c = cond as Record<symbol, unknown>;
      if (Op.in in c) return (c[Op.in] as unknown[]).includes(v);
      if (Op.ne in c) return v !== c[Op.ne];
    }
    return cond === null ? v === null || v === undefined : v === cond;
  });
}
const model = (name: keyof typeof tables) => ({
  findAll: jest.fn(async (opts: { where: Record<string | symbol, unknown>; limit?: number }) => tables[name].filter((r) => matches(r, opts.where)).slice(0, opts.limit ?? Infinity)),
});
jest.mock('../../../models/ServiceOffering', () => ({ __esModule: true, default: model('services') }));
jest.mock('../../../models/CaseStudyServiceLink', () => ({ __esModule: true, default: model('links') }));
jest.mock('../../../models/CaseStudy', () => ({ __esModule: true, default: model('cases') }));
jest.mock('../../../models/CaseStudyExternalImport', () => ({ __esModule: true, default: model('imports') }));

import { loadFitProofContext } from '../govFitProofLoader';

const cs = (id: string, o: Row = {}): Row => ({ id, title: `Case ${id}`, slug: id, status: 'published', source_type: 'project', industry: 'Retail', primary_capability: null, archived_at: null, created_at: new Date('2026-01-01Z'), ...o });
const link = (c: string, s: string, state = 'confirmed'): Row => ({ case_study_id: c, service_offering_id: s, state, decided_at: new Date() });

beforeEach(() => {
  tables.services = [
    { id: 'A1', name: 'Active One', tenant_id: 't1', status: 'active' },
    { id: 'R1', name: 'Retired One', tenant_id: 't1', status: 'retired' },
    { id: 'X1', name: 'Other Tenant Service', tenant_id: 't2', status: 'active' },
  ];
  tables.cases = [cs('shared'), cs('arch', { status: 'archived' }), cs('loose', { source_type: 'external_document' })];
  tables.imports = [{ case_study_id: 'loose', analysis: { keywords: ['pricing'], capabilities: ['Demand forecasting'] } }];
  tables.links = [link('shared', 'A1'), link('shared', 'X1'), link('arch', 'A1'), link('loose', 'A1', 'suggested')];
});

describe('loadFitProofContext', () => {
  it('cites confirmed, non-archived case studies for ACTIVE services only', async () => {
    const p = await loadFitProofContext('t1', ['A1'], new Date('2026-11-13Z'));
    expect(p.available).toBe(true);
    expect(p.evidenceByService).toEqual({ A1: [{ caseStudyId: 'shared', title: 'Case shared', sourceKind: 'inside' }] });
  });

  it("never names another tenant's service through a shared case study", async () => {
    const p = await loadFitProofContext('t1', ['A1'], new Date('2026-11-13Z'));
    const shared = p.candidates.find((c) => c.caseStudyId === 'shared');
    expect(shared?.confirmedServiceIds).toEqual(['A1']);
    expect(JSON.stringify(p)).not.toContain('X1');
  });

  it('a link to a retired service still marks the record as linked elsewhere, but is not evidence for fit', async () => {
    tables.links.push(link('loose', 'R1'));
    const p = await loadFitProofContext('t1', ['A1'], new Date('2026-11-13Z'));
    expect(p.evidenceByService.R1).toBeUndefined();
    expect(p.candidates.find((c) => c.caseStudyId === 'loose')?.confirmedServiceIds).toEqual(['R1']);
  });

  it('candidates carry outside analysis terms and exclude archived records', async () => {
    const p = await loadFitProofContext('t1', ['A1'], new Date('2026-11-13Z'));
    expect(p.candidates.map((c) => c.caseStudyId).sort()).toEqual(['loose', 'shared']);
    expect(p.candidates.find((c) => c.caseStudyId === 'loose')).toMatchObject({ sourceKind: 'outside', confirmedServiceIds: [] });
    expect(p.candidates.find((c) => c.caseStudyId === 'loose')?.terms).toEqual(expect.arrayContaining(['pricing', 'Demand forecasting']));
  });
});
