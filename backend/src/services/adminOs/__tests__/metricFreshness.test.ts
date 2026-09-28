import { freshnessAgentOf, metricFreshness, type MetricFreshnessRule } from '../metricFreshness';

/**
 * T605 — fresh, stale, never, and the clock skew.
 *
 * The verdict that earns its own name is `never`: the state the whole Phase 6
 * launch sits in, where nothing has run and every rate is legitimately unknown.
 * Collapsing it into `stale` would read as "this used to work".
 */

const NOW = new Date('2026-09-28T12:00:00Z');
const HOUR = 3_600_000;
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

const LIVE: MetricFreshnessRule = { source: 'live', max_age_hours: 26 };
const NIGHTLY: MetricFreshnessRule = { source: 'nightly:GrowthJourneyShadowDecisions', max_age_hours: 26 };
const CRON: MetricFreshnessRule = { source: 'cron:GrowthJourneyExecutor', max_age_hours: 4 };

describe('which timestamp a rule reads', () => {
  it('a live rule reads the newest ROW and ignores an agent run', () => {
    const f = metricFreshness(LIVE, { sourceMaxAt: ago(2), agentLastRunAt: ago(400) }, NOW);
    expect(f).toMatchObject({ verdict: 'fresh', age_hours: 2, source: 'live', max_age_hours: 26 });
    expect(f.reason).toContain('newest row');
  });

  it('a scheduled rule reads the AGENT\'s last run and ignores the rows', () => {
    // A row written by hand, by a backfill or by another service does not mean the agent produced
    // the figure. This is the property that makes "nothing has run" visible on a screen.
    const f = metricFreshness(NIGHTLY, { sourceMaxAt: ago(1), agentLastRunAt: ago(50) }, NOW);
    expect(f).toMatchObject({ verdict: 'stale', age_hours: 50 });
    expect(f.reason).toContain('GrowthJourneyShadowDecisions last run');
  });

  it('names the agent a rule declares, and none for a live rule', () => {
    expect(freshnessAgentOf(NIGHTLY)).toBe('GrowthJourneyShadowDecisions');
    expect(freshnessAgentOf(CRON)).toBe('GrowthJourneyExecutor');
    expect(freshnessAgentOf(LIVE)).toBeNull();
  });
});

describe('fresh and stale are decided by the rule\'s own window', () => {
  it.each([
    [LIVE, 0, 'fresh'],
    [LIVE, 25.9, 'fresh'],
    [LIVE, 26, 'fresh'],
    [LIVE, 26.5, 'stale'],
    [LIVE, 400, 'stale'],
    [CRON, 3.9, 'fresh'],
    [CRON, 4, 'fresh'],
    [CRON, 4.2, 'stale'],
  ])('%s at %sh -> %s', (rule, hours, verdict) => {
    expect(metricFreshness(rule as MetricFreshnessRule, { sourceMaxAt: ago(hours as number), agentLastRunAt: ago(hours as number) }, NOW).verdict).toBe(verdict);
  });

  it('a wider max_age_hours makes the same timestamp fresh - the window is the rule\'s, not a constant', () => {
    const at = ago(40);
    expect(metricFreshness({ source: 'live', max_age_hours: 26 }, { sourceMaxAt: at }, NOW).verdict).toBe('stale');
    expect(metricFreshness({ source: 'live', max_age_hours: 72 }, { sourceMaxAt: at }, NOW).verdict).toBe('fresh');
  });

  it('reports the age and the bound in the reason, so a reader need not compute it', () => {
    const f = metricFreshness(CRON, { agentLastRunAt: ago(9.5) }, NOW);
    expect(f.age_hours).toBe(9.5);
    expect(f.reason).toBe('GrowthJourneyExecutor last run is 9.5h old, past 4h');
  });
});

describe('never is its own verdict', () => {
  it('an agent that has never run is never, not stale, and says which agent', () => {
    const f = metricFreshness(NIGHTLY, { agentLastRunAt: null, sourceMaxAt: ago(1) }, NOW);
    expect(f).toMatchObject({ verdict: 'never', age_hours: null });
    expect(f.reason).toBe('GrowthJourneyShadowDecisions has never run');
  });

  it('a live metric with no rows in the window is never, not zero-aged', () => {
    const f = metricFreshness(LIVE, {}, NOW);
    expect(f).toMatchObject({ verdict: 'never', age_hours: null, reason: 'no rows in the window' });
  });

  it('undefined and null are the same absence', () => {
    expect(metricFreshness(LIVE, { sourceMaxAt: undefined }, NOW).verdict).toBe('never');
    expect(metricFreshness(LIVE, { sourceMaxAt: null }, NOW).verdict).toBe('never');
  });
});

describe('clock skew is not freshness', () => {
  it('a timestamp in the future is stale, and says why', () => {
    // The safe direction for a freshness claim is downward: if the app and the database disagree
    // about now, the age cannot be trusted, and "fresh" is the one answer that must not be given.
    const f = metricFreshness(LIVE, { sourceMaxAt: new Date(NOW.getTime() + 5 * HOUR) }, NOW);
    expect(f).toMatchObject({ verdict: 'stale', age_hours: 0 });
    expect(f.reason).toContain('in the future (clock skew)');
  });

  it('holds for a scheduled rule too', () => {
    const f = metricFreshness(CRON, { agentLastRunAt: new Date(NOW.getTime() + HOUR) }, NOW);
    expect(f.verdict).toBe('stale');
    expect(f.reason).toContain('clock skew');
  });
});

describe('it is pure', () => {
  it('never throws on any input shape, and defaults `now` to the real clock', () => {
    expect(() => metricFreshness(LIVE, {})).not.toThrow();
    expect(() => metricFreshness(NIGHTLY, { agentLastRunAt: new Date(0) })).not.toThrow();
    expect(metricFreshness(LIVE, { sourceMaxAt: new Date() }).verdict).toBe('fresh');
  });

  it('echoes the rule back, so a served value carries its own contract', () => {
    expect(metricFreshness(CRON, { agentLastRunAt: ago(1) }, NOW)).toMatchObject({ source: 'cron:GrowthJourneyExecutor', max_age_hours: 4 });
  });
});
