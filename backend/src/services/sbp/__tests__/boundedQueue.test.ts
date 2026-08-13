/**
 * boundedQueue — the ceiling that makes "20 students start at once" survivable.
 *
 * The assertion that matters is the high-water mark: not that the work finished,
 * but that concurrency was NEVER exceeded while it did.
 */
import { BoundedQueue, QueueFullError, getProvisionQueue, __resetProvisionQueue } from '../boundedQueue';

/** A task that stays in flight until released, so overlap is controllable. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setImmediate(r));

beforeEach(() => __resetProvisionQueue());

describe('the concurrency ceiling', () => {
  it('never runs more than `concurrency` tasks at once', async () => {
    const q = new BoundedQueue({ concurrency: 3 });
    const gates = Array.from({ length: 20 }, () => deferred());
    let observedPeak = 0;

    const runs = gates.map((g, i) => q.run(async () => {
      observedPeak = Math.max(observedPeak, q.stats.running);
      await g.promise;
      return i;
    }));

    await tick();
    expect(q.stats.running).toBe(3);
    expect(q.stats.waiting).toBe(17);

    // Release in waves; the ceiling must hold throughout.
    for (const g of gates) { g.resolve(); await tick(); }
    await Promise.all(runs);

    expect(observedPeak).toBeLessThanOrEqual(3);
    expect(q.stats.peak).toBeLessThanOrEqual(3);
  });

  it('completes all 20 — bounding is not dropping', async () => {
    const q = new BoundedQueue({ concurrency: 3 });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => q.run(async () => i)),
    );
    expect(results).toHaveLength(20);
    expect(new Set(results).size).toBe(20);
    expect(q.stats.peak).toBeLessThanOrEqual(3);
  });

  it('clamps a nonsensical concurrency to 1 rather than deadlocking', async () => {
    const q = new BoundedQueue({ concurrency: 0 });
    await expect(q.run(async () => 'ran')).resolves.toBe('ran');
    expect(q.stats.concurrency).toBe(1);
  });
});

describe('failure cannot wedge the queue', () => {
  it('releases the slot when a task throws', async () => {
    const q = new BoundedQueue({ concurrency: 1 });
    await expect(q.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(q.stats.running).toBe(0);
    await expect(q.run(async () => 'next')).resolves.toBe('next');
  });

  it('propagates the task\'s own error, not a wrapper', async () => {
    const q = new BoundedQueue({ concurrency: 2 });
    const original = Object.assign(new Error('upstream 500'), { error_class: 'UpstreamError' });
    await expect(q.run(async () => { throw original; })).rejects.toBe(original);
  });

  it('keeps draining after a failure mid-queue', async () => {
    const q = new BoundedQueue({ concurrency: 1 });
    const outcomes = await Promise.allSettled([
      q.run(async () => 'a'),
      q.run(async () => { throw new Error('b failed'); }),
      q.run(async () => 'c'),
    ]);
    expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });
});

describe('backpressure', () => {
  it('refuses work beyond maxDepth instead of accepting and dropping it', async () => {
    const q = new BoundedQueue({ concurrency: 1, maxDepth: 2 });
    const gate = deferred();
    const inflight = q.run(async () => { await gate.promise; });
    await tick();

    const queued = [q.run(async () => 'w1'), q.run(async () => 'w2')];
    await tick();
    expect(q.stats.waiting).toBe(2);

    await expect(q.run(async () => 'overflow')).rejects.toBeInstanceOf(QueueFullError);

    gate.resolve();
    await Promise.all([inflight, ...queued]);
  });

  it('carries the numbers an operator needs in the error', async () => {
    const q = new BoundedQueue({ concurrency: 1, maxDepth: 0 });
    const gate = deferred();
    const inflight = q.run(async () => { await gate.promise; });
    await tick();
    const err = await q.run(async () => 'x').catch((e) => e);
    expect(err).toBeInstanceOf(QueueFullError);
    expect(err.maxDepth).toBe(0);
    expect(String(err.message)).toMatch(/try again shortly/);
    gate.resolve();
    await inflight;
  });
});

describe('observability', () => {
  it('emits a state change for every transition', async () => {
    const events: string[] = [];
    const q = new BoundedQueue({ concurrency: 1, onEvent: (e) => events.push(e.type) });
    const gate = deferred();
    const first = q.run(async () => { await gate.promise; }, 'first');
    await tick();
    const second = q.run(async () => 'second', 'second');
    await tick();
    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toContain('started');
    expect(events).toContain('queued');
    expect(events).toContain('settled');
  });
});

describe('the shared provisioning queue', () => {
  it('is a singleton — a per-request queue would bound nothing', () => {
    expect(getProvisionQueue()).toBe(getProvisionQueue());
  });

  it('reads its ceiling from the environment', () => {
    process.env.SBP_PROVISION_CONCURRENCY = '7';
    __resetProvisionQueue();
    expect(getProvisionQueue().stats.concurrency).toBe(7);
    delete process.env.SBP_PROVISION_CONCURRENCY;
  });

  it('defaults to a conservative ceiling against one shared platform token', () => {
    delete process.env.SBP_PROVISION_CONCURRENCY;
    __resetProvisionQueue();
    expect(getProvisionQueue().stats.concurrency).toBe(3);
  });
});
