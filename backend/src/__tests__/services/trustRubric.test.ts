import {
  evaluateDimension,
  evaluateAll,
  collectOpenActions,
  dimensionKeys,
  type LiveSignals,
} from '../../services/trustRubric';

const SIGNALS: LiveSignals = {
  costUsd7d: 5,
  distinctWorkflows7d: 12, // 12/15 ≈ 80% coverage
  traceCoveragePct: 80,
  events24h: 100,
  blockedWrites24h: 2,
  killSwitchReady: true,
  safeModeReady: true,
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
    // unified(2,100)+coverage(3,85 shipped)+cost(1,100)+trace(2,80)+metrics(2,0)+tool(2,0) = 715 ; /12 ≈ 60
    expect(d.score).toBe(60);
    expect(d.state).toBe('live'); // cost + trace are live criteria
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
