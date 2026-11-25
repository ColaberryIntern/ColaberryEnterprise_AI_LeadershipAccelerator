/**
 * Voice Studio Overview metrics (VS3.3), pure. Turns rows the caller already fetched into KPIs.
 *
 * Rules (directive: "explicit denominators and windows; empty states; no fabricated KPIs"):
 *   - A KPI with no underlying data is value: null ("no data"), never 0. Zero is reported only when
 *     the denominator exists and the count really is zero.
 *   - Every KPI states its provenance: observed (measured from our own call records), estimated
 *     (computed from a rate card, not a provider invoice) or simulated (synthetic test traffic).
 *   - Rates carry their denominator, so "50%" always shows "of 2 connected".
 *   - Test-mode calls are reported separately (mode: 'test') and never mixed into live numbers.
 */

export type Provenance = 'observed' | 'estimated' | 'simulated';
export type OverviewMode = 'live' | 'test';

export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  unit: 'count' | 'percent' | 'ms' | 'usd_per_min';
  provenance: Provenance;
  denominator?: { label: string; value: number };
}

export interface CallRow {
  state: string;
  engine: string;
  state_reason: string | null;
  carrier_answered: boolean;
  human_answered: boolean;
  session_succeeded: boolean;
  duration_seconds: number | null;
  cost_usd: number | string | null;
}

export interface UsageRow { measured: boolean }
export interface RouteRow { mode: string }

export interface OverviewInput {
  mode: OverviewMode;
  windowDays: number;
  calls: CallRow[];
  agentLatenciesMs: number[];
  usage: UsageRow[];
  activeReservations: number;
  routes: RouteRow[];
  flags: { studioEnabled: boolean; testEnabled: boolean; gatewayLegacyEnabled: boolean; engineDefault: string };
}

export interface Overview {
  window: { days: number; mode: OverviewMode };
  kpis: Kpi[];
  byEngine: Array<{ engine: string; attempted: number; completed: number; successPercent: number | null }>;
  safety: OverviewInput['flags'];
  migration: { legacy: number; shadow: number; test: number; canary: number; live: number; disabled: number; total: number };
}

/** Nearest-rank percentile; null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function computeOverview(i: OverviewInput): Overview {
  const prov: Provenance = i.mode === 'test' ? 'simulated' : 'observed';
  const attempted = i.calls.filter((c) => c.state !== 'blocked');
  const blocked = i.calls.length - attempted.length;
  const connected = attempted.filter((c) => c.carrier_answered).length;
  const human = attempted.filter((c) => c.human_answered).length;
  const completed = attempted.filter((c) => c.session_succeeded).length;
  const optOuts = attempted.filter((c) => c.state_reason === 'caller_opt_out').length;
  const priced = attempted.filter((c) => c.cost_usd !== null && (c.duration_seconds ?? 0) > 0);
  const minutes = priced.reduce((s, c) => s + (c.duration_seconds as number) / 60, 0);
  const cost = priced.reduce((s, c) => s + Number(c.cost_usd), 0);
  const allMeasured = i.usage.length > 0 && i.usage.every((u) => u.measured);
  const none = i.calls.length === 0;

  const kpis: Kpi[] = [
    { key: 'attempted', label: 'Calls attempted', value: none ? null : attempted.length, unit: 'count', provenance: prov },
    { key: 'blocked', label: 'Blocked before dialing', value: none ? null : blocked, unit: 'count', provenance: prov, denominator: none ? undefined : { label: 'requested', value: i.calls.length } },
    { key: 'connected', label: 'Connected', value: pct(connected, attempted.length), unit: 'percent', provenance: prov, denominator: attempted.length ? { label: 'attempted', value: attempted.length } : undefined },
    { key: 'human_answered', label: 'Answered by a person', value: pct(human, connected), unit: 'percent', provenance: prov, denominator: connected ? { label: 'connected', value: connected } : undefined },
    { key: 'completed', label: 'Conversation completed', value: pct(completed, human), unit: 'percent', provenance: prov, denominator: human ? { label: 'answered by a person', value: human } : undefined },
    { key: 'latency_p50', label: 'First response p50', value: percentile(i.agentLatenciesMs, 50), unit: 'ms', provenance: prov, denominator: i.agentLatenciesMs.length ? { label: 'agent turns', value: i.agentLatenciesMs.length } : undefined },
    { key: 'latency_p95', label: 'First response p95', value: percentile(i.agentLatenciesMs, 95), unit: 'ms', provenance: prov, denominator: i.agentLatenciesMs.length ? { label: 'agent turns', value: i.agentLatenciesMs.length } : undefined },
    { key: 'opt_outs', label: 'Asked not to be called', value: none ? null : optOuts, unit: 'count', provenance: prov },
    { key: 'cost_per_minute', label: 'Cost per minute', value: minutes > 0 ? Math.round((cost / minutes) * 10000) / 10000 : null, unit: 'usd_per_min', provenance: allMeasured && i.mode === 'live' ? 'observed' : 'estimated', denominator: minutes > 0 ? { label: 'minutes', value: Math.round(minutes * 10) / 10 } : undefined },
    { key: 'queue', label: 'Calls holding a dial slot now', value: i.activeReservations, unit: 'count', provenance: 'observed' },
  ];

  const engines = [...new Set(attempted.map((c) => c.engine))].sort();
  const byEngine = engines.map((engine) => {
    const rows = attempted.filter((c) => c.engine === engine);
    const done = rows.filter((c) => c.session_succeeded).length;
    return { engine, attempted: rows.length, completed: done, successPercent: pct(done, rows.length) };
  });

  const migration = { legacy: 0, shadow: 0, test: 0, canary: 0, live: 0, disabled: 0, total: i.routes.length };
  for (const r of i.routes) if (r.mode in migration) (migration as Record<string, number>)[r.mode] += 1;

  return { window: { days: i.windowDays, mode: i.mode }, kpis, byEngine, safety: i.flags, migration };
}
