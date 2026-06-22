import {
  evaluateDimension,
  evaluateAll,
  collectOpenActions,
  dimensionKeys,
  type LiveSignals,
} from '../../services/trustRubric';

const SIGNALS: LiveSignals = {
  costUsd7d: 5,
  distinctWorkflows7d: 12,
  traceCoveragePct: 80,
  events24h: 100,
  blockedWrites24h: 2,
  killSwitchReady: true,
  safeModeReady: true,
  events7d: 400,
  p50Ms: 800,
  p95Ms: 2000,
  errorRatePct: 2,
  toolEvents7d: 5,
  retrievalEvents7d: 8,
  vectorRetrievalEvents7d: 4,
};

describe('trustRubric', () => {
  it('rolls Security up to a deterministic 70 (no live criteria)', () => {
    const d = evaluateDimension('security', SIGNALS)!;
    // admin-auth(3)+jwt(1)+webhook(1)+transport(2) met = 700 ; abac(2)+ci(1) open = 0 ; /10 = 70
    expect(d.score).toBe(70);
    expect(d.band).toBe('amber');
    expect(d.state).toBe('baseline'); // no live criterion in Security
  });

  it('computes Observability live from the signals', () => {
    const d = evaluateDimension('observability', SIGNALS)!;
    // unified(2,100)+coverage(3,85)+cost(1,100)+trace(2,80)+metrics(2,100)+tool-retrieval(2,100) = 1115 ; /12 ≈ 93
    expect(d.score).toBe(93);
    expect(d.state).toBe('live'); // cost + trace + metrics + tool-retrieval are live criteria
  });

  it('tool-retrieval + citations criteria flip live once tool/retrieval events are captured', () => {
    const obs = evaluateDimension('observability', SIGNALS)!.criteria.find((c) => c.key === 'tool-retrieval')!;
    expect(obs.status).toBe('met'); // both tool + retrieval events present
    const expl = evaluateDimension('explainability', SIGNALS)!.criteria.find((c) => c.key === 'citations')!;
    expect(expl.status).toBe('met'); // both Maya keyword + Cory vector retrieval persist provenance
    // Keyword-only (no vector) → citations partial
    const kwOnly = evaluateDimension('explainability', { ...SIGNALS, vectorRetrievalEvents7d: 0 })!.criteria.find((c) => c.key === 'citations')!;
    expect(kwOnly.status).toBe('partial');
    const none = evaluateDimension('observability', { ...SIGNALS, toolEvents7d: 0, retrievalEvents7d: 0 })!.criteria.find((c) => c.key === 'tool-retrieval')!;
    expect(none.status).toBe('open');
  });

  it('metrics criterion flips to met once events exist, with live latency evidence', () => {
    const d = evaluateDimension('observability', SIGNALS)!;
    const metrics = d.criteria.find((c) => c.key === 'metrics')!;
    expect(metrics.status).toBe('met');
    expect(metrics.evidence).toContain('p95 2000ms');
    const noData = evaluateDimension('observability', { ...SIGNALS, events7d: 0 })!.criteria.find((c) => c.key === 'metrics')!;
    expect(noData.status).toBe('open');
  });

  it('returns all dimensions with criteria', () => {
    const all = evaluateAll(SIGNALS);
    expect(all).toHaveLength(dimensionKeys().length);
    for (const d of all) {
      expect(d.criteria.length).toBeGreaterThan(0);
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
  });

  it('builds the open-actions backlog ranked by weight, only for unmet criteria with remediation', () => {
    const actions = collectOpenActions(evaluateAll(SIGNALS));
    expect(actions.length).toBeGreaterThan(0);
    // Highest-weight open gap is governance ABAC/autonomy (weight 4).
    expect(actions[0].weight).toBe(4);
    expect(actions[0].dimensionKey).toBe('governance');
    // Every action is unmet and carries a remediation.
    for (const a of actions) {
      expect(a.status === 'open' || a.status === 'partial').toBe(true);
      expect(a.remediation.length).toBeGreaterThan(0);
    }
    // Sorted by descending weight.
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i - 1].weight).toBeGreaterThanOrEqual(actions[i].weight);
    }
  });

  it('returns null for an unknown dimension key (whitelist)', () => {
    expect(evaluateDimension('not-a-dimension', SIGNALS)).toBeNull();
  });
});
