/**
 * In-process voice metrics (VS4.3): a rolling hour of operation outcomes and log events, bounded in
 * memory, plus the three provider breakers. Holds names, counts and milliseconds only.
 */
import { CircuitBreaker, type CircuitState, type Outcome } from './circuitBreaker';

export const WINDOW_MS = 60 * 60_000;
const MAX_PER_KEY = 2_000;
const MAX_KEYS = 300;

export type Provider = 'twilio' | 'anthropic' | 'openai_realtime';
export const PROVIDERS: readonly Provider[] = ['twilio', 'anthropic', 'openai_realtime'];

export interface OpMetrics { operation: string; volume: number; success_rate: number | null; failure_rate: number | null; retry_count: number; latency_ms: { p50: number | null; p95: number | null; p99: number | null } }

const pct = (xs: number[], p: number): number | null => (xs.length ? xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)] : null);

export class OpsMetrics {
  private readonly ops = new Map<string, Array<{ at: number; outcome: Outcome; ms: number; retries: number }>>();
  private readonly events = new Map<string, number[]>();
  readonly breakers: Record<Provider, CircuitBreaker>;

  constructor(private readonly now: () => number = Date.now, onBreaker: (p: Provider, from: CircuitState, to: CircuitState) => void = () => undefined) {
    this.breakers = Object.fromEntries(PROVIDERS.map((p) => [p, new CircuitBreaker(p, (f, t) => onBreaker(p, f, t), undefined, now)])) as Record<Provider, CircuitBreaker>;
  }

  operation(name: string, outcome: Outcome, ms: number, retries = 0): void {
    const a = this.ops.get(name) ?? [];
    if (!this.ops.has(name) && this.ops.size >= MAX_KEYS) return;
    a.push({ at: this.now(), outcome, ms, retries });
    if (a.length > MAX_PER_KEY) a.shift();
    this.ops.set(name, a);
  }

  /** Count one structured log line by its event, and by event and error class. */
  line(l: Record<string, unknown>): void {
    if (typeof l.event !== 'string') return;
    this.bump(l.event);
    if (typeof l.error_class === 'string') this.bump(`${l.event}:${l.error_class}`);
  }

  private bump(key: string): void {
    const a = this.events.get(key) ?? [];
    if (!this.events.has(key) && this.events.size >= MAX_KEYS) return;
    a.push(this.now());
    if (a.length > MAX_PER_KEY) a.shift();
    this.events.set(key, a);
  }

  count(key: string): number {
    const since = this.now() - WINDOW_MS;
    return (this.events.get(key) ?? []).filter((t) => t > since).length;
  }

  snapshot(): OpMetrics[] {
    const since = this.now() - WINDOW_MS;
    return [...this.ops].map(([operation, all]) => {
      const xs = all.filter((x) => x.at > since);
      const counted = xs.filter((x) => x.outcome !== 'neutral');
      const ok = counted.filter((x) => x.outcome === 'success').length;
      const ms = xs.map((x) => x.ms).sort((a, b) => a - b);
      return {
        operation, volume: xs.length,
        success_rate: counted.length ? ok / counted.length : null, failure_rate: counted.length ? (counted.length - ok) / counted.length : null,
        retry_count: xs.reduce((n, x) => n + x.retries, 0), latency_ms: { p50: pct(ms, 50), p95: pct(ms, 95), p99: pct(ms, 99) },
      };
    });
  }
}

/** One per process. A breaker change is logged where it happens; the sweep turns an open one into an alert. */
export const voiceOps = new OpsMetrics(Date.now, (provider, from, to) => {
  (to === 'OPEN' ? console.warn : console.log)(JSON.stringify({ timestamp: new Date().toISOString(), level: to === 'OPEN' ? 'error' : 'info', service: 'voice-studio', event: 'voice_circuit_changed', outcome: to === 'OPEN' ? 'failure' : 'success', provider, from, to, ...(to === 'OPEN' ? { error_class: 'CircuitOpen' } : {}) }));
});

/** Every voice log line passes here: counted, and given the call id as its correlation id. */
export function tapVoiceLog(l: Record<string, unknown>, ops: OpsMetrics = voiceOps): Record<string, unknown> {
  ops.line(l);
  return { timestamp: new Date().toISOString(), service: 'voice-studio', correlation_id: l.correlation_id ?? l.call_id ?? null, ...l };
}
