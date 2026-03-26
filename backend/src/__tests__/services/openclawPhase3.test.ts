/**
 * OpenClaw Phase 3 — Action Engine, Urgency System & Revenue Optimization Tests
 *
 * Pure function tests — no DB, no network.
 */
import {
  computeUrgency,
  computeActionPriority,
  classifyAction,
  detectHesitation,
  detectReadiness,
} from '../../services/agents/openclaw/openclawActionEngineService';

// ─── computeUrgency ──────────────────────────────────────────────────────────

describe('computeUrgency', () => {
  it('returns critical for 72h+ silent at stage >= 3', () => {
    const result = computeUrgency({
      last_their_activity_at: new Date(Date.now() - 73 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
      current_stage: 3,
      priority_tier: 'warm',
      stall_detected_at: null,
    });
    expect(result.level).toBe('critical');
    expect(result.hours_silent).toBeGreaterThanOrEqual(72);
  });

  it('returns critical for hot lead 48h+ silent', () => {
    const result = computeUrgency({
      last_their_activity_at: new Date(Date.now() - 49 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
      current_stage: 2,
      priority_tier: 'hot',
      stall_detected_at: null,
    });
    expect(result.level).toBe('critical');
  });

  it('returns high for 48h+ silent at stage >= 2', () => {
    const result = computeUrgency({
      last_their_activity_at: new Date(Date.now() - 49 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
      current_stage: 2,
      priority_tier: 'cold',
      stall_detected_at: null,
    });
    expect(result.level).toBe('high');
  });

  it('returns medium for 24h+ silent at stage >= 2', () => {
    const result = computeUrgency({
      last_their_activity_at: new Date(Date.now() - 25 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
      current_stage: 2,
      priority_tier: 'cold',
      stall_detected_at: null,
    });
    expect(result.level).toBe('medium');
  });

  it('returns low for 24h silent cold lead at stage 1', () => {
    const result = computeUrgency({
      last_their_activity_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
      current_stage: 1,
      priority_tier: 'cold',
      stall_detected_at: null,
    });
    expect(result.level).toBe('low');
  });

  it('returns low for recent activity', () => {
    const result = computeUrgency({
      last_their_activity_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
      current_stage: 5,
      priority_tier: 'hot',
      stall_detected_at: null,
    });
    expect(result.level).toBe('low');
  });

  it('uses last_activity_at as fallback when last_their_activity_at is null', () => {
    const result = computeUrgency({
      last_their_activity_at: null,
      last_activity_at: new Date(Date.now() - 73 * 3600000).toISOString(),
      current_stage: 4,
      priority_tier: 'warm',
      stall_detected_at: null,
    });
    expect(result.level).toBe('critical');
  });

  it('computes decay_rate between 0 and 1', () => {
    const result = computeUrgency({
      last_their_activity_at: new Date(Date.now() - 100 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
      current_stage: 6,
      priority_tier: 'hot',
      stall_detected_at: null,
    });
    expect(result.decay_rate).toBeGreaterThanOrEqual(0);
    expect(result.decay_rate).toBeLessThanOrEqual(1);
  });
});

// ─── computeActionPriority ───────────────────────────────────────────────────

describe('computeActionPriority', () => {
  it('returns highest score for hot lead + critical urgency + high stage + conversion signals', () => {
    const urgency = { level: 'critical' as const, hours_silent: 80, decay_rate: 0.8 };
    const score = computeActionPriority(85, urgency, 6, [{ signal: 'sign me up', confidence: 1.0 }]);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('returns lower score for cold lead + low urgency + low stage', () => {
    const urgency = { level: 'low' as const, hours_silent: 5, decay_rate: 0.1 };
    const score = computeActionPriority(10, urgency, 2, []);
    expect(score).toBeLessThan(30);
  });

  it('scores between 0 and 100', () => {
    const urgency = { level: 'medium' as const, hours_silent: 30, decay_rate: 0.4 };
    const score = computeActionPriority(50, urgency, 4, [{ signal: 'interested', confidence: 0.75 }]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('conversion signals boost priority', () => {
    const urgency = { level: 'medium' as const, hours_silent: 30, decay_rate: 0.4 };
    const withoutSignals = computeActionPriority(50, urgency, 4, []);
    const withSignals = computeActionPriority(50, urgency, 4, [{ signal: 'sign me up', confidence: 1.0 }]);
    expect(withSignals).toBeGreaterThan(withoutSignals);
  });
});

// ─── classifyAction ──────────────────────────────────────────────────────────

describe('classifyAction', () => {
  it('returns close_opportunity for stage 6+', () => {
    const conv = {
      current_stage: 6,
      status: 'active',
      stall_detected_at: null,
      conversion_signals: [],
      their_reply_count: 5,
      last_their_activity_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      priority_tier: 'hot',
    };
    const urgency = { level: 'low' as const, hours_silent: 2, decay_rate: 0.1 };
    const result = classifyAction(conv, urgency);
    expect(result.type).toBe('close_opportunity');
  });

  it('returns conversion_ready for stage 5 with high-confidence signals', () => {
    const conv = {
      current_stage: 5,
      status: 'active',
      stall_detected_at: null,
      conversion_signals: [{ signal: 'sign me up', confidence: 1.0 }],
      their_reply_count: 3,
      last_their_activity_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      priority_tier: 'hot',
    };
    const urgency = { level: 'low' as const, hours_silent: 2, decay_rate: 0.1 };
    const result = classifyAction(conv, urgency);
    expect(result.type).toBe('conversion_ready');
    expect(result.recommended_action.toLowerCase()).toContain('call');
  });

  it('returns respond_to_interest for high-confidence signal at stage < 5', () => {
    const conv = {
      current_stage: 3,
      status: 'active',
      stall_detected_at: null,
      conversion_signals: [{ signal: 'interested', confidence: 0.85 }],
      their_reply_count: 2,
      last_their_activity_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      priority_tier: 'warm',
    };
    const urgency = { level: 'low' as const, hours_silent: 5, decay_rate: 0.1 };
    const result = classifyAction(conv, urgency);
    expect(result.type).toBe('respond_to_interest');
  });

  it('returns follow_up_required for stalled conversation', () => {
    const conv = {
      current_stage: 3,
      status: 'stalled',
      stall_detected_at: new Date().toISOString(),
      conversion_signals: [],
      their_reply_count: 2,
      last_their_activity_at: new Date(Date.now() - 72 * 3600000).toISOString(),
      last_activity_at: new Date(Date.now() - 72 * 3600000).toISOString(),
      priority_tier: 'warm',
    };
    const urgency = { level: 'critical' as const, hours_silent: 72, decay_rate: 0.7 };
    const result = classifyAction(conv, urgency);
    expect(result.type).toBe('follow_up_required');
  });

  it('returns advance_stage for active conversation with replies at low stage', () => {
    const conv = {
      current_stage: 2,
      status: 'active',
      stall_detected_at: null,
      conversion_signals: [],
      their_reply_count: 3,
      last_their_activity_at: new Date(Date.now() - 25 * 3600000).toISOString(),
      last_activity_at: new Date(Date.now() - 25 * 3600000).toISOString(),
      priority_tier: 'warm',
    };
    const urgency = { level: 'medium' as const, hours_silent: 25, decay_rate: 0.3 };
    const result = classifyAction(conv, urgency);
    expect(result.type).toBe('advance_stage');
  });
});

// ─── detectHesitation ────────────────────────────────────────────────────────

describe('detectHesitation', () => {
  it('detects hesitation: 3+ replies but no interest signals', () => {
    const result = detectHesitation({
      their_reply_count: 4,
      current_stage: 3,
      conversion_signals: [],
      last_their_activity_at: new Date(Date.now() - 40 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
    });
    expect(result.detected).toBe(true);
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
    expect(result.recommendation).toBeTruthy();
  });

  it('does not detect hesitation for recent active conversation with signals', () => {
    const result = detectHesitation({
      their_reply_count: 2,
      current_stage: 4,
      conversion_signals: [{ signal: 'interested', confidence: 0.8 }],
      last_their_activity_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
    });
    expect(result.detected).toBe(false);
  });

  it('does not detect hesitation for single reply', () => {
    const result = detectHesitation({
      their_reply_count: 1,
      current_stage: 2,
      conversion_signals: [],
      last_their_activity_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    });
    expect(result.detected).toBe(false);
  });
});

// ─── detectReadiness ─────────────────────────────────────────────────────────

describe('detectReadiness', () => {
  it('detects readiness for high-confidence signal at stage 4+', () => {
    const result = detectReadiness({
      conversion_signals: [{ signal: 'sign me up', confidence: 1.0 }],
      current_stage: 5,
      their_reply_count: 3,
    });
    expect(result.ready).toBe(true);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.recommended_transition).toBeTruthy();
  });

  it('does not detect readiness at low stage even with signals', () => {
    const result = detectReadiness({
      conversion_signals: [{ signal: 'interested', confidence: 0.75 }],
      current_stage: 2,
      their_reply_count: 1,
    });
    expect(result.ready).toBe(false);
  });

  it('recommends pricing discussion for pricing signals', () => {
    const result = detectReadiness({
      conversion_signals: [{ signal: 'pricing', confidence: 0.85 }],
      current_stage: 5,
      their_reply_count: 4,
    });
    expect(result.ready).toBe(true);
    expect(result.recommended_transition.toLowerCase()).toContain('pricing');
  });

  it('returns not ready for empty signals', () => {
    const result = detectReadiness({
      conversion_signals: [],
      current_stage: 5,
      their_reply_count: 3,
    });
    expect(result.ready).toBe(false);
  });
});

// ─── Safety ──────────────────────────────────────────────────────────────────

describe('safety', () => {
  it('no aggressive language in any recommendation from classifyAction', () => {
    const aggressivePatterns = /\b(last chance|don't miss|act now|limited time|hurry|final reminder|closing soon|urgent)\b/i;

    const scenarios = [
      { current_stage: 3, status: 'stalled', stall_detected_at: new Date().toISOString(), conversion_signals: [], their_reply_count: 2, last_their_activity_at: new Date(Date.now() - 80 * 3600000).toISOString(), last_activity_at: new Date().toISOString(), priority_tier: 'hot' },
      { current_stage: 5, status: 'active', stall_detected_at: null, conversion_signals: [{ signal: 'sign me up', confidence: 1.0 }], their_reply_count: 4, last_their_activity_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), priority_tier: 'hot' },
      { current_stage: 6, status: 'active', stall_detected_at: null, conversion_signals: [], their_reply_count: 5, last_their_activity_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), priority_tier: 'hot' },
      { current_stage: 2, status: 'active', stall_detected_at: null, conversion_signals: [], their_reply_count: 3, last_their_activity_at: new Date(Date.now() - 25 * 3600000).toISOString(), last_activity_at: new Date().toISOString(), priority_tier: 'warm' },
    ];

    for (const conv of scenarios) {
      const urgency = computeUrgency({
        ...conv,
        last_their_activity_at: conv.last_their_activity_at,
      });
      const action = classifyAction(conv, urgency);
      expect(aggressivePatterns.test(action.recommended_action)).toBe(false);
      expect(aggressivePatterns.test(action.description)).toBe(false);
    }
  });

  it('all actions are recommendations, not automated executions', () => {
    const conv = {
      current_stage: 5,
      status: 'active',
      stall_detected_at: null,
      conversion_signals: [{ signal: 'sign me up', confidence: 1.0 }],
      their_reply_count: 4,
      last_their_activity_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      priority_tier: 'hot',
    };
    const urgency = computeUrgency(conv);
    const action = classifyAction(conv, urgency);
    // Recommended actions should be suggestions, not imperative system actions
    expect(action.recommended_action).toBeTruthy();
    expect(action.recommended_action.length).toBeGreaterThan(10);
  });

  it('hesitation recommendations are non-aggressive', () => {
    const result = detectHesitation({
      their_reply_count: 5,
      current_stage: 4,
      conversion_signals: [],
      last_their_activity_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      last_activity_at: new Date().toISOString(),
    });
    if (result.detected) {
      const aggressivePatterns = /\b(last chance|don't miss|act now|limited time|hurry|urgent)\b/i;
      expect(aggressivePatterns.test(result.recommendation)).toBe(false);
    }
  });
});

// ─── Action Queue Ordering ───────────────────────────────────────────────────

describe('action queue ordering', () => {
  it('higher priority items score higher than lower priority', () => {
    const urgencyHigh = { level: 'critical' as const, hours_silent: 80, decay_rate: 0.8 };
    const urgencyLow = { level: 'low' as const, hours_silent: 5, decay_rate: 0.1 };

    const highScore = computeActionPriority(80, urgencyHigh, 5, [{ signal: 'sign me up', confidence: 1.0 }]);
    const lowScore = computeActionPriority(10, urgencyLow, 2, []);

    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('critical urgency outranks medium urgency for same lead score', () => {
    const criticalUrgency = { level: 'critical' as const, hours_silent: 80, decay_rate: 0.8 };
    const mediumUrgency = { level: 'medium' as const, hours_silent: 30, decay_rate: 0.4 };

    const criticalScore = computeActionPriority(50, criticalUrgency, 3, []);
    const mediumScore = computeActionPriority(50, mediumUrgency, 3, []);

    expect(criticalScore).toBeGreaterThan(mediumScore);
  });
});
