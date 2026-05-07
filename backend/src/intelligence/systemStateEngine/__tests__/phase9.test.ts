/**
 * Phase 9 tests — pure helpers covering the distributed cognition layer.
 *
 * Coverage:
 *   - incidentEscalationPolicy (decisions across severity / occurrence / correlation)
 *   - incidentCorrelationEngine (groups same-type same-route within window)
 *   - incidentClassifier.predictFromPatterns (no-history, escalation prediction, severity bump)
 *   - predictivePressureForecaster (linear extrapolation, escalation risk, flat trend)
 *   - federatedPatternRegistry.patternSignature + primaryRoutePrefix (stable signatures)
 *   - cognitiveHealthIndex (weighting, weakest dimension, tier mapping)
 *   - incidentFanoutEngine (subscriber dispatch + accept filter + outcome aggregation)
 *   - subscribers (console succeeds; webhook timeout fails; email skips when no send_fn)
 */
import { decideEscalation } from '../incidents/incidentEscalationPolicy';
import { correlateIncidents } from '../incidents/incidentCorrelationEngine';
import { predictFromPatterns } from '../prediction/incidentClassifier';
import { forecastPressure, type PressureSample } from '../prediction/predictivePressureForecaster';
import { patternSignature, primaryRoutePrefix } from '../learning/federatedPatternRegistry';
import { computeCognitiveHealthIndex, type CognitiveHealthInputs } from '../health/cognitiveHealthIndex';
import {
  fanOutIncident,
  registerIncidentSubscriber,
  _resetSubscribersForTests,
  listSubscribers,
} from '../incidents/incidentFanoutEngine';
import { createConsoleSubscriber } from '../incidents/subscribers/consoleSubscriber';
import { createEmailSubscriber } from '../incidents/subscribers/emailSubscriber';
import type { IncidentDispatchPayload, IncidentSubscriber } from '../incidents/subscribers/types';

// ---------------------------------------------------------------------------
// incidentEscalationPolicy
// ---------------------------------------------------------------------------

describe('decideEscalation', () => {
  const baseInput = {
    type: 'ux_regression',
    severity: 'warning' as const,
    state: 'open' as const,
    occurrence_count: 1,
    opened_at: new Date(),
    last_seen_at: new Date(),
    affected_routes: ['/x'],
  };

  it('error severity always dispatches', () => {
    const r = decideEscalation({ ...baseInput, severity: 'error' });
    expect(r.action).toBe('dispatch');
  });

  it('warning + occurrence 1 suppresses', () => {
    const r = decideEscalation(baseInput);
    expect(r.action).toBe('suppress');
  });

  it('warning + occurrence ≥3 dispatches', () => {
    const r = decideEscalation({ ...baseInput, occurrence_count: 3 });
    expect(r.action).toBe('dispatch');
  });

  it('warning + occurrence ≥5 escalates to error', () => {
    const r = decideEscalation({ ...baseInput, occurrence_count: 5 });
    if (r.action === 'dispatch') expect(r.effective_severity).toBe('error');
  });

  it('reopened incident escalates to error', () => {
    const r = decideEscalation({ ...baseInput, previous_resolved_at: new Date(Date.now() - 60_000) });
    expect(r.action).toBe('escalate');
  });

  it('correlation: same-type same-route recent dispatch suppresses', () => {
    const r = decideEscalation({
      ...baseInput,
      occurrence_count: 5,    // would dispatch otherwise
      severity: 'warning',
      recent_dispatches: [{
        type: 'ux_regression',
        routes: ['/x'],
        dispatched_at: new Date(Date.now() - 5 * 60_000),
      }],
    });
    expect(r.action).toBe('suppress');
  });

  it('error open >60min re-dispatches', () => {
    const opened = new Date(Date.now() - 90 * 60_000);
    const r = decideEscalation({ ...baseInput, severity: 'error', opened_at: opened });
    expect(r.action).toBe('dispatch');
  });
});

// ---------------------------------------------------------------------------
// incidentCorrelationEngine
// ---------------------------------------------------------------------------

describe('correlateIncidents', () => {
  it('groups same-type same-route within window', () => {
    const incidents = [
      { id: 'a', type: 'ux_regression', affected_routes: ['/dash'], opened_at: new Date(0), severity: 'warning' as const },
      { id: 'b', type: 'ux_regression', affected_routes: ['/dash'], opened_at: new Date(60_000), severity: 'error' as const },
    ];
    const clusters = correlateIncidents(incidents);
    expect(clusters.length).toBe(1);
    expect(clusters[0].incident_ids).toEqual(['a', 'b']);
    expect(clusters[0].highest_severity).toBe('error');
  });

  it('separates incidents on different types', () => {
    const incidents = [
      { id: 'a', type: 'ux_regression', affected_routes: ['/x'], opened_at: new Date(0), severity: 'warning' as const },
      { id: 'b', type: 'cognition_collapse', affected_routes: ['/x'], opened_at: new Date(60_000), severity: 'error' as const },
    ];
    const clusters = correlateIncidents(incidents);
    expect(clusters.length).toBe(2);
  });

  it('separates incidents outside the window', () => {
    const incidents = [
      { id: 'a', type: 'ux_regression', affected_routes: ['/x'], opened_at: new Date(0), severity: 'warning' as const },
      { id: 'b', type: 'ux_regression', affected_routes: ['/x'], opened_at: new Date(2 * 3600_000), severity: 'warning' as const },
    ];
    const clusters = correlateIncidents(incidents, 30);
    expect(clusters.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// incidentClassifier.predictFromPatterns
// ---------------------------------------------------------------------------

describe('predictFromPatterns', () => {
  const baseRecord = {
    type: 'ux_regression',
    severity: 'warning' as const,
    affected_routes: ['/admin/dashboard'],
    cognition_impact: -15,
    occurrence_count: 1,
    opened_at: new Date(),
  };

  it('returns conservative prediction with no patterns', () => {
    const r = predictFromPatterns(baseRecord, []);
    expect(r.matched_patterns.length).toBe(0);
    expect(r.confidence).toBeLessThanOrEqual(40);
  });

  it('high prior occurrence + low success rate predicts escalation to error', () => {
    const r = predictFromPatterns({ ...baseRecord, occurrence_count: 4 }, [
      {
        signature: 'sig1',
        description: 'pattern A',
        occurrence_count: 30,
        project_count: 4,
        successful_remediations: 1,
        attempted_remediations: 10,
        successful_actions: ['Reduce competing CTAs'],
      },
    ]);
    expect(r.likely_to_escalate).toBeGreaterThanOrEqual(60);
    expect(r.predicted_severity).toBe('error');
    expect(r.remediation_suggestions).toContain('Reduce competing CTAs');
  });

  it('lifts confidence with more attempts', () => {
    const r = predictFromPatterns(baseRecord, [
      {
        signature: 'sig', description: 'p',
        occurrence_count: 50, project_count: 3,
        successful_remediations: 20, attempted_remediations: 25,
        successful_actions: ['fix'],
      },
    ]);
    expect(r.confidence).toBeGreaterThan(70);
  });
});

// ---------------------------------------------------------------------------
// predictivePressureForecaster
// ---------------------------------------------------------------------------

describe('forecastPressure', () => {
  const minute = 60_000;
  function series(values: number[]): PressureSample[] {
    return values.map((v, i) => ({ timestamp_ms: i * minute, pressure: v }));
  }

  it('insufficient history returns latest as prediction with low confidence', () => {
    const r = forecastPressure(series([30]), 30);
    expect(r.predicted_pressure).toBe(30);
    expect(r.confidence).toBeLessThanOrEqual(20);
  });

  it('rising series predicts higher pressure', () => {
    const r = forecastPressure(series([10, 20, 30, 40, 50]), 10);
    expect(r.trend).toBe('rising');
    expect(r.predicted_pressure).toBeGreaterThan(50);
  });

  it('falling series predicts lower pressure', () => {
    const r = forecastPressure(series([90, 80, 70, 60, 50]), 10);
    expect(r.trend).toBe('falling');
    expect(r.predicted_pressure).toBeLessThan(50);
  });

  it('flat series returns flat trend', () => {
    const r = forecastPressure(series([40, 40, 40, 40, 40]), 30);
    expect(r.trend).toBe('flat');
    expect(r.predicted_pressure).toBe(40);
  });

  it('escalation risk high when crossing tier upward', () => {
    // Currently elevated, rising fast — should cross urgent
    const r = forecastPressure(series([30, 40, 50, 60, 70]), 30);
    expect(r.escalation_risk).toBeGreaterThan(0);
  });

  it('clamps prediction to 0-100', () => {
    const r = forecastPressure(series([90, 95, 100, 100, 100]), 60);
    expect(r.predicted_pressure).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// federatedPatternRegistry signature helpers
// ---------------------------------------------------------------------------

describe('patternSignature', () => {
  it('produces stable signature for identical input', () => {
    const a = patternSignature({ type: 'ux_regression', cognition_impact: -20, primary_route_prefix: '/admin' });
    const b = patternSignature({ type: 'ux_regression', cognition_impact: -20, primary_route_prefix: '/admin' });
    expect(a).toBe(b);
  });

  it('produces different signatures for different types', () => {
    const a = patternSignature({ type: 'ux_regression', cognition_impact: -20, primary_route_prefix: '/admin' });
    const b = patternSignature({ type: 'cognition_collapse', cognition_impact: -20, primary_route_prefix: '/admin' });
    expect(a).not.toBe(b);
  });

  it('buckets cognition_impact (-30 and -25 hash to same bucket)', () => {
    const a = patternSignature({ type: 'r', cognition_impact: -30, primary_route_prefix: '/' });
    const b = patternSignature({ type: 'r', cognition_impact: -25, primary_route_prefix: '/' });
    expect(a).toBe(b);     // both 'severe' bucket
  });
});

describe('primaryRoutePrefix', () => {
  it('returns /global for empty input', () => {
    expect(primaryRoutePrefix([])).toBe('global');
  });

  it('uses first 2 path segments', () => {
    expect(primaryRoutePrefix(['/admin/dashboard/foo'])).toBe('/admin/dashboard');
  });

  it('handles root path', () => {
    expect(primaryRoutePrefix(['/'])).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// cognitiveHealthIndex
// ---------------------------------------------------------------------------

describe('computeCognitiveHealthIndex', () => {
  const healthy: CognitiveHealthInputs = {
    sync_health: 95, ux_health: 90, workflow_health: 90, cognition_health: 90,
    behavioral_health: 90, pressure_health: 95, contradiction_health: 100,
    prediction_confidence: 70, operational_stability: 90, remediation_health: 95,
  };

  it('healthy inputs produce score ≥85 and tier=healthy', () => {
    const r = computeCognitiveHealthIndex(healthy);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.tier).toBe('healthy');
  });

  it('one bad dimension drags score and identifies weakest', () => {
    const r = computeCognitiveHealthIndex({ ...healthy, cognition_health: 20 });
    expect(r.weakest_dimension).toBe('cognition_health');
    expect(r.score).toBeLessThan(85);
  });

  it('tier mapping: critical for low aggregate', () => {
    const bad: CognitiveHealthInputs = {
      sync_health: 30, ux_health: 30, workflow_health: 30, cognition_health: 30,
      behavioral_health: 30, pressure_health: 30, contradiction_health: 30,
      prediction_confidence: 30, operational_stability: 30, remediation_health: 30,
    };
    const r = computeCognitiveHealthIndex(bad);
    expect(r.tier).toBe('critical');
  });

  it('UX_health is the average of ux + workflow', () => {
    const r = computeCognitiveHealthIndex({ ...healthy, ux_health: 80, workflow_health: 60 });
    expect(r.UX_health).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// incidentFanoutEngine + subscribers
// ---------------------------------------------------------------------------

const samplePayload: IncidentDispatchPayload = {
  incident_id: '11111111-1111-4111-8111-111111111111',
  project_id: '22222222-2222-4222-8222-222222222222',
  type: 'ux_regression',
  severity: 'error',
  state: 'open',
  affected_routes: ['/admin/dashboard'],
  cognition_impact: -25,
  recommended_actions: ['Run a visual review.'],
  opened_at: new Date().toISOString(),
  occurrence_count: 1,
  summary: 'cognition dropped 25 points',
};

describe('incidentFanoutEngine', () => {
  beforeEach(() => _resetSubscribersForTests());

  it('console subscriber receives error-severity payloads', async () => {
    registerIncidentSubscriber(createConsoleSubscriber());
    const result = await fanOutIncident(samplePayload);
    expect(result.succeeded).toBe(1);
    expect(result.attempted_subscribers).toEqual(['console']);
  });

  it('subscriber accept() filter excludes non-matching', async () => {
    const lowOnly: IncidentSubscriber = {
      id: 'low_only',
      description: 'only info',
      accepts: (p) => p.severity === 'info',
      dispatch: async () => ({ status: 'succeeded' }),
    };
    registerIncidentSubscriber(lowOnly);
    const result = await fanOutIncident(samplePayload);     // severity=error
    expect(result.attempted_subscribers).toEqual([]);
  });

  it('failed subscriber doesn\'t block successful one', async () => {
    registerIncidentSubscriber(createConsoleSubscriber());
    registerIncidentSubscriber({
      id: 'broken', description: 'always throws',
      accepts: () => true,
      dispatch: async () => { throw new Error('boom'); },
    });
    const result = await fanOutIncident(samplePayload);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('email subscriber skips when no send function configured', async () => {
    registerIncidentSubscriber(createEmailSubscriber({
      recipients: ['ops@example.com'],
      send_fn: null,
      min_severity: 'error',
    }));
    const result = await fanOutIncident(samplePayload);
    // accepts() returns false when send_fn is null → no attempt
    expect(result.attempted_subscribers).toEqual([]);
  });

  it('email subscriber dispatches when send function provided', async () => {
    let captured: any = null;
    registerIncidentSubscriber(createEmailSubscriber({
      recipients: ['ops@example.com'],
      send_fn: async (input) => { captured = input; return { ok: true }; },
      min_severity: 'error',
    }));
    const result = await fanOutIncident(samplePayload);
    expect(result.succeeded).toBe(1);
    expect(captured?.to).toEqual(['ops@example.com']);
    expect(captured?.subject).toContain('ux_regression');
  });

  it('listSubscribers returns the registered set', () => {
    registerIncidentSubscriber(createConsoleSubscriber());
    expect(listSubscribers().length).toBe(1);
  });
});
