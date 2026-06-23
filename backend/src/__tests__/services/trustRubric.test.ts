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
  valueUsd30d: 1200,
  hoursSaved30d: 24,
  consentChecks7d: 30,
  consentEnforcing: false,
  abacChecks7d: 40,
  abacEnforcing: false,
};

describe('trustRubric', () => {
  it('rolls Security up with the live ABAC criterion (shadow)', () => {
    const d = evaluateDimension('security', SIGNALS)!;
    // admin-auth(3)+jwt(1)+webhook(1)+transport(2)+ci-secrets(1) met = 800 ; abac(2) shadow-live = 120 ; /10 = 92
    expect(d.score).toBe(92);
    expect(d.band).toBe('green');
    expect(d.state).toBe('live'); // abac is now a live criterion in Security
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

  it('consent criterion is live: shadow→partial, enforcing→met, no-traffic→partial-low', () => {
    // Shadow (default) with traffic → partial 65, live source
    const shadow = evaluateDimension('privacy', SIGNALS)!.criteria.find((c) => c.key === 'consent')!;
    expect(shadow.status).toBe('partial');
    expect(shadow.source).toBe('live');
    expect(shadow.pct).toBe(65);
    expect(shadow.evidence).toContain('SHADOW');
    // Enforcing + checks → met 100
    const enforcing = evaluateDimension('privacy', { ...SIGNALS, consentEnforcing: true })!.criteria.find((c) => c.key === 'consent')!;
    expect(enforcing.status).toBe('met');
    expect(enforcing.pct).toBe(100);
    // Shipped but no outbound in 7d → still live, partial-low (never 'open' again)
    const idle = evaluateDimension('privacy', { ...SIGNALS, consentChecks7d: 0 })!.criteria.find((c) => c.key === 'consent')!;
    expect(idle.status).toBe('partial');
    expect(idle.pct).toBe(55);
  });

  it('both ABAC criteria are live: shadow→partial, enforcing→met, idle→partial-low (never open)', () => {
    for (const [dim, key] of [['security', 'abac'], ['governance', 'abac-gov']] as const) {
      // Shadow (default) with traffic → partial 60, live
      const shadow = evaluateDimension(dim, SIGNALS)!.criteria.find((c) => c.key === key)!;
      expect(shadow.status).toBe('partial');
      expect(shadow.source).toBe('live');
      expect(shadow.pct).toBe(60);
      expect(shadow.evidence).toContain('SHADOW');
      // Enforcing + checks → met 100
      const enforcing = evaluateDimension(dim, { ...SIGNALS, abacEnforcing: true })!.criteria.find((c) => c.key === key)!;
      expect(enforcing.status).toBe('met');
      expect(enforcing.pct).toBe(100);
      // Shipped but no agent actions in 7d → still live, partial-low (never 'open' again)
      const idle = evaluateDimension(dim, { ...SIGNALS, abacChecks7d: 0 })!.criteria.find((c) => c.key === key)!;
      expect(idle.status).toBe('partial');
      expect(idle.pct).toBe(50);
    }
  });

  it('roi-attribution flips to partial-live once time-saved value exists', () => {
    const roi = evaluateDimension('businessImpact', SIGNALS)!.criteria.find((c) => c.key === 'roi-attribution')!;
    expect(roi.status).toBe('partial');
    expect(roi.source).toBe('live');
    expect(roi.evidence).toContain('$1200');
    const none = evaluateDimension('businessImpact', { ...SIGNALS, valueUsd30d: 0 })!.criteria.find((c) => c.key === 'roi-attribution')!;
    expect(none.status).toBe('open');
  });
});
