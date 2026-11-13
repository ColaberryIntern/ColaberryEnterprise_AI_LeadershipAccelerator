/**
 * SV2.3 diff logic on synthetic fixtures (no real pursuit, title or verdict is committed - the repository is public).
 */
import { buildRegressionReport, diffPursuit, FitRun, median, RegressionReport, RunCapability, summarizeRegression } from '../fitRegression';
import type { CatalogSnapshot, PursuitBaseline } from '../schemas';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ACTIVE = U(1); const RETIRED = U(2); const OTHER = U(3); const DROPPED = U(4);
const catalog: CatalogSnapshot = {
  kind: 'service_catalog_snapshot', takenOn: '2026-11-13', tenantId: U(9), rowCount: 4,
  rows: [ACTIVE, RETIRED, OTHER, DROPPED].map((id) => ({ id, name: `S-${id.slice(-1)}`, description: null, category: null, keywords: [], naicsCodes: [], pscCodes: [], pastPerformance: null, status: 'active', updatedAt: null })),
};
const now = new Map([[ACTIVE, 'active'], [RETIRED, 'retired'], [OTHER, 'active'], [DROPPED, 'active']]);
const cap = (id: string, assessment: 'have' | 'partial' | 'new', matchedServiceId: string | null, o: Partial<RunCapability> = {}): RunCapability => ({ id, name: `cap ${id}`, assessment, matchedServiceId, ...o });
const before: PursuitBaseline = {
  canonicalOpportunityId: 'opp-1', source: 'fresh_run', title: 'Synthetic pursuit', requirementCount: 5, verdict: null, coveragePct: null, completedAt: null, error: null,
  capabilities: [
    { id: 'C1', name: 'a', assessment: 'have', matchedServiceId: ACTIVE, rationale: '' },
    { id: 'C2', name: 'b', assessment: 'have', matchedServiceId: RETIRED, rationale: '' },
    { id: 'C3', name: 'c', assessment: 'have', matchedServiceId: DROPPED, rationale: '' },
    { id: 'C4', name: 'd', assessment: 'new', matchedServiceId: null, rationale: '' },
  ],
};
// The model still says "have" for ACTIVE; the proof rule downgrades it only in the flag-on view.
const runWith = (droppedAssessment: 'have' | 'partial'): FitRun => ({
  error: null,
  flagOff: [cap('C1', 'have', ACTIVE, { evidence: [] }), cap('C3', droppedAssessment, DROPPED, droppedAssessment === 'have' ? { evidence: [] } : { possibleProof: [{}] }), cap('C4', 'new', null, { possibleProof: [{}, {}] })],
  flagOn: [cap('C1', 'partial', ACTIVE, { downgradedFrom: 'have', possibleProof: [] }), cap('C3', droppedAssessment === 'have' ? 'partial' : droppedAssessment, DROPPED, droppedAssessment === 'have' ? { downgradedFrom: 'have' } : {}), cap('C4', 'new', null, { possibleProof: [{}, {}] })],
});

describe('diffPursuit', () => {
  const runs = [runWith('partial'), runWith('partial'), runWith('have')];
  const d = diffPursuit(before, runs, catalog, now);

  it('counts before from the baseline file, against the baseline catalog', () => {
    expect(d.before).toEqual({ counts: { have: 3, partial: 0, new: 1 }, matched: { active: 3, growth: 0, retired: 0, unknown: 0 }, haveServices: [ACTIVE, RETIRED, DROPPED].sort() });
  });

  it('flag OFF: majority vote keeps ACTIVE as have; explains every have lost with one reason', () => {
    const v = d.after!.flagOff;
    expect(v.majorityHaveServices).toEqual([ACTIVE]);
    expect(v.median).toEqual({ have: 1, partial: 1, new: 1 });
    // Ordered by service id (RETIRED ...2 before DROPPED ...4).
    expect(v.explanations).toEqual([
      { serviceId: RETIRED, reason: 'service-no-longer-active', statusNow: 'retired', afterByRun: ['unmatched', 'unmatched', 'unmatched'] },
      { serviceId: DROPPED, reason: 'model-reassessed', statusNow: 'active', afterByRun: ['partial', 'partial', 'have'] },
    ]);
    expect(v.downgraded).toBe(0);
    expect(v.possibleProofOffered).toBe(3);
  });

  it('flag ON: the downgrade is explained as downgraded-no-proof, from the same runs', () => {
    const v = d.after!.flagOn;
    expect(v.majorityHaveServices).toEqual([]);
    const byId = Object.fromEntries(v.explanations.map((e) => [e.serviceId, e.reason]));
    expect(byId).toEqual({ [ACTIVE]: 'downgraded-no-proof', [RETIRED]: 'service-no-longer-active', [DROPPED]: 'model-reassessed' });
    expect(v.downgraded).toBe(1);
  });

  it('every before-have service is either a majority have after or explained (both views)', () => {
    for (const k of ['flagOff', 'flagOn'] as const) {
      const v = d.after![k];
      for (const id of d.before.haveServices) expect(v.majorityHaveServices.includes(id) || v.explanations.some((e) => e.serviceId === id)).toBe(true);
    }
  });

  it('1 of 3 is not a majority; 2 of 3 is', () => {
    expect(diffPursuit(before, [runWith('have'), runWith('partial'), runWith('partial')], catalog, now).after!.flagOff.majorityHaveServices).not.toContain(DROPPED);
    expect(diffPursuit(before, [runWith('have'), runWith('have'), runWith('partial')], catalog, now).after!.flagOff.majorityHaveServices).toContain(DROPPED);
  });

  it('failed runs are excluded from the vote and counted; all failing gives an error and no after', () => {
    const fail: FitRun = { error: 'upstream down', flagOff: [], flagOn: [] };
    const some = diffPursuit(before, [fail, runWith('have'), runWith('have')], catalog, now);
    expect(some).toMatchObject({ runs: 3, failedRuns: 1, error: null });
    expect(some.after!.flagOff.majorityHaveServices).toContain(DROPPED);
    const all = diffPursuit(before, [fail, fail], catalog, now);
    expect(all).toMatchObject({ after: null, error: 'every run failed: upstream down' });
    expect(diffPursuit(before, [], catalog, now, 'pursuit_not_found')).toMatchObject({ runs: 0, after: null, error: 'pursuit_not_found' });
  });
});

describe('buildRegressionReport + summary', () => {
  const pursuits = [diffPursuit(before, [runWith('partial'), runWith('partial'), runWith('have')], catalog, now), diffPursuit(before, [], catalog, now, 'pursuit_not_found')];
  const r: RegressionReport = buildRegressionReport({ generatedAt: 'g', baselineTakenOn: '2026-11-13', runsPerPursuit: 3, pursuits });

  it('totals add up across pursuits and validate against the schema', () => {
    expect(r.totals.before).toEqual({ have: 6, partial: 0, new: 2 });
    expect(r.totals.flagOff.explained).toBe(2);
    expect(r.totals.flagOn).toMatchObject({ explained: 3, downgraded: 1 });
  });

  it('is deterministic: same input, same report', () => {
    expect(buildRegressionReport({ generatedAt: 'g', baselineTakenOn: '2026-11-13', runsPerPursuit: 3, pursuits })).toEqual(r);
  });

  it('the terminal summary carries ids and counts, never titles or capability names', () => {
    const s = summarizeRegression(r);
    expect(s).toContain('opp-1');
    expect(s).toContain('downgraded-no-proof');
    expect(s).not.toContain('Synthetic pursuit');
    expect(s).not.toContain('cap C1');
  });

  it('median handles odd, even and empty', () => {
    expect([median([3, 1, 2]), median([1, 2, 3, 4]), median([])]).toEqual([2, 2.5, 0]);
  });
});
