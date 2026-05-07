/**
 * Phase 8 tests — pure helpers + bus dynamics.
 *
 * Coverage:
 *   - cognitiveEventBus (publish, subscribe, kind-subscribe, error isolation)
 *   - awarenessHeartbeatManager (start/stop, handler registration)
 *   - pressureDecayModel (half-life decay, hysteretic tier mapping)
 *   - livePressureEngine (events emit on threshold cross, no events on small jitter)
 *   - autonomousRegressionDetector.evaluateRegression (threshold logic)
 *   - cognitiveStabilityProtection (rate limit, debounce, hysteresis, cooldown)
 *   - operationalCostGovernance (counters, health signals)
 */
import {
  cognitiveEventBus,
  publishCognitiveEvent,
  type CognitiveEvent,
} from '../realtime/cognitiveEventBus';
import {
  configureHeartbeat,
  registerHeartbeatHandler,
  startHeartbeat,
  stopHeartbeat,
  heartbeatStatus,
  _resetHeartbeatForTests,
} from '../realtime/awarenessHeartbeatManager';
import { decayPressure, tierOf } from '../realtime/pressureDecayModel';
import { tickPressure, getPressureState, _resetLivePressureForTests } from '../realtime/livePressureEngine';
import { evaluateRegression } from '../realtime/autonomousRegressionDetector';
import {
  allowByRateLimit,
  withCooldown,
  withHysteresis,
  _resetStabilityForTests,
} from '../realtime/cognitiveStabilityProtection';
import {
  recordGPT4oCall,
  recordGPT4oCacheHit,
  recordRerank,
  getCostGovernanceReport,
  resetCostGovernanceWindow,
} from '../realtime/operationalCostGovernance';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------------------
// cognitiveEventBus
// ---------------------------------------------------------------------------

describe('cognitiveEventBus', () => {
  beforeEach(() => cognitiveEventBus._resetForTests());

  it('delivers events to all subscribers', () => {
    const calls: CognitiveEvent[] = [];
    cognitiveEventBus.subscribe(e => calls.push(e));
    cognitiveEventBus.subscribe(e => calls.push(e));
    publishCognitiveEvent({ kind: 'queue.reranked', project_id: PROJECT_ID, payload: { x: 1 } });
    expect(calls.length).toBe(2);
  });

  it('kind-specific subscribers fire only for matching events', () => {
    const all: CognitiveEvent[] = [];
    const reranks: CognitiveEvent[] = [];
    cognitiveEventBus.subscribe(e => all.push(e));
    cognitiveEventBus.subscribeToKind('queue.reranked', e => reranks.push(e));
    publishCognitiveEvent({ kind: 'queue.reranked', project_id: PROJECT_ID, payload: {} });
    publishCognitiveEvent({ kind: 'pressure.changed', project_id: PROJECT_ID, payload: {} });
    expect(all.length).toBe(2);
    expect(reranks.length).toBe(1);
  });

  it('isolates subscriber errors from other subscribers', () => {
    cognitiveEventBus.subscribe(() => { throw new Error('boom'); });
    const okCalls: CognitiveEvent[] = [];
    cognitiveEventBus.subscribe(e => okCalls.push(e));
    publishCognitiveEvent({ kind: 'queue.reranked', project_id: PROJECT_ID, payload: {} });
    expect(okCalls.length).toBe(1);
    expect(cognitiveEventBus.stats().dropped).toBe(1);
  });

  it('unsubscribe stops delivery', () => {
    const calls: CognitiveEvent[] = [];
    const off = cognitiveEventBus.subscribe(e => calls.push(e));
    off();
    publishCognitiveEvent({ kind: 'queue.reranked', project_id: PROJECT_ID, payload: {} });
    expect(calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// awarenessHeartbeatManager
// ---------------------------------------------------------------------------

describe('awarenessHeartbeatManager', () => {
  beforeEach(() => _resetHeartbeatForTests());
  afterEach(() => _resetHeartbeatForTests());

  it('start/stop is idempotent', () => {
    expect(heartbeatStatus().running).toBe(false);
    configureHeartbeat({ interval_ms: 5000, project_ids: [PROJECT_ID] });
    startHeartbeat();
    startHeartbeat();
    expect(heartbeatStatus().running).toBe(true);
    stopHeartbeat();
    stopHeartbeat();
    expect(heartbeatStatus().running).toBe(false);
  });

  it('registers handlers + tracks them', () => {
    const off1 = registerHeartbeatHandler(() => {});
    registerHeartbeatHandler(() => {});
    expect(heartbeatStatus().handler_count).toBe(2);
    off1();
    expect(heartbeatStatus().handler_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// pressureDecayModel
// ---------------------------------------------------------------------------

describe('decayPressure', () => {
  it('half-life: 60 → 30 after one half_life_min', () => {
    const r = decayPressure({
      previous_pressure: 60,
      minutes_since_last_escalation: 15,
      new_raw_pressure: 0,
      half_life_min: 15,
    });
    expect(r.value).toBe(30);
    expect(r.applied_decay).toBeCloseTo(30, 0);
  });

  it('new raw pressure overrides decay (escalation immediate)', () => {
    const r = decayPressure({
      previous_pressure: 20,
      minutes_since_last_escalation: 60,
      new_raw_pressure: 80,
    });
    expect(r.value).toBe(80);
    expect(r.applied_escalation).toBeGreaterThan(0);
  });

  it('clamps to 0–100', () => {
    const high = decayPressure({ previous_pressure: 50, minutes_since_last_escalation: 0, new_raw_pressure: 200 });
    expect(high.value).toBe(100);
    const low = decayPressure({ previous_pressure: 0, minutes_since_last_escalation: 100, new_raw_pressure: -50 });
    expect(low.value).toBe(0);
  });
});

describe('tierOf hysteresis', () => {
  it('initial mapping (no previous)', () => {
    expect(tierOf(10)).toBe('calm');
    expect(tierOf(30)).toBe('elevated');
    expect(tierOf(60)).toBe('urgent');
    expect(tierOf(90)).toBe('critical');
  });

  it('hysteretic: stays in calm when value just touches lower band', () => {
    // From calm, 19 should not escalate to elevated (band lower = 18 means
    // value must EXCEED 18; 19 does, but check edge)
    expect(tierOf(15, 'calm')).toBe('calm');
    expect(tierOf(40, 'calm')).toBe('elevated');     // moved past elevated lower (18)
  });

  it('does not flap between adjacent tiers on small jitter', () => {
    expect(tierOf(28, 'elevated')).toBe('elevated');
    expect(tierOf(20, 'elevated')).toBe('elevated');
  });
});

// ---------------------------------------------------------------------------
// livePressureEngine
// ---------------------------------------------------------------------------

describe('livePressureEngine', () => {
  beforeEach(() => {
    _resetLivePressureForTests();
    cognitiveEventBus._resetForTests();
  });

  it('first tick from 0 with non-zero pressure publishes pressure.changed', () => {
    const events: any[] = [];
    cognitiveEventBus.subscribe(e => events.push(e));
    tickPressure({ project_id: PROJECT_ID, new_raw_pressure: 30 });
    expect(events.some(e => e.kind === 'pressure.changed')).toBe(true);
  });

  it('escalation across tier emits pressure.escalated', () => {
    const events: any[] = [];
    cognitiveEventBus.subscribe(e => events.push(e));
    tickPressure({ project_id: PROJECT_ID, new_raw_pressure: 25 }); // elevated
    tickPressure({ project_id: PROJECT_ID, new_raw_pressure: 85 }); // critical
    expect(events.some(e => e.kind === 'pressure.escalated' && e.payload.tier === 'critical')).toBe(true);
  });

  it('small jitter does not emit', () => {
    tickPressure({ project_id: PROJECT_ID, new_raw_pressure: 30 });
    cognitiveEventBus._resetForTests();
    const events: any[] = [];
    cognitiveEventBus.subscribe(e => events.push(e));
    tickPressure({ project_id: PROJECT_ID, new_raw_pressure: 31 });   // < 3 delta
    expect(events.length).toBe(0);
  });

  it('getPressureState returns current snapshot', () => {
    tickPressure({ project_id: PROJECT_ID, new_raw_pressure: 70 });
    const state = getPressureState(PROJECT_ID);
    expect(state.pressure).toBeGreaterThanOrEqual(70);
    expect(['urgent', 'critical']).toContain(state.tier);
  });
});

// ---------------------------------------------------------------------------
// autonomousRegressionDetector.evaluateRegression
// ---------------------------------------------------------------------------

describe('evaluateRegression', () => {
  it('no regression on first observation (no previous)', () => {
    const r = evaluateRegression({
      project_id: PROJECT_ID,
      previous: null,
      current: { worst_cognition_score: 80, regression_count: 0, pressure_level: 10 },
      recent_routes_with_regression: [],
    });
    expect(r.is_regression).toBe(false);
  });

  it('regression: cognition drops 15+ points', () => {
    const r = evaluateRegression({
      project_id: PROJECT_ID,
      previous: { worst_cognition_score: 90, regression_count: 0, pressure_level: 10 },
      current: { worst_cognition_score: 70, regression_count: 0, pressure_level: 10 },
      recent_routes_with_regression: ['/x'],
    });
    expect(r.is_regression).toBe(true);
    expect(r.cognition_delta).toBe(-20);
  });

  it('regression: regression_count increased', () => {
    const r = evaluateRegression({
      project_id: PROJECT_ID,
      previous: { worst_cognition_score: 80, regression_count: 0, pressure_level: 10 },
      current: { worst_cognition_score: 80, regression_count: 1, pressure_level: 10 },
      recent_routes_with_regression: [],
    });
    expect(r.is_regression).toBe(true);
  });

  it('regression: pressure jumped 20+ points', () => {
    const r = evaluateRegression({
      project_id: PROJECT_ID,
      previous: { worst_cognition_score: 80, regression_count: 0, pressure_level: 10 },
      current: { worst_cognition_score: 80, regression_count: 0, pressure_level: 35 },
      recent_routes_with_regression: [],
    });
    expect(r.is_regression).toBe(true);
  });

  it('no regression: scores stable', () => {
    const r = evaluateRegression({
      project_id: PROJECT_ID,
      previous: { worst_cognition_score: 80, regression_count: 0, pressure_level: 10 },
      current: { worst_cognition_score: 78, regression_count: 0, pressure_level: 12 },
      recent_routes_with_regression: [],
    });
    expect(r.is_regression).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cognitiveStabilityProtection
// ---------------------------------------------------------------------------

describe('cognitiveStabilityProtection', () => {
  beforeEach(() => _resetStabilityForTests());

  describe('rate limit', () => {
    it('allows up to max_per_window', () => {
      const cfg = { key: 'test', window_ms: 60000, max_per_window: 3 };
      expect(allowByRateLimit(cfg)).toBe(true);
      expect(allowByRateLimit(cfg)).toBe(true);
      expect(allowByRateLimit(cfg)).toBe(true);
      expect(allowByRateLimit(cfg)).toBe(false);
    });
  });

  describe('cooldown', () => {
    it('returns true once, then false until cooldown elapses', () => {
      expect(withCooldown('k', 60000)).toBe(true);
      expect(withCooldown('k', 60000)).toBe(false);
    });
  });

  describe('hysteresis', () => {
    it('returns true on first crossing of upper, false until reset', () => {
      const opts = { upper: 80, lower: 50 };
      expect(withHysteresis('k', 70, opts)).toBe(false);
      expect(withHysteresis('k', 85, opts)).toBe(true);    // crossed upper
      expect(withHysteresis('k', 90, opts)).toBe(false);   // already tripped
      expect(withHysteresis('k', 40, opts)).toBe(false);   // dropped below lower → reset
      expect(withHysteresis('k', 85, opts)).toBe(true);    // re-tripped
    });
  });
});

// ---------------------------------------------------------------------------
// operationalCostGovernance
// ---------------------------------------------------------------------------

describe('operationalCostGovernance', () => {
  beforeEach(() => {
    resetCostGovernanceWindow();
    cognitiveEventBus._resetForTests();
  });

  it('counts GPT calls + cache hits', () => {
    recordGPT4oCall();
    recordGPT4oCall();
    recordGPT4oCacheHit();
    const r = getCostGovernanceReport();
    expect(r.gpt4o_calls).toBe(2);
    expect(r.gpt4o_cache_hits).toBe(1);
    expect(r.gpt4o_total_evaluations).toBe(3);
    expect(r.cache_hit_rate).toBeCloseTo(0.33, 2);
  });

  it('rerank counter increments', () => {
    recordRerank();
    recordRerank();
    expect(getCostGovernanceReport().rerank_count).toBe(2);
  });

  it('estimated cost reflects per-call price', () => {
    recordGPT4oCall();
    const r = getCostGovernanceReport();
    expect(r.gpt4o_estimated_cost_usd).toBeGreaterThan(0);
    // Without cache, cost would be at least equal (same N calls)
    expect(r.gpt4o_estimated_cost_without_cache_usd).toBeGreaterThanOrEqual(r.gpt4o_estimated_cost_usd);
  });
});
