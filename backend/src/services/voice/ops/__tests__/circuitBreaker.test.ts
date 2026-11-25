import { CircuitBreaker, DEFAULT_BREAKER } from '../circuitBreaker';

function make() {
  let t = 0;
  const changes: string[] = [];
  const b = new CircuitBreaker('x', (f, to) => changes.push(`${f}>${to}`), DEFAULT_BREAKER, () => t);
  const fail = (n: number) => { for (let i = 0; i < n; i++) if (b.allow()) b.record('failure'); };
  return { b, changes, fail, tick: (ms: number) => { t += ms; } };
}

describe('CircuitBreaker', () => {
  it('four failures are not enough; the fifth opens it, and it then lets nothing through', () => {
    const m = make();
    m.fail(4);
    expect(m.b.current).toBe('CLOSED');
    m.fail(1);
    expect(m.b.current).toBe('OPEN');
    expect(m.b.allow()).toBe(false);
  });
  it('under half failing stays closed; neutral outcomes never count', () => {
    const m = make();
    for (const o of ['failure', 'success', 'success', 'failure', 'success', 'neutral', 'neutral', 'neutral'] as const) m.b.record(o);
    expect(m.b.current).toBe('CLOSED');
    const n = make();
    for (let i = 0; i < 50; i++) n.b.record('neutral');
    n.fail(4);
    expect(n.b.current).toBe('CLOSED');
  });
  it('old failures age out', () => {
    const m = make();
    m.fail(4);
    m.tick(DEFAULT_BREAKER.windowMs + 1);
    m.fail(1);
    expect(m.b.current).toBe('CLOSED');
  });
  it('after the cooldown one probe at a time; two wins close it', () => {
    const m = make();
    m.fail(5);
    m.tick(DEFAULT_BREAKER.cooldownMs - 1);
    expect(m.b.allow()).toBe(false);
    m.tick(1);
    expect(m.b.available()).toBe(true);
    expect(m.b.allow()).toBe(true);
    expect(m.b.allow()).toBe(false); // the probe is out
    m.b.record('success');
    expect(m.b.current).toBe('HALF_OPEN');
    expect(m.b.allow()).toBe(true);
    m.b.record('success');
    expect(m.changes).toEqual(['CLOSED>OPEN', 'OPEN>HALF_OPEN', 'HALF_OPEN>CLOSED']);
    m.fail(4);
    expect(m.b.current).toBe('CLOSED'); // a fresh start, old failures are gone
  });
  it('a failed probe opens it again for a full cooldown', () => {
    const m = make();
    m.fail(5);
    m.tick(DEFAULT_BREAKER.cooldownMs);
    m.b.allow();
    m.b.record('failure');
    expect(m.b.current).toBe('OPEN');
    expect(m.b.allow()).toBe(false);
    m.tick(DEFAULT_BREAKER.cooldownMs);
    expect(m.b.allow()).toBe(true);
  });
  it('an abandoned probe, or a neutral one, does not jam it half open', () => {
    const m = make();
    m.fail(5);
    m.tick(DEFAULT_BREAKER.cooldownMs);
    m.b.allow();
    m.tick(DEFAULT_BREAKER.probeTimeoutMs);
    expect(m.b.allow()).toBe(true);
    m.b.record('neutral');
    expect(m.b.allow()).toBe(true);
  });
  it('a call that started before it opened cannot change it afterwards', () => {
    const m = make();
    m.fail(5);
    m.b.record('success');
    m.b.record('failure');
    expect(m.b.current).toBe('OPEN');
  });
});
