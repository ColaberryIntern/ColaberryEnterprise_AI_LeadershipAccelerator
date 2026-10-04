import { METRICS, mayComputeWith } from '../metricRegistry';
import { JOURNEY_METRICS } from '../metrics/journeyMetrics';
import { metricFreshness } from '../metricFreshness';

/**
 * T605 — the journey group answers the registry's contract, plus the one the
 * plan added for it: every journey metric declares a freshness rule, and every
 * metric that crosses the e-mail-equality join to `enrollments` is `partial`
 * with the reason rather than `trusted`.
 *
 * `metricRegistry.test.ts` already holds the contract every metric shares
 * (key matches its own name, namespaced by domain, definition/formula/sources
 * present, a reason whenever not trusted, drill-through filters). This suite is
 * the journey-specific half, so a change to either is a change to one file.
 */

const KEYS = Object.keys(JOURNEY_METRICS);
const EMAIL_JOIN_SOURCE = 'enrollments';

describe('the journey group is registered, once, in the one registry', () => {
  it('every journey key is in METRICS and identical to its own definition', () => {
    expect(KEYS.length).toBeGreaterThanOrEqual(10);
    for (const key of KEYS) {
      expect(METRICS[key]).toBe(JOURNEY_METRICS[key]);
      expect(JOURNEY_METRICS[key].key).toBe(key);
      expect(JOURNEY_METRICS[key].domain).toBe('journey');
      expect(key.startsWith('journey.')).toBe(true);
    }
  });

  it('states a definition, a formula and at least one source for each', () => {
    for (const def of Object.values(JOURNEY_METRICS)) {
      expect(def.definition.trim().length).toBeGreaterThan(20);
      expect(def.formula.trim().length).toBeGreaterThan(10);
      expect(def.sources.length).toBeGreaterThan(0);
    }
  });

  it('names a real journey table or agent in every source', () => {
    // A source list is the promise a drill-through has to keep; a metric citing a table this run
    // does not own is a metric nobody can reconcile.
    const allowed = /growth_journey_(decisions|handoffs|executions|outcomes)|event_ledger|enrollments|ai_agents/;
    for (const def of Object.values(JOURNEY_METRICS)) {
      for (const source of def.sources) expect(source).toMatch(allowed);
    }
  });

  it('splits only by dimensions the rows actually carry', () => {
    const allowed = new Set(['brand', 'program', 'mode', 'channel', 'owner_queue', 'disposition', 'status_reason', 'reason', 'period']);
    for (const def of Object.values(JOURNEY_METRICS)) {
      expect(def.dimensions.length).toBeGreaterThan(0);
      for (const dimension of def.dimensions) expect(allowed).toContain(dimension);
    }
  });
});

describe('every journey metric declares how old its value may be', () => {
  it('has a freshness rule - the group the registry added the field for', () => {
    for (const def of Object.values(JOURNEY_METRICS)) {
      expect(def.freshness).toBeDefined();
      expect(def.freshness!.max_age_hours).toBeGreaterThan(0);
      expect(def.freshness!.source).toMatch(/^(live|nightly:|cron:)/);
    }
  });

  it('a scheduled rule names one of the two agents that exist, never a third', () => {
    for (const def of Object.values(JOURNEY_METRICS)) {
      const [kind, agent] = def.freshness!.source.split(':');
      if (kind === 'live') continue;
      expect(['GrowthJourneyShadowDecisions', 'GrowthJourneyExecutor']).toContain(agent);
    }
  });

  it('the executor\'s metrics allow a tighter window than the nightly\'s, because it runs every 15 minutes', () => {
    const executor = Object.values(JOURNEY_METRICS).filter((d) => d.freshness!.source === 'cron:GrowthJourneyExecutor');
    const nightly = Object.values(JOURNEY_METRICS).filter((d) => d.freshness!.source.startsWith('nightly:'));
    expect(executor.length).toBeGreaterThan(0);
    expect(nightly.length).toBeGreaterThan(0);
    expect(Math.max(...executor.map((d) => d.freshness!.max_age_hours))).toBeLessThan(Math.min(...nightly.map((d) => d.freshness!.max_age_hours)));
  });

  it('reads `never` for every one of them on a dark system - which is the state today', () => {
    // Nothing has run: no agent row, no rows in the window. Every journey metric must say so
    // rather than read as a zero-aged fresh figure.
    for (const def of Object.values(JOURNEY_METRICS)) {
      expect(metricFreshness(def.freshness!, {}).verdict).toBe('never');
    }
  });
});

describe('the honesty rules', () => {
  it('a metric that crosses the e-mail join to enrollments is partial, with the join named in its reason', () => {
    const crossing = Object.values(JOURNEY_METRICS).filter((d) => d.sources.includes(EMAIL_JOIN_SOURCE));
    expect(crossing.length).toBeGreaterThan(0);
    for (const def of crossing) {
      expect(def.status).toBe('partial');
      expect(def.statusReason).toMatch(/e-mail equality/i);
      expect(mayComputeWith(def.key)).toBe(false);
    }
  });

  it('every non-trusted journey metric carries a reason, and may not be computed with', () => {
    for (const def of Object.values(JOURNEY_METRICS)) {
      if (def.status === 'trusted') {
        expect(mayComputeWith(def.key)).toBe(true);
      } else {
        expect(def.statusReason && def.statusReason.trim().length).toBeGreaterThan(40);
        expect(mayComputeWith(def.key)).toBe(false);
      }
    }
  });

  it('a rate is a percent and a body count is a count - never the other way round', () => {
    for (const def of Object.values(JOURNEY_METRICS)) {
      if (/_rate$|_share$/.test(def.key)) expect(def.unit).toBe('percent');
      if (/^journey\.(decisions_recorded|receipts_completed|nightly_recorded_decisions)$/.test(def.key)) expect(def.unit).toBe('count');
    }
  });

  it('every percent metric states its denominator in the formula', () => {
    // The registry exists because "conversion" had three denominators in one week. A percent with
    // no stated denominator is the same defect in a new domain.
    for (const def of Object.values(JOURNEY_METRICS)) {
      if (def.unit !== 'percent') continue;
      expect(def.formula).toMatch(/\/|per |of /);
    }
  });

  it('carries required drill-through filters wherever it offers a drill-through, and brand_id is always one', () => {
    // Every journey read is brand-scoped by the caller's memberships, so a drill-through that did
    // not carry the brand could show a count the destination cannot reconcile.
    for (const def of Object.values(JOURNEY_METRICS)) {
      if (!def.drilldown) continue;
      expect(def.drilldown.target).toMatch(/^journey\./);
      expect(def.drilldown.requiredFilters).toContain('brand_id');
    }
  });
});
