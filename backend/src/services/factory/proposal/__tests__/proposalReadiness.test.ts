/**
 * proposalReadiness — the pure readiness meter (spec §C.2 / §B.1). Counts the scored, in-scope documents that pass,
 * excluding pricing (admin-only), superseded ("No longer required"), and FORM docs. Happy / boundary / exclusion /
 * garbage coverage.
 */
import { proposalReadiness, type ReadinessDoc } from '../proposalReadiness';

const d = (over: Partial<ReadinessDoc>): ReadinessDoc => ({ adminOnly: false, superseded: false, docType: 'derived', passes: false, ...over });

describe('proposalReadiness', () => {
  it('computes pct / passing / total over scored docs', () => {
    const docs = [d({ passes: true }), d({ passes: true }), d({ passes: false }), d({ passes: false })];
    expect(proposalReadiness(docs)).toEqual({ pct: 50, passing: 2, total: 4 });
  });

  it('rounds the percentage', () => {
    const docs = [d({ passes: true }), d({ passes: false }), d({ passes: false })]; // 1/3 = 33.33
    expect(proposalReadiness(docs).pct).toBe(33);
  });

  it('excludes pricing (admin-only), superseded, and FORM documents from both numerator and denominator', () => {
    const docs = [
      d({ passes: true }),                                  // counts
      d({ passes: true, adminOnly: true }),                 // pricing — excluded
      d({ passes: true, superseded: true }),                // No longer required — excluded
      d({ passes: true, docType: 'form' }),                 // signature form — excluded
      d({ passes: false }),                                 // counts (not passing)
    ];
    expect(proposalReadiness(docs)).toEqual({ pct: 50, passing: 1, total: 2 });
  });

  it('boundary: no scored docs → 0% / 0 of 0 (never divides by zero)', () => {
    expect(proposalReadiness([])).toEqual({ pct: 0, passing: 0, total: 0 });
    expect(proposalReadiness([d({ adminOnly: true, passes: true }), d({ docType: 'form', passes: true })]))
      .toEqual({ pct: 0, passing: 0, total: 0 });
  });

  it('boundary: all passing → 100, none passing → 0', () => {
    expect(proposalReadiness([d({ passes: true }), d({ passes: true })])).toEqual({ pct: 100, passing: 2, total: 2 });
    expect(proposalReadiness([d({ passes: false }), d({ passes: false })])).toEqual({ pct: 0, passing: 0, total: 2 });
  });

  it('garbage input yields an empty-but-valid readiness, never throws', () => {
    expect(proposalReadiness(undefined as unknown as ReadinessDoc[])).toEqual({ pct: 0, passing: 0, total: 0 });
    expect(proposalReadiness([null as unknown as ReadinessDoc, d({ passes: true })])).toEqual({ pct: 100, passing: 1, total: 1 });
  });
});

describe('proposalReadiness — graduated pct (the gauge fix)', () => {
  it('pct is the average of eligible documents weighted scores when scores are provided', () => {
    const docs = [d({ score: 90, passes: true }), d({ score: 60, passes: false })]; // (90+60)/2 = 75
    expect(proposalReadiness(docs)).toEqual({ pct: 75, passing: 1, total: 2 });
  });
  it('a substantive draft reads near-ready instead of 0% (every doc scored ~70, none fully passes)', () => {
    const docs = [d({ score: 70, passes: false }), d({ score: 68, passes: false }), d({ score: 72, passes: false })];
    const r = proposalReadiness(docs);
    expect(r.pct).toBe(70); // was 0 under the old pass-fraction meter
    expect(r.passing).toBe(0); // the pass count is still honest
  });
  it('a document with no scored version yet contributes 0 to the average', () => {
    const docs = [d({ score: 80, passes: false }), d({ passes: false })]; // (80+0)/2 = 40
    expect(proposalReadiness(docs).pct).toBe(40);
  });
  it('clamps an out-of-range score into 0..100', () => {
    expect(proposalReadiness([d({ score: 140, passes: true })]).pct).toBe(100);
    expect(proposalReadiness([d({ score: -5, passes: false })]).pct).toBe(0);
  });
  it('excluded docs (form / admin-only / superseded) are not in the average', () => {
    const docs = [d({ score: 90 }), d({ score: 10, docType: 'form' })]; // form excluded -> avg is just 90
    expect(proposalReadiness(docs).pct).toBe(90);
  });
  it('falls back to the pass fraction when NO document carries a score (older callers unchanged)', () => {
    expect(proposalReadiness([d({ passes: true }), d({ passes: false })]).pct).toBe(50);
  });
});
