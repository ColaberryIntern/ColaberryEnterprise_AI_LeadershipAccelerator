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
