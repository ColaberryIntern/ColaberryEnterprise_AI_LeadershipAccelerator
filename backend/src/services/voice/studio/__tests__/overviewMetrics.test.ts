import { computeOverview, percentile, type CallRow, type OverviewInput } from '../overviewMetrics';

const call = (p: Partial<CallRow> = {}): CallRow => ({ state: 'completed', engine: 'conversation_relay', state_reason: null, carrier_answered: true, human_answered: true, session_succeeded: true, duration_seconds: 120, cost_usd: '0.20', ...p });
const base = (p: Partial<OverviewInput> = {}): OverviewInput => ({
  mode: 'live', windowDays: 7, calls: [], agentLatenciesMs: [], usage: [], activeReservations: 0, routes: [],
  flags: { studioEnabled: false, testEnabled: false, gatewayLegacyEnabled: false, engineDefault: 'synthflow_legacy' }, ...p,
});
const kpi = (o: ReturnType<typeof computeOverview>, k: string) => o.kpis.find((x) => x.key === k)!;

describe('computeOverview', () => {
  it('no calls: every call KPI is null ("no data"), never 0', () => {
    const o = computeOverview(base());
    for (const k of ['attempted', 'blocked', 'connected', 'human_answered', 'completed', 'latency_p50', 'latency_p95', 'opt_outs', 'cost_per_minute']) {
      expect(kpi(o, k).value).toBeNull();
      expect(kpi(o, k).denominator).toBeUndefined();
    }
    expect(kpi(o, 'queue').value).toBe(0); // a point-in-time count that genuinely exists
    expect(o.byEngine).toEqual([]);
  });

  it('rates carry their denominators and blocked calls are excluded from attempts', () => {
    const o = computeOverview(base({ calls: [
      call(), call({ state: 'blocked', carrier_answered: false, human_answered: false, session_succeeded: false }),
      call({ state: 'no_answer', carrier_answered: false, human_answered: false, session_succeeded: false, duration_seconds: null, cost_usd: null }),
      call({ human_answered: false, session_succeeded: false, state_reason: 'caller_opt_out' }),
    ] }));
    expect(kpi(o, 'attempted').value).toBe(3);
    expect(kpi(o, 'blocked')).toMatchObject({ value: 1, denominator: { label: 'requested', value: 4 } });
    expect(kpi(o, 'connected')).toMatchObject({ value: 66.7, denominator: { label: 'attempted', value: 3 } });
    expect(kpi(o, 'human_answered')).toMatchObject({ value: 50, denominator: { label: 'connected', value: 2 } });
    expect(kpi(o, 'completed')).toMatchObject({ value: 100, denominator: { label: 'answered by a person', value: 1 } });
    expect(kpi(o, 'opt_outs').value).toBe(1);
  });

  it('zero is reported when the denominator exists', () => {
    const o = computeOverview(base({ calls: [call({ session_succeeded: false })] }));
    expect(kpi(o, 'completed').value).toBe(0);
  });

  it('cost per minute is estimated unless every usage row is measured on live traffic', () => {
    const calls = [call({ duration_seconds: 60, cost_usd: '0.10' }), call({ duration_seconds: 120, cost_usd: 0.2 })];
    expect(kpi(computeOverview(base({ calls })), 'cost_per_minute')).toMatchObject({ value: 0.1, provenance: 'estimated', denominator: { label: 'minutes', value: 3 } });
    expect(kpi(computeOverview(base({ calls, usage: [{ measured: true }] })), 'cost_per_minute').provenance).toBe('observed');
    expect(kpi(computeOverview(base({ calls, usage: [{ measured: true }, { measured: false }] })), 'cost_per_minute').provenance).toBe('estimated');
    expect(kpi(computeOverview(base({ calls, mode: 'test', usage: [{ measured: true }] })), 'cost_per_minute').provenance).toBe('estimated');
  });

  it('test mode labels call KPIs simulated; live labels them observed', () => {
    expect(kpi(computeOverview(base({ calls: [call()], mode: 'test' })), 'attempted').provenance).toBe('simulated');
    expect(kpi(computeOverview(base({ calls: [call()] })), 'attempted').provenance).toBe('observed');
  });

  it('latency percentiles, per-engine success and migration counts', () => {
    const o = computeOverview(base({
      calls: [call(), call({ engine: 'openai_realtime', session_succeeded: false })],
      agentLatenciesMs: [900, 400, 1200, 700],
      routes: [{ mode: 'legacy' }, { mode: 'legacy' }, { mode: 'canary' }, { mode: 'weird' }],
    }));
    expect(kpi(o, 'latency_p50')).toMatchObject({ value: 700, denominator: { value: 4 } });
    expect(kpi(o, 'latency_p95').value).toBe(1200);
    expect(o.byEngine).toEqual([
      { engine: 'conversation_relay', attempted: 1, completed: 1, successPercent: 100 },
      { engine: 'openai_realtime', attempted: 1, completed: 0, successPercent: 0 },
    ]);
    expect(o.migration).toMatchObject({ legacy: 2, canary: 1, live: 0, total: 4 });
  });

  it('percentile edge cases', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });
});
