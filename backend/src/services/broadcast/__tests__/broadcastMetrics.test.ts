/**
 * §7 asks for success_rate, failure_rate, retry_count, latency p50/p95/p99 and volume on
 * five named paths. The acceptance bar I set for P2-09 was that these are asserted EQUAL to
 * hand-computed values rather than merely present — a metric nobody can compute by hand in
 * a test is a metric nobody can audit in production.
 *
 * Every expected number below is worked out in the comment beside it.
 */
jest.mock('../../../utils/requestContext', () => ({ ensureTraceId: () => 'trace-fixed' }));

import {
  aggregate, aggregateAll, percentile, isUsableErrorClass, emitObservation, observe,
  OPERATIONAL_PATHS, type Observation,
} from '../broadcastMetrics';

const obs = (over: Partial<Observation> = {}): Observation => ({
  path: 'provider', outcome: 'success', durationMs: 100, ...over,
});

describe('aggregate — hand-computed values', () => {
  it('computes all five measures on a seeded fixture', () => {
    // 5 observations: 4 success, 1 failure. Retries 0+2+0+1+0 = 3.
    // Durations sorted: [50, 100, 150, 200, 1000]
    const fixture: Observation[] = [
      obs({ durationMs: 100 }),
      obs({ durationMs: 50, retries: 2 }),
      obs({ durationMs: 1000 }),
      obs({ durationMs: 200, outcome: 'failure', errorClass: 'TimeoutError', retries: 1 }),
      obs({ durationMs: 150 }),
    ];
    const m = aggregate(fixture);

    expect(m.volume).toBe(5);
    expect(m.success_rate).toBe(0.8);   // 4/5
    expect(m.failure_rate).toBe(0.2);   // 1/5
    expect(m.retry_count).toBe(3);      // 2 + 1
    // Nearest-rank on N=5: p50 -> ceil(2.5)=3 -> index 2 -> 150
    expect(m.latency_ms.p50).toBe(150);
    // p95 -> ceil(4.75)=5 -> index 4 -> 1000;  p99 -> ceil(4.95)=5 -> 1000
    expect(m.latency_ms.p95).toBe(1000);
    expect(m.latency_ms.p99).toBe(1000);
  });

  it('rates sum to exactly 1 when there is any volume', () => {
    const m = aggregate([obs(), obs({ outcome: 'failure', errorClass: 'AuthError' }), obs()]);
    expect(m.success_rate! + m.failure_rate!).toBe(1);
    expect(m.success_rate).toBeCloseTo(2 / 3, 10);
  });

  it('counts retries on operations that SUCCEEDED — the early degradation signal', () => {
    // Rising retries against a perfect success rate is the first sign an upstream is sick.
    const m = aggregate([obs({ retries: 3 }), obs({ retries: 4 })]);
    expect(m.success_rate).toBe(1);
    expect(m.retry_count).toBe(7);
  });
});

describe('zero observations yields null, never zero', () => {
  it('returns null rates and null latencies for an empty sample', () => {
    const m = aggregate([]);
    // A success_rate of 0 would read as "everything failed" during an outage of the
    // measurement itself. §4.7 forbids the fabricated zero.
    expect(m.success_rate).toBeNull();
    expect(m.failure_rate).toBeNull();
    expect(m.latency_ms).toEqual({ p50: null, p95: null, p99: null });
    expect(m.volume).toBe(0);
    expect(m.retry_count).toBe(0);   // a genuine count of zero retries, not a missing value
  });

  it('null is distinguishable from 0 — a path where everything failed', () => {
    const allFailed = aggregate([obs({ outcome: 'failure', errorClass: 'UpstreamUnavailable' })]);
    expect(allFailed.success_rate).toBe(0);       // really 0: one attempt, it failed
    expect(aggregate([]).success_rate).toBeNull(); // not measured at all
    expect(allFailed.success_rate).not.toBeNull();
  });
});

describe('percentile — nearest-rank, stated and pinned', () => {
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('matches nearest-rank on N=10', () => {
    expect(percentile(ten, 50)).toBe(5);   // ceil(5) = 5 -> index 4
    expect(percentile(ten, 95)).toBe(10);  // ceil(9.5) = 10 -> index 9
    expect(percentile(ten, 99)).toBe(10);  // ceil(9.9) = 10 -> index 9
  });

  it('matches nearest-rank on N=100, where p95 and p99 finally differ', () => {
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(hundred, 50)).toBe(50);
    expect(percentile(hundred, 95)).toBe(95);
    expect(percentile(hundred, 99)).toBe(99);
  });

  it('single sample is every percentile', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  it('returns null rather than 0 for an empty sample', () => {
    expect(percentile([], 50)).toBeNull();
  });
});

describe('aggregateAll — every §7 path is present even when silent', () => {
  it('reports all five paths, with unobserved ones as volume 0 and null rates', () => {
    const m = aggregateAll([obs({ path: 'recording' }), obs({ path: 'recording', outcome: 'failure', errorClass: 'ProviderTimeout' })]);
    expect(Object.keys(m).sort()).toEqual([...OPERATIONAL_PATHS].sort());
    expect(m.recording).toMatchObject({ volume: 2, success_rate: 0.5, failure_rate: 0.5 });
    // A silent path must be visibly silent, not absent from the payload.
    expect(m.provider).toMatchObject({ volume: 0, success_rate: null });
    expect(m.publishing.volume).toBe(0);
  });

  it('does not let one path\'s observations leak into another', () => {
    const m = aggregateAll([
      obs({ path: 'provider', durationMs: 10 }),
      obs({ path: 'notification', durationMs: 9999 }),
    ]);
    expect(m.provider.latency_ms.p50).toBe(10);
    expect(m.notification.latency_ms.p50).toBe(9999);
  });
});

describe('error classes must be usable for triage', () => {
  it('rejects the generic ones CLAUDE.md names', () => {
    for (const bad of ['Error', 'error', 'Exception', 'UnknownError', '', undefined, null]) {
      expect(isUsableErrorClass(bad as any)).toBe(false);
    }
  });

  it('accepts the specific ones this codebase already uses', () => {
    for (const good of ['TimeoutError', 'RateLimitError', 'AuthError', 'ValidationError', 'UpstreamUnavailable', 'ContractViolation', 'InvalidStateTransition', 'VersionConflict']) {
      expect(isUsableErrorClass(good)).toBe(true);
    }
  });
});

describe('emitObservation — the CLAUDE.md log shape', () => {
  let out: string[];
  let err: string[];
  beforeEach(() => {
    out = []; err = [];
    jest.spyOn(console, 'log').mockImplementation((s: any) => { out.push(String(s)); });
    jest.spyOn(console, 'error').mockImplementation((s: any) => { err.push(String(s)); });
  });
  afterEach(() => jest.restoreAllMocks());

  it('emits every required field, with a correlation id', () => {
    emitObservation({ path: 'playback_authorization', outcome: 'success', durationMs: 12 });
    const line = JSON.parse(out[0]);
    expect(line).toMatchObject({
      level: 'info', service: 'broadcast', event: 'broadcast_playback_authorization',
      correlation_id: 'trace-fixed', duration_ms: 12, outcome: 'success',
    });
    expect(line.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('a failure logs at error level and carries error_class', () => {
    emitObservation({ path: 'provider', outcome: 'failure', durationMs: 30, errorClass: 'TimeoutError' });
    const line = JSON.parse(err[0]);
    expect(line).toMatchObject({ level: 'error', outcome: 'failure', error_class: 'TimeoutError' });
    expect(out).toHaveLength(0);
  });

  it('REPLACES a generic class rather than logging it — an unusable class is itself a finding', () => {
    emitObservation({ path: 'provider', outcome: 'failure', durationMs: 1, errorClass: 'Error' });
    expect(JSON.parse(err[0]).error_class).toBe('UnclassifiedError');
  });

  it('a success carries no error_class at all', () => {
    emitObservation({ path: 'recording', outcome: 'success', durationMs: 5 });
    expect(JSON.parse(out[0])).not.toHaveProperty('error_class');
  });
});

describe('observe — timing wrapper', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns the operation result unchanged', async () => {
    const clock = (() => { let t = 1000; return () => (t += 25); })();
    await expect(observe('provider', async () => 'ok', { nowMs: clock })).resolves.toBe('ok');
  });

  it('RE-THROWS after recording — instrumentation must not swallow a failure', async () => {
    const boom = Object.assign(new Error('upstream down'), { error_class: 'UpstreamUnavailable' });
    await expect(observe('provider', async () => { throw boom; })).rejects.toBe(boom);
  });

  it('measures elapsed time from the injected clock', async () => {
    const spy = jest.spyOn(console, 'log');
    const clock = (() => { let t = 0; return () => (t += 40); })(); // 40 then 80 => 40ms
    await observe('notification', async () => 'x', { nowMs: clock });
    expect(JSON.parse(String(spy.mock.calls[0][0])).duration_ms).toBe(40);
  });
});
