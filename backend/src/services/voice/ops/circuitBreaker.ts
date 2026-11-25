/**
 * Per-provider circuit breaker (VS4.3), following openclawCircuitBreaker's states with a clock that can be
 * injected. CLOSED: everything passes. OPEN: nothing does, until the cooldown. HALF_OPEN: one probe at a
 * time; enough successes close it, one failure opens it again.
 *
 * State is per process and resets on restart (as openclaw's does): a restart re-tests the provider.
 * Nothing is retried here. A neutral outcome (the caller hung up, or the request itself was wrong) says
 * nothing about the provider's health, so it neither opens nor closes the circuit.
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type Outcome = 'success' | 'failure' | 'neutral';

export interface BreakerConfig { minSamples: number; failureRatio: number; windowMs: number; cooldownMs: number; probesToClose: number; probeTimeoutMs: number }
export const DEFAULT_BREAKER: BreakerConfig = { minSamples: 5, failureRatio: 0.5, windowMs: 5 * 60_000, cooldownMs: 60_000, probesToClose: 2, probeTimeoutMs: 60_000 };

const MAX_SAMPLES = 200;

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private samples: Array<{ at: number; ok: boolean }> = [];
  private openedAt = 0;
  private probeAt: number | null = null;
  private probeWins = 0;

  constructor(readonly name: string, private readonly onChange: (from: CircuitState, to: CircuitState) => void = () => undefined,
    private readonly cfg: BreakerConfig = DEFAULT_BREAKER, private readonly now: () => number = Date.now) {}

  get current(): CircuitState { return this.state; }

  /** Would a call be let through? Changes nothing. */
  available(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') return this.now() - this.openedAt >= this.cfg.cooldownMs;
    return this.probeAt === null || this.now() - this.probeAt >= this.cfg.probeTimeoutMs;
  }

  /** Take a place. Every true must be followed by record(). An abandoned probe expires on its own. */
  allow(): boolean {
    if (!this.available()) return false;
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') { this.probeWins = 0; this.move('HALF_OPEN'); }
    this.probeAt = this.now();
    return true;
  }

  record(outcome: Outcome): void {
    const t = this.now();
    if (this.state === 'OPEN') return; // a call that started before it opened: already counted against it
    if (this.state === 'HALF_OPEN') {
      this.probeAt = null;
      if (outcome === 'failure') this.open(t);
      else if (outcome === 'success' && ++this.probeWins >= this.cfg.probesToClose) { this.samples = []; this.move('CLOSED'); }
      return;
    }
    if (outcome === 'neutral') return;
    this.samples.push({ at: t, ok: outcome === 'success' });
    this.samples = this.samples.filter((s) => t - s.at < this.cfg.windowMs).slice(-MAX_SAMPLES);
    const failed = this.samples.filter((s) => !s.ok).length;
    if (this.samples.length >= this.cfg.minSamples && failed / this.samples.length >= this.cfg.failureRatio) this.open(t);
  }

  private open(t: number): void { this.openedAt = t; this.probeAt = null; this.samples = []; this.move('OPEN'); }

  private move(to: CircuitState): void {
    const from = this.state;
    this.state = to;
    if (from !== to) this.onChange(from, to);
  }
}
