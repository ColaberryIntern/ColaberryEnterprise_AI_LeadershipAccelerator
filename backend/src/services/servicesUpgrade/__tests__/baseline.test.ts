import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  mapEstablished, parseBaselineArgs, selectBaselinePursuits, sqlRowToDto, summarizeBaseline, toSnapshotRow, vettingToPursuit, writeBaseline,
  type QualificationRow,
} from '../baseline';

const reqs = (n: number) => ({ established: Array.from({ length: n }, (_, i) => ({ id: `R${i}`, text: `req ${i}` })) });
const row = (id: string, updated: string, n = 3, version = 1, status = 'active'): QualificationRow =>
  ({ canonical_opportunity_id: id, status, version, updated_at: updated, requirements_json: reqs(n) });
const uuid = (d: string) => `${d.repeat(8)}-1111-4111-8111-111111111111`;

describe('selectBaselinePursuits', () => {
  it('is deterministic: newest first, id tie-break, excludes < 3 requirements and inactive rows', () => {
    const rows = [
      row('gws:b', '2026-11-10'), row('gws:a', '2026-11-10'), row('gws:c', '2026-11-12'),
      row('gws:thin', '2026-11-13', 2), row('gws:old', '2026-11-13', 5, 1, 'superseded'),
      row('gws:d', '2026-11-01'), row('gws:e', '2026-10-01'), row('gws:f', '2026-09-01'),
    ];
    const ids = selectBaselinePursuits(rows).map((r) => r.canonical_opportunity_id);
    expect(ids).toEqual(['gws:c', 'gws:a', 'gws:b', 'gws:d', 'gws:e']);
    expect(selectBaselinePursuits([...rows].reverse()).map((r) => r.canonical_opportunity_id)).toEqual(ids);
  });

  it('keeps only the latest version per opportunity', () => {
    const picked = selectBaselinePursuits([row('gws:x', '2026-11-01', 3, 1), row('gws:x', '2026-11-02', 4, 2)]);
    expect(picked).toHaveLength(1);
    expect(picked[0].version).toBe(2);
  });

  it('mapEstablished drops empty and duplicate ids', () => {
    expect(mapEstablished([{ id: 'A', text: 'x' }, { id: 'A', text: 'y' }, { text: ' ' }, { statement: 'z' }])).toEqual([{ id: 'A', text: 'x' }, { id: 'REQ-004', text: 'z' }]);
    expect(mapEstablished(null)).toEqual([]);
  });
});

describe('summarizeBaseline', () => {
  it('counts statuses, flags weak active rows, and totals assessments', () => {
    const base = { description: 'x'.repeat(50), category: 'C', keywords: ['a', 'b', 'c'], naicsCodes: ['541511'], pscCodes: [], pastPerformance: null, updatedAt: null };
    const snapshot: any = { kind: 'service_catalog_snapshot', takenOn: '2026-11-13', tenantId: uuid('1'), rowCount: 3, rows: [
      { ...base, id: uuid('2'), name: 'Good', status: 'active' },
      { ...base, id: uuid('3'), name: 'Weak', status: 'active', keywords: [], description: null },
      { ...base, id: uuid('4'), name: 'Grow', status: 'growth' },
    ] };
    const cap = (a: string, m: string | null) => ({ id: 'C', name: 'n', assessment: a, matchedServiceId: m, rationale: 'r' });
    const fit: any = { kind: 'capability_fit_baseline', takenOn: '2026-11-13', activeServiceCount: 2, selectionRule: 'r', pursuits: [
      { canonicalOpportunityId: 'gws:a', source: 'fresh_run', title: 'A', requirementCount: 3, verdict: null, coveragePct: null, completedAt: null, error: null, capabilities: [cap('have', uuid('2')), cap('new', null), cap('partial', uuid('2')), cap('have', uuid('4'))] },
    ] };
    const s = summarizeBaseline(snapshot, fit);
    expect(s.byStatus).toEqual({ active: 2, growth: 1, retired: 0 });
    expect(s.weakRows.map((w) => w.name)).toEqual(['Weak']);
    expect(s.totals).toEqual({ have: 2, partial: 1, new: 1, matched: 3 });
    expect(s.matchesByStatus).toEqual({ active: 2, growth: 1, retired: 0, unknown: 0 });
  });
});

describe('writeBaseline', () => {
  const snap = { kind: 'service_catalog_snapshot', takenOn: '2026-11-13', tenantId: uuid('1'), rowCount: 0, rows: [] };
  it('overwrites the same files on a second run (idempotent)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-'));
    const a = writeBaseline(dir, '2026-11-13', snap, {});
    const b = writeBaseline(dir, '2026-11-13', snap, {});
    expect(a).toEqual(b);
    expect(fs.readdirSync(dir)).toEqual(['catalog_2026-11-13.json']);
  });
  it('refuses invalid data before writing anything', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-'));
    expect(() => writeBaseline(dir, '2026-11-13', { ...snap, rowCount: 5 }, {})).toThrow();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('parseBaselineArgs', () => {
  it('parses --help and --catalog-only without side effects', () => {
    expect(parseBaselineArgs(['--help'], {}, '2026-11-13')).toEqual({ help: true, catalogOnly: false, outDir: '/tmp/svc-baseline', takenOn: '2026-11-13', fromExport: null });
    expect(parseBaselineArgs(['--from-export', 'c.json', 'v.json'], {}, 'x').fromExport).toEqual(['c.json', 'v.json']);
    expect(parseBaselineArgs(['--catalog-only'], { OUT_DIR: '/o', TAKEN_ON: '2026-01-01' }, 'x')).toMatchObject({ catalogOnly: true, outDir: '/o', takenOn: '2026-01-01' });
  });
});

describe('stored vetting + SQL export mapping', () => {
  it('maps a gov_ai_vettings row to a stored_vetting pursuit and validates through writeBaseline', () => {
    const p = vettingToPursuit({ qualification_key: 'gws:z', verdict: 'pass', coverage_pct: 14, completed_at: '2026-11-12T10:00:00Z', title: 'Roof',
      fit_json: { capabilities: [{ id: 'CAP-01', name: 'Roofing', assessment: 'new', matchedServiceId: null, rationale: 'none' }] } });
    expect(p).toMatchObject({ source: 'stored_vetting', verdict: 'pass', coveragePct: 14, requirementCount: null });
    expect(vettingToPursuit({ qualification_key: 'gws:y', fit_json: null }).capabilities).toEqual([]);
    const row = toSnapshotRow(sqlRowToDto({ id: uuid('5'), name: 'S', description: null, category: null, keywords: null, naics: ['541511'], psc: null,
      past_performance: null, status: 'retired', updated_at: '2026-11-01T00:00:00Z' }));
    expect(row).toMatchObject({ keywords: [], naicsCodes: ['541511'], status: 'retired' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-'));
    const files = writeBaseline(dir, '2026-11-13', { kind: 'service_catalog_snapshot', takenOn: '2026-11-13', tenantId: uuid('1'), rowCount: 1, rows: [row] },
      { capability_fit_stored: { kind: 'capability_fit_baseline', takenOn: '2026-11-13', activeServiceCount: 0, selectionRule: 'r', pursuits: [p] } });
    expect(files.map((f) => path.basename(f))).toEqual(['catalog_2026-11-13.json', 'capability_fit_stored_2026-11-13.json']);
  });
});
