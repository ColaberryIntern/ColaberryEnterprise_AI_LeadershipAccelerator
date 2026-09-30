import { LIFECYCLE_STAGES } from '../lifecycle';
import { METRICS, getMetric, mayComputeWith, metricsForDomain } from '../metricRegistry';

describe('metric registry', () => {
  it('keys every metric to its own definition', () => {
    for (const [key, def] of Object.entries(METRICS)) {
      expect(def.key).toBe(key);
    }
  });

  it('namespaces every key by its domain', () => {
    // 'conversion' meaning three things on three screens is the defect this
    // consolidation exists to remove; the namespace makes a collision impossible.
    for (const def of Object.values(METRICS)) {
      expect(def.key.startsWith(`${def.domain}.`)).toBe(true);
    }
  });

  it('states a definition, a formula and at least one source for every metric', () => {
    for (const def of Object.values(METRICS)) {
      expect(def.definition.trim().length).toBeGreaterThan(0);
      expect(def.formula.trim().length).toBeGreaterThan(0);
      expect(def.sources.length).toBeGreaterThan(0);
    }
  });

  it('requires a reason whenever a metric is not fully trusted', () => {
    // A KPI that renders as "partial" with no reason is worse than one that
    // renders plainly wrong: the caveat is visible but unactionable.
    for (const def of Object.values(METRICS)) {
      if (def.status !== 'trusted') {
        expect(def.statusReason && def.statusReason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('refuses to compute with anything that is not trusted', () => {
    // The core guard. unavailable and invalid must never contribute a zero to a
    // health score, an average, or an AI narrative.
    expect(mayComputeWith('revenue.net_revenue')).toBe(false);
    expect(mayComputeWith('learning.active_learners')).toBe(false);
    expect(mayComputeWith('growth.visitor_to_lead')).toBe(false);
    expect(mayComputeWith('growth.unique_visitors')).toBe(true);
  });

  it('refuses to compute with an unregistered key', () => {
    // Fails closed. An unknown key is a typo or a metric someone invented on a
    // dashboard without registering it; either way it must not be trusted.
    expect(mayComputeWith('growth.made_up_number')).toBe(false);
    expect(getMetric('growth.made_up_number')).toBeUndefined();
  });

  it('holds net revenue as unavailable until a payment source is confirmed', () => {
    expect(METRICS['revenue.net_revenue'].status).toBe('unavailable');
  });

  it('holds active learners as invalid rather than attendance-derived', () => {
    expect(METRICS['learning.active_learners'].status).toBe('invalid');
  });

  it('counts visitor conversion per person, never per session', () => {
    // At ~4.5 sessions per person a session denominator understates conversion
    // by that factor and nothing in the UI would show it.
    const metric = METRICS['growth.visitor_to_lead'];
    expect(metric.grain).toBe('visitor');
    expect(metric.formula).toContain('engaged_visitors');
    expect(metric.formula).not.toContain('sessions');
  });

  it('carries required drill-down filters wherever a drill-down is offered', () => {
    for (const def of Object.values(METRICS)) {
      if (def.drilldown) {
        expect(def.drilldown.target.trim().length).toBeGreaterThan(0);
        expect(def.drilldown.requiredFilters.length).toBeGreaterThan(0);
      }
    }
  });

  it('only cites lifecycle stages from the canonical vocabulary', () => {
    for (const def of Object.values(METRICS)) {
      if (def.lifecycleStage) {
        expect(LIFECYCLE_STAGES).toContain(def.lifecycleStage);
      }
    }
  });

  it('returns only that domain when filtering by domain', () => {
    const growth = metricsForDomain('growth');
    expect(growth.length).toBeGreaterThan(0);
    expect(growth.every((m) => m.domain === 'growth')).toBe(true);
  });

  it('never expresses a percentage metric as a count', () => {
    expect(METRICS['growth.visitor_to_lead'].unit).toBe('percent');
    expect(METRICS['people.identity_coverage'].unit).toBe('percent');
    expect(METRICS['revenue.net_revenue'].unit).toBe('currency');
  });
});
